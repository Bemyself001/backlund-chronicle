import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, DEFAULT_API_SETTINGS, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { executeCombatTool } from "../src/engine/combat.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.WEAPON_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/weapons");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const [width, height] of [[1440, 900], [768, 1024], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width === 375, hasTouch: width === 375 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "武器验收员", extraordinary: "low", pathway: "囚犯（序列7）" });
    for (const [instanceId, name, kind, bonusPercent, equipped] of [["knife", "普通短剑", "melee", 7, true], ["gun", "普通左轮手枪", "firearm", 15, false]]) {
      fixture.inventory.push(normalizeInventoryItem({ instanceId, itemId: instanceId, name, description: "已固定伤害的武器。", quantity: 1, weight: 1, rarity: "普通", condition: "良好", source: "已购买", equipped,
        weapon: { version: 1, kind, quality: "common", bonusPercent } }));
    }
    fixture.equipment["武器"] = "knife";
    executeCombatTool(fixture, "enemy.encounter", { enemies: [{ id: "foe", name: "无面甲的人类对手", maxHealth: 100 }] });
    await page.addInitScript(({ fixture, settings }) => {
      if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "武器验收", updatedAt: new Date().toISOString(), game: fixture }]));
      localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
      const realFetch = window.fetch.bind(window);
      window.weaponChecks = { planning: [], settlement: [] };
      window.fetch = (url, init) => {
        if (!String(url).startsWith("https://weapon.invalid")) return realFetch(url, init);
        const body = JSON.parse(init.body);
        const user = body.messages.filter(message => message.role === "user").at(-1)?.content || "";
        const line = user.split("\n").find(line => line.startsWith("{"));
        const data = line ? JSON.parse(line) : {};
        const planning = body.tools?.some(tool => tool.function.name === "location__move");
        let message;
        if (planning) {
          window.weaponChecks.planning.push(data);
          const args = { actionId: "attack", enemyId: "foe", reason: "执行玩家攻击" };
          if (data.playerAction.includes("眼睛")) args.weakPoint = { name: "眼睛", evidence: "对手为人类且没有面甲，近距离射击能够瞄准暴露的眼部。" };
          message = { content: null, tool_calls: [{ id: `attack-${data.playerVisibleState.turn}`, type: "function", function: { name: "combat__action", arguments: JSON.stringify(args) } }] };
        } else {
          if (data.turnResolution) window.weaponChecks.settlement.push(data.turnResolution);
          message = { content: JSON.stringify({ narrative: "你握稳武器，将注意力集中在对手的动作上。", choices: ["观察对手", "保持距离", "寻找掩体"].map(label => ({ label, intent: "observe", risk: "low" })) }) };
        }
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message, finish_reason: planning ? "tool_calls" : "stop" }] }), { headers: { "Content-Type": "application/json" } }));
      };
    }, { fixture, settings: { ...DEFAULT_API_SETTINGS, apiKey: "test", baseUrl: "https://weapon.invalid/v1", model: "test", nativeTools: true, stream: false, fastMode: width === 375 } });
    const save = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game);
    await page.goto(url);
    await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    await page.getByRole("button", { name: /继续调查/ }).click();
    const battle = page.getByLabel("本回合战斗行动");
    assert.match(await battle.innerText(), /19%/);
    await page.getByRole("navigation", { name: "游戏功能" }).getByRole("button", { name: "行囊" }).click();
    await page.getByRole("button", { name: /普通左轮手枪.*×1/ }).click();
    const detail = page.getByLabel("武器伤害");
    assert.match(await detail.innerText(), /15%/);
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `${width}-weapon.png`) });
    await page.getByRole("button", { name: "装备", exact: true }).click();
    await page.getByRole("button", { name: "关闭资料，返回剧情" }).click();
    assert.match(await battle.innerText(), /27%/);
    let current = await save();
    assert.equal(current.equipment["武器"], "gun");
    assert.equal(current.inventory.find(item => item.instanceId === "knife").equipped, false);
    await page.reload();
    await page.getByRole("button", { name: /签署档案并进入贝克兰德|继续调查|提交普通攻击/ }).first().waitFor();
    if (await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).isVisible()) await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    if (await page.getByRole("button", { name: /继续调查/ }).isVisible()) await page.getByRole("button", { name: /继续调查/ }).click();
    await battle.waitFor({ timeout: 8000 }).catch(async error => {
      process.stdout.write((await page.locator("body").innerText()).slice(-5000));
      await page.screenshot({ path: resolve(output, `${width}-failure.png`) });
      throw error;
    });
    assert.match(await battle.innerText(), /27%/);
    await page.getByRole("textbox", { name: "自由行动", exact: true }).fill("我用左轮手枪瞄准对手暴露的眼睛射击");
    await page.getByRole("button", { name: /提交行动/ }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === 1);
    await page.getByRole("button", { name: "提交普通攻击", exact: true }).waitFor({ state: "visible" });
    current = await save();
    assert.equal(current.combat.enemies[0].health, 68);
    assert.ok(current.changeLog.some(entry => String(entry.text || entry).includes("弱点「眼睛」奖励5%")));
    const planning = await page.evaluate(() => window.weaponChecks.planning[0]);
    assert.equal(planning.playerVisibleState.combatRules.equippedWeapon.bonusPercent, 15);
    await page.getByRole("button", { name: "提交普通攻击", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === 2);
    current = await save();
    assert.equal(current.combat.enemies[0].health, 41, "weak-point bonus must not carry over");
    await battle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `${width}-combat.png`) });
    await page.getByRole("navigation", { name: "游戏功能" }).getByRole("button", { name: "行囊" }).click();
    // The dossier retains its previously selected item across panel closes.
    if (!await page.getByRole("button", { name: "卸下", exact: true }).isVisible()) await page.getByRole("button", { name: /普通左轮手枪.*×1/ }).click();
    await page.getByRole("button", { name: "卸下", exact: true }).click();
    await page.getByRole("button", { name: "关闭资料，返回剧情" }).click();
    assert.match(await battle.innerText(), /当前徒手/);
    assert.match(await battle.innerText(), /12%/);
    assert.deepEqual(errors, []);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    results.push({ width, height, fastMode: width === 375, equippedPreview: 27, rpDamage: 32, nextOrdinaryDamage: 27, unequippedPreview: 12, savedRoll: 15, overflow, errors });
    await page.close();
  }
  await writeFile(resolve(output, "verification.json"), JSON.stringify(results, null, 2));
  process.stdout.write(JSON.stringify(results) + "\n");
} finally { await browser.close(); }
