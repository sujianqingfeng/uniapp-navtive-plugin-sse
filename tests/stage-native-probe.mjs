import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [destination, baseUrl, platform] = process.argv.slice(2)
if (!destination || !baseUrl || !['ios', 'android'].includes(platform)) {
  throw Error('Usage: node tests/stage-native-probe.mjs <empty external directory> <fixture base URL> <ios|android>')
}
const root = fileURLToPath(new URL('../', import.meta.url))
const source = path.join(root, 'uniapp-sse-playground')
const target = path.resolve(destination)
if (target.startsWith(root) || !path.isAbsolute(destination)) throw Error('Use an external absolute directory')
await fs.mkdir(target) // Refuse to overwrite an existing project.
await fs.cp(source, target, {
  recursive: true,
  filter: entry => !['unpackage', 'dist', 'node_modules', '.git', '.DS_Store'].includes(path.basename(entry))
})
await fs.copyFile(path.join(root, 'tests/native-probe.js'), path.join(target, 'utils/native-probe.js'))
await fs.writeFile(path.join(target, 'pages/index/index.vue'), `<template>
  <view style="padding:30px"><text>{{ status }}</text></view>
</template>
<script>
import { connectStream } from '@/uni_modules/hens-sse'
import { runNativeRegressions } from '../../utils/native-probe.js'
export default {
  data() { return { status: 'Starting native regression' } },
  async onReady() {
    const request = (url, data) => new Promise((resolve, reject) => uni.request({
      url, method: data ? 'POST' : 'GET', data,
      success: res => resolve(res.data), fail: reject
    }))
    try {
      this.status = 'Running native regression'
      const report = await runNativeRegressions(connectStream, ${JSON.stringify(baseUrl)}, request, ${JSON.stringify(platform)})
      this.status = JSON.stringify(report.results.map(result => [result.name, result.pass]))
    } catch (error) {
      this.status = String(error)
      await request(${JSON.stringify(baseUrl + '/results')}, { platform: ${JSON.stringify(platform)}, results: [{ name: 'harness', pass: false, error: String(error) }] })
    }
  }
}
</script>
`)
console.log(target)
