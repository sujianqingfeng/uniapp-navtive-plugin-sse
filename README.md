# hens-sse

用于 uni-app / uni-app x 的文本流式 HTTP 客户端插件，支持 Web、Android、iOS 和 Harmony，以及 SSE、按行文本、JSONL / NDJSON、原始文本 chunk 四种协议。

当前版本：**2.0.2**。本次更新修复初始回调时序、iOS message 数据与 UTF-8 分片问题，并补充 SSE 换行支持。完整变更见 [changelog](uniapp-sse-playground/uni_modules/hens-sse/changelog.md)。

## 使用插件

将 `hens-sse` 安装到项目的 `uni_modules/`，通过 `@/uni_modules/hens-sse` 导入 `connectStream`。

- [安装后的 API 与使用示例](uniapp-sse-playground/uni_modules/hens-sse/readme.md)
- [uni-app x 中的同版插件文档](uniappx-sse-playground/uni_modules/hens-sse/readme.md)

初始事件监听应通过 `connectStream({ url, onOpen, onChunk, onMessage, onError, onComplete })` 一次传入。返回连接对象的 `onXxx/offXxx` 用于替换或取消监听；页面卸载时调用 `abort()`。

升级到 2.0.2 后，App 需重新编译；使用自定义调试基座时也需重新制作基座。传统 uni-app Android 发送 JSON 请求体时建议先 `JSON.stringify`。如果需要完整保留响应 JSON 对象中的 `null` 字段，请使用 `autoParseJson: false`，并在 JS 回调中对 `evt.rawText` 执行 `JSON.parse`，详见插件文档中的兼容说明。

## 仓库结构

```text
uniapp-sse-playground/       # 传统 uni-app 示例
  uni_modules/hens-sse/      # 插件源码及发布文档
uniappx-sse-playground/      # uni-app x 示例
  uni_modules/hens-sse/      # 同步的插件源码及使用文档
sse-server/                 # 本地流式 HTTP 测试服务
sse-uniapp-v3-demo/          # 保留的早期 Vue3 示例
tests/                     # 解析器、UTF-8 与原生回调回归入口
docs/                      # 平台构建说明及验证记录
```

Android、iOS 原生实现位于插件的 `utssdk/app-android/` 和 `utssdk/app-ios/` 内。

## 运行示例

启动本地服务：

```sh
cd sse-server
pnpm install
pnpm dev
```

使用 HBuilderX 打开 `uniapp-sse-playground` 或 `uniappx-sse-playground`，选择目标平台运行。测试地址：

- Web / iOS 模拟器：`http://localhost:3000/sse`
- Android 模拟器：`http://10.0.2.2:3000/sse`
- 真机：把主机名改成开发电脑的局域网 IP，并确保设备可以访问服务。

其他协议端点为 `/line-stream`、`/jsonl-stream`、`/raw-stream`。在示例中填写地址并选择对应协议。

Android 本地 HTTP 测试需配置明文网络访问；传统示例配置位于 `uniapp-sse-playground/nativeResources/android/res/xml/network_security_config.xml`。iOS 使用 HTTP 时需配置适当的 ATS 例外。Web 跨域请求需要服务端允许 CORS。

Harmony 本地 `module.har` 的生成与使用见 [鸿蒙构建说明](docs/harmony-module-har-build.md)。

## 验证

本机边界测试需要 Node.js 22.18+ 与 Swift 工具链：

```sh
node --test tests/*.test.mjs
```

- [回归测试与原生验收入口](tests/README.md)
- [2.0.2 回调修复验证记录及已知限制](docs/TEST-hens-sse-callbacks-2026-09-10.md)

本机测试覆盖 UTS/Web 解析器与 Swift UTF-8 解码器，不替代 App 原生桥接验收。已有验收记录覆盖传统 uni-app Android/iOS 模拟器；uni-app x、Harmony 和 iOS 真机仍需运行验证。
