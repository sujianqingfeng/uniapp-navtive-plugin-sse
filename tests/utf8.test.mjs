import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('iOS incremental UTF-8 decoder preserves split characters and malformed input', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const directory = await mkdtemp(path.join(tmpdir(), 'hens-sse-utf8-'))
  try {
    const executable = path.join(directory, 'utf8-test')
    const compile = spawnSync('swiftc', [
      path.join(root, 'uniapp-sse-playground/uni_modules/hens-sse/utssdk/app-ios/SSEUTF8Decoder.swift'),
      path.join(root, 'tests/UTF8DecoderTests.swift'), '-o', executable
    ], { encoding: 'utf8' })
    assert.equal(compile.status, 0, compile.stderr)
    const run = spawnSync(executable, [], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    console.log(run.stdout.trim())
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
