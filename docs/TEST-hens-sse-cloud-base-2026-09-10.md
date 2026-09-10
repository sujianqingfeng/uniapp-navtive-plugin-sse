# hens-sse 2.0.2 云端自定义基座编译验证

## 构建范围

- 日期：2026-09-10（北京时间）。
- HBuilderX：`5.24.2026081301`。
- 项目：`uniapp-sse-playground`，传统 uni-app / Vue 3，AppID `__UNI__F8D7036`。
- 插件：该项目内的 `uni_modules/hens-sse`，版本 `2.0.2`；构建前后插件文件哈希一致。
- 方式：HBuilderX CLI `pack --platform android,ios --iscustom true`，提交云端自定义调试基座构建。
- 签名：Android 使用云端证书；iOS 使用用户提供的有效 Ad Hoc 证书及描述文件。
- `module.har` 保留原位置，未修改。

## 结果

16:27:35 两个平台任务提交成功。Android 于 16:30:30 返回成功；iOS 排队后于 16:46:02 进入构建，16:47:05 返回成功。CLI 明确输出两个平台均为 `custom packaging success`，最终 `pack status` 也均为打包成功。

| 平台 | 产物 | 文件大小 | 检查结果 |
| --- | --- | --- | --- |
| Android | `uniapp-sse-playground/unpackage/debug/android_debug.apk` | 15,455,252 字节（14.74 MiB） | ZIP 完整；`classes2.dex` 包含 SSE 插件代码；原生库为 arm64-v8a |
| iOS | `uniapp-sse-playground/unpackage/debug/iOS_debug.ipa` | 8,956,421 字节（8.54 MiB） | ZIP 完整；包含 `unimoduleHensSse.framework`；Bundle ID 与签名配置一致；`codesign --verify --deep --strict` 通过 |

产物 SHA-256：

- Android：`52f33cc619f47b388d8566945853001d5963cb21ce2d88ff6751e7c4feaf0522`
- iOS：`3163fc11fb1734dcfa7b9870c070fa016605181a84d0d639c97d2ea8f10ac8aa`

两端均未出现阻断构建的编译错误，产物均小于 100 MB。提交前的 Android 公共测试证书错误已通过切换云端证书解决；首次 iOS 构建的体积计费提示为通用提示，没有出现实际超限或扣费消息。

## 验证边界

本次验证云端原生编译、打包及产物完整性，不包含安装运行或 SSE 行为回归。产物是自定义调试基座，用于 HBuilderX 调试，不是商店发布包。uni-app x 和 Harmony 未参与本次云构建。

证书、密码、临时打包配置和云端访问令牌未写入本报告。产物保存在 Git 忽略的 `unpackage/debug/` 下。
