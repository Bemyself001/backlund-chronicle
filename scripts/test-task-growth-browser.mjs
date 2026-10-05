import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { getMapLocation } from "../src/system/map.js";
import { moneyFromPence, moneyToPence } from "../src/system/money.js";
import { registerQuest } from "../src/engine/questLifecycle.js";
import { VISITABLE_PEOPLE } from "../src/content/index.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.GROWTH_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/task-growth");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const choices = ["整理已知线索", "观察周围街道", "和夏洛克交谈"].map(label => ({ label, intent: "observe", risk: "low" }));
const fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "艾琳·霍尔" });
fixture.turn = 2;
fixture.money = moneyFromPence(720);
fixture.location = { ...getMapLocation("minsk-street-15") };
const sherlock = VISITABLE_PEOPLE.find(person => person.locationId === "minsk-street-15");
fixture.triggerState.facts[sherlock.metFact] = { value: true, firstTurn: 1, lastTurn: 1, evidenceIds: ["visit-fixture"] };
fixture.inventory.push(normalizeInventoryItem({ instanceId: "known-potion", itemId: "test-potion", name: "占卜家魔药", description: "已鉴定的成品魔药。", quantity: 1, category: "魔药", weight: .2, tags: [], condition: "完好", rarity: "稀有" }));
fixture.inventory.push(normalizeInventoryItem({ instanceId: "unknown-potion", itemId: "hidden-identity-test", name: "未鉴定魔药", description: "PRIVATE_POTION_TRUTH", properties: { private: "PRIVATE_POTION_TRUTH" }, quantity: 2, category: "魔药", weight: .2, tags: [], condition: "完好", rarity: "稀有", potion: { pathwayId: "seer", sequence: 8, identified: false } }));
fixture.quests.push({ id: "old-done", title: "已经结清的账目", status: "completed", summary: "酬金已付清。", objective: "完成核账" });
registerQuest(fixture, { id: "delivery", title: "侦探的回执", status: "engaged", kind: "side", objective: "向夏洛克交付回执", contract: { coreGoal: "向夏洛克交付回执", nodes: [{ id: "deliver", objective: "向夏洛克交付回执", conditions: [{ type: "location", locationId: "minsk-street-15" }, { type: "action", terms: ["交付回执"] }], minutes: 5 }], rewards: [{ type: "money", amountPence: 24 }] } }, 1, "我接受这份委托");
registerQuest(fixture, { id: "travel", title: "旅馆留言", status: "engaged", kind: "side", objective: "前往雾鸦旅店核对留言", contract: { nodes: [{ id: "read", objective: "核对留言", conditions: [{ type: "location", locationId: "soot-lamp" }, { type: "action", terms: ["核对留言"] }], minutes: 5 }] } }, 1, "我接受旅馆的委托");
fixture.quests.push({ id: "expired", kind: "random", title: "散去的街头传闻", status: "available", createdTurn: -15, objective: "问清传闻" });
fixture.choices = choices;
fixture.recentDialogues = fixture.storyHistory = [{ id: "fixture-story", turn: 2, role: "assistant", content: "明斯克街的窗前，夏洛克放下报纸，等你说明来意。回执和装着魔药的小瓶都在行囊里。" }];
const summary = [];

try {
  for (const [width, height, legacy] of [[375, 812, true], [768, 1024, false], [1440, 900, false]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], requests = [];
    let failIdentification = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ fixture, settings, legacy }) => {
      if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "测试档案", game: fixture, turn: fixture.turn, characterName: fixture.character.name, updatedAt: new Date().toISOString() }]));
      localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
      if (legacy) {
        window.structuredClone = undefined; Array.prototype.at = undefined; Object.hasOwn = undefined;
        String.prototype.replaceAll = undefined;
        Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
        const originalMatch = window.matchMedia.bind(window);
        window.matchMedia = query => { const match = originalMatch(query); match.addEventListener = undefined; match.removeEventListener = undefined; return match; };
      }
    }, { fixture, legacy, settings: { ...DEFAULT_API_SETTINGS, baseUrl: "https://growth-test.invalid/v1", model: "fixture", apiKey: "mock-only", nativeTools: true, fastMode: true, stream: false, jsonMode: false, customHeaders: "" } });
    await page.route("**/*", async route => {
      const request = route.request();
      if (request.url().startsWith(new URL(url).origin)) return route.continue();
      if (!request.url().includes("/chat/completions")) return route.fulfill({ status: 404, body: "isolated" });
      const body = request.postDataJSON();
      requests.push(body);
      const planning = body.tools?.some(tool => tool.function.name === "advancement__promote");
      const last = body.messages.at(-1).content;
      let data = {};
      try { data = JSON.parse(last.slice(last.indexOf("{"), last.lastIndexOf("}") + 1)); } catch { /* plain retry prompt */ }
      const identify = JSON.stringify(body.messages).includes("请夏洛克·莫里亚蒂鉴定一瓶");
      const narrative = data.turnResolution?.accepted?.some(entry => entry.name === "potion.identify") ? "夏洛克完成了鉴定，收下一镑，将已确认身份的一瓶小丑魔药还给你。" : "你完成了选定的行动。事情按约定告一段落，接下来可以自由安排。";
      const content = planning ? "NO_STATE_CHANGE" : failIdentification && identify ? "" : JSON.stringify({ narrative, choices });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }) });
    });
    const button = name => page.getByRole("button", { name, exact: true });
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game);
    const waitTurn = turn => page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game.turn === turn, turn);
    const screenshot = name => page.screenshot({ path: resolve(output, `${width}-${name}.png`) });
    const checkWidth = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const enter = async () => { await page.goto(url); await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click(); await page.getByRole("button", { name: /继续调查/ }).click(); };
    const identifyDialog = async () => {
      await button("特殊行动").click(); await button("人物").click();
      await page.getByRole("button", { name: /选择魔药/ }).click();
      return page.getByRole("dialog", { name: "委托魔药鉴定" });
    };
    try {
      await enter();
      await button("特殊行动").click(); await checkWidth(); await screenshot("special");
      await button("人物").click(); await screenshot("people");
      await page.getByRole("button", { name: /选择魔药/ }).click();
      let dialog = page.getByRole("dialog", { name: "委托魔药鉴定" });
      await dialog.getByRole("button", { name: "确认鉴定 · 1 镑" }).focus();
      await page.keyboard.press("Tab");
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
      await screenshot("identify"); await page.keyboard.press("Escape");
      assert.match(await page.evaluate(() => document.activeElement.textContent), /选择魔药/);
      assert.equal(moneyToPence((await saved()).money), 720);
      await button("关闭资料，返回剧情").click();

      await button("行囊").click(); await page.getByRole("button", { name: /占卜家魔药/ }).click();
      await button("使用 · 服用魔药").click();
      await page.getByRole("dialog", { name: "确认成为非凡者" }).waitFor();
      assert.equal((await saved()).character.advancement.type, "ordinary");
      await button("确认服用并成为非凡者").click(); await waitTurn(3);
      assert.equal((await saved()).character.advancement.pathwayId, "seer");
      assert.equal((await saved()).character.advancement.sequence, 9);
      assert.equal((await saved()).inventory.some(item => item.instanceId === "known-potion"), false);
      assert.equal((await saved()).character.stats.maxHealth, 20);

      failIdentification = true;
      dialog = await identifyDialog(); await dialog.getByRole("button", { name: "确认鉴定 · 1 镑" }).click();
      await page.getByRole("button", { name: "重试本轮", exact: true }).waitFor();
      assert.equal((await saved()).turn, 3);
      assert.equal(moneyToPence((await saved()).money), 720);
      assert.equal((await saved()).inventory.find(item => item.instanceId === "unknown-potion").quantity, 2);
      if (JSON.stringify(requests).includes("PRIVATE_POTION_TRUTH")) await writeFile(resolve(output, "leaks.json"), JSON.stringify(requests.flatMap((body, requestIndex) => body.messages.flatMap((message, messageIndex) => { const i = String(message.content).indexOf("PRIVATE_POTION_TRUTH"); return i < 0 ? [] : [{requestIndex,messageIndex,excerpt:message.content.slice(i-160,i+180)}]; })), null, 2));
      assert.equal(JSON.stringify(requests).includes("PRIVATE_POTION_TRUTH"), false, "unknown potion metadata must not enter API requests");
      failIdentification = false;
      await page.getByRole("button", { name: /重试.*行动|重试本轮/ }).click(); await waitTurn(4);
      assert.equal(moneyToPence((await saved()).money), 480);
      assert.equal((await saved()).inventory.find(item => item.instanceId === "unknown-potion").quantity, 1);
      assert.equal((await saved()).inventory.filter(item => item.potion?.identified && item.potion.sequence === 8).length, 1);

      await button("行囊").click(); await page.getByRole("complementary", { name: "行囊", exact: true }).getByRole("button", { name: /小丑魔药/ }).click();
      await button("使用 · 服用魔药").click();
      await page.getByRole("dialog", { name: "确认序列晋升" }).waitFor();
      await page.getByText("将强化的非凡能力", { exact: true }).waitFor();
      await screenshot("promotion"); await button("确认服用并晋升序列8").click(); await waitTurn(5);
      assert.equal((await saved()).character.stats.maxHealth, 22);
      assert.equal((await saved()).character.stats.maxSanity, 12);
      assert.equal((await saved()).character.stats.maxSpirituality, 10);

      await button("手记").click();
      const board = page.getByRole("region", { name: "任务簿" });
      assert.equal(await board.getByText("已经结清的账目", { exact: true }).count(), 0);
      assert.equal(await board.getByText("散去的街头传闻", { exact: true }).count(), 0);
      await checkWidth(); await screenshot("tasks");
      await board.locator("article").filter({ hasText: "侦探的回执" }).getByRole("button", { name: /继续追踪任务/ }).click();
      await waitTurn(6);
      assert.equal((await saved()).quests.find(quest => quest.id === "delivery").status, "completed");
      assert.equal(moneyToPence((await saved()).money), 504);
      await button("手记").click();
      assert.equal(await board.getByText("侦探的回执", { exact: true }).count(), 0);
      await board.getByRole("button", { name: /归档/ }).click();
      await board.getByText("侦探的回执", { exact: true }).waitFor();
      assert.equal(await board.getByRole("button", { name: /继续追踪任务/ }).count(), 0);
      await screenshot("archive");
      await board.getByRole("button", { name: /进行中/ }).click();
      await board.locator("article").filter({ hasText: "旅馆留言" }).getByRole("button", { name: /继续追踪任务/ }).click(); await waitTurn(7);
      assert.equal((await saved()).location.id, "soot-lamp");
      assert.equal((await saved()).quests.find(quest => quest.id === "travel").status, "engaged");
      await button("手记").click();
      await board.locator("article").filter({ hasText: "旅馆留言" }).getByRole("button", { name: /继续追踪任务/ }).click(); await waitTurn(8);
      assert.equal((await saved()).quests.find(quest => quest.id === "travel").status, "completed");
      assert.deepEqual(errors, []);
      summary.push({ width, height, legacy, ok: true, turn: (await saved()).turn, requests: requests.length });
    } catch (error) { await screenshot("failure"); throw error; }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
await writeFile(resolve(output, "results.json"), JSON.stringify(summary, null, 2));
console.log("Task/growth UI passed: ordinary promotion, fee confirmation, cancellation, failed narrative rollback, retry, stack splitting, quest completion and archives at 375/768/1440px.");
