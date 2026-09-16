/* eslint-disable no-console -- 函数计算的日志依赖 console 输出 */
/**
 * 阿里云函数计算：OSS 事件转发器
 *
 * OSS 触发器调用本函数，本函数把事件以 JSON POST 给 webhook 服务（webhook/server.mjs）。
 * 运行时：Node.js 18+，入口 index.handler。
 *
 * 环境变量：
 *   WEBHOOK_HOST     必填，webhook 域名，例如 hook.example.com
 *   WEBHOOK_TOKEN    必填，与 deploy/aliyun-static/.env 中的 WEBHOOK_TOKEN 一致，通过 X-Webhook-Token 请求头发送
 *   WEBHOOK_PROTOCOL 可选，默认 https:
 *   WEBHOOK_PORT     可选，默认 443（http: 时为 80）
 *   WEBHOOK_PATH     可选，默认 /oss（反向代理保留 /webhook 前缀时填 /webhook/oss）
 *   WEBHOOK_HOST_HEADER          可选，覆盖 Host 请求头
 *   WEBHOOK_TIMEOUT_MS           可选，默认 10000
 *   WEBHOOK_MAX_RESPONSE_PREVIEW 可选，默认 300
 *   REPORT_FAILURE_AS_SUCCESS    可选，设为 1 时转发失败也返回成功（不触发函数计算重试）
 */

const { Buffer } = require('node:buffer')
const http = require('node:http')
const https = require('node:https')
const process = require('node:process')

const protocol = process.env.WEBHOOK_PROTOCOL || 'https:'

const CONFIG = {
  webhookProtocol: protocol,
  webhookHost: process.env.WEBHOOK_HOST || '',
  webhookPort: Number(process.env.WEBHOOK_PORT || (protocol === 'https:' ? 443 : 80)),
  webhookPath: process.env.WEBHOOK_PATH || '/oss',
  webhookToken: process.env.WEBHOOK_TOKEN || '',
  webhookHostHeader: process.env.WEBHOOK_HOST_HEADER || '',
  timeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS || 10000),
  maxResponsePreview: Number(process.env.WEBHOOK_MAX_RESPONSE_PREVIEW || 300),
  reportFailureAsSuccess: (process.env.REPORT_FAILURE_AS_SUCCESS || '0') === '1',
}

function buildHttpResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  }
}

function createSafeDone(callback) {
  let finished = false

  return (err, result) => {
    if (finished) {
      console.warn('检测到重复 callback，已忽略')
      return
    }

    finished = true
    callback(err, result)
  }
}

function finishSuccess(done, payload) {
  done(
    null,
    buildHttpResponse(200, {
      success: true,
      ...payload,
    }),
  )
}

function finishFailure(done, payload) {
  if (CONFIG.reportFailureAsSuccess) {
    done(
      null,
      buildHttpResponse(200, {
        success: false,
        suppressed: true,
        ...payload,
      }),
    )
    return
  }

  const error = new Error(payload.message || 'Webhook 转发失败')
  error.details = payload
  done(error)
}

function normalizeEventInput(event) {
  if (Buffer.isBuffer(event)) {
    return event.toString('utf8')
  }
  if (typeof event === 'string') {
    return event
  }
  if (event && typeof event.toString === 'function' && event.toString !== Object.prototype.toString) {
    return event.toString()
  }
  return JSON.stringify(event || {})
}

function parseOssEvent(event) {
  const raw = normalizeEventInput(event)
  console.log('原始事件长度:', raw.length, 'bytes')

  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('事件不是有效 JSON 对象')
  }

  if (Array.isArray(parsed.events)) {
    console.log('事件解析成功，包含', parsed.events.length, '个事件')
    parsed.events.forEach((item, index) => {
      console.log(`事件 ${index + 1}:`, {
        类型: item?.eventName,
        Bucket: item?.oss?.bucket?.name,
        文件: item?.oss?.object?.key,
        大小: item?.oss?.object?.size ? `${(item.oss.object.size / 1024 / 1024).toFixed(2)} MB` : '未知',
      })
    })
  } else {
    console.warn('事件格式异常，无 events 字段')
  }

  return parsed
}

exports.handler = function handler(event, context, callback) {
  const done = createSafeDone(callback)
  const startTime = Date.now()

  if (!CONFIG.webhookHost || !CONFIG.webhookToken) {
    finishFailure(done, {
      message: '缺少环境变量 WEBHOOK_HOST 或 WEBHOOK_TOKEN',
      requestId: context.requestId,
    })
    return
  }

  console.log('========================================')
  console.log('函数触发时间:', new Date().toISOString())
  console.log('请求 ID:', context.requestId)
  console.log(
    '转发目标:',
    `${CONFIG.webhookProtocol}//${CONFIG.webhookHost}:${CONFIG.webhookPort}${CONFIG.webhookPath}`,
  )
  console.log('========================================')

  let ossEvent
  try {
    ossEvent = parseOssEvent(event)
  } catch (error) {
    console.error('解析事件失败:', error.message)
    finishFailure(done, {
      message: '解析 OSS 事件失败',
      error: error.message,
      requestId: context.requestId,
      duration: Date.now() - startTime,
    })
    return
  }

  const postData = JSON.stringify(ossEvent)
  console.log('准备转发数据大小:', postData.length, 'bytes')

  const requestImpl = CONFIG.webhookProtocol === 'https:' ? https : http
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'AliyunFC-OSS-Trigger/2.2',
    'X-FC-Request-Id': context.requestId,
    'X-Webhook-Token': CONFIG.webhookToken,
  }

  if (CONFIG.webhookHostHeader) {
    headers.Host = CONFIG.webhookHostHeader
  }

  const req = requestImpl.request(
    {
      hostname: CONFIG.webhookHost,
      port: CONFIG.webhookPort,
      path: CONFIG.webhookPath,
      method: 'POST',
      headers,
      timeout: CONFIG.timeoutMs,
    },
    (res) => {
      let responseBody = ''
      res.setEncoding('utf8')

      res.on('data', (chunk) => {
        responseBody += chunk
      })

      res.on('end', () => {
        const duration = Date.now() - startTime
        const preview = responseBody.slice(0, CONFIG.maxResponsePreview)
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300

        console.log('========================================')
        console.log(isSuccess ? '转发成功' : '转发失败')
        console.log('Webhook 响应状态:', res.statusCode)
        console.log('Webhook 响应头 Location:', res.headers.location || '')
        console.log('Webhook 响应内容:', preview)
        console.log('总耗时:', duration, 'ms')
        console.log('========================================')

        if (!isSuccess) {
          finishFailure(done, {
            message: `Webhook 返回非 2xx 状态码：${res.statusCode}`,
            webhookStatus: res.statusCode,
            webhookLocation: res.headers.location || null,
            webhookResponse: preview,
            requestId: context.requestId,
            duration,
          })
          return
        }

        finishSuccess(done, {
          message: '转发成功',
          webhookStatus: res.statusCode,
          requestId: context.requestId,
          duration,
        })
      })
    },
  )

  req.on('error', (error) => {
    const duration = Date.now() - startTime
    console.error('========================================')
    console.error('转发失败')
    console.error('错误信息:', error.message)
    console.error('错误代码:', error.code || '未知')
    console.error('总耗时:', duration, 'ms')
    console.error('========================================')

    finishFailure(done, {
      message: 'Webhook 请求失败',
      error: error.message,
      code: error.code || null,
      requestId: context.requestId,
      duration,
    })
  })

  req.on('timeout', () => {
    req.destroy(new Error(`Webhook 请求超时（${CONFIG.timeoutMs}ms）`))
  })

  req.write(postData)
  req.end()
}
