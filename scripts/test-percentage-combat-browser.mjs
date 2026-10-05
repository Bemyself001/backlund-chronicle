import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";
import { executeToolCalls } from "../src/engine/tools.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.COMBAT_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/percentage-combat");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const errors = [];
const checks = [];
const choices = [{ label: "观察敌人的动向", intent: "observe", risk: "low" }, { label: "寻找撤退路线", intent: "withdraw", risk: "medium" }, { label: "试着交涉", intent: "talk", risk: "medium" }];

function fresh(pathway, maxHealth, health = maxHealth, enemyHealth = 0) {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "百分比验收员", extraordinary: "low", pathway, startingMoneyPence: 1200 });
  game.turn = 3;
  game.character.stats.maxHealth = maxHealth;
  game.character.stats.health = health;
  if (enemyHealth) game = executeToolCalls(game, [{ name: "enemy.encounter", args: { enemies: [{ id: "foe", name: "巷口对手", maxHealth: enemyHealth }] }, reason: "战斗验收" }]).game;
  game.choices = choices;
  game.storyHistory = game.recentDialogues = [{ id: "test-scene", role: "assistant", turn: 3, content: "你已准备好采取下一步行动。" }];
  return game;
}

async function scenario(fixture, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1040 } });
  const page = await context.newPage();
  const planning = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ fixture, settings }) => {
    if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "自动存档", updatedAt: new Date().toISOString(), turn: fixture.turn, characterName: fixture.character.name, game: fixture }]));
    localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
  }, { fixture, settings: { ...DEFAULT_API_SETTINGS, baseUrl: "https://percentage-test.invalid/v1", model: "percentage-test", apiKey: "mock-key", customHeaders: "", nativeTools: true, stream: false, fastMode: true, jsonMode: false } });
  await page.route("**/*", async route => {
    const request = route.request();
    if (request.url().startsWith(new URL(url).origin)) return route.continue();
    if (!request.url().includes("/chat/completions")) return route.fulfill({ status: 404, body: "test-isolated" });
    const body = request.postDataJSON();
    const last = body.messages.at(-1).content;
    const data = JSON.parse(last.slice(last.indexOf("{"), last.lastIndexOf("}") + 1));
    const isPlanning = (body.tools || []).some(tool => tool.function.name === "combat__action");
    let message;
    if (isPlanning) {
      const intent = data.privateSimulationState;
      planning.push(intent);
      // Deliberately propose a different ability: the clicked basic attack must win.
      const proposals = intent.requestedCombatAction?.actionId === "attack" ? [
        { name: "ability__use", args: { abilityId: "prisoner:wolf_claw", targetId: "foe", boostStacks: 3 } },
        { name: "enemy__act", args: { enemyId: "foe", moveId: "windup" } },
      ] : [];
      message = { content: proposals.length ? null : "NO_STATE_CHANGE", tool_calls: proposals.map((call, index) => ({ id: `mock-${planning.length}-${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify({ ...call.args, reason: "验收用行动建议" }) } })) };
    } else {
      message = { content: JSON.stringify({ narrative: "行动已经完成，实际的生命变化与灵性消耗已记录。你审视局势，准备下一次行动。", choices }) };
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }) });
  });
  const enter = async () => {
    await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    await page.getByRole("button", { name: /继续调查/ }).click();
  };
  await page.goto(url);
  await enter();
  return {
    context, page, planning, enter,
    saved: () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game),
    waitTurn: turn => page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === turn, turn),
    button: name => page.getByRole("button", { name, exact: true }),
  };
}

let current;
try {
  const fixture = fresh("囚犯（序列7）", 100, 100, 1000);
  current = await scenario(fixture);
  const { page, saved, waitTurn, button, planning } = current;
  const combat = page.getByRole("region", { name: "当前遭遇" });
  await combat.waitFor();
  for (let layer = 0; layer < 3; layer++) await combat.getByRole("button", { name: "强化＋1层", exact: true }).click();
  assert.match(await combat.innerText(), /20\.736%/);
  assert.match(await combat.innerText(), /实际扣除208点/);
  assert.equal(await combat.getByRole("button", { name: "强化＋1层", exact: true }).isDisabled(), true);
  await combat.getByRole("button", { name: "减少一层强化", exact: true }).click();
  assert.match(await combat.innerText(), /17\.28%/);
  await combat.getByRole("button", { name: "取消准备", exact: true }).click();
  assert.equal(planning.length, 0);
  assert.deepEqual((await saved()).character.stats, fixture.character.stats);
  assert.equal((await saved()).turn, 3);

  await button("角色").click();
  const claw = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "狼人利爪", exact: true }) });
  for (let layer = 0; layer < 3; layer++) await claw.getByRole("button", { name: "强化＋1层", exact: true }).click();
  assert.match(await claw.innerText(), /51\.84%/);
  assert.match(await claw.innerText(), /实际扣除519点/);
  assert.match(await claw.innerText(), /本次共消耗5点灵性/);
  await claw.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "wolf-desktop.png") });
  await claw.getByRole("button", { name: "使用能力", exact: true }).click();
  await waitTurn(4);
  let result = await saved();
  assert.equal(result.combat.enemies[0].health, 481);
  assert.equal(result.character.stats.spirituality, fixture.character.stats.spirituality - 5);
  assert.equal(result.character.stats.health, 88);
  assert.equal(result.character.combatBoost, undefined);
  assert.equal(planning[0].requestedCombatPreview.damage, 519);
  assert.equal(planning[0].requestedCombatPreview.damagePercent, 51.84);

  await page.setViewportSize({ width: 390, height: 844 });
  await combat.getByRole("button", { name: "提交普通攻击", exact: true }).scrollIntoViewIfNeeded();
  assert.match(await combat.innerText(), /实际扣除120点/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(output, "combat-mobile.png") });
  await button("提交普通攻击").click();
  await waitTurn(5);
  result = await saved();
  assert.equal(result.combat.enemies[0].health, 361);
  assert.equal(result.character.stats.spirituality, fixture.character.stats.spirituality - 5);
  await combat.getByText("正在蓄力 · 警惕20%重击", { exact: true }).waitFor();
  await button("防御 · 本回合直接受伤比例减半").click();
  await waitTurn(6);
  result = await saved();
  assert.equal(result.character.stats.health, 78);
  assert.equal(result.combat.enemies[0].health, 361);
  assert.equal(result.character.guardedThroughTurn, undefined);
  assert.deepEqual(result.money, fixture.money);
  await page.reload();
  await current.enter();
  assert.deepEqual((await saved()).character.stats, result.character.stats);
  checks.push("wolf draft/cancel, 3-layer attack, exact preview, next-round reset, immutable UI intent, windup/defense, mobile layout, reload");
  await current.context.close();
  current = null;

  for (const [pathway, name, healing, percent] of [["药师（序列7）", "血族再生", 7, 20], ["歌颂者（序列5）", "圣光治疗", 11, 30]]) {
    current = await scenario(fresh(pathway, 37, 1), true);
    await current.button("角色").click();
    const card = current.page.getByRole("article").filter({ has: current.page.getByRole("heading", { name, exact: true }) });
    assert.match(await card.innerText(), new RegExp(`自身最大生命值的${percent}%`));
    assert.match(await card.innerText(), new RegExp(`实际恢复${healing}点生命`));
    await card.getByRole("button", { name: "使用能力", exact: true }).click();
    await current.waitTurn(4);
    assert.equal((await current.saved()).character.stats.health, 1 + healing);
    assert.equal(current.planning[0].requestedCombatPreview.healing, healing);
    checks.push(`${pathway} heals ${percent}% with matching preview`);
    await current.context.close();
    current = null;
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ ok: true, checks, errors }, null, 2));
  console.log(`Percentage combat browser smoke passed: ${checks.join("; ")}.`);
} catch (error) {
  if (current) await current.page.screenshot({ path: resolve(output, "failure.png") });
  throw error;
} finally {
  if (current) await current.context.close();
  await browser.close();
}
