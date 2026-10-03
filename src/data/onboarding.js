export const API_SETUP_STEPS = [
  { title: "前往官方 API 开放平台", text: "在浏览器中搜索 DeepSeek 等服务商的官方 API 开放平台，登录或注册账号。" },
  { title: "查看充值与 API Keys", text: "进入平台的充值页面，按需充值；再打开 API Keys（密钥管理），创建并复制一枚 API Key。具体按钮名称以服务商页面为准。" },
  { title: "回到游戏填写密钥", text: "点击下方「API 设置」，选择对应服务商，将复制的密钥填入 API Key 栏，确认当前模型，再保存设置。" },
];

export const HOME_TOUR_STEPS = [
  { id: "import", title: "导入存档", text: "选择之前从游戏中导出的 JSON 存档，接着原有进度继续调查。存档不包含 API 密钥，换设备后需要单独配置 API。" },
  { id: "api", title: "API 设置", text: "在这里切换服务商、修改密钥和模型，也可以测试连接。以后需要调整 AI 对话设置时，随时从这里进入。" },
  { id: "changelog", title: "更新日志", text: "查看当前版本与往期版本的新增内容、规则调整和问题修复，了解这座城市最近发生的变化。" },
  { id: "diagnostics", title: "启动诊断", text: "遇到白屏或启动异常时，可查看并复制设备环境与启动记录，帮助排查问题。诊断不读取 API 密钥、存档或对话，也不会自动上传。" },
  { id: "privacy", title: "隐私政策", text: "查看游戏对本地存档、API 密钥和 AI 请求数据的处理说明。点击这个入口会在新窗口打开隐私政策。" },
];
