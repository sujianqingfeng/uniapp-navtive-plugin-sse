function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    const result = {}
    Object.keys(value).sort().forEach(key => { result[key] = stable(value[key]) })
    return result
  }
  return value
}

// Run this in a real classic app service; JS-only tests cannot exercise UTS bridging.
export async function runNativeRegressions(connectStream, baseUrl, request, platform) {
  const cases = await request(`${baseUrl}/cases`)
  const results = []
  for (const fixture of cases) {
    const result = { name: fixture.name, events: [], chunks: '', messages: [], errors: [], completes: 0 }
    let connection
    let resolveComplete
    const complete = new Promise(resolve => { resolveComplete = resolve })
    const timer = setTimeout(() => { result.timeout = true; resolveComplete() }, 6000)
    connection = connectStream({
      url: fixture.url === '' ? '' : `${baseUrl}/${fixture.name}`,
      protocol: fixture.protocol || 'sse',
      autoParseJson: fixture.autoParseJson || false,
      onOpen: evt => { result.events.push('open'); result.status = evt.statusCode },
      onChunk: evt => { result.events.push('chunk'); result.chunks += evt.text },
      onMessage: evt => {
        result.events.push('message')
        result.messages.push({ rawText: evt.rawText, data: stable(evt.data), event: evt.event, id: evt.id })
        if (fixture.hold) connection.abort()
      },
      onError: err => { result.events.push('error'); result.errors.push(err.errCode) },
      onComplete: () => { result.events.push('complete'); result.completes++; resolveComplete() }
    })
    if (fixture.abort) connection.abort()
    await complete
    clearTimeout(timer)
    connection.abort()
    const expectedData = fixture.messages.map(text => fixture.autoParseJson ? stable(JSON.parse(text)) : text)
    result.callbacksPass = !result.timeout && result.completes === 1 && result.events[result.events.length - 1] === 'complete' &&
      JSON.stringify(result.messages.map(m => m.rawText)) === JSON.stringify(fixture.messages) &&
      JSON.stringify(result.errors) === JSON.stringify(fixture.error ? [fixture.error] : []) &&
      (fixture.abort ? result.events.join(',') === 'complete' : fixture.url === '' || result.events[0] === 'open') &&
      (fixture.abort || fixture.url === '' || result.status === (fixture.status || 200)) &&
      (!fixture.text || fixture.abort || result.chunks === fixture.text)
    result.dataPass = JSON.stringify(result.messages.map(m => m.data)) === JSON.stringify(expectedData)
    result.pass = result.callbacksPass && result.dataPass
    // Keep failures reviewable without writing hundreds of successful messages to the report.
    result.messageCount = result.messages.length
    result.chunkCount = result.events.filter(event => event === 'chunk').length
    if (result.pass) { delete result.chunks; delete result.messages; delete result.events }
    results.push(result)
  }
  const report = { platform, results }
  await request(`${baseUrl}/results`, report)
  return report
}
