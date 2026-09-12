# Android 热更新恢复与发布

## 1.2.99 及更早版本的恢复

下载同一仓库、同一正式签名的新版 `backlund-chronicle.apk`，直接覆盖安装。不要先卸载，不要清除应用数据。新 APK 首次启动会清除旧的更新路径配置，加载自身的内置页面；不会删除 WebView 中的存档和设置。

旧更新器在插件初始化时访问尚未创建的本地资源服务，并把手机文件目录作为 APK assets 目录读取，可能在更新后出现 localhost 无法连接。原生 Java 修复必须通过 APK 安装生效。

## 启动规则

1. `MainActivity.load()` 先读取更新状态，把 `ServerPath(BASE_PATH, ...)` 交给 Bridge Builder；没有可用更新则显式使用内置 `public` assets。
2. Capacitor 创建本地资源服务后再加载对应页面。插件初始化不访问服务、不 reload。
3. 下载只创建 pending 状态，当前游戏继续运行。立即应用通过重建 Activity 使用同一条启动流程。
4. React 首屏挂载后以实际构建版本确认启动；版本不一致不确认。
5. 30 秒内未确认或上次启动中断，则回退到已确认版本；该版本也失败则使用内置页面。失败版本不自动重试，提供完整 APK 更新。
6. 安装不同版本 APK 后停用旧更新状态；待下载目录、确认目录均在应用私有 bundles 下，游戏存档不在其中。

## 发布规则

- `android:sync` 在同一份构建输出内写入 `bundle-manifest.json`，再同步到 APK。
- 发布 `web-bundle-v2.zip` 和 SHA-256，旧 APK 不再识别此包名，转为完整 APK 更新。
- Pages 从已经发布的 Release 下载原包，校验后发布 `latest-v2.json`。不单独构建手机更新资源。
- 兼容旧客户端的 `latest.json` 永远不提供 bundleUrl，仅提供 APK。
- APK 公共名称、包名、正式签名及递增 versionCode 保持原发布机制。
- Java、插件、权限等原生变动仍须安装 APK。更新协议发生不兼容变化时同步升级协议及客户端通道。

## 验证边界

Java 单元测试覆盖待更新、确认、失败回退、启动中断、APK 升级与过期回调；JavaScript 测试覆盖版本、校验和双通道一致性。原生编译和 Java 测试由 Android CI 执行。真机验收应覆盖：1.2.99 故障状态覆盖安装、正常热更新、损坏包回退，以及原有存档可继续读取。
