# Changelog

## 2.0.2（2026-09-10）
- 新增 `connectStream` 参数中的 `onOpen/onChunk/onMessage/onError/onComplete` 初始回调，避免传统 uni-app 快速响应时丢失初始事件。升级后建议一次传入所需监听；原有 on/off 方法仍可替换或取消监听，已发出的事件不会重放。
- 修复 iOS `onMessage.data` 无法在 JS 回调中读取，以及自动解析的 JSON 数组、对象中 `null` 丢失的问题。
- 修复 iOS 中文、emoji 等 UTF-8 字符跨网络分片时文本丢失的问题；非法编码及正常结束时的残缺字符以 `U+FFFD` 替换。
- SSE 支持 CR、LF、CRLF 和跨分片换行，保留正常结束时派发缓冲中最后一条消息的行为。
- 修复 Android/iOS 调用 `connectStream` 后立即 `abort()` 仍可能启动请求的问题。
- 更新使用示例及兼容说明：传统 uni-app Android 在 HBuilderX 5.24 下仍可能丢失自动解析 JSON 对象中的 `null` 字段，可使用 `autoParseJson: false` 并在 JS 中解析 `rawText`。
## 2.0.1 - 2026-04-30

- 修复 Android 自定义基座与本地调试环境中的网络库依赖冲突问题。

## 2.0.0 - 2026-04-12

- 支持 `sse`、`line`、`jsonl`、`raw` 四种文本流协议
- 新增 `connectStream(options) => StreamConnection`
- 新增 Harmony 平台支持，需允许网络访问
- 移除旧版 SSE API；旧版调用需要迁移到 `connectStream` 及连接对象的事件监听方法

## 1.0.0 - 2025-08-10

首个 SSE 版本。
