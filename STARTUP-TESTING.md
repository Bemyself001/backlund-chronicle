# 首次启动黑屏测试

适用反馈：vivo T1（V2115A）、Android 11、已报告内核 110 以上；TapTap 试玩与首次安装 APK 都持续黑屏。根因尚未确定。优先使用诊断版，兼容版只作为对照。

## 两种构建

| 构建 | 命令 | 用途 |
| --- | --- | --- |
| diagnostic | `pnpm run build:diagnostic` | 保留 Vite 的现代浏览器目标和原生 API 行为，记录真实启动失败 |
| compat | `pnpm run build:compat` | Chromium 80 语法/CSS 目标，加入所用新 API 的 core-js 兼容实现 |

两者共有：独立于 React 的启动页、15 秒网页超时提示、复制诊断、React 错误边界、Android 实际 WebView 包与版本、原生 20 秒超时提示。成功启动后右下角仍可打开报告。报告只保留错误类型与脚本位置，不保留异常消息、任意 URL、密钥、存档或对话，也不会自动上传。

测试版暂停网页更新检查/下载/切换，Android 从 APK 内置资源启动，不改动既有 OTA 状态。测试版的编译目标、资源与原生构建标识必须一致，否则 Gradle 会拒绝构建。正式 `pnpm run build` 保持默认现代目标，并保留通用故障提示。

## 网页产物

构建后 `dist/client` 是本次网页资源。两种构建各自还保存在 `.shots/startup-builds/<variant>/<timestamp>/web`，`latest.json` 记录最新目录；正式构建不会覆盖这些留存副本。

`index.html` 用于 HTTP/HTTPS 托管或上传试玩环境；`离线启动测试.html` 内联主脚本与样式，但图片、字体仍使用同目录资源。请分享整个 web 目录，不只分享一个 HTML。单独浏览器测试不能证明 TapTap 或 APK 的 WebView 表现相同。

## Android APK

工作流 `.github/workflows/build-startup-test-apks.yml` 在推送 `codex/startup-diagnostics` 测试分支或手动触发时，并行生成两种签名 APK 和校验文件，使用既有四项 Android 签名 secret；只上传 Actions 测试产物，不创建 Release、不更新公开网页或 OTA 清单。

本地构建需要 Java 21、Android SDK 36 和既有正式签名材料。例如 diagnostic：

```sh
pnpm run build:diagnostic
pnpm exec cap sync android
cd android
./gradlew testDebugUnitTest assembleRelease -PSTARTUP_VARIANT=diagnostic
```

Windows 使用 `gradlew.bat`。compat 同理。签名通过既有环境变量设置；不要新建签名替换正式签名，也不要把未签名输出当成可安装测试包。包名保持不变，同机测试两包需逐一覆盖安装；不要求清空数据。若确需复现完全空数据，使用测试设备或先导出存档。

## 群友测试顺序

1. 先安装 diagnostic，从桌面打开，记录是否显示首页、网页错误提示或 Android 原生提示。
2. 黑屏后等待约 20 秒，复制能看到的诊断报告；保留“原生 WebView 包/版本”和最后完成的阶段。
3. 用 compat 覆盖测试并记录同样的信息。两包都失败时，比较错误位置；只有兼容版成功时，继续逐项确认是哪项兼容处理生效。
4. TapTap 试玩需要由相应发布流程接入同一测试网页，单独记录其结果；本工作流不改动线上试玩。
5. 若连原生提示都没有，连接故障设备采集启动 logcat，重点查看 `BacklundStartup`、`AndroidRuntime` 和 Chromium 错误。原生崩溃发生在 Activity 创建前时，页面诊断无法捕获。

## 输入焦点测试（2026-10-03）

兼容版加入原生触摸焦点恢复与网页点击聚焦兜底；diagnostic 只记录输入，不启用这两项恢复。恢复不吞掉事件、不改写输入值、不用定时器争抢焦点，也不绕过禁用、只读或弹窗限制。这是依据症状的针对性修复，尚未在反馈问题的 vivo 手机上确认根因与效果。

先覆盖安装新的 compat APK，测试角色姓名、API 地址与自由行动的输入、粘贴、选字、删除。若仍失败，关闭游戏弹窗，点右下角“启动 / 输入诊断”，分别在“普通输入框”和“游戏式输入框”输入或粘贴 abc，再点“复制诊断信息”。报告保留最近 80 条输入事件、临时字段编号、字符长度与焦点标记，并采样 Android 的 WebView 焦点及输入法连接状态；不记录输入内容、字段标签、密钥或剪贴板数据，也不保存或上传。输入事件在测试包中采集，正式 standard 构建不启用。

普通框正常、游戏式框异常，优先调查 React 输入处理；两框都异常，结合网页 activeElement、document.hasFocus 与原生 inputFocus 信息判断。桌面浏览器检查不能替代真实 Android 输入法测试。

## 开发验证

```sh
node --test tests/startup.test.mjs
pnpm run build:diagnostic
pnpm run build:compat
node scripts/test-startup-browser.mjs
pnpm run lint
pnpm run test
pnpm run build
```

浏览器验证使用独立上下文，覆盖空数据首次启动、主脚本/样式失败、语法错误、渲染异常、存储被拒、启动超时、脚本请求挂起、内联 HTML 和 API 缺失。`PLAYWRIGHT_MODULE` 可指定 Playwright 安装目录，`BROWSER_CHANNEL` 默认 `msedge`。这些检查不等同于真实 Chromium 80 或 vivo 故障手机验证。
