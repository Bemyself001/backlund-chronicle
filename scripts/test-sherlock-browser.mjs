import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.SHERLOCK_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/sherlock");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const summary = [];
const personId = "sherlock-moriarty";
const choices = ["整理刚才的谈话", "观察周围的街道", "考虑下一步调查"].map(label => ({ label, intent: "observe", risk: "low" }));
try {
  for (const [width, legacy] of [[1440, false], [390, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "侦探拜访验收员" });
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ fixture, settings, legacy }) => {
      if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "自动存档", updatedAt: new Date().toISOString(), turn: fixture.turn, characterName: fixture.character.name, game: fixture }]));
      localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
      if (legacy) {
        window.structuredClone = undefined; Array.prototype.at = undefined; Array.prototype.findLast = undefined;
        Object.hasOwn = undefined; String.prototype.replaceAll = undefined;
        Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
      }
    }, { fixture, legacy, settings: { ...DEFAULT_API_SETTINGS, baseUrl: "https://sherlock-test.invalid/v1", model: "sherlock-test", apiKey: "mock-key", customHeaders: "", nativeTools: true, stream: false, fastMode: false, jsonMode: false } });
    await page.route("**/*", async route => {
      const request = route.request();
      if (request.url().startsWith(new URL(url).origin)) return route.continue();
      if (!request.url().includes("/chat/completions")) return route.fulfill({ status: 404, body: "test-isolated" });
      const body = request.postDataJSON();
      const last = body.messages.at(-1).content;
      const data = JSON.parse(last.slice(last.indexOf("{"), last.lastIndexOf("}") + 1));
      requests.push(data);
      const planning = (body.tools || []).some(tool => tool.function.name === "location__move");
      const narrative = data.playerAction.startsWith("前往")
        ? `你按照已确认的路线抵达${data.visibleStateAfter?.location?.name || "目的地"}。`
        : "夏洛克把两张纸并排放好。“先把亲眼所见和听来的消息分开，”他说，“再看它们的时间是否吻合。现在材料还不够，下结论之前，最好再核对一次。”";
      const message = { content: planning ? "NO_STATE_CHANGE" : JSON.stringify({ narrative, choices }) };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }) });
    });
    const button = name => page.getByRole("button", { name, exact: true });
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game);
    const waitTurn = turn => page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game.turn === turn, turn);
    const enter = async () => {
      await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
      await page.getByRole("button", { name: /继续调查/ }).click();
    };
    try {
      await page.goto(url);
      await enter();
      await button("特殊行动").click();
      await button("人物").click();
      assert.equal(await button("需先到达乔伍德区·明斯克街15号").isDisabled(), true);
      assert.equal(await button("聊聊侦探工作").isDisabled(), true);
      await button("在地图查看乔伍德区·明斯克街15号").click();
      await button("前往此处").click();
      await waitTurn(1);
      assert.equal((await saved()).location.id, "minsk-street-15");
      assert.equal((await saved()).relationships.find(person => person.id === personId).contact, "heard");
      const beforeVisitCalls = requests.length;
      const specialPanel = page.getByRole("dialog", { name: "特殊行动", exact: true });
      if (await specialPanel.count()) await specialPanel.getByRole("button", { name: "人物", exact: true }).click();
      await button("敲门拜访夏洛克·莫里亚蒂 · 1回合").click();
      await waitTurn(2);
      assert.equal(requests.length, beforeVisitCalls, "first visit must complete locally");
      const met = await saved();
      assert.equal(met.relationships.find(person => person.id === personId).contact, "met");
      assert.equal(met.occult.contact, 0);
      assert.deepEqual(met.money, fixture.money);
      assert.equal(met.inventory.length, fixture.inventory.length);
      assert.equal(met.clues.length, 0);
      assert.equal(await button("聊聊侦探工作").isEnabled(), true);
      await page.screenshot({ path: resolve(output, `${width}-visit.png`) });
      await button("聊聊侦探工作").click();
      await waitTurn(3);
      const conversation = requests.find(data => data.playerAction.includes("分辨证词"));
      assert.equal(conversation.playerVisibleState.nearbyPeople[0].id, personId);
      assert.equal(conversation.playerVisibleState.nearbyPeople[0].met, true);
      assert.doesNotMatch(JSON.stringify(conversation.playerVisibleState.nearbyPeople), /克莱恩|Klein|愚者|塔罗会/);
      assert.deepEqual((await saved()).money, fixture.money);
      await page.getByText(/夏洛克把两张纸并排放好/).last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `${width}-conversation.png`) });
      await button("手记").click();
      await button("人物").click();
      const card = page.getByRole("region", { name: "人物档案" }).getByRole("article").filter({ hasText: "夏洛克·莫里亚蒂" });
      assert.equal(await card.count(), 1);
      assert.match(await card.innerText(), /已见面/);
      assert.doesNotMatch(await card.innerText(), /克莱恩|Klein|愚者|塔罗会/);
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `${width}-dossier.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.reload();
      await enter();
      await button("特殊行动").click();
      await button("人物").click();
      await button("再次拜访夏洛克·莫里亚蒂 · 1回合").click();
      await waitTurn(4);
      const reloaded = await saved();
      assert.equal(reloaded.relationships.filter(person => person.id === personId).length, 1);
      assert.equal(reloaded.relationships.find(person => person.id === personId).dossier.discoveries.met.turn, 2);
      assert.deepEqual(errors, []);
      summary.push({ width, legacy, result: "PASS", turn: 4 });
      console.log(`Sherlock ${width}px${legacy ? " with missing native APIs" : ""}: travel, first visit, AI conversation, public dossier, reload, revisit passed.`);
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${width}-failure.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(resolve(output, "result.json"), JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
