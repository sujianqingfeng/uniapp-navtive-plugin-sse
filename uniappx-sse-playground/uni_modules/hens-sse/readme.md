# hens-sse

用于 uni-app x / uni-app 的文本流式 HTTP 客户端插件。

当前支持平台：

- Web
- App Android
- App iOS
- App Harmony

适用场景：

- 标准 SSE
- 按行文本流
- JSONL / NDJSON
- 原始文本 chunk

## 导入

```ts
import { connectStream } from '@/uni_modules/hens-sse'
```

## 快速开始

以下为 uni-app x / UTS 写法。传统 uni-app 的 JavaScript 页面只需导入 `connectStream`，并去掉类型标注。

```ts
import {
  connectStream,
  StreamConnectOptions,
  StreamConnection,
  StreamOpenEvent,
  StreamChunkEvent,
  StreamMessageEvent,
  StreamFail
} from '@/uni_modules/hens-sse'

const options: StreamConnectOptions = {
  url: 'http://localhost:3000/sse',
  method: 'GET',
  protocol: 'sse',
  autoParseJson: true,
  onOpen: (evt: StreamOpenEvent) => console.log('open', evt.statusCode, evt.headers),
  onChunk: (evt: StreamChunkEvent) => console.log('chunk', evt.text),
  onMessage: (evt: StreamMessageEvent) => console.log('message', evt.event, evt.id, evt.data, evt.rawText),
  onError: (err: StreamFail) => console.error('error', err.errCode, err.errMsg),
  onComplete: () => console.log('complete')
}

const connection: StreamConnection = connectStream(options)
```

需要停止时调用 `connection.abort()`；页面卸载时也应关闭连接。

初始监听请通过 `connectStream` 参数传入。传统 uni-app 先连接再逐个调用 `onOpen/onMessage/...` 时，快速响应可能在监听注册前到达，已发出的事件不会重放。

参数中的回调会在请求启动前一次性注册。返回对象的 `onXxx(callback)` 会替换对应监听，`offXxx()` 会取消对应监听；两种注册方式不会叠加触发。仅需监听某一种事件时，只传该回调即可。

## 2.0.2 升级说明

- 将连接开始时需要的监听移到 `connectStream` 参数中；原有 `onXxx/offXxx` 方法继续用于运行中替换或取消监听。
- 更新插件后，App 应重新编译；使用自定义调试基座时也需重新制作基座。
- 传统 uni-app Android 的 JSON 对象 `null` 字段限制及处理方式见下方 `onMessage` 说明。

## API

### `connectStream(options)`

参数：

- `url: string`
  流式接口地址，必填。
- `method?: string | null`
  请求方法，默认 `GET`。
- `headers?: UTSJSONObject | null`
  自定义请求头。
- `body?: UTSJSONObject | string | null`
  请求体。建议只在 `POST` / `PUT` / `PATCH` / `DELETE` 时传入。为避免传统 uni-app Android 发送嵌套对象时丢失属性，推荐先执行 `JSON.stringify`，再传入字符串。
- `timeout?: number | null`
  超时时间，单位毫秒。App 平台默认 `60000`。
- `protocol?: 'sse' | 'line' | 'jsonl' | 'raw' | null`
  解析协议，默认 `sse`。
- `autoParseJson?: boolean | null`
  是否尝试把 message 文本解析为 JSON 对象或数组。未传时按协议默认值处理：`sse` / `line` 默认 `false`，`jsonl` 默认 `true`。JSON 数字、布尔值、字符串和 `null` 等顶层标量保持文本。
- `onOpen? / onChunk? / onMessage? / onError? / onComplete?`
  可选初始回调，参数类型与下方对应事件一致。建议把整个连接周期需要的监听一次传入，保证快速响应也不会丢失初始事件。
- `debug?: boolean | null`
  是否输出连接日志，默认 `false`。开启后会打印 `connect/open/chunk/message/error/complete/abort`，其中 `chunk` 会输出完整文本内容。

返回值：

```ts
interface StreamConnection {
  abort(): void
  onOpen(callback: ((evt: StreamOpenEvent) => void) | null): void
  offOpen(): void
  onChunk(callback: ((evt: StreamChunkEvent) => void) | null): void
  offChunk(): void
  onMessage(callback: ((evt: StreamMessageEvent) => void) | null): void
  offMessage(): void
  onError(callback: ((err: StreamFail) => void) | null): void
  offError(): void
  onComplete(callback: (() => void) | null): void
  offComplete(): void
}
```

## 事件说明

以下 `connection.onXxx(...)` 示例用于替换已有监听。首次连接请使用上面的参数注册方式；类型沿用快速开始中的导入。

### `onOpen`

收到响应头后触发一次。

如果服务端返回 `4xx` / `5xx`，也会先触发 `onOpen`，随后再触发 `onError` 和 `onComplete`。

Harmony 上 `evt.statusCode` 可能为 `NaN`，此时不能据此判断 HTTP 请求成功或失败；HTTP 错误仍会通过 `onError` 和 `onComplete` 上报。

```ts
connection.onOpen((evt: StreamOpenEvent) => {
  console.log(evt.statusCode)
  console.log(evt.headers)
})
```

### `onChunk`

每收到一段解码后的文本就触发一次。UTF-8 字符跨网络分片时会等字符字节完整后输出，chunk 边界不等于网络包边界。无论是哪种协议，都会先走 `onChunk`。iOS 遇到非法 UTF-8 或正常结束时的残缺字符，会以 `U+FFFD` 替换，不会丢弃整段文本。

```ts
connection.onChunk((evt: StreamChunkEvent) => {
  console.log(evt.text)
})
```

### `onMessage`

仅在 `sse` / `line` / `jsonl` 下触发，`raw` 不会触发。

- `sse`: `evt.data` 保持原始字符串
- `line`: `evt.data` 保持原始字符串
- `jsonl`: `evt.data` 优先解析为 JSON；解析失败时保留原始字符串
- 显式传 `autoParseJson: true/false` 时，会覆盖上面的协议默认行为

传统 uni-app Android 在 HBuilderX 5.24 下，自动解析后的 JSON 对象可能省略值为 `null` 的字段。如果业务需要区分“字段缺失”和 `null`，请使用 `autoParseJson: false`，在 JS 回调中对 `evt.rawText` 执行 `JSON.parse`；原文始终保留。iOS 自动解析结果会保留数组和对象中的 `null`。

```ts
connection.onMessage((evt: StreamMessageEvent) => {
  console.log(evt.event)
  console.log(evt.id)
  console.log(evt.data)
  console.log(evt.rawText)
})
```

### `onError`

网络失败、HTTP 非 2xx，或流读取、解码异常时触发，随后触发 `onComplete`。自动 JSON 解析失败会保留原始字符串，不会因此触发 `onError`；主动 `abort()` 也不会触发错误回调。

```ts
connection.onError((err: StreamFail) => {
  console.error(err.errCode, err.errMsg)
})
```

### `onComplete`

连接正常结束、发生错误、或手动调用 `abort()` 后都会触发一次。

```ts
connection.onComplete(() => {
  console.log('stream finished')
})
```

## 协议差异

### `sse`

支持 SSE 的 LF、CRLF 和 CR 换行，包括分片间拆开的换行符。连接正常结束时，即使最后一条消息没有以空行结尾，也会派发该消息。

- `onChunk`: 收到解码后的文本片段时触发
- `onMessage`: 收到完整 SSE message 时触发
- `evt.data`: 保持原始字符串，不自动解析 JSON

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/sse',
  protocol: 'sse'
})
```

### `line`

按换行切分，每一行对应一个 message。

- `onChunk`: 收到解码后的文本片段时触发
- `onMessage`: 每一行触发一次
- `evt.data`: 行文本

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/line-stream',
  protocol: 'line'
})
```

### `jsonl`

按换行切分，每一行按 JSONL / NDJSON 解析。

- `onChunk`: 收到解码后的文本片段时触发
- `onMessage`: 每一行触发一次
- `evt.data`: 优先解析为 JSON；解析失败时保留原始字符串

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/jsonl-stream',
  protocol: 'jsonl'
})
```

### 覆盖默认解析行为

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/sse',
  protocol: 'sse',
  autoParseJson: true
})
```

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/jsonl-stream',
  protocol: 'jsonl',
  autoParseJson: false
})
```

### `raw`

不做 message 切分，只保留 chunk。

- `onChunk`: 收到解码后的文本片段时触发
- `onMessage`: 不触发

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/raw-stream',
  protocol: 'raw'
})
```

## 常见用法

### POST + JSON 请求体

```ts
const body = {
  topic: 'demo',
  messages: [
    {
      role: 'user',
      content: '你好'
    }
  ]
}

const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/sse',
  method: 'POST',
  protocol: 'sse',
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  },
  body: JSON.stringify(body)
})
```

#### 传统 uni-app Android 兼容说明

在部分传统 uni-app Android 运行环境中，直接把普通 JavaScript 对象作为 `body` 传入时，嵌套数组中的对象可能丢失属性。例如页面传入的 `messages: [{ role: 'user', content: '你好' }]`，服务端可能收到 `messages: [{}]`。

发送 JSON 请求时，建议统一使用以下方式：

```ts
const bodyText = typeof body == 'string' ? body : JSON.stringify(body)

const connection: StreamConnection = connectStream({
  url,
  method: 'POST',
  protocol: 'sse',
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  },
  body: bodyText
})
```

注意：`body` 序列化为字符串后，JSON 请求的 `Content-Type` 仍应设置为 `application/json; charset=utf-8`，不要改成 `text/plain`。

### 发送纯文本请求体

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/raw-stream',
  method: 'POST',
  protocol: 'raw',
  headers: {
    'Content-Type': 'text/plain'
  },
  body: 'hello stream'
})
```

### 开启调试日志

```ts
const connection: StreamConnection = connectStream({
  url: 'http://localhost:3000/sse',
  protocol: 'sse',
  debug: true
})
```

开启后，插件会在控制台输出连接生命周期日志。`chunk` 日志会打印完整文本内容，适合排查流式拆包问题；如果响应里包含敏感信息，不建议在生产环境打开。

### 页面卸载时关闭连接

```ts
let connection: StreamConnection | null = null

onUnload(() => {
  connection?.abort()
  connection = null
})
```

## 平台注意事项

- Android 模拟器访问本机服务时，建议把 `localhost` 改成 `10.0.2.2`。
- 接口使用 UTF-8 文本流，不暴露二进制 chunk。
- `body` 传对象时，会序列化为 JSON 字符串。
- 手动 `abort()` 不应作为错误处理；如果你只是主动停止连接，请在 `onComplete` 里做收尾。

## 错误码

- `9030002`: URL 无效
- `9030003`: 网络请求失败
- `9030004`: HTTP 状态码错误
- `9030005`: 流解码失败
- `9030007`: 当前环境不支持流读取
