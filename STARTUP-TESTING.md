# 首次启动黑屏测试

适用反馈：vivo T1（V2115A）、Android 11、已报告内核 110 以上；TapTap 试玩与首次安装 APK 都持续黑屏。根因尚未确定。优先使用诊断版，兼容版只作为对照。

## 正式构建与诊断对照

| 构建 | 命令 | 用途 |
| --- | --- | --- |
| standard | `pnpm run build` / `pnpm run dev` | 正式版本默认采用 Chromium 80 语法/CSS目标和所用 API 的兼容实现；保留正常网页更新流程 |
| diagnostic | `pnpm run build:diagnostic` | 保留 Vite 的现代浏览器目标和原生 API 行为，记录真实启动失败 |
| compat | `pnpm run build:compat` | Chromium 80 语法/CSS 目标，加入所用新 API 的 core-js 兼容实现 |

三者共有：独立于 React 的启动页、15 秒网页超时提示、复制诊断、React 错误边界、Android 实际 WebView 包与版本、原生 20 秒超时提示。成功启动后右下角仍可打开报告。报告只保留错误类型与脚本位置，不保留异常消息、任意 URL、密钥、存档或对话，也不会自动上传。

diagnostic/compat 测试版暂停网页更新检查/下载/切换，Android 从 APK 内置资源启动，不改动既有 OTA 状态。测试版的编译目标、资源与原生构建标识必须一致，否则 Gradle 会拒绝构建。正式构建即使启用兼容实现，仍标记为 `standard`，不进入 startup-test 模式，不修改正式签名或 OTA 状态。

## 兼容范围

正式版本和 compat 在应用模块前加载 `structuredClone`、`Array.at/findLast`、`Object.hasOwn`、`String.replaceAll`；缺少 `crypto.randomUUID` 时使用原生安全随机字节生成 UUID v4，保证手动存档可创建。已有原生实现不会被无条件替换。开发服务器也加载相同入口，应用与依赖预构建的 JavaScript 目标均为 Chrome 80。

组件自身提供定位长属性、`vh`、裁剪、固定方形尺寸、颜色和逻辑属性的回退。选中单选/复选项可通过相邻元素样式辨认，不依赖 `:has()`。flex 间距采用一次实际布局探测，再启用各组件的 margin 回退；不使用 `@supports(gap)`，因为旧内核可能支持 grid gap 而不支持 flex gap。移动布局切换成 grid 时恢复原生 grid 间距。键盘焦点也有 `:focus` 回退。

目标是 Chrome 80 级别的 ES modules、Web Crypto、Fetch/ReadableStream、原生 dialog、VisualViewport 等已有能力，不承诺低于此基线的 WebView。CSS 目标只转换构建工具能处理的语法，不能自动补齐所有布局特性。真实设备的字体、GPU、内存、厂商 WebView、文件访问和软键盘仍需实机验证。core-js 的结构化复制也不等于为任意 DOM/可转移对象提供完整原生能力；游戏数据的对象、数组、Map/Set、日期、循环引用和不可复制函数拒绝语义有回归覆盖。

参考：[Chrome 88 的 aspect-ratio](https://developer.chrome.com/blog/new-in-chrome-88)、[Chrome 108 的视口单位](https://developer.chrome.com/blog/new-in-chrome-108)、[MDN 浏览器兼容数据中的 padding-inline](https://github.com/mdn/browser-compat-data/blob/main/css/properties/padding-inline.json)、[core-js 结构化复制说明](https://github.com/zloirock/core-js#structuredclone)。

## 网页产物

构建后 `dist/client` 是本次网页资源。两种构建各自还保存在 `.shots/startup-builds/<variant>/<timestamp>/web`，`latest.json` 记录最新目录；正式构建不会覆盖这些留存副本。

`index.html` 用于 HTTP/HTTPS 托管或上传试玩环境；`离线启动测试.html` 内联主脚本与样式，但图片、字体仍使用同目录资源。请分享整个 web 目录，不只分享一个 HTML。单独浏览器测试不能证明 TapTap 或 APK 的 WebView 表现相同。

## Android APK

手动工作流 `.github/workflows/build-startup-test-apks.yml` 会并行生成两种签名 APK 和校验文件，使用既有四项 Android 签名 secret；只上传 Actions 测试产物，不创建 Release、不更新公开网页或 OTA 清单。

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

## 开发验证

```sh
node --test tests/startup.test.mjs
pnpm run build:diagnostic
pnpm run build:compat
node scripts/test-startup-browser.mjs
node scripts/test-startup-browser.mjs standard
# 复用现有开发或预览服务器；COMPAT_TEST_URL 可指定地址，默认 http://127.0.0.1:5173/
node scripts/test-webview-compat.mjs
pnpm run lint
pnpm run test
pnpm run build
```

启动浏览器验证使用独立上下文，覆盖空数据首次启动、主脚本/样式失败、语法错误、渲染异常、存储被拒、启动超时、脚本请求挂起、内联 HTML 和 API 缺失。`standard` 参数验证当前 `dist/client`，不重新构建；默认仍验证两种留存的测试产物。

`test-webview-compat.mjs` 复用服务器，以 360、390、1440 像素视口分别验证原生模式和 API/CSS 降级模式，检查首页背景、面板、休息结算、手动存档 UUID 与模态框边界，截图与结果保存在 `.shots/webview-compat`。CSS 声明在解析前移除，保留真正的旧式回退声明；API 删除和 flex 布局探测结果模拟均只作用于测试上下文。请求不会送往外部服务，存档不会写入日常浏览器上下文。

`PLAYWRIGHT_MODULE` 可指定 Playwright 安装目录，`BROWSER_CHANNEL` 默认 `msedge`。这些检查不等同于真实 Chromium 80 或 vivo 故障手机验证。
