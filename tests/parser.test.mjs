import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const plugin = new URL('../uniapp-sse-playground/uni_modules/hens-sse/utssdk/', import.meta.url)
globalThis.UTSJSONObject = class {
  constructor(value) { Object.assign(this, value) }
}

for (const source of ['internal/parser.uts', 'web/index.js']) {
  let code = await fs.readFile(new URL(source, plugin), 'utf8')
  if (source.endsWith('.uts')) {
    code = stripTypeScriptTypes(code.replace(/^import .*$/m, '').replace(/\/\/ #ifdef APP-IOS[\s\S]*?\/\/ #endif/g, ''))
  } else {
    code += '\nexport { parseBuffer }'
  }
  const { parseBuffer } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  function consume(chunks, final = false, protocol = 'sse', autoParseJson = true) {
    let rest = ''
    const messages = []
    for (const chunk of chunks) {
      const result = parseBuffer(protocol, rest + chunk, false, autoParseJson)
      rest = result.rest
      messages.push(...result.messages)
    }
    if (final) messages.push(...parseBuffer(protocol, rest, true, autoParseJson).messages)
    return messages.map(msg => ({ event: msg.event || '', id: msg.id || '', rawText: msg.rawText, data: msg.data }))
  }

  test(`${source}: CR, LF, CRLF and mixed delimiters dispatch before EOF at every split`, () => {
    for (const lines of [['\n'], ['\r'], ['\r\n'], ['\r', '\n', '\r\n']]) {
      let delimiter = '\n'
      const payload = [': heartbeat', 'event: delta', 'id: 7', 'data: 你好', 'data: world', '', 'data:', '', 'data: last', '']
        .map((line, index) => {
          // CR followed by LF is one delimiter, so an empty line repeats its predecessor.
          if (line !== '') delimiter = lines[index % lines.length]
          return line + delimiter
        }).join('')
      const expected = [
        { event: 'delta', id: '7', rawText: '你好\nworld', data: '你好\nworld' },
        { event: '', id: '', rawText: '', data: '' },
        { event: '', id: '', rawText: 'last', data: 'last' }
      ]
      for (let i = 0; i <= payload.length; i++) {
        for (let j = i; j <= payload.length; j++) {
          assert.deepEqual(consume([payload.slice(0, i), payload.slice(i, j), payload.slice(j)]), expected, `${JSON.stringify(lines)} at ${i}, ${j}`)
        }
      }
      assert.deepEqual(consume([...payload]), expected)
    }
  })

  test(`${source}: data JSON, null positions, multiline and incomplete EOF retain their values`, () => {
    const array = '[null,{"nested":[null,"你好",null]},null,[null,2,null],null]'
    const message = consume([`data: ${array}\n\n`])[0]
    assert.deepEqual(message.data, JSON.parse(array))
    assert.equal(message.rawText, array)
    assert.equal(consume(['data: {broken}\n\n'])[0].data, '{broken}')
    assert.equal(consume(['data: {"ok":true}\n\n'], false, 'sse', false)[0].data, '{"ok":true}')
    assert.equal(consume(['data: partial'], false).length, 0)
    assert.equal(consume(['data: partial'], true)[0].data, 'partial')
    assert.deepEqual(consume([': heartbeat\r\r']), [])
    assert.equal(consume(['data: value\r', '\n\r', '\ndata: next\r\n\r\n']).length, 2)
  })
}
