# 鸿蒙 module.har 打包说明

本文记录如何为 `uniapp-sse-playground` 里的 `hens-sse` 插件打出鸿蒙本地包需要的 `module.har`。

当前随插件提供的 HAR 已于 2026-09-10 按 2.0.2 源码重建，使用 HBuilderX 5.24、DevEco Studio 6.0.2，最低兼容 HarmonyOS API 13。构建结果、接口及字节码的新旧对比见 [本次核验记录](TEST-hens-sse-harmony-har-2026-09-10.md)。下文保留早期 CLI 构建流程及当时的工具版本。

适用场景：别人打包鸿蒙时报类似下面的错误，说明插件目录里缺少已编译好的本地 HAR：

```text
ohpm ERROR: Run install command failed Error: 00617202 Fetch Local Package Failed
Error Message: Fetch local file package error,
\unpackage\dist\dev\app-harmony\uni_modules\hens-sse\utssdk\app-harmony\module.har does not exist.
```

## 前置条件

1. 本机已安装 HBuilderX，本文验证版本：`5.07.2026041006`。
2. 本机已安装 DevEco Studio，本文验证版本：`6.0.0.878`。
3. HBuilderX 能生成 `app-harmony` 工程。
4. 如需走 `launch app-harmony`，鸿蒙模拟器或真机已启动，并能被 HBuilderX CLI 识别。

常用路径：

```bash
HX_CLI=/Applications/HBuilderX.app/Contents/MacOS/cli
HARMONY_SDK=/Applications/DevEco-Studio.app/Contents/sdk
HVIGOR=/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw
PROJECT=/Users/hens/code-space/uniappx-sse/uniapp-sse-playground
PLUGIN=hens-sse
MODULE_NAME=uni_modules__hens_sse
```

注意：`DEVECO_SDK_HOME` 要指向 `/Applications/DevEco-Studio.app/Contents/sdk`，不要指向 `sdk/default`，否则 Hvigor 可能报 SDK 组件缺失。

## 1. 导入项目到 HBuilderX

HBuilderX CLI 的 `--project` 参数要求项目已经导入工作区。先执行：

```bash
"$HX_CLI" project open --path "$PROJECT"
```

如果不导入，可能会报：

```text
项目 /path/to/project 不存在，请先导入
```

## 2. 生成鸿蒙工程

先确认设备：

```bash
"$HX_CLI" devices list --platform app-harmony
```

然后执行一次鸿蒙编译。把 `127.0.0.1:5555` 换成实际设备 ID：

```bash
"$HX_CLI" launch app-harmony \
  --project "$PROJECT" \
  --deviceId 127.0.0.1:5555 \
  --cleanCache true \
  --compile true \
  --continue-on-error true
```

这一步的关键产物是 HBuilderX 生成的鸿蒙工程：

```text
uniapp-sse-playground/unpackage/dist/dev/app-harmony
```

如果应用最终因为签名失败而停止，但日志已经出现类似下面的信息，一般仍然可以继续单独打 HAR：

```text
Created harmony project at: .../unpackage/dist/dev/app-harmony
Finished :uni_modules__hens_sse:default@PreBuild
Finished :entry:default@PackageHap
Building failed
```

签名失败通常是 `manifest.json` 里证书路径还是占位值导致的，和单独生成插件 HAR 不是同一个问题。

## 3. 单独打出插件 HAR

进入 HBuilderX 生成的鸿蒙工程目录：

```bash
cd "$PROJECT/unpackage/dist/dev/app-harmony"
```

执行 Hvigor 的 `assembleHar`：

```bash
DEVECO_SDK_HOME="$HARMONY_SDK" \
"$HVIGOR" --no-daemon assembleHar --mode module \
  -p module="$MODULE_NAME" \
  -p product=default \
  -p buildMode=debug
```

成功时最后会看到：

```text
Finished :uni_modules__hens_sse:default@PackageHar
Finished :uni_modules__hens_sse:default@PackageSignHar
Finished :uni_modules__hens_sse:assembleHar
BUILD SUCCESSFUL
```

生成的 HAR 在：

```text
$PROJECT/unpackage/dist/dev/app-harmony/uni_modules/hens-sse/build/default/outputs/default/uni_modules__hens_sse.har
```

## 4. 复制为 module.har

把 Hvigor 产物复制到插件要求的位置：

```bash
cp "$PROJECT/unpackage/dist/dev/app-harmony/uni_modules/$PLUGIN/build/default/outputs/default/$MODULE_NAME.har" \
  "$PROJECT/uni_modules/$PLUGIN/utssdk/app-harmony/module.har"
```

如果当前本机还要继续用已生成的 `unpackage/dist/dev/app-harmony` 工程打包，也可以同步复制一份到生成工程里：

```bash
cp "$PROJECT/unpackage/dist/dev/app-harmony/uni_modules/$PLUGIN/build/default/outputs/default/$MODULE_NAME.har" \
  "$PROJECT/unpackage/dist/dev/app-harmony/uni_modules/$PLUGIN/utssdk/app-harmony/module.har"
```

对外分发时，通常给这个文件即可：

```text
uniapp-sse-playground/uni_modules/hens-sse/utssdk/app-harmony/module.har
```

## 5. 校验 module.har

确认它是真实编译产物，而不是空文件或手工压缩包：

```bash
file "$PROJECT/uni_modules/$PLUGIN/utssdk/app-harmony/module.har"
tar -tzf "$PROJECT/uni_modules/$PLUGIN/utssdk/app-harmony/module.har" | sed -n '1,80p'
```

有效 HAR 应该显示类似：

```text
gzip compressed data
package/ResourceTable.txt
package/ets/
package/libs/
package/oh-package.json5
package/src/
package/utssdk/
package/ets/modules.abc
package/ets/sourceMaps.map
package/src/main/module.json
package/utssdk/app-harmony/index.d.ets
```

其中 `package/ets/modules.abc` 是关键文件，表示 ArkTS 已编译完成。

## 一键命令示例

下面这段从项目导入、生成鸿蒙工程、单独打 HAR 到复制产物一次跑完。设备 ID 按实际情况修改：

```bash
set -e

HX_CLI=/Applications/HBuilderX.app/Contents/MacOS/cli
HARMONY_SDK=/Applications/DevEco-Studio.app/Contents/sdk
HVIGOR=/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw
PROJECT=/Users/hens/code-space/uniappx-sse/uniapp-sse-playground
PLUGIN=hens-sse
MODULE_NAME=uni_modules__hens_sse
DEVICE_ID=127.0.0.1:5555

"$HX_CLI" project open --path "$PROJECT"

"$HX_CLI" launch app-harmony \
  --project "$PROJECT" \
  --deviceId "$DEVICE_ID" \
  --cleanCache true \
  --compile true \
  --continue-on-error true || true

cd "$PROJECT/unpackage/dist/dev/app-harmony"

DEVECO_SDK_HOME="$HARMONY_SDK" \
"$HVIGOR" --no-daemon assembleHar --mode module \
  -p module="$MODULE_NAME" \
  -p product=default \
  -p buildMode=debug

cp "$PROJECT/unpackage/dist/dev/app-harmony/uni_modules/$PLUGIN/build/default/outputs/default/$MODULE_NAME.har" \
  "$PROJECT/uni_modules/$PLUGIN/utssdk/app-harmony/module.har"

file "$PROJECT/uni_modules/$PLUGIN/utssdk/app-harmony/module.har"
tar -tzf "$PROJECT/uni_modules/$PLUGIN/utssdk/app-harmony/module.har" | sed -n '1,40p'
```

## 常见问题

### launch app-harmony 报项目不存在

先执行：

```bash
"$HX_CLI" project open --path "$PROJECT"
```

### launch app-harmony 最后 Building failed

如果失败点是应用签名，例如日志里出现 `SignHap`，通常仍可继续执行 `assembleHar`。生成插件 HAR 不需要应用 HAP 签名成功。

### 找不到 SDK 组件

确认 `DEVECO_SDK_HOME` 是：

```text
/Applications/DevEco-Studio.app/Contents/sdk
```

不要写成：

```text
/Applications/DevEco-Studio.app/Contents/sdk/default
```

### 没有生成 uni_modules__hens_sse.har

先检查 HBuilderX 生成工程是否存在插件模块：

```bash
find "$PROJECT/unpackage/dist/dev/app-harmony/uni_modules/$PLUGIN" -maxdepth 4 -type f | sort
```

再确认根目录 `build-profile.json5` 里有模块配置：

```json5
{
  "name": "uni_modules__hens_sse",
  "srcPath": "./uni_modules/hens-sse"
}
```

如果模块名不同，需要把 `MODULE_NAME` 改成实际模块名。
