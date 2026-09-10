# hens-sse 2.0.2 鸿蒙 HAR 构建与内容核验

## 结果

使用当前 `uniapp-sse-playground/uni_modules/hens-sse` 源码重新构建并替换了 `utssdk/app-harmony/module.har`。源代码对应提交 `6f47497`；构建前后逐文件校验了插件输入，未修改插件源码。

最终采用新版工具链默认的 HarmonyOS API 13 产物，最低兼容版本由 API 12 提升到 API 13（HarmonyOS 5.0.1）。本次更新已明确接受这个变化。

## 构建过程

- HBuilderX：`5.24.2026081301`。
- DevEco Studio：`6.0.2.642`；编译 SDK：`6.0.2.130`。
- 工程类型：传统 uni-app / Vue 3。
- 构建模式：`debug`，与旧 HAR 一致；未配置 HAR 签名。
- 在临时目录复制工程，排除旧 HAR、`unpackage/` 和缓存，确保从 UTS 源码编译。
- 使用 HBuilderX 内置 `uni.js build -p app-harmony --logLevel all` 生成资源及插件 ArkTS。
- 调用 HBuilderX 导出的 `HarmonyLauncher` 的 `init`、`prepareHarmonyProjectPath`、`assembleCompileOutput`、`assembleCompiledManifest`、`installDependencies`，生成鸿蒙工程并安装依赖。
- 使用 DevEco 内置 Node/Hvigor 执行 `assembleHar`，未构建或安装应用 HAP。

在生成的鸿蒙工程目录中执行的 HAR 构建参数：

```sh
node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js \
  --no-daemon assembleHar --mode module \
  -p module=uni_modules__hens_sse -p product=default -p buildMode=debug
```

环境使用 DevEco 的 Node、Java 和 SDK，`DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk`。实际构建输出为 `uni_modules/hens-sse/build/default/outputs/default/uni_modules__hens_sse.har`；退出码为 0，日志包含 `BUILD SUCCESSFUL`，没有 ArkTS 编译错误。

编译器对生成代码中的 definite assignment assertion 给出 15 处警告，运行时依赖也有警告；构建成功不代表这些代码已通过设备运行验证。

## 与旧包对比

旧包来自提交 `a3b851d`，此前一直未更新。本次分别解包新旧 HAR，并用 DevEco 的 `ark_disasm` 反汇编各自的 `ets/modules.abc`。

| 项目 | 旧包 | 新包 |
| --- | --- | --- |
| 插件版本 | 2.0.1 | 2.0.2 |
| HAR 大小 | 28,579 字节 | 28,876 字节 |
| `modules.abc` 大小 | 48,996 字节 | 49,392 字节 |
| 最低兼容 API | 12 | 13 |
| 构建时运行时依赖 | `5.0.2026020301` | `5.2.32026072901` |
| `StreamConnectOptions` 初始回调 | 无 | 五个回调齐全 |
| `connectStream` 声明 | 函数类型常量 | 具名函数 |
| `StreamMessageEvent.data` | `StreamData` 别名 | 等价的内联联合类型 |

新旧包均包含六个文件：`ResourceTable.txt`、`oh-package.json5`、`ets/modules.abc`、`ets/sourceMaps.map`、`src/main/module.json`、`utssdk/app-harmony/index.d.ets`。未增加应用页面或其他平台的源码；公开导出列表、模块名称和权限配置一致，权限仍只有 `ohos.permission.INTERNET`。

内容核验确认：

- 声明文件包含 `onOpen/onChunk/onMessage/onError/onComplete` 五个初始回调。
- 新字节码的 `connectStream` 将 options 传入连接构造函数；构造函数读取这五个回调并存入对应成员。旧字节码只把成员初始化为 null。
- 新字节码的 SSE 解析器包含 CRLF/CR 归一化与末尾 CR 保留逻辑，旧包没有这一实现。
- `normalizeDebug` 字节码和 `logDebug` 的关闭分支与旧包一致；`chunk` 日志仍读取该连接的 debug 值。HAR 元数据中的 `debug: true` 表示构建模式，不是调用者传入的 `options.debug`。
- source map 的模块标识全部为 2.0.2，HAR 中的实现与本次生成的 ArkTS 及当前源码变更相符。

替换前完成 25 项产物、接口、字节码和源码一致性断言；替换后再次校验目标文件 SHA-256。

```text
旧 HAR SHA-256
1108e5cf632ea71ea416b41bedb77afad1e57fbb58b86408023a058ee287a69a

新 HAR SHA-256
2b03709e28fea748145d82e01c4f480d32046cf793903bc40b562df1ab0d3d69
```

## 验证边界

`node --test tests/parser.test.mjs`：4 项测试全部通过，覆盖 UTS/Web 解析器的换行分片、JSON 和 EOF 行为。UTS 测试通过去除类型后运行，不是 HAR 字节码运行测试。

本次完成真实 HAR 编译及包内容核验，未进行鸿蒙模拟器或真机运行测试，也未复现用户反馈的 `debug: false` 日志问题。更新包不能单独证明该问题已解决。
