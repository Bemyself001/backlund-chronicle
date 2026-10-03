import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { getMapLocation } from "../src/system/map.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.ADVANCEMENT_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/advancement");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const choices = [{ label: "观察街道", intent: "observe", risk: "low" }, { label: "查看委托", intent: "work", risk: "low" }, { label: "和接待员交谈", intent: "talk", risk: "low" }];
const fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "晋升验收员", extraordinary: "low", pathway: "占卜家（序列9）" });
fixture.turn = 4;
fixture.character.stats.health = 3;
fixture.character.stats.sanity = 2;
fixture.character.stats.spirituality = 4;
fixture.location = { ...getMapLocation("mi9-headquarters") };
fixture.clues.push({ id: "recipe-seer-8", title: "小丑魔药配方", detail: "经过核对的完整魔药配方。", kind: "potion_recipe", pathwayId: "seer", sequence: 8 });
fixture.inventory.push(normalizeInventoryItem({ instanceId: "potion-seer-8", itemId: "potion-seer-8", name: "小丑魔药", description: "一份已经鉴定的序列8魔药。", category: "非凡物品", quantity: 1, weight: 0.2,
  importance: "important", condition: "密封", rarity: "稀有", tags: ["非凡物品"], potion: { pathwayId: "seer", sequence: 8, identified: true } }));
fixture.choices = choices;
fixture.storyHistory = fixture.recentDialogues = [{ id: "test-scene", role: "assistant", turn: 4, content: "你站在军情九处的公开联络署中，接待员正等候你的决定。小丑魔药和经过确认的配方都已备齐。" }];
await page.addInitScript(({ fixture, settings }) => {
  if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "自动存档", updatedAt: new Date().toISOString(), turn: fixture.turn, characterName: fixture.character.name, game: fixture }]));
  localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
}, { fixture, settings: { ...DEFAULT_API_SETTINGS, baseUrl: "https://advancement-test.invalid/v1", model: "advancement-test", apiKey: "mock-key", customHeaders: "", nativeTools: true, stream: false, fastMode: true, jsonMode: false } });
await page.route("**/*", async route => {
  const request = route.request();
  if (request.url().startsWith(new URL(url).origin)) return route.continue();
  if (!request.url().includes("/chat/completions")) return route.fulfill({ status: 404, body: "test-isolated" });
  const body = request.postDataJSON();
  const last = body.messages.at(-1).content;
  const data = JSON.parse(last.slice(last.indexOf("{"), last.lastIndexOf("}") + 1));
  const planning = (body.tools || []).some(tool => tool.function.name === "advancement__promote");
  const promoted = data.turnResolution?.accepted?.some(entry => entry.name === "advancement.promote");
  const message = planning ? { content: "NO_STATE_CHANGE" } : { content: JSON.stringify({ narrative: promoted
    ? "你服下小丑魔药，身体与精神重新恢复。生命与理智回满，灵性增加两点。"
    : "你把魔药重新收好，暂时保留了这次晋升的机会。", choices }) };
  return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }) });
});

const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game);
const waitTurn = turn => page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === turn, turn);
const button = name => page.getByRole("button", { name, exact: true });
const openPotion = async () => {
  await button("行囊").click();
  await page.getByRole("button", { name: /小丑魔药.*非凡物品/ }).click();
  await button("服用并晋升").click();
  await page.getByRole("dialog", { name: "确认序列晋升" }).waitFor();
};
try {
  await page.goto(url);
  await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
  await page.getByRole("button", { name: /继续调查/ }).click();
  await openPotion();
  const preview = page.getByRole("region", { name: "晋升结果预览" });
  for (const [label, before, after] of [["当前灵性", 4, 6], ["灵性上限", 8, 10], ["生命回满", 3, 20], ["理智回满", 2, 10]]) {
    assert.match(await preview.locator("dl > div").filter({ hasText: label }).innerText(), new RegExp(`${before} → ${after}`));
  }
  assert.equal((await saved()).turn, 4);
  assert.equal((await saved()).inventory.some(item => item.instanceId === "potion-seer-8"), true);
  await page.screenshot({ path: resolve(output, "promotion-desktop.png") });
  await button("暂不服用").click();
  await waitTurn(5);
  assert.deepEqual((await saved()).character.stats, fixture.character.stats);
  assert.equal((await saved()).inventory.some(item => item.instanceId === "potion-seer-8"), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPotion();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await preview.getByText("理智回满", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "promotion-mobile.png") });
  await button("确认服用并晋升序列8").click();
  await waitTurn(6);
  const promoted = await saved();
  assert.deepEqual(promoted.character.stats, { health: 20, maxHealth: 20, sanity: 10, maxSanity: 10, spirituality: 6, maxSpirituality: 10 });
  assert.equal(promoted.character.advancement.sequence, 8);
  assert.equal(promoted.inventory.some(item => item.instanceId === "potion-seer-8"), false);
  await page.getByRole("button", { name: "生命 20/20，查看角色", exact: true }).waitFor();
  await button("特殊行动").click();
  await button("申请正式加入军情九处").click();
  assert.equal((await saved()).organizationState.membership, null);
  await button("确认加入军情九处").click();
  await waitTurn(7);
  assert.equal((await saved()).organizationState.membership.organizationId, "mi9");
  await page.getByText("当前组织：军情九处", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "mi9-mobile.png") });
  await page.reload();
  await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
  await page.getByRole("button", { name: /继续调查/ }).click();
  await page.getByRole("button", { name: "生命 20/20，查看角色", exact: true }).waitFor();
  await page.getByRole("button", { name: "灵性 6/10，查看角色", exact: true }).waitFor();
  assert.deepEqual((await saved()).character.stats, promoted.character.stats);
  assert.equal((await saved()).organizationState.membership.organizationId, "mi9");
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ ok: true, stats: promoted.character.stats, membership: "mi9", screenshots: ["promotion-desktop.png", "promotion-mobile.png", "mi9-mobile.png"], errors }, null, 2));
  console.log("Advancement browser smoke passed: pending preview, decline, confirmation, stat restoration, MI9 registration, reload, desktop/mobile layout.");
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
