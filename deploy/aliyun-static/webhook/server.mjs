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
const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024
const LOG_TAIL_BYTES = 256 * 1024

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

function rotateLogIfNeeded() {
  try {
    if (fs.statSync(CONFIG.logFile).size > MAX_LOG_FILE_BYTES) {
      fs.renameSync(CONFIG.logFile, `${CONFIG.logFile}.1`)
    }
  }
  catch {
    // 文件还不存在
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  // pm2 会收集 stdout 作为运行日志
  process.stdout.write(`${line}\n`)
  rotateLogIfNeeded()
  fs.appendFileSync(CONFIG.logFile, `${line}\n`, 'utf8')
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
 * 写接口（/oss、/build）的 token 可以放在：
 * - 请求头：X-Webhook-Token 或 Authorization: Bearer <token>（推荐，不会进入访问日志）
 * - 路径最后一段：POST /oss/<token>（适合只能填 URL 的 HTTP 回调）
 * - 查询参数：?token=<token>
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
    log(`构建进程启动失败：${error.message}`)
    addBuildHistory('failed', '构建进程启动失败')
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
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
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
    buildHistory: buildHistory.slice(0, 5),
  }
}

// ---------------------------------------------------------------------------
// 公开日志：白名单转换
//
// 状态页和日志不鉴权，所以不能简单地「遮掉已知敏感词」，而是只展示认得的日志行：
// 照片文件名、步骤开始/成功/失败、上传的文件名照常显示；原始报错、路径、bucket、
// IP 等一律不展示。完整日志仍保存在服务器上的日志文件里。
// ---------------------------------------------------------------------------

const PUBLIC_BUILD_MESSAGES = new Set([
  '==========================================',
  '开始自动构建 Afilmory（私有原图模式）',
  '加载项目环境变量',
  '已生成 manifest',
  '已生成静态资源',
  '准备临时函数目录',
  '上传根目录静态文件',
  '设置关键文件元数据',
  '构建并发布完成',
])

function toPublicBuildMessage(message) {
  if (PUBLIC_BUILD_MESSAGES.has(message)) {
    return message
  }
  if (/^(?:开始|成功|失败)：[\w\p{Script=Han} -]+$/u.test(message)) {
    return message
  }
  if (/^(?:上传完成|元数据已更新)：[\w.-]+$/.test(message)) {
    return message
  }
  if (message.startsWith('最近日志（')) {
    return '失败详情已隐藏，请在服务器的构建日志目录中查看'
  }
  if (message.startsWith('元数据更新失败')) {
    return '元数据更新失败'
  }
  if (message.startsWith('跳过')) {
    return '跳过自动部署函数'
  }
  if (message.startsWith('错误：') || message.startsWith('警告：')) {
    return `${message.slice(0, 2)}（详情已隐藏）`
  }
  return null
}

const PUBLIC_WEBHOOK_RULES = [
  [/^(?:收到 OSS 事件通知|开始自动构建|自动构建完成|已有构建在执行，已标记待构建)$/, m => m],
  [/^\d+ 个照片事件(?:：.*)?$/, m => m],
  [/^照片变更已进入防抖队列，\d+ 秒后开始构建$/, m => m],
  [/^收到手动构建请求/, m => m.replace(/（来源 [^）]*）/, '')],
  [/^构建失败，退出码：\S+$/, m => m],
  [/^构建进程启动失败/, () => '构建进程启动失败'],
  [/^忽略非照片相关事件/, () => '忽略非照片相关事件'],
  [/^OSS 通知格式无法解析/, () => 'OSS 通知格式无法解析，未触发构建'],
  [/^处理请求失败/, () => '处理请求失败'],
  [/^Webhook 服务启动成功/, () => 'Webhook 服务启动成功'],
  [/^收到 SIG[A-Z]+，准备退出$/, m => m],
]

function toPublicLine(line) {
  const match = line.match(/^\[([^\]]+)\] (.*)$/)
  if (!match) {
    return null
  }
  const [, time, message] = match

  const buildOutput = message.match(/^构建输出：\[[^\]]+\] (.*)$/)
  if (buildOutput) {
    const publicMessage = toPublicBuildMessage(buildOutput[1].trim())
    return publicMessage ? `[${time}] 构建输出：${publicMessage}` : null
  }

  for (const [pattern, transform] of PUBLIC_WEBHOOK_RULES) {
    if (pattern.test(message)) {
      return `[${time}] ${transform(message)}`
    }
  }
  // 构建错误（stderr 原文）、拒绝未授权请求等不公开
  return null
}

function readLogTail() {
  let fd
  try {
    fd = fs.openSync(CONFIG.logFile, 'r')
  }
  catch {
    return []
  }
  try {
    const { size } = fs.fstatSync(fd)
    const length = Math.min(size, LOG_TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n')
    // 从文件中间开始读时，第一行可能不完整
    return length < size ? lines.slice(1) : lines
  }
  finally {
    fs.closeSync(fd)
  }
}

function readPublicLogs() {
  const lines = readLogTail()
    .map(toPublicLine)
    .filter(Boolean)
    .slice(-CONFIG.maxLogLines)
  return lines.length > 0 ? lines.join('\n') : '暂无日志'
}

/**
 * 页面链接用相对路径。以 /webhook（无尾随斜杠）访问时，相对路径会解析到站点根目录，
 * 所以这种情况下要带上最后一段作为前缀。
 */
function renderPage(pathname) {
  const linkBase = pathname.endsWith('/') ? '' : `${pathname.split('/').pop()}/`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Afilmory 构建状态</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f4f5;color:#18181b;padding:24px 16px}
main{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
section{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);min-width:0}
h1{font-size:22px;margin-bottom:12px}h2{font-size:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline}
h2 small{font-size:12px;font-weight:400;color:#71717a}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.grid div{background:#f4f4f5;border-radius:8px;padding:12px}.grid small{color:#71717a;display:block;margin-bottom:4px}
ul{list-style:none;display:flex;flex-direction:column;gap:8px}
li{display:flex;gap:12px;align-items:center;background:#f4f4f5;border-radius:8px;padding:10px 12px;border-left:4px solid #a1a1aa;font-size:14px}
li span:nth-child(2){flex:1}li.success{border-color:#16a34a}li.failed{border-color:#dc2626}li.building{border-color:#ca8a04}li.empty{justify-content:center;color:#a1a1aa}
pre{background:#18181b;color:#e4e4e7;border-radius:8px;padding:12px;font-size:12px;line-height:1.6;max-height:480px;overflow:auto;white-space:pre-wrap;word-break:break-all}
a{color:#2563eb;margin-right:16px;font-size:14px}
</style>
</head>
<body>
<main>
<section>
<h1>Afilmory 构建状态</h1>
<div class="grid">
<div><small>状态</small><strong id="state">-</strong></div>
<div><small>运行时间</small><strong id="uptime">-</strong></div>
<div><small>防抖延迟</small><strong>${CONFIG.buildDelayMs / 1000} 秒</strong></div>
</div>
</section>
<section><h2>最近构建<small>webhook 重启后清空</small></h2><ul id="history"><li class="empty">加载中</li></ul></section>
<section><h2>日志<small id="updated">每 10 秒刷新</small></h2><pre id="logs">加载中</pre></section>
<section><a href="${linkBase}status" target="_blank">状态 JSON</a><a href="${linkBase}logs" target="_blank">纯文本日志</a><a href="${linkBase}health" target="_blank">健康检查</a></section>
</main>
<script>
const base = ${JSON.stringify(linkBase)}
const statusText = { success: '成功', failed: '失败', building: '构建中' }

function renderHistory(items) {
  const list = document.getElementById('history')
  list.replaceChildren()
  if (items.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = '暂无构建记录'
    list.append(li)
    return
  }
  for (const item of items) {
    const li = document.createElement('li')
    li.className = item.status
    const time = document.createElement('span')
    time.textContent = new Date(item.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    const message = document.createElement('span')
    message.textContent = item.message
    const badge = document.createElement('b')
    badge.textContent = statusText[item.status] || item.status
    li.append(time, message, badge)
    list.append(li)
  }
}

async function refresh() {
  try {
    const [status, logs] = await Promise.all([
      fetch(base + 'status').then(res => res.json()),
      fetch(base + 'logs').then(res => res.text()),
    ])
    document.getElementById('state').textContent = (status.isBuilding ? '构建中' : '空闲') + (status.pendingBuild ? '（有待构建）' : '')
    document.getElementById('uptime').textContent = status.uptimeFormatted
    renderHistory(status.buildHistory)
    const pre = document.getElementById('logs')
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8
    pre.textContent = logs
    if (atBottom) {
      pre.scrollTop = pre.scrollHeight
    }
    document.getElementById('updated').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN')
  } catch {}
}

refresh().then(() => {
  const pre = document.getElementById('logs')
  pre.scrollTop = pre.scrollHeight
})
setInterval(refresh, 10000)
</script>
</body>
</html>`
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const { route, pathToken } = resolveRoute(url.pathname)
  const method = req.method || 'GET'

  // 只读接口公开：健康检查、状态、脱敏后的日志
  if (method === 'GET') {
    switch (route) {
      case '/health':
        return send(res, 200, { status: 'ok' })
      case '/status':
        return send(res, 200, statusPayload())
      case '/logs':
        return send(res, 200, readPublicLogs(), 'text/plain; charset=utf-8')
      case '/':
        return send(res, 200, renderPage(url.pathname), 'text/html; charset=utf-8')
    }
  }

  // 会触发构建的写接口必须鉴权
  if (method !== 'POST' || (route !== '/oss' && route !== '/build')) {
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

  scheduleBuild(`收到手动构建请求（来源 ${clientIp(req)}）`)
  return send(res, 202, { success: true, message: `将在 ${CONFIG.buildDelayMs / 1000} 秒后构建` })
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
