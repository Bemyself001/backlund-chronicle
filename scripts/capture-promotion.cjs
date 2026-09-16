/* global require, process, __dirname, console */
// Isolated demo context: never reads or replaces a player's browser saves.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const out = path.resolve(__dirname, '../assets/promo-2026-09/screenshots');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 480, height: 680 }, deviceScaleFactor: 2, locale: 'zh-CN', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.PROMO_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { createInitialGame, EMPTY_CHARACTER } = await import('/src/system/game.js');
    const { saveGame } = await import('/src/services/storage.js');
    const game = createInitialGame({ ...EMPTY_CHARACTER, name: '伊芙琳·格雷', age: 24, gender: '女', occupation: '私人调查员', extraordinary: 'low', pathway: '占卜家（序列9）', background: '一位从廷根来到贝克兰德的私人调查员，随身携带一本旧笔记，希望查清一封匿名来信的来源。' });
    // Fictional demo records illustrate the real journal components.
    game.clues = [
      { id: 'promo-letter', title: '没有署名的来信', detail: '信封盖着桥区邮戳，正文只有一个地址。纸张边缘残留着淡淡的药剂气味。寄件人的身份仍待确认。', discoveredAt: '调查记录 · 信件检查' },
      { id: 'promo-watch', title: '停在同一时刻的怀表', detail: '表壳内侧有一行细小刻字。它与来信中的日期是否有关，还需要更多证据。', discoveredAt: '调查记录 · 随身物品' },
      { id: 'promo-witness', title: '码头工人的证词', detail: '一名工人说，曾见过穿灰色外套的人在仓库门前等待。此事尚未得到其他目击者印证。', discoveredAt: '调查记录 · 人物转述' },
    ];
    game.quests = [{ id: 'promo-case', title: '追查匿名来信', status: '进行中', summary: '从邮戳与地址入手，确认写信人的身份。' }];
    saveGame(game, 'autosave', '雾都来信');
    const second = createInitialGame({ ...EMPTY_CHARACTER, name: '奥利弗·里德', age: 29, occupation: '钟表修理师', background: '在桥区经营一家钟表铺，过着普通人的生活。' });
    saveGame(second, 'promo-second', '桥区旧事');
    const third = createInitialGame({ ...EMPTY_CHARACTER, name: '艾琳·温特', age: 26, occupation: '报社记者', background: '记录贝克兰德街头的新闻，追寻每一条消息背后的事实。' });
    saveGame(third, 'promo-third', '未完的采访');
    localStorage.setItem('mist-reading-preferences', JSON.stringify({ theme: 'paper', fontSize: 18 }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /签署档案并进入/ }).click();
  await page.getByRole('button', { name: /打开档案柜/ }).click();
  await page.getByRole('button', { name: /伊芙琳·格雷/ }).click();
  await page.getByRole('textbox', { name: '自由行动' }).fill('我想先检查信封上的邮戳，再向附近的报童打听这个地址。');
  await page.getByRole('textbox', { name: '自由行动' }).blur();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, '01-story.png') });
  const nav = page.getByRole('navigation', { name: '游戏功能' });
  for (const [label, file] of [['角色', '02-character'], ['地图', '03-map'], ['手记', '04-journal'], ['行囊', '05-inventory'], ['特殊行动', '07-special-actions']]) {
    await page.setViewportSize({ width: 480, height: label === '地图' ? 680 : 900 });
    await nav.getByRole('button', { name: label, exact: true }).click();
    if (label === '手记') await page.getByRole('button', { name: '线索', exact: true }).click();
    await (label === '地图' ? page : page.locator('#game-dossier')).screenshot({ path: path.join(out, file + '.png') });
    if (label === '地图') await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
    else await page.getByRole('button', { name: '关闭资料，返回剧情' }).click();
  }
  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /存档柜/ }).click();
  await page.getByRole('dialog').screenshot({ path: path.join(out, '06-saves.png') });
  await fs.writeFile(path.join(out, 'capture-report.json'), JSON.stringify({ viewport: { width: 480, height: 680 }, scale: 2, demo: true, errors }, null, 2));
  console.log(JSON.stringify({ out, errors }));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
