# hens-sse 回调修复与验证（2026-09-10）

## 结论与适用范围

修复落在本仓库的 `uniapp-sse-playground/uni_modules/hens-sse`，并同步到 `uniappx-sse-playground/uni_modules/hens-sse`。本轮使用传统 uni-app 完整运行时验收；试用示例没有用于构建。业务仓库仅用于检查调用方式及本地样本回放。

iOS 的 message 回调实际有触发，但 `data` 字段没有跨过原生到 JS 的桥接。标准 JSON 对象和纯文本都能复现，说明这不是业务后端独有的数据结构问题。业务仓库的 `resolveClawSSEPayload` 和既有回归测试也明确包含 `data` 缺失时读取 `rawText` 的兼容，并非只依赖 `onChunk`。本轮没有审计当前线上所有接口。

## 已完成的修改

- `interface.uts` 将 `StreamMessageEvent.data` 的联合类型内联。HBuilderX 5.24 原来把别名生成成 Swift 双重 Optional，Objective-C 桥接头中没有 `data` 属性；修复后的头文件暴露 `id _Nullable data`，真实 JS 回调可读取该字段。
- iOS 每个请求各自持有 `SSEUTF8Decoder`，最多保留三个未完成字节，正常结束时刷新。合法 UTF-8 跨网络回调不再丢失整段文本；非法或残缺编码按 U+FFFD 替换。请求状态同步访问，URLSession 委托串行派发。
- iOS 通过 `SSEJSONParser` 保留 Foundation 的显式 NSNull，避免 UTS JSON.parse 将其变成 nil 后被桥接省略。覆盖数组首、中、尾 null，嵌套数组和对象 null。
- 共享及 Web SSE 解析器支持 CR、LF、CRLF 和分片间拆开的换行。按普通字符串分割归一化，避免 iOS UTS 正则替换对 Unicode 的索引崩溃。保留已有正常 EOF 时派发残余消息的行为。
- `connectStream` 接受 `onOpen/onChunk/onMessage/onError/onComplete` 初始回调，构造连接时一次性注册，并显式保留流式回调。两个主示例及传统示例业务适配器已迁移。Android/iOS 的延后启动还会检查连接是否已经取消，避免立即 abort 后仍发起请求。
- 传统示例输入框补充固定高度，Android 上可以直接编辑地址。

## Android 回调时序与调用迁移

原生时序记录确认：一次冷启动快速请求的 open/chunk/message/complete 全部发出后，JS 的监听才开始注册，晚约 180 毫秒。连续 HTTP 错误也可能在 onError/onComplete 注册前完成。原来的原生 `setTimeout(0)` 与 JS 不在同一个事件循环；改为调用线程排队仍可能被桥接的多次调用打断。

保证初始事件交付的用法是：

```js
const connection = connectStream({
  url,
  protocol: 'sse',
  onOpen: handleOpen,
  onChunk: handleChunk,
  onMessage: handleMessage,
  onError: handleError,
  onComplete: handleComplete
})
```

返回对象的 on/off 方法继续用于替换或取消对应监听。旧的“先 connectStream，再逐个 onXxx”调用不会重放已经发出的事件；需要可靠捕获首包的调用者应迁移到参数注册。没有加入任意延时或无限事件缓存。

## 验证结果

环境：HBuilderX 5.24.2026081301；Android 14 / API 34 / ARM64 模拟器；iPhone 17 / iOS 26 模拟器。iOS 使用同版经典运行时与本次源码构建的 x86_64 framework，签名验证通过。Android 使用官方标准调试基座并加载本地编译的插件 DEX，真实 JS 回调已验证；CLI 的通用原生依赖提示不等于插件不能在该基座运行。

| 验证 | 结果 |
| --- | --- |
| Node 解析器及 Swift 解码器测试 | 5 项通过；Swift 含 835 种分片组合与独立解码器隔离 |
| iOS，两个独立进程 | 每轮 14/14 通过，回调、原文和完整 data 均匹配 |
| Android，两个独立进程 | 每轮回调/原文 14/14；完整 data 10/14，四项失败原因见下方 SDK 限制 |
| Web Fetch 实现 | 14/14 通过 |
| 保存的真实格式 SSE 样本 | 每轮 681 条；iOS、Android、Web 原文及 data 全部匹配 |
| 业务仓库既有兼容测试 | 两个测试文件，共 11 项通过 |

14 项覆盖：JSON 对象、原始字符串、数组及嵌套 null、中文/emoji 字节分片、未结束的 CR 流、拆开的 CRLF、681 条突发消息、JSONL、raw、连续两次 404、无效 URL、立即中止及保存样本回放。持续消息与主动中止也在普通 Android 页面单独验证，包含初始欢迎消息，完成只触发一次。

本次原生验收使用的 iOS framework SHA-256：`1ad4232898be824921e9516a46f4e536ded475b59c2c5778cb8acffa37aa80c3`。

本次 Android 原生验收 DEX SHA-256：`8aec69a5eafb8ec26e3dae083c4e8fb028a986dcfeae5167cea16cc000ee10f7`。

## 已知限制

传统 Android 的自动 JSON 解析结果经过 HBuilderX 5.24 回调桥后，会省略对象中值为 null 的键。四个失败用例为 object-json、array-null、unicode-split、jsonl；共同原因是对象 null 字段，不是回调丢失、UTF-8 丢失或数组长度改变。原文和回调顺序全部正确。

检查安装 SDK 的 UTSCallback/Gson/FastJSON 路径及局部序列化实验可见：即使在进入回调桥前保留 null，最终 JS 对象仍会丢键。未修改 SDK 全局序列化设置，也未保留无效的实验补丁。需要区分 null 与字段缺失时，使用默认字符串模式或 `autoParseJson: false`，在 JS 回调中 `JSON.parse(evt.rawText)`。测试保留严格 data 比较及失败结果，没有把已知限制改成“通过”。

uni-app X 的对应源码与示例已同步，但本轮未完成 X、Harmony 或 iOS 真机运行验收。模拟器不需要使用用户提供的证书。普通 Android/iOS 手动测试页面已恢复为修复后的源码版本。

## 复跑

入口见 `tests/README.md`：`node --test tests/*.test.mjs` 运行本机边界测试；`fixture-server.mjs`、`stage-native-probe.mjs` 和 `native-probe.js` 用于真实原生回调验收。测试源码在仓库内，临时工程、编译产物和包含业务样本的结果原文不提交到仓库。
