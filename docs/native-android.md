# 原生 Android 客户端

原生客户端位于 `android/native-app`，界面使用 Kotlin 和 Jetpack Compose，不使用 WebView。原生模块不依赖 Capacitor 或 React，APK 不打包 HTML 页面。现有 JavaScript 游戏规则编译为独立脚本，由 QuickJS 执行；仅本仓库的固定规则代码可以执行，玩家输入与 AI 响应仅作为 JSON 数据传入。

`src/native/session.js` 负责规划、工具验证、玩家确认、结算和剧情提交。Android 负责组件、网络、流式读取、文件选择与存储。网络取消或规则失败时未提交的回合被丢弃；剧情提交后，行动建议补全和记忆整理不会重放回合。API 密钥不进入规则状态、存档或导出文件，选择持久化时使用 Android Keystore 加密并保存在不参与备份的目录。

## 构建

```sh
pnpm install --frozen-lockfile
node scripts/build-native-engine.mjs
cd android
./gradlew -PNATIVE_ONLY=true :native-app:testPreviewDebugUnitTest :native-app:assemblePreviewDebug
./gradlew -PNATIVE_ONLY=true :native-app:connectedPreviewDebugAndroidTest
```

预览包名为 `io.github.bemyself001.backlundchronicle.native`，可以与已发布的 APK 同时安装。生产构建沿用 `io.github.bemyself001.backlundchronicle`，以及现有签名环境变量；覆盖安装前必须完成旧版存档迁移验证。内部版本号继续由发布流程提供的 `APP_VERSION_CODE` 控制。

纯游戏规则的测试使用 `node --test tests/native-session.test.mjs`。CI 同时运行完整 Node 测试、ESLint、QuickJS/JVM 测试、Android 编译、正式密钥签名及原生组件的模拟器测试，保留 APK 和原生界面截图。当前稳定发布流程仍构建原来的 Capacitor 模块，原生预览流程位于 `.github/workflows/build-native-android.yml`。

## 存档与更新

在现有 APK 或网页版存档柜导出 JSON，再在原生版首页导入。存档结构与版本保持兼容，不要求重新创建角色。原生版使用自动存档与三个手动存档位，保存采用原子文件写入。旧版 WebView 的本地数据不会自动被原生文件存储读取，预览版独立安装提供导出和核对时间。

Compose 界面随完整 APK 更新，现有网页 OTA 包不加载到原生客户端。AI 叙事仍通过玩家配置的 API 在线生成；等待、探索、固定工作等本地行动可以离线进行。
