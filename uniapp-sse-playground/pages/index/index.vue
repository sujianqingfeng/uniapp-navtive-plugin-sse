<template>
  <scroll-view class="page" scroll-y>
    <view class="container">
      <view class="hero">
        <text class="title">流式接口测试</text>
        <text class="subtitle">标准 SSE、逐行文本、JSONL 与原始文本流的统一验证工具</text>
        <view class="entry-card" @click="goToWangaiAgentPage">
          <text class="entry-title">业务仿真页</text>
          <text class="entry-text">按 `agent-new` 的 start、resume、retry、stop 方式测试插件</text>
        </view>
      </view>

      <view class="card">
        <text class="section-title">01 / 配置</text>

        <text class="label">协议</text>
        <view class="tabs">
          <view
            v-for="(label, index) in protocolLabels"
            :key="label"
            class="tab"
            :class="{ active: protocolIndex === index }"
            @click="pickProtocol(index)"
          >
            <text class="tab-text" :class="{ 'tab-text-active': protocolIndex === index }">{{ label }}</text>
          </view>
        </view>

        <text class="label">URL</text>
        <input v-model="serverUrl" class="input" placeholder="请输入流式接口地址" />

        <text class="label">请求方法</text>
        <view class="tabs compact">
          <view
            v-for="(item, index) in methods"
            :key="item"
            class="tab"
            :class="{ active: methodIndex === index }"
            @click="pickMethod(index)"
          >
            <text class="tab-text" :class="{ 'tab-text-active': methodIndex === index }">{{ item }}</text>
          </view>
        </view>

        <text class="label">消息数据解析</text>
        <view class="tabs compact">
          <view
            v-for="(item, index) in parseModeLabels"
            :key="item"
            class="tab"
            :class="{ active: parseModeIndex === index }"
            @click="pickParseMode(index)"
          >
            <text class="tab-text" :class="{ 'tab-text-active': parseModeIndex === index }">{{ item }}</text>
          </view>
        </view>

        <text class="label">请求体（JSON 或纯文本，可留空）</text>
        <textarea
          v-model="requestBody"
          class="textarea"
          auto-height
          placeholder='例如：{"topic":"demo"}'
        />
      </view>

      <view class="card">
        <text class="section-title">02 / 操作</text>
        <view class="actions">
          <view class="btn primary" @click="startStream">
            <text class="btn-text primary-text">开始</text>
          </view>
          <view class="btn" @click="stopStream">
            <text class="btn-text">停止</text>
          </view>
        </view>

        <view class="status-box">
          <view class="status-row">
            <text class="status-label">状态</text>
            <text class="status-value">{{ statusText }}</text>
          </view>
          <view class="divider"></view>
          <view class="status-row">
            <text class="status-label">统计</text>
            <text class="status-value">数据块: {{ chunkCount }} / 消息: {{ messageCount }}</text>
          </view>
        </view>
      </view>

      <view class="card log-card">
        <view class="log-header">
          <text class="section-title">03 / 日志</text>
        </view>
        <view class="log-list">
          <view v-for="(item, index) in logs" :key="index" class="log-item">
            <view class="log-meta">
              <text class="log-time">{{ item.time }}</text>
              <text class="log-kind">{{ item.kind }}</text>
            </view>
            <text class="log-text">{{ item.text }}</text>
          </view>
          <text v-if="logs.length === 0" class="empty">等待连接...</text>
        </view>
      </view>
    </view>
  </scroll-view>
</template>

<script>
import { connectStream } from '@/uni_modules/hens-sse'

const harmonySimulatorHost = '192.168.123.56'

function isAndroidAppRuntime() {
  // #ifdef APP-PLUS
  try {
    return uni.getSystemInfoSync().platform === 'android'
  } catch (error) {
    return false
  }
  // #endif
  return false
}

function resolveDefaultHost() {
  if (isAndroidAppRuntime()) return '10.0.2.2'
  // #ifdef APP-HARMONY
  return harmonySimulatorHost
  // #endif
  return 'localhost'
}

function normalizeRuntimeUrl(url) {
  let resolved = url || ''
  if (isAndroidAppRuntime()) {
    const androidPatterns = [
      '://localhost',
      '://127.0.0.1',
      '://[::1]'
    ]

    for (let i = 0; i < androidPatterns.length; i += 1) {
      const pattern = androidPatterns[i]
      if (resolved.indexOf(pattern) !== -1) {
        resolved = resolved.replace(pattern, '://10.0.2.2')
      }
    }
  }
  // #ifdef APP-HARMONY
  const harmonyPatterns = [
    '://localhost',
    '://127.0.0.1',
    '://[::1]'
  ]

  for (let i = 0; i < harmonyPatterns.length; i += 1) {
    const pattern = harmonyPatterns[i]
    if (resolved.indexOf(pattern) !== -1) {
      resolved = resolved.replace(pattern, `://${harmonySimulatorHost}`)
    }
  }
  // #endif
  return resolved
}

export default {
  data() {
    const host = resolveDefaultHost()

    return {
      protocolLabels: ['SSE', 'Line', 'JSONL', 'Raw'],
      protocolValues: ['sse', 'line', 'jsonl', 'raw'],
      protocolPaths: ['/sse', '/line-stream', '/jsonl-stream', '/raw-stream'],
      bodySamples: [
        '{"topic":"demo","userId":"u_001"}',
        '{"topic":"demo","userId":"u_001"}',
        '{"topic":"demo","userId":"u_001"}',
        'hello stream'
      ],
      methods: ['GET', 'POST'],
      parseModeLabels: ['协议默认', '自动 JSON'],
      protocolIndex: 0,
      methodIndex: 0,
      parseModeIndex: 0,
      serverUrl: `http://${host}:3000/sse`,
      requestBody: '{"topic":"demo","userId":"u_001"}',
      statusText: '未连接',
      chunkCount: 0,
      messageCount: 0,
      logs: [],
      activeConnection: null
    }
  },
  onUnload() {
    this.stopStream()
  },
  methods: {
    pickProtocol(index) {
      this.protocolIndex = index
      const path = this.protocolPaths[index]
      const value = this.protocolValues[index]
      const url = this.serverUrl
      const schemeIndex = url.indexOf('://')
      const searchStart = schemeIndex === -1 ? 0 : schemeIndex + 3
      const slashIndex = url.indexOf('/', searchStart)
      const origin = slashIndex === -1 ? url : url.slice(0, slashIndex)
      this.serverUrl = `${origin}${path}`
      if (this.shouldReplaceRequestBody()) {
        this.requestBody = this.defaultRequestBody(index)
      }
      this.statusText = `已切换协议: ${value}`
    },
    pickMethod(index) {
      this.methodIndex = index
      if (index === 1 && this.shouldReplaceRequestBody()) {
        this.requestBody = this.defaultRequestBody(this.protocolIndex)
      }
    },
    pickParseMode(index) {
      this.parseModeIndex = index
    },
    defaultRequestBody(protocolIndex) {
      const sample = this.bodySamples[protocolIndex]
      return sample || ''
    },
    shouldReplaceRequestBody() {
      const current = (this.requestBody || '').trim()
      if (current.length === 0) return true
      return this.bodySamples.includes(current)
    },
    parseBody() {
      const text = (this.requestBody || '').trim()
      if (text.length === 0) return null
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          return JSON.parse(text)
        } catch (error) {
          return text
        }
      }
      return text
    },
    nowText() {
      const now = new Date()
      const hh = now.getHours().toString().padStart(2, '0')
      const mm = now.getMinutes().toString().padStart(2, '0')
      const ss = now.getSeconds().toString().padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    },
    stringifySafe(value, fallback = '') {
      if (typeof value === 'string') return value
      try {
        const text = JSON.stringify(value)
        return text == null ? fallback : text
      } catch (error) {
        return fallback
      }
    },
    pushLog(kind, text) {
      this.logs.unshift({
        time: this.nowText(),
        kind,
        text: typeof text === 'string' ? text : this.stringifySafe(text, '')
      })
      if (this.logs.length > 80) {
        this.logs = this.logs.slice(0, 80)
      }
    },
    stopStream() {
      if (this.activeConnection) {
        try {
          this.activeConnection.abort()
        } catch (error) {
        }
        this.activeConnection = null
      }
      this.statusText = '已停止'
    },
    goToWangaiAgentPage() {
      uni.navigateTo({
        url: '/pages/wangai-agent/index'
      })
    },
    startStream() {
      this.stopStream()
      this.logs = []
      this.chunkCount = 0
      this.messageCount = 0

      const inputUrl = this.serverUrl
      const url = normalizeRuntimeUrl(inputUrl)
      const protocol = this.protocolValues[this.protocolIndex]
      const method = this.methods[this.methodIndex]
      const autoParseJson = this.parseModeIndex === 1 ? true : null
      const body = method === 'POST' ? this.parseBody() : null
      const headers = { 'X-Demo-Protocol': `${protocol}` }

      if (url !== inputUrl) {
        this.serverUrl = url
        this.pushLog('config', `runtime remapped localhost to ${url}`)
      }

      if (method === 'POST' && body != null) {
        headers['Content-Type'] = typeof body === 'string'
          ? 'text/plain; charset=utf-8'
          : 'application/json; charset=utf-8'
      }

      this.statusText = `连接中: ${protocol}`
      const connection = connectStream({
        url,
        method,
        protocol,
        autoParseJson,
        debug: true,
        headers,
        body,
        onOpen: (evt) => {
          this.statusText = evt.statusCode > 0 ? `已连接 HTTP ${evt.statusCode}` : '已连接'
          this.pushLog('open', this.stringifySafe(evt.headers, 'open'))
        },

        onChunk: (evt) => {
          this.chunkCount += 1
          this.pushLog('chunk', evt.text)
        },

        onMessage: (evt) => {
          this.messageCount += 1
          const eventName = evt.event != null ? evt.event : 'message'
          this.pushLog(eventName, evt.rawText)
        },

        onError: (err) => {
          this.statusText = `错误: ${err.errMsg}`
          this.pushLog('error', err.errMsg)
        },

        onComplete: () => {
          this.statusText = '已完成'
          this.pushLog('complete', 'stream completed')
        },
      })
      this.activeConnection = connection
    }
  }
}
</script>

<style>
.page {
  height: 100vh;
  background-color: #f5f2ed;
}

.container {
  padding: 32rpx 24rpx 64rpx;
}

.hero {
  margin-bottom: 40rpx;
}

.entry-card {
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 8rpx;
  background: linear-gradient(135deg, #2d2a25 0%, #4f4639 100%);
}

.entry-title {
  display: block;
  color: #f5f2ed;
  font-size: 15px;
}

.entry-text {
  display: block;
  margin-top: 8rpx;
  color: #d7cfc5;
  font-size: 12px;
  line-height: 18px;
}

.title {
  font-size: 32rpx;
  font-weight: 400;
  color: #1a1714;
  letter-spacing: 1rpx;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  font-size: 15px;
  line-height: 24px;
  color: #6b665c;
}

.card {
  margin-bottom: 24rpx;
  padding: 24rpx;
  border-radius: 8rpx;
  background-color: #f5f2ed;
  border: 1px solid #ede6de;
}

.section-title {
  display: block;
  margin-bottom: 24rpx;
  font-size: 14px;
  color: #8a8175;
  letter-spacing: 2rpx;
}

.label {
  display: block;
  margin-bottom: 8rpx;
  font-size: 13px;
  color: #6b665c;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
}

.tab {
  padding: 8rpx 16rpx;
  margin-right: 12rpx;
  margin-bottom: 12rpx;
  border-radius: 4rpx;
  border: 1px solid #ede6de;
  background-color: transparent;
}

.tab.active {
  border-color: #2d2a25;
  background-color: #2d2a25;
}

.tab-text {
  font-size: 14px;
  color: #6b665c;
}

.tab-text-active {
  color: #f5f2ed;
}

.input,
.textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 24rpx;
  font-size: 15px;
  color: #2d2a25;
  border: 1px solid #ede6de;
  border-radius: 4rpx;
  background-color: #f5f2ed;
}

.input {
  height: 48px;
}

.textarea {
  min-height: 180rpx;
}

.actions {
  display: flex;
  margin-bottom: 24rpx;
}

.btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0;
  border-radius: 4rpx;
  border: 1px solid #ede6de;
}

.btn.primary {
  margin-right: 16rpx;
  border-color: #2d2a25;
  background-color: #2d2a25;
}

.btn-text {
  font-size: 15px;
  color: #2d2a25;
}

.primary-text {
  color: #f5f2ed;
}

.status-box {
  padding: 16rpx;
  border-radius: 4rpx;
  background-color: #ede6de;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4rpx 0;
}

.divider {
  height: 1px;
  margin: 12rpx 0;
  border-bottom: 1px solid #dfd8ce;
}

.status-label {
  font-size: 14px;
  color: #6b665c;
}

.status-value {
  font-size: 14px;
  color: #2d2a25;
}

.log-card {
  padding-bottom: 12rpx;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-item {
  padding: 16rpx 0;
  border-bottom: 1px solid #ede6de;
}

.log-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.log-time {
  font-size: 12px;
  color: #8a8175;
}

.log-kind {
  font-size: 12px;
  color: #8a9980;
}

.log-text {
  font-size: 14px;
  line-height: 1.5;
  color: #2d2a25;
  word-break: break-all;
}

.empty {
  padding: 24rpx 0;
  text-align: center;
  font-size: 14px;
  color: #8a8175;
}
</style>
