# 雾中纪事

《雾中纪事》是一款无需后端即可运行的单人 AI 文字冒险沙盒。默认使用原创港城“灰檐港”、原创 NPC 与失踪案件，以克制的蒸汽时代神秘学风格提供角色创建、自由对话、三选行动、结构化物品与本地存档。

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
