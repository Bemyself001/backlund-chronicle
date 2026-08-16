# 贝克兰德纪事

《贝克兰德纪事》是一款无需后端即可运行的单人 AI 文字冒险沙盒。角色从贝克兰德东区火车站自由开局，可自行选择居所、工作、人脉、旅行与调查目标；原创案件只是可选世界线，不会强制绑定主线。游戏提供角色创建、自由对话、三选行动、结构化物品与本地存档。

## 在线游玩与下载

- 在线版：<https://bemyself001.github.io/backlund-chronicle/>
- Android APK：<https://github.com/Bemyself001/backlund-chronicle/releases/latest>

在线版由 GitHub Pages 自动发布，不依赖 Cloudflare。每次推送到 `main` 分支都会重新部署网页，并生成一个带递增版本号的正式签名 APK Release。

## 运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm ci
npm run dev
```

质量检查：

```bash
npm run lint
npm run build
npm run preview
```

## 目录

- `src/components/`：欢迎页、角色创建、游戏三栏、移动抽屉及设置面板。
- `src/data/`：默认角色、初始世界与系统提示词。
- `src/engine/`：AI 工具调用的参数、权限、去重与执行验证。
- `src/services/`：OpenAI-compatible API、JSON 协议、记忆与存档。
- `src/styles/`：全局 token、重置与通用交互状态。

## 数据与密钥

游戏存档保存在 LocalStorage。API Key 默认只保存在 sessionStorage；只有用户明确开启“跨会话保存”时才会写入单独的本地 API 设置。剧情状态与导出的 JSON 存档均会剔除 API Key。

没有 API Key 时保持 Mock 模式即可完成全部核心流程。真实接口默认按 OpenAI Chat Completions 协议调用，兼容流式输出、原生 tool calling 与 JSON 回退。

## GitHub 云端构建 APK

项目包含 Capacitor Android 工程与 `.github/workflows/build-android-apk.yml`。代码推送到 GitHub 的 `main` 分支后会自动构建正式签名 APK，也可以在仓库的 **Actions → Build Android APK → Run workflow** 手动运行。流水线以 `1.1.<Actions 运行编号>` 生成显示版本，以 `10000 + 运行编号` 生成始终递增的 Android `versionCode`。

正式构建依赖四个 GitHub Actions Secrets：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD`。签名文件及其本地恢复信息保存在被 Git 忽略的 `.signing/`；必须离线备份，丢失后将无法覆盖更新现有安装。

构建完成后，可直接从仓库的 **Releases** 页面下载 `backlund-chronicle.apk`，无需登录且不会像 Actions Artifact 一样在 14 天后过期。APK 会在启动约两秒后每天至多自动检查一次最新版；也可在 **API 设置 → 检查应用更新** 手动检查。发现新版后会跳转浏览器下载，最终安装仍由 Android 系统要求用户确认。

旧的 `apk-8`、`apk-9` 等版本使用临时调试签名，无法直接覆盖升级为新的正式签名版。首次迁移前请先导出游戏存档，然后卸载旧版、安装新正式版并导入存档；API Key 不包含在存档中，需要重新填写。

本地同步 Android 网页资源：

```bash
pnpm install
pnpm run android:sync
```

## 开源许可与版权说明

本仓库中由项目作者原创的程序代码与原创素材采用 [MIT License](LICENSE) 发布，Copyright © 2026 Bemyself001。

MIT License 不授予《诡秘之主》名称、世界观、角色、地点、设定或其他第三方知识产权的任何权利。本项目为非官方同人创作，与原作者、出版方及其他权利人无隶属、授权或背书关系。使用者在复制、修改或分发项目时，仍须自行确保其内容使用符合适用法律及第三方权利要求。
