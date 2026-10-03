import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { executeToolCalls } from "../src/engine/tools.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.COMBAT_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/combat");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
let knowledgeFailure = true;
const choices = [{ label: "观察敌人的动向", intent: "observe", risk: "low" }, { label: "寻找撤退路线", intent: "withdraw", risk: "medium" }, { label: "试着交涉", intent: "talk", risk: "medium" }];
let fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "符咒验收员", extraordinary: "low", pathway: "占卜家（序列9）" });
fixture.turn = 3;
fixture = executeToolCalls(fixture, [{ name: "enemy.encounter", args: { enemies: [{ id: "guard", name: "持械守卫", maxHealth: 101, health: 80 }, { id: "hound", name: "灰毛猎犬", maxHealth: 30, health: 17 }] }, reason: "巷口遭遇守卫与猎犬" }]).game;
for (const itemId of ["crimson-charm", "storm-charm", "knowledge-charm"]) fixture.inventory.push(normalizeInventoryItem({ instanceId: itemId, itemId, quantity: 1, condition: "完好", source: "验收测试物品" }));
fixture.choices = choices;
fixture.storyHistory = fixture.recentDialogues = [{ id: "test-scene", role: "assistant", turn: 3, content: "巷口的守卫举起短棍，猎犬拦住了另一条出口。你能看清两名敌人的伤势，行囊中的符咒仍然完好。" }];
await page.addInitScript(({ fixture, settings }) => {
  localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "自动存档", updatedAt: new Date().toISOString(), turn: fixture.turn, characterName: fixture.character.name, game: fixture }]));
  localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
}, { fixture, settings: { ...DEFAULT_API_SETTINGS, baseUrl: "https://combat-test.invalid/v1", model: "combat-test", apiKey: "mock-key", customHeaders: "", nativeTools: true, stream: false, fastMode: true, jsonMode: false } });
await page.route("**/*", async route => {
  const request = route.request();
  if (request.url().startsWith(new URL(url).origin)) return route.continue();
  if (!request.url().includes("/chat/completions")) return route.fulfill({ status: 404, body: "test-isolated" });
  const body = request.postDataJSON();
  const last = body.messages.at(-1).content;
  const data = JSON.parse(last.slice(last.indexOf("{"), last.lastIndexOf("}") + 1));
  const names = (body.tools || []).map(tool => tool.function.name);
  let message;
  if (names.includes("item__use")) {
    const action = data.playerAction || "";
    const proposals = action.includes("深红") ? [{ name: "enemy.act", args: { enemyId: "guard", damage: 3, action: "挥棍反击" } }]
      : action.includes("风暴") ? [{ name: "enemy.damage", args: { enemyId: "guard", amount: 31 } }]
        : knowledgeFailure ? [] : [{ name: "clue.add", args: { clue: { id: "clue-bootmark", title: "仓库的靴印", detail: "守卫的靴底沾着仓库独有的蓝色粉笔，留下通往后门的足迹。" } } }];
    message = { content: proposals.length ? null : "NO_STATE_CHANGE", tool_calls: proposals.map((call, index) => ({ id: `mock-${Date.now()}-${index}`, type: "function", function: { name: call.name.replace(".", "__"), arguments: JSON.stringify({ ...call.args, reason: "响应玩家使用符咒" }) } })) };
  } else {
    const effect = data.turnResolution?.accepted?.find(entry => entry.data?.talismanEffect)?.data.talismanEffect;
    const narrative = effect?.effect === "stun" ? "深红月光落在守卫身上，他的动作凝固了。本回合，他无法行动。"
      : effect?.effect === "damage" ? `风暴符咒迸发电光，守卫受到${effect.damage}点伤害，生命值降至${effect.after}。`
        : "通识符咒揭示了守卫靴底的蓝色粉笔痕迹。你已经将这条新线索记入手记。";
    message = { content: JSON.stringify({ narrative, choices }) };
  }
  return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }) });
});

const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game);
const waitTurn = turn => page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === turn, turn);
const button = name => page.getByRole("button", { name, exact: true });
try {
  await page.goto(url);
  await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
  await page.getByRole("button", { name: /继续调查/ }).click();
  const guard = page.getByRole("meter", { name: "持械守卫的生命", exact: true });
  await guard.waitFor();
  assert.equal(await guard.getAttribute("aria-valuenow"), "80");
  assert.equal(await guard.getAttribute("aria-valuemax"), "101");
  assert.equal(await page.getByRole("meter").count(), 2);
  await page.getByText("使用战斗符咒", { exact: false }).click();
  assert.equal(await button("使用深红符咒").isDisabled(), true);
  const controls = page.getByRole("region", { name: "当前遭遇" }).locator("select");
  await controls.nth(0).selectOption("guard");
  await button("使用深红符咒").click();
  await waitTurn(4);
  assert.equal((await saved()).character.stats.health, fixture.character.stats.maxHealth);
  assert.equal((await saved()).combat.enemies[0].stunnedThroughTurn, 4);
  assert.equal((await saved()).inventory.some(item => item.itemId === "crimson-charm"), false);
  await button("使用风暴符咒").waitFor();
  await page.getByRole("region", { name: "当前遭遇" }).locator("select").selectOption("guard");
  await button("使用风暴符咒").click();
  await waitTurn(5);
  assert.equal((await saved()).combat.enemies[0].health, 49);
  assert.equal((await saved()).inventory.some(item => item.itemId === "storm-charm"), false);
  await guard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await guard.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const bounds = await guard.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await page.screenshot({ path: resolve(output, "mobile.png") });
  await button("行囊").click();
  await page.getByRole("button", { name: /通识符咒.*符咒/ }).click();
  await button("使用通识符咒").click();
  await page.getByRole("alert").filter({ hasText: "符咒与回合均未消耗" }).waitFor();
  assert.equal((await saved()).turn, 5);
  assert.equal((await saved()).inventory.find(item => item.itemId === "knowledge-charm").quantity, 1);
  knowledgeFailure = false;
  await button("重试本轮").click();
  await waitTurn(6);
  assert.equal((await saved()).clues.filter(clue => clue.id === "clue-bootmark").length, 1);
  assert.equal((await saved()).inventory.some(item => item.itemId === "knowledge-charm"), false);
  assert.equal((await saved()).combat.enemies[0].health, 49);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ ok: true, turn: 6, enemyHealth: 49, playerHealth: (await saved()).character.stats.health, clueCount: 1, screenshots: ["desktop.png", "mobile.png"], errors }, null, 2));
  console.log("Combat browser smoke passed: multi-target selection, one-turn stun, 30% damage, atomic clue failure/retry, desktop/mobile HP layout.");
} finally {
  await context.close();
  await browser.close();
}
