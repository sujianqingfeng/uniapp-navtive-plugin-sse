import { connectStream } from '@/uni_modules/hens-sse'

export const WANGAI_STREAM_TIMEOUT = 30 * 60 * 1000

const WANGAI_PREFIX = '/wang-ai'
const harmonySimulatorHost = '192.168.123.56'

function isKnownStatusCode(statusCode) {
  const code = Number(statusCode)
  return Number.isFinite(code)
}

function isSuccessStatusCode(statusCode) {
  const code = Number(statusCode)
  if (!Number.isFinite(code)) {
    return true
  }
  return code >= 200 && code < 300
}

function safeCall(handler, payload) {
  if (typeof handler !== 'function') {
    return
  }
  handler(payload)
}

export function normalizeBaseUrl(baseUrl = '') {
  return `${baseUrl || ''}`.trim().replace(/\/+$/, '')
}

export function normalizeRuntimeUrl(url = '') {
  let resolved = `${url || ''}`.trim()

  // #ifdef APP-ANDROID
  const androidPatterns = ['://localhost', '://127.0.0.1', '://[::1]']
  for (let index = 0; index < androidPatterns.length; index += 1) {
    const pattern = androidPatterns[index]
    if (resolved.indexOf(pattern) !== -1) {
      resolved = resolved.replace(pattern, '://10.0.2.2')
    }
  }
  // #endif

  // #ifdef APP-HARMONY
  const harmonyPatterns = ['://localhost', '://127.0.0.1', '://[::1]']
  for (let index = 0; index < harmonyPatterns.length; index += 1) {
    const pattern = harmonyPatterns[index]
    if (resolved.indexOf(pattern) !== -1) {
      resolved = resolved.replace(pattern, `://${harmonySimulatorHost}`)
    }
  }
  // #endif

  return resolved
}

export function buildAgentHeaders({
  token = '',
  sourcePlatform = 'IWANGKE',
  platformClient = 'iwangke',
  contentType = 'application/json'
} = {}) {
  const headers = {}
  const normalizedToken = `${token || ''}`.trim()
  const normalizedSourcePlatform = `${sourcePlatform || ''}`.trim()
  const normalizedPlatformClient = `${platformClient || ''}`.trim()

  if (contentType) {
    headers['content-type'] = `${contentType}; charset=utf-8`
  }
  if (normalizedSourcePlatform) {
    headers['x-source-platform'] = normalizedSourcePlatform
  }
  if (normalizedPlatformClient) {
    headers['x-platform-client'] = normalizedPlatformClient
  }
  if (normalizedToken) {
    headers['x-auth-token'] = normalizedToken
    headers.Authorization = `Bearer ${normalizedToken}`
  }

  return headers
}

export function buildCreateThreadUrl(baseUrl = '') {
  return `${normalizeBaseUrl(baseUrl)}${WANGAI_PREFIX}/app/report-sessions`
}

export function buildStartStreamUrl(baseUrl = '') {
  return `${normalizeBaseUrl(baseUrl)}${WANGAI_PREFIX}/app/agent/runs/stream`
}

export function buildResumeStreamUrl(baseUrl = '', threadId = '', runId = '') {
  const normalizedThreadId = `${threadId || ''}`.trim()
  const normalizedRunId = `${runId || ''}`.trim()
  return `${normalizeBaseUrl(baseUrl)}${WANGAI_PREFIX}/app/agent/threads/${normalizedThreadId}/runs/${normalizedRunId}/stream`
}

export function buildCurrentRunIdUrl(baseUrl = '', threadId = '') {
  const normalizedThreadId = `${threadId || ''}`.trim()
  return `${normalizeBaseUrl(baseUrl)}${WANGAI_PREFIX}/app/agent/threads/${normalizedThreadId}/run-id`
}

export function buildThreadHistoryUrl(baseUrl = '', threadId = '') {
  const normalizedThreadId = `${threadId || ''}`.trim()
  return `${normalizeBaseUrl(baseUrl)}${WANGAI_PREFIX}/app/agent/v2/threads/${normalizedThreadId}/history`
}

export function buildCancelStreamUrl(baseUrl = '', threadId = '', runId = '', reportId = '') {
  const normalizedThreadId = `${threadId || ''}`.trim()
  const normalizedRunId = `${runId || ''}`.trim()
  const normalizedReportId = `${reportId || ''}`.trim()
  return `${normalizeBaseUrl(baseUrl)}${WANGAI_PREFIX}/app/agent/threads/${normalizedThreadId}/runs/${normalizedRunId}/cancel/${normalizedReportId}`
}

export function buildStartPayload({
  prompt = '',
  threadId = '',
  templateId = '',
  templateType = 2,
  docInfo = []
} = {}) {
  return {
    docInfo: Array.isArray(docInfo) ? docInfo : [],
    prompt: `${prompt || ''}`,
    runScene: 'normal',
    templateId: `${templateId || ''}`,
    templateType: Number(templateType) || 2,
    threadId: `${threadId || ''}`.trim()
  }
}

export function buildRetryPayload({
  prompt = '',
  threadId = '',
  runId = '',
  checkpointId = '',
  reportId = '',
  templateId = '',
  templateType = 2,
  docInfo = []
} = {}) {
  return {
    docInfo: Array.isArray(docInfo) ? docInfo : [],
    prompt: `${prompt || ''}`,
    runScene: 'reanalyze',
    templateId: `${templateId || ''}`,
    templateType: Number(templateType) || 2,
    threadId: `${threadId || ''}`.trim(),
    runId: `${runId || ''}`.trim(),
    checkpointId: `${checkpointId || ''}`.trim(),
    reportId: `${reportId || ''}`.trim()
  }
}

export function normalizeAgentStreamError(error) {
  const message = error?.errMsg || error?.message || error?.msg || '网络异常，请稍后重试'
  const code = error?.errCode ?? error?.code ?? ''

  return {
    message,
    code,
    raw: error || null
  }
}

export function createWangaiAgentStreamBridge({
  url = '',
  method = 'GET',
  headers = {},
  body = null,
  timeout = WANGAI_STREAM_TIMEOUT,
  debug = true,
  onOpen,
  onChunk,
  onMessage,
  onError,
  onClose
} = {}) {
  let connection = null
  let closed = false
  let closeEmitted = false
  let lastError = null
  let abortMeta = {
    silent: false,
    reason: ''
  }

  const emitCloseOnce = (payload) => {
    if (closeEmitted) {
      return
    }
    closeEmitted = true
    safeCall(onClose, payload)
  }

  const cleanup = () => {
    try {
      connection?.offOpen?.()
      connection?.offChunk?.()
      connection?.offMessage?.()
      connection?.offError?.()
      connection?.offComplete?.()
    } catch (error) {
    }
  }

  const finish = ({ reason } = {}) => {
    if (closed) {
      return
    }
    closed = true
    const isSilentAbort = abortMeta.silent === true
    cleanup()
    const finalReason = reason || abortMeta.reason || (lastError ? 'error' : 'normal-complete')
    if (!isSilentAbort) {
      emitCloseOnce({
        reason: finalReason,
        error: lastError
      })
    }
  }

  if (!url) {
    const invalidUrlError = normalizeAgentStreamError({
      message: '缺少流地址'
    })
    safeCall(onError, invalidUrlError)
    emitCloseOnce({
      reason: 'error',
      error: invalidUrlError
    })
    return {
      abort() {}
    }
  }

  try {
    connection = connectStream({
      url: normalizeRuntimeUrl(url),
      method,
      headers,
      body,
      timeout,
      protocol: 'sse',
      autoParseJson: false,
      debug,
      onOpen: (event) => {
        if (closed) {
          return
        }
        if (!isSuccessStatusCode(event?.statusCode)) {
          return
        }
        safeCall(onOpen, event)
      },

      onChunk: (event) => {
        if (closed) {
          return
        }
        safeCall(onChunk, event)
      },

      onMessage: (event) => {
        if (closed) {
          return
        }
        safeCall(onMessage, event)
      },

      onError: (error) => {
        if (closed) {
          return
        }
        lastError = normalizeAgentStreamError(error)
        safeCall(onError, lastError)
      },

      onComplete: () => {
        finish({
          reason: abortMeta.reason || (lastError ? 'error' : 'normal-complete')
        })
      },
    })
  } catch (error) {
    const normalizedError = normalizeAgentStreamError(error)
    lastError = normalizedError
    safeCall(onError, normalizedError)
    emitCloseOnce({
      reason: 'error',
      error: normalizedError
    })
    return {
      abort() {}
    }
  }

  return {
    abort({ silent = false, reason = '' } = {}) {
      if (closed) {
        return
      }

      abortMeta = {
        silent: silent === true,
        reason: reason || (silent ? 'dispose-abort' : 'manual-abort')
      }

      try {
        connection?.abort?.()
      } catch (error) {
        if (abortMeta.silent) {
          finish({ reason: abortMeta.reason })
          return
        }
        lastError = normalizeAgentStreamError(error)
        safeCall(onError, lastError)
        finish({ reason: 'error' })
        return
      }

      if (abortMeta.silent) {
        finish({ reason: abortMeta.reason })
      }
    }
  }
}

export function shouldTreatOpenAsSuccess(statusCode) {
  if (!isKnownStatusCode(statusCode)) {
    return true
  }
  return isSuccessStatusCode(statusCode)
}
