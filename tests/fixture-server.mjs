import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'

const port = Number(process.env.SSE_TEST_PORT || 3002)
const output = process.env.SSE_TEST_OUTPUT
const array = '[null,{"nested":[null,"你好",null],"empty":null},null,[null,2,null],null]'
const object = '{"event":"message.delta","data":{"delta":"你好🙂","nested":{"ok":true,"empty":null}},"seq":1}'
const cases = [
  { name: 'object-json', text: `event: delta\nid: 1\ndata: ${object}\n\n`, messages: [object], autoParseJson: true },
  { name: 'object-text', text: `data: ${object}\n\n`, messages: [object], autoParseJson: false },
  { name: 'array-null', text: `data: ${array}\n\n`, messages: [array], autoParseJson: true },
  { name: 'unicode-split', text: `data: ${object}\n\n`, messages: [object], autoParseJson: true, split: true },
  { name: 'cr-only', text: 'event: delta\rdata: hello\rdata: world\r\r', messages: ['hello\nworld'], hold: true },
  { name: 'crlf-split', text: 'data: first\r\n\r\ndata: second\r\n\r\n', messages: ['first', 'second'], split: true },
  { name: 'burst', text: Array.from({ length: 681 }, (_, i) => `data: {"seq":${i},"text":"你好🙂","values":[null,${i},null]}\n\n`).join(''), autoParseJson: true,
    messages: Array.from({ length: 681 }, (_, i) => JSON.stringify({ seq: i, text: '你好🙂', values: [null, i, null] })) },
  { name: 'jsonl', protocol: 'jsonl', text: `${object}\n${array}\n`, messages: [object, array], autoParseJson: true },
  { name: 'raw', protocol: 'raw', text: '你好🙂\nraw text\n', messages: [], split: true },
  { name: 'http-error-1', status: 404, messages: [], error: 9030004 },
  { name: 'http-error-2', status: 404, messages: [], error: 9030004 },
  { name: 'invalid-url', url: '', messages: [], error: 9030002 },
  { name: 'immediate-abort', text: 'data: unexpected\n\n', messages: [], abort: true }
]
if (process.env.SSE_TEST_SNAPSHOT) {
  const text = await fs.readFile(process.env.SSE_TEST_SNAPSHOT, 'utf8')
  const messages = text.split('\n\n').filter(block => block.trim()).map(block =>
    block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n'))
  cases.push({ name: 'saved-snapshot', text, messages, autoParseJson: true })
}
const reports = []
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (url.pathname === '/cases') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(cases))
    return
  }
  if (url.pathname === '/reports') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(reports))
    return
  }
  if (url.pathname === '/results' && req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    const report = JSON.parse(body)
    reports.push(report)
    if (output) {
      await fs.mkdir(output, { recursive: true })
      await fs.writeFile(path.join(output, `native-${report.platform}-${Date.now()}.json`), JSON.stringify(report, null, 2))
    }
    console.log(JSON.stringify({ report: reports.length, platform: report.platform, passed: report.results.filter(r => r.pass).length, callbacksPassed: report.results.filter(r => r.callbacksPass).length, total: report.results.length }))
    res.end('ok')
    return
  }
  const fixture = cases.find(entry => url.pathname === `/${entry.name}`)
  if (!fixture) { res.writeHead(404); res.end(); return }
  if (fixture.status) { res.writeHead(fixture.status); res.end(); return }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
  res.flushHeaders()
  const bytes = Buffer.from(fixture.text)
  if (fixture.split) {
    const position = bytes.indexOf(Buffer.from('你'))
    const boundary = position >= 0 ? position + 1 : bytes.indexOf(13) + 1
    res.write(bytes.subarray(0, boundary))
    // Deliberately expose an incomplete UTF-8 scalar / CRLF to URLSession.
    const timer = setTimeout(() => res.end(bytes.subarray(boundary)), 120)
    res.on('close', () => clearTimeout(timer))
  } else if (fixture.hold) {
    // The client must receive the complete message and abort without waiting for EOF.
    res.write(bytes)
  } else {
    res.end(bytes)
  }
})
server.listen(port, '127.0.0.1', () => console.log(`SSE fixtures listening on ${port}`))
