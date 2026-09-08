export const LATEST_UPDATE = {
  date: "2026-09-08",
  dateLabel: "2026.09.08",
  title: "修复热更新后无法启动",
  summary: "修复热更新资源切换的启动竞态（net::ERR_CONNECTION_REFUSED）：资源路径改在页面加载前的插件初始化阶段切换，不再依赖重新载入。",
  changes: [
    "热更新资源路径切换到 UpdaterPlugin.load() 中执行——这是页面加载前的生命周期，本地资源服务器尚未启动时的 reload 竞态被根除。",
    "移除了 MainActivity 里的启动 reload 逻辑；已下载的热更新包内容本身完好，新底座启动后会直接沿用。",
    "本次改动位于原生层，需要安装新底座 APK（v1.2.83 起）覆盖更新一次；覆盖安装不清空存档。",
  ],
};
