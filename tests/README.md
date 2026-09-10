# SSE 回归测试

本机测试需要 Node.js 22.18+ 和 Swift 工具链：

```sh
node --test tests/*.test.mjs
```

这些测试运行实际的 UTS/Web 解析器及 Swift UTF-8 解码器，覆盖 CR/LF/CRLF 在任意两处拆分、空 data、中文、无效 JSON、EOF，以及 835 种 UTF-8 分片组合。UTS 通过去除类型后运行，因此不能替代原生桥接验收。

原生验收服务：

```sh
SSE_TEST_OUTPUT=/tmp/sse-results node tests/fixture-server.mjs
```

可选 `SSE_TEST_SNAPSHOT=/absolute/path/to/sse.txt` 额外回放已有 SSE 文本样本。样本只用于本地回归，不应提交到仓库。服务仅监听本机；Android 模拟器使用 `10.0.2.2:3002`，iOS 模拟器使用 `localhost:3002`。

生成独立测试页面，不覆盖日常示例：

```sh
node tests/stage-native-probe.mjs /tmp/sse-android-probe http://10.0.2.2:3002 android
node tests/stage-native-probe.mjs /tmp/sse-ios-probe http://localhost:3002 ios
```

目标目录必须不存在。使用 HBuilderX 将生成的传统 uni-app 工程运行到对应模拟器；iOS 宿主需要包含本次源码编译的 hens-sse framework。测试页启动后自动请求 fixture，使用真实 `connectStream` 回调验证结果，并回传到本机 `/results`。构建、安装成功本身不算测试通过。

每个平台至少执行两次独立的进程启动。结果 JSON 同时记录 `callbacksPass`（事件、原文、完成次数）与 `dataPass`（完整 JSON 值），总 `pass` 必须同时满足两项。不能把原文正确当成自动解析的 data 正确。测试覆盖快速响应、连续 HTTP 404、立即中止、Unicode 分片、未结束的 CR 流、CRLF 分片、数组/对象 null、JSONL、raw 及 681 条突发消息。

HBuilderX 5.24 的传统 Android 回调桥会省略 JSON 对象的 null 字段；对应 `dataPass` 目前会失败，应如实保留结果。默认字符串模式及 `rawText` 不受影响。细节及本次原生验证见 `docs/TEST-hens-sse-callbacks-2026-09-10.md`。
