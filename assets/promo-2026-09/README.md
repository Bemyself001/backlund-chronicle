# 贝克兰德纪事 · 功能宣传图

七张 1080 × 1920（9:16）竖版海报，每张同时提供 PNG 原图和 JPG 分享版。

| 文件 | 主题 |
| --- | --- |
| 01-story | 自由输入与 AI 叙事 |
| 02-character | 自定义角色与 22 条非凡途径 |
| 03-map | 六边形城区图与迷雾探索 |
| 04-journal | 任务、线索与人物关系 |
| 05-inventory | 资金、负重与物品管理 |
| 06-saves | 自动保存、手动存档与导入导出 |
| 07-special-actions | 途径委托、配方制作与组织身份 |

`contact-sheet.jpg` 是七图总览；`promotion-pack.zip` 包含七张 PNG、七张 JPG 和总览。

## 素材与真实性

- 参考旧 `assets/promo-vertical` 系列，延续黑金边框、中文标题和大幅截图。
- 使用项目现有 `assets/promo-16x9.png` 作为低对比背景。
- 截图来自本地当前版本 1.5.0，使用独立浏览器上下文和演示档案，无玩家 API 密钥或真实存档。
- 人物、信件与调查记录是用于展示现有界面的虚构示例；不代表固定剧情或模型实际生成结果。每张底部注明「实机截图 · 演示档案」。
- 自由 AI 叙事需要玩家自行配置 AI 服务；截图保留离线演示标识。
- 本次仅制作宣传素材和记录更新日志。

## 后续编辑

`screenshots/` 保存原始截图；`editable/` 保存未叠加宣传文字的底图及 `*-text.json` 文本框配置。

1. 启动项目 Vite 开发服务器。
2. 使用装有 Playwright 的 Node 运行 `scripts/capture-promotion.cjs`。默认调用本机 Edge，默认地址为 `http://127.0.0.1:5173/`；可通过 `PROMO_URL`、`PLAYWRIGHT_MODULE` 覆盖。
3. 使用装有 Pillow 的 Python 运行 `scripts/compose-promotion.py`，批量重建。文案在该脚本 `POSTERS` 中维护；默认使用个人 `image-text-overlay` 技能的渲染器，可通过 `TEXT_OVERLAY_RENDERER` 指定位置。
4. 若仅编辑单张，修改对应 JSON 后，使用技能 `render_text.py --input 底图 --spec 文本JSON --output 新图片` 渲染。

主标题使用宋体，说明使用微软雅黑。重新生成后检查所有图片，再重建分发 ZIP。
