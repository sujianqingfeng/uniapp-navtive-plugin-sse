function createStreamError(code, message, data) {
  return {
    errSubject: 'hens-sse-stream-api',
    errCode: code,
    errMsg: message || 'Stream error',
    data: data || null,
  }
}

const LOG_TAG = '[hens-sse]'
let webRequestIndex = 0

function nextRequestId() {
  webRequestIndex += 1
  return `sse_${Date.now()}_${webRequestIndex}`
}

function normalizeDebug(debug) {
  return debug === true
}

function logDebug(enabled, requestId, stage, data = null) {
  if (!enabled) return
  const prefix = `${LOG_TAG} [${requestId}] ${stage}`
  if (data != null) {
    console.log(prefix, data)
    return
  }
  console.log(prefix)
}

class WebStreamConnection {
  constructor(options) {
    this.openCallback = options.onOpen || null
    this.chunkCallback = options.onChunk || null
    this.messageCallback = options.onMessage || null
    this.errorCallback = options.onError || null
    this.completeCallback = options.onComplete || null
    this.completed = false
    this.aborter = null
  }

  setAborter(aborter) {
    this.aborter = aborter
  }

  abort() {
    if (this.completed) return
    try { this.aborter && this.aborter() } catch (_) {}
    this.finishOnce()
  }

  onOpen(callback) { this.openCallback = callback || null }
  offOpen() { this.openCallback = null }
  onChunk(callback) { this.chunkCallback = callback || null }
  offChunk() { this.chunkCallback = null }
  onMessage(callback) { this.messageCallback = callback || null }
  offMessage() { this.messageCallback = null }
  onError(callback) { this.errorCallback = callback || null }
  offError() { this.errorCallback = null }
  onComplete(callback) { this.completeCallback = callback || null }
  offComplete() { this.completeCallback = null }

  emitOpen(evt) { if (!this.completed && this.openCallback) this.openCallback(evt) }
  emitChunk(text) { if (!this.completed && text && this.chunkCallback) this.chunkCallback({ text }) }
  emitMessage(evt) { if (!this.completed && this.messageCallback) this.messageCallback(evt) }
  emitError(err) { if (!this.completed && this.errorCallback) this.errorCallback(err) }
  finishOnce() {
    if (this.completed) return
    this.completed = true
    if (this.completeCallback) this.completeCallback()
  }
}

function normalizeProtocol(protocol) {
  return protocol || 'sse'
}

function parseDataText(dataText) {
  if (!dataText) return ''
  const text = dataText.trim()
  if (!text) return ''
  const looksLikeJsonObject = text.startsWith('{') && text.endsWith('}')
  const looksLikeJsonArray = text.startsWith('[') && text.endsWith(']')
  if (!looksLikeJsonObject && !looksLikeJsonArray) return dataText
  try {
    const parsed = JSON.parse(text)
    return parsed == null ? dataText : parsed
  } catch (_) {
    return dataText
  }
}

function resolveAutoParseJson(protocol, autoParseJson) {
  if (autoParseJson != null) return autoParseJson === true
  return protocol === 'jsonl'
}

function parseLineBuffer(buffer, final, autoParseJson = false) {
  const messages = []
  let rest = buffer
  while (true) {
    const idx = rest.indexOf('\n')
    if (idx === -1) break
    let line = rest.slice(0, idx)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    rest = rest.slice(idx + 1)
    messages.push({ data: autoParseJson ? parseDataText(line) : line, rawText: line })
  }
  if (final && rest.length > 0) {
    let line = rest
    if (line.endsWith('\r')) line = line.slice(0, -1)
    messages.push({ data: autoParseJson ? parseDataText(line) : line, rawText: line })
    rest = ''
  }
  return { messages, rest }
}

function parseJsonlBuffer(buffer, final, autoParseJson = true) {
  return parseLineBuffer(buffer, final, autoParseJson)
}

function parseSseBlock(block, autoParseJson = false) {
  const lines = block.split('\n')
  let event = null
  let id = null
  const dataLines = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'id') id = value
    else if (field === 'data') dataLines.push(value)
  }
  if (!event && !id && dataLines.length === 0) return null
  const rawText = dataLines.join('\n')
  const msg = { data: autoParseJson ? parseDataText(rawText) : rawText, rawText }
  if (event) msg.event = event
  if (id) msg.id = id
  return msg
}

function parseSseBuffer(buffer, final, autoParseJson = false) {
  const messages = []
  // Use string splitting: the iOS UTS regexp implementation misindexes Unicode text.
  const trailingCr = buffer.endsWith('\r')
  let rest = buffer.split('\r\n').join('\n').split('\r').join('\n')
  while (true) {
    const index = rest.indexOf('\n\n')
    if (index == -1) break
    const msg = parseSseBlock(rest.slice(0, index), autoParseJson)
    if (msg != null) messages.push(msg)
    rest = rest.slice(index + 2)
  }
  if (final) {
    if (rest.length > 0) {
      const msg = parseSseBlock(rest, autoParseJson)
      if (msg != null) messages.push(msg)
    }
    rest = ''
  } else if (trailingCr) {
    // Preserve CR until the next chunk so a split CRLF is still one line ending.
    rest = rest.endsWith('\n') ? rest.slice(0, -1) + '\r' : rest + '\r'
  }
  return { messages, rest }
}

function parseBuffer(protocol, buffer, final, autoParseJson = null) {
  const shouldAutoParseJson = resolveAutoParseJson(protocol, autoParseJson)
  switch (protocol) {
    case 'line':
      return parseLineBuffer(buffer, final, shouldAutoParseJson)
    case 'jsonl':
      return parseJsonlBuffer(buffer, final, shouldAutoParseJson)
    case 'raw':
      return { messages: [], rest: final ? '' : buffer }
    case 'sse':
    default:
      return parseSseBuffer(buffer, final, shouldAutoParseJson)
  }
}

function buildHeaders(custom, protocol) {
  const headers = new Headers()
  headers.set('Accept', protocol === 'sse' ? 'text/event-stream' : 'text/plain')
  if (custom && typeof custom === 'object') {
    Object.keys(custom).forEach((key) => {
      const value = custom[key]
      if (value == null) return
      headers.set(key, String(value))
    })
  }
  return headers
}

function isAbortError(err) {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    String((err && err.message) || err).toLowerCase().includes('aborted')
  )
}

export function connectStream(options) {
  const connection = new WebStreamConnection(options || {})
  const protocol = normalizeProtocol(options && options.protocol)
  const autoParseJson = !options || options.autoParseJson == null ? null : options.autoParseJson === true
  const debugEnabled = normalizeDebug(options && options.debug)
  const requestId = nextRequestId()
  const controller = new AbortController()
  connection.setAborter(() => {
    logDebug(debugEnabled, requestId, 'abort')
    controller.abort()
  })

  setTimeout(async () => {
    try {
      if (!options || !options.url || String(options.url).trim().length === 0) {
        const err = createStreamError(9030002, 'Invalid stream URL')
        logDebug(debugEnabled, requestId, 'error', err)
        connection.emitError(err)
        connection.finishOnce()
        return
      }

      logDebug(debugEnabled, requestId, 'connect', {
        url: options.url,
        method: options.method || 'GET',
        protocol,
        autoParseJson,
        hasHeaders: !!options.headers,
        hasBody: options.body != null,
      })

      const response = await fetch(options.url, {
        method: options.method || 'GET',
        headers: buildHeaders(options.headers, protocol),
        body: options.body == null ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)),
        signal: controller.signal,
        cache: 'no-cache',
        mode: 'cors'
      })

      const headerObj = {}
      response.headers.forEach((value, key) => {
        headerObj[key] = value
      })
      logDebug(debugEnabled, requestId, 'open', { statusCode: response.status, headers: headerObj })
      connection.emitOpen({ statusCode: response.status, headers: headerObj })

      if (!response.ok) {
        const err = createStreamError(9030004, `HTTP ${response.status}`, { statusCode: response.status })
        logDebug(debugEnabled, requestId, 'error', err)
        connection.emitError(err)
        connection.finishOnce()
        return
      }

      if (!response.body || typeof response.body.getReader !== 'function') {
        const err = createStreamError(9030007, 'ReadableStream is not supported in this environment')
        logDebug(debugEnabled, requestId, 'error', err)
        connection.emitError(err)
        connection.finishOnce()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        if (text.length > 0) {
          logDebug(debugEnabled, requestId, 'chunk', { length: text.length, text })
          connection.emitChunk(text)
          if (protocol === 'raw') continue
          buffer += text
          const parsed = parseBuffer(protocol, buffer, false, autoParseJson)
          buffer = parsed.rest
          parsed.messages.forEach((msg) => {
            logDebug(debugEnabled, requestId, 'message', msg)
            connection.emitMessage(msg)
          })
        }
      }

      const tail = decoder.decode()
      if (tail.length > 0) {
        logDebug(debugEnabled, requestId, 'chunk', { length: tail.length, text: tail })
        connection.emitChunk(tail)
        if (protocol !== 'raw') buffer += tail
      }
      if (protocol !== 'raw') {
        const parsed = parseBuffer(protocol, buffer, true, autoParseJson)
        parsed.messages.forEach((msg) => {
          logDebug(debugEnabled, requestId, 'message', msg)
          connection.emitMessage(msg)
        })
      }
    } catch (err) {
      if (!isAbortError(err)) {
        const streamErr = createStreamError(9030003, err instanceof Error ? err.message : String(err))
        logDebug(debugEnabled, requestId, 'error', streamErr)
        connection.emitError(streamErr)
      }
    } finally {
      logDebug(debugEnabled, requestId, 'complete')
      connection.finishOnce()
    }
  }, 0)

  return connection
}

export { createStreamError }
