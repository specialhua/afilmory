// Afilmory 静态部署 webhook：接收 OSS 照片变更通知，防抖后执行构建发布脚本。
// 只依赖 Node 内置模块（需要 Node >= 20.12，用到 process.loadEnvFile）。

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WEBHOOK_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEPLOY_DIR = path.resolve(WEBHOOK_DIR, '..')
const ENV_FILE = path.join(DEPLOY_DIR, '.env')

if (fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE)
}

const MIN_TOKEN_LENGTH = 24
const MAX_BODY_BYTES = 1024 * 1024

const CONFIG = {
  host: process.env.WEBHOOK_HOST || '127.0.0.1',
  port: Number(process.env.WEBHOOK_PORT || 3002),
  token: process.env.WEBHOOK_TOKEN || '',
  buildDelayMs: Number(process.env.WEBHOOK_BUILD_DELAY_SECONDS || 30) * 1000,
  buildScript: path.join(DEPLOY_DIR, 'scripts', 'build-and-publish.sh'),
  logFile: process.env.WEBHOOK_LOG_FILE || path.join(WEBHOOK_DIR, 'webhook.log'),
  photoPrefix: normalizePrefix(process.env.WEBHOOK_PHOTO_PREFIX ?? 'photos/'),
  allowedBuckets: parseCsv(process.env.WEBHOOK_ALLOWED_BUCKETS),
  maxHistory: 10,
  maxLogLines: 100,
}

const PHOTO_EXTENSION_PATTERN = /\.(?:jpg|jpeg|png|heic|heif|avif|tiff|webp|raw|dng|cr2|cr3|nef|arw|raf|orf|rw2|mov|mp4)$/i

if (CONFIG.token.length < MIN_TOKEN_LENGTH) {
  console.error(
    `WEBHOOK_TOKEN 未设置或过短（至少 ${MIN_TOKEN_LENGTH} 个字符）。可用 openssl rand -hex 32 生成，写入 ${ENV_FILE}`,
  )
  process.exit(1)
}

if (!fs.existsSync(CONFIG.buildScript)) {
  console.error(`找不到构建脚本：${CONFIG.buildScript}`)
  process.exit(1)
}

let isBuilding = false
let pendingBuild = false
let buildTimer = null
let buildHistory = []

function parseCsv(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizePrefix(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function normalizeObjectKey(value) {
  const key = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  try {
    return decodeURIComponent(key)
  }
  catch {
    return key
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  // pm2 会收集 stdout 作为运行日志
  process.stdout.write(`${line}\n`)
  fs.appendFileSync(CONFIG.logFile, `${line}\n`, 'utf8')
}

function sanitizeLog(line) {
  return line
    .replace(/AccessKey(?:Id|Secret)[:=]\s*[\w/+=-]+/gi, 'AccessKey***隐藏***')
    .replace(/token[:=]\s*[\w.-]+/gi, 'token=***隐藏***')
    .replace(/auth_key=[\w-]+/gi, 'auth_key=***隐藏***')
    .replaceAll(path.resolve(DEPLOY_DIR, '..', '..'), '<项目目录>')
    .replace(/\d{1,3}(?:\.\d{1,3}){3}/g, '***.***.***.***')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function addBuildHistory(status, message) {
  buildHistory.unshift({ timestamp: new Date().toISOString(), status, message })
  if (buildHistory.length > CONFIG.maxHistory) {
    buildHistory = buildHistory.slice(0, CONFIG.maxHistory)
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (days > 0) {
    parts.push(`${days}天`)
  }
  if (hours > 0) {
    parts.push(`${hours}小时`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}分钟`)
  }
  return parts.join(' ') || '刚刚启动'
}

// ---------------------------------------------------------------------------
// 鉴权
// ---------------------------------------------------------------------------

function tokensEqual(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false
  }
  const expected = crypto.createHash('sha256').update(CONFIG.token).digest()
  const actual = crypto.createHash('sha256').update(candidate).digest()
  return crypto.timingSafeEqual(expected, actual)
}

/**
 * token 可以放在：
 * - 路径最后一段：POST /webhook/oss/<token>（适合只能填 URL 的事件通知）
 * - 查询参数：?token=<token>（适合浏览器打开状态页）
 * - 请求头：X-Webhook-Token 或 Authorization: Bearer <token>（适合 curl）
 */
function extractToken(req, url, pathToken) {
  if (pathToken) {
    return pathToken
  }
  const header = req.headers['x-webhook-token']
  if (typeof header === 'string' && header) {
    return header
  }
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length)
  }
  return url.searchParams.get('token') || ''
}

function clientIp(req) {
  // X-Real-IP 由反向代理直接写入，客户端无法伪造；X-Forwarded-For 首段可被客户端自带
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp) {
    return realIp
  }
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',').at(-1).trim()
  }
  return req.socket.remoteAddress || '-'
}

// ---------------------------------------------------------------------------
// 构建调度
// ---------------------------------------------------------------------------

function scheduleBuild(reason) {
  clearTimeout(buildTimer)
  buildTimer = setTimeout(runBuild, CONFIG.buildDelayMs)
  log(`${reason}，${CONFIG.buildDelayMs / 1000} 秒后开始构建`)
}

function queueNextBuild(delayMs) {
  if (!pendingBuild) {
    return
  }
  pendingBuild = false
  setTimeout(runBuild, delayMs)
}

function filterBuildLines(chunk) {
  return chunk
    .toString('utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line =>
      /^(?:\[[0-9:-]+ [0-9:]+\]|开始：|成功：|失败：|错误：|跳过|函数 ZIP：|构建并发布完成|已生成|上传完成|元数据已更新)/.test(line),
    )
}

function runBuild() {
  if (isBuilding) {
    log('已有构建在执行，已标记待构建')
    pendingBuild = true
    return
  }

  isBuilding = true
  addBuildHistory('building', '开始构建')
  log('开始自动构建')

  const child = spawn('/bin/bash', [CONFIG.buildScript], {
    cwd: DEPLOY_DIR,
    env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    for (const line of filterBuildLines(chunk)) {
      log(`构建输出：${line}`)
    }
  })

  child.stderr.on('data', (chunk) => {
    const lines = chunk
      .toString('utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    for (const line of lines.slice(-20)) {
      log(`构建错误：${line}`)
    }
  })

  child.on('error', (error) => {
    isBuilding = false
    const message = `构建进程启动失败：${error.message}`
    log(message)
    addBuildHistory('failed', message)
    queueNextBuild(5000)
  })

  child.on('close', (code) => {
    isBuilding = false
    if (code !== 0) {
      const message = `构建失败，退出码：${code}`
      log(message)
      addBuildHistory('failed', message)
      queueNextBuild(5000)
      return
    }
    log('自动构建完成')
    addBuildHistory('success', '构建完成（站点已发布，函数已尝试自动部署）')
    queueNextBuild(2000)
  })
}

// ---------------------------------------------------------------------------
// OSS 事件解析
// ---------------------------------------------------------------------------

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

/**
 * 兼容三种投递形式：
 * - JSON：{ "events": [...] }（EventBridge 等直接投递）
 * - Base64 编码的 JSON（MNS 主题 HTTP 订阅，SIMPLIFIED/JSON 格式）
 * - XML 包裹、<Message> 内为 Base64 JSON（MNS 主题 HTTP 订阅，XML 格式）
 */
function parseOssNotification(raw) {
  const text = raw.trim()
  if (!text) {
    return null
  }

  const candidates = [text]
  const xmlMessage = text.match(/<Message>([\s\S]*?)<\/Message>/)
  if (xmlMessage) {
    candidates.push(xmlMessage[1].trim())
  }

  for (const candidate of candidates) {
    const direct = tryParseJson(candidate)
    if (direct && typeof direct === 'object') {
      if (Array.isArray(direct.events)) {
        return direct
      }
      // MNS JSON 格式：{ "Message": "<base64>" }
      if (typeof direct.Message === 'string') {
        const inner = tryParseJson(Buffer.from(direct.Message, 'base64').toString('utf8'))
        if (inner && Array.isArray(inner.events)) {
          return inner
        }
      }
    }

    const decoded = tryParseJson(Buffer.from(candidate, 'base64').toString('utf8'))
    if (decoded && Array.isArray(decoded.events)) {
      return decoded
    }
  }

  return null
}

function describeEvent(event) {
  const eventName = event?.eventName || ''
  const bucket = event?.oss?.bucket?.name || ''
  const key = normalizeObjectKey(event?.oss?.object?.key)
  const isObjectChange = eventName.startsWith('ObjectCreated') || eventName.startsWith('ObjectRemoved')
  const isAllowedBucket = CONFIG.allowedBuckets.length === 0 || CONFIG.allowedBuckets.includes(bucket)
  const isAllowedPrefix = !CONFIG.photoPrefix || key.startsWith(CONFIG.photoPrefix)
  const isAllowedExtension = PHOTO_EXTENSION_PATTERN.test(key)

  let reason = '匹配'
  if (!isObjectChange) {
    reason = `事件类型不匹配：${eventName || '空'}`
  }
  else if (!isAllowedBucket) {
    reason = `Bucket 不匹配：${bucket || '空'}`
  }
  else if (!isAllowedPrefix) {
    reason = `路径前缀不匹配：${key || '空'}`
  }
  else if (!isAllowedExtension) {
    reason = `扩展名不匹配：${key || '空'}`
  }

  return { event, bucket, key, accepted: reason === '匹配', reason }
}

function summarizePhotoEvents(checks) {
  const names = checks
    .map(item => item.key.split('/').pop())
    .filter(Boolean)
    .slice(0, 3)
  if (names.length === 0) {
    return `${checks.length} 个照片事件`
  }
  return `${checks.length} 个照片事件：${names.join('、')}${checks.length > 3 ? ' 等' : ''}`
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * 去掉可选的 /webhook 前缀，兼容反向代理是否剥离前缀两种配置。
 * 返回 { route, pathToken }，例如 /webhook/oss/abc -> { route: '/oss', pathToken: 'abc' }
 */
function resolveRoute(pathname) {
  const trimmed = pathname.replace(/\/+$/, '') || '/'
  const withoutPrefix = trimmed === '/webhook' ? '/' : trimmed.replace(/^\/webhook(?=\/)/, '')
  const ossMatch = withoutPrefix.match(/^\/oss(?:\/([^/]+))?$/)
  if (ossMatch) {
    return { route: '/oss', pathToken: ossMatch[1] ? decodeURIComponent(ossMatch[1]) : '' }
  }
  return { route: withoutPrefix, pathToken: '' }
}

async function handleOss(req, res) {
  const raw = await readBody(req)
  const body = parseOssNotification(raw)

  if (!body) {
    const preview = raw.slice(0, 200).replaceAll(/\s+/g, ' ')
    log(`OSS 通知格式无法解析，未触发构建。content-type=${req.headers['content-type'] || '-'} 前 200 字符：${preview}`)
    return send(res, 400, { success: false, message: '无法解析的通知格式' })
  }

  const checks = body.events.map(describeEvent)
  const accepted = checks.filter(item => item.accepted)

  if (accepted.length === 0) {
    const reasons = checks
      .slice(0, 3)
      .map(item => `${item.reason} bucket=${item.bucket || '-'} key=${item.key || '-'}`)
      .join('；')
    log(`忽略非照片相关事件：${reasons || '无事件明细'}`)
    return send(res, 200, { success: true, message: '非照片相关事件' })
  }

  log(summarizePhotoEvents(accepted))
  scheduleBuild('照片变更已进入防抖队列')
  return send(res, 200, {
    success: true,
    message: `已接收 ${accepted.length} 个照片变化，将在 ${CONFIG.buildDelayMs / 1000} 秒后构建`,
  })
}

function statusPayload() {
  return {
    status: 'ok',
    isBuilding,
    pendingBuild,
    uptime: Math.floor(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    buildDelay: CONFIG.buildDelayMs / 1000,
    photoPrefix: CONFIG.photoPrefix || '(all)',
    allowedBuckets: CONFIG.allowedBuckets,
    buildHistory: buildHistory.slice(0, 5),
  }
}

function readLogs() {
  if (!fs.existsSync(CONFIG.logFile)) {
    return '暂无日志'
  }
  const lines = fs.readFileSync(CONFIG.logFile, 'utf8').split('\n').slice(-CONFIG.maxLogLines)
  return lines.map(sanitizeLog).join('\n')
}

/**
 * 页面链接用相对路径。以 /webhook（无尾随斜杠）访问时，相对路径会解析到站点根目录，
 * 所以这种情况下要带上最后一段作为前缀。
 */
function renderPage(token, pathname) {
  const linkBase = pathname.endsWith('/') ? '' : `${pathname.split('/').pop()}/`
  const tokenQuery = `?token=${encodeURIComponent(token)}`
  const historyHtml = buildHistory.length > 0
    ? buildHistory
        .slice(0, 5)
        .map((item) => {
          const time = new Date(item.timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
          const statusText = { success: '成功', failed: '失败', building: '构建中' }[item.status] || item.status
          return `<li class="${escapeHtml(item.status)}"><span>${escapeHtml(time)}</span><span>${escapeHtml(item.message)}</span><b>${escapeHtml(statusText)}</b></li>`
        })
        .join('')
    : '<li class="empty">暂无构建记录</li>'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Afilmory Webhook</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f4f5;color:#18181b;padding:24px 16px}
main{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
section{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:22px;margin-bottom:12px}h2{font-size:16px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.grid div{background:#f4f4f5;border-radius:8px;padding:12px}.grid small{color:#71717a;display:block;margin-bottom:4px}
ul{list-style:none;display:flex;flex-direction:column;gap:8px}
li{display:flex;gap:12px;align-items:center;background:#f4f4f5;border-radius:8px;padding:10px 12px;border-left:4px solid #a1a1aa;font-size:14px}
li span:nth-child(2){flex:1}li.success{border-color:#16a34a}li.failed{border-color:#dc2626}li.building{border-color:#ca8a04}li.empty{justify-content:center;color:#a1a1aa}
a{color:#2563eb;margin-right:16px;font-size:14px}
</style>
</head>
<body>
<main>
<section>
<h1>Afilmory Webhook</h1>
<div class="grid">
<div><small>状态</small><strong id="state">${isBuilding ? '构建中' : '空闲'}${pendingBuild ? '（有待构建）' : ''}</strong></div>
<div><small>运行时间</small><strong id="uptime">${escapeHtml(formatUptime(process.uptime()))}</strong></div>
<div><small>防抖延迟</small><strong>${CONFIG.buildDelayMs / 1000} 秒</strong></div>
</div>
</section>
<section><h2>最近构建</h2><ul>${historyHtml}</ul></section>
<section><h2>链接</h2><a href="${escapeHtml(linkBase)}status${tokenQuery}" target="_blank">状态 JSON</a><a href="${escapeHtml(linkBase)}logs${tokenQuery}" target="_blank">日志</a><a href="${escapeHtml(linkBase)}health" target="_blank">健康检查</a></section>
</main>
<script>
const statusUrl = ${JSON.stringify(linkBase)} + 'status' + location.search
async function refresh() {
  try {
    const data = await (await fetch(statusUrl)).json()
    document.getElementById('state').textContent = (data.isBuilding ? '构建中' : '空闲') + (data.pendingBuild ? '（有待构建）' : '')
    document.getElementById('uptime').textContent = data.uptimeFormatted
  } catch {}
}
setInterval(refresh, 10000)
</script>
</body>
</html>`
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const { route, pathToken } = resolveRoute(url.pathname)
  const method = req.method || 'GET'

  if (method === 'GET' && route === '/health') {
    return send(res, 200, { status: 'ok' })
  }

  const knownRoute
    = (method === 'POST' && (route === '/oss' || route === '/build'))
      || (method === 'GET' && (route === '/' || route === '/status' || route === '/logs'))
  if (!knownRoute) {
    return send(res, 404, { success: false, message: 'Not Found' })
  }

  const token = extractToken(req, url, pathToken)
  if (!tokensEqual(token)) {
    log(`拒绝未授权请求：${method} ${route} 来源 ${clientIp(req)}`)
    return send(res, 401, { success: false, message: 'Unauthorized' })
  }

  if (route === '/oss') {
    log('收到 OSS 事件通知')
    return handleOss(req, res)
  }

  if (route === '/build') {
    scheduleBuild(`收到手动构建请求（来源 ${clientIp(req)}）`)
    return send(res, 202, { success: true, message: `将在 ${CONFIG.buildDelayMs / 1000} 秒后构建` })
  }

  if (route === '/status') {
    return send(res, 200, statusPayload())
  }

  if (route === '/logs') {
    return send(res, 200, readLogs(), 'text/plain; charset=utf-8')
  }

  return send(res, 200, renderPage(token, url.pathname), 'text/html; charset=utf-8')
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    log(`处理请求失败：${error.message}`)
    if (!res.headersSent) {
      send(res, 500, { success: false, message: 'Internal Error' })
    }
  })
})

server.listen(CONFIG.port, CONFIG.host, () => {
  log(`Webhook 服务启动成功：${CONFIG.host}:${CONFIG.port}`)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log(`收到 ${signal}，准备退出`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
