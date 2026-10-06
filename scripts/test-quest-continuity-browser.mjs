import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, DEFAULT_API_SETTINGS, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { getTriggerDefinition } from "../src/engine/triggerDefinitions.js";
import { registerQuest } from "../src/engine/questLifecycle.js";
import { resolveQuestAction } from "../src/engine/questActions.js";
import { moneyToPence } from "../src/system/money.js";
import { advanceWorldTime } from "../src/engine/worldTime.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = resolve(".shots/quest-continuity");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const [width, height, scenario] of [[1440, 900, "auction"], [375, 812, "reward"]]) {
    const fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "支线验收员" });
    const main = getTriggerDefinition("watch.heirloom.late-hour");
    fixture.triggerState.active.push({ instanceId: "main-case", definitionId: main.id, status: "engaged", stage: "trace-uncle", createdTurn: 0, engagedTurn: 0, stageHistory: [], presentation: main.presentation });
    fixture.trackedQuestId = "main-case";
    if (scenario === "auction") {
      const definition = getTriggerDefinition("side.queens.renard-fall");
      fixture.triggerState.active.push({ instanceId: "renard-case", definitionId: definition.id, status: "engaged", stage: "assess-injury", createdTurn: 0, engagedTurn: 0, stageHistory: [], presentation: definition.presentation });
      fixture.location = { id: "queen-renard-estate", name: "雷纳德宅邸", district: "皇后区" };
    } else {
      const added = registerQuest(fixture, { id: "letter", title: "送信支线", objective: "交还信件", status: "engaged", contract: { coreGoal: "交还信件", nodes: [{ id: "deliver", objective: "交还信件", conditions: [{ type: "action", terms: ["交还信件"] }], minutes: 5 }], rewards: [{ type: "money", amountPence: 240 }], rewardClaim: { objective: "向委托人领取报酬", locationId: fixture.location.id } } }, 1, "我接受送信委托");
      assert.equal(added.ok, true);
      assert.equal(resolveQuestAction(fixture, { instanceId: "letter", actionQuote: "交还信件", outcome: "progress", evidence: "实际交还信件，等待原地交差", steps: [{ objectiveId: "deliver" }] }, "交还信件", 1).ok, true);
      fixture.turn = 1; fixture.questFocus = { id: "quest:letter", turn: 1 };
    }
    const before = moneyToPence(fixture.money), startTurn = fixture.turn;
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width === 375, hasTouch: width === 375 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ fixture, settings, scenario }) => {
      if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "支线验收", updatedAt: new Date().toISOString(), game: fixture }]));
      localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
      const realFetch = window.fetch.bind(window);
      window.fetch = (url, init) => {
        if (!String(url).startsWith("https://quest.invalid")) return realFetch(url, init);
        const body = JSON.parse(init.body);
        const content = body.messages.filter(message => message.role === "user").at(-1)?.content || "";
        const data = JSON.parse(content.split("\n").find(line => line.startsWith("{")) || "{}");
        const planning = body.tools?.some(tool => tool.function.name === "location__move");
        let message;
        if (planning) {
          const args = { instanceId: scenario === "auction" ? "side.queens.renard-fall" : "letter", actionQuote: data.playerAction, evidence: "玩家实际处理当前支线并核对约定结果", outcome: scenario === "auction" ? "progress" : "claim", steps: scenario === "auction" ? [{ objectiveId: data.playerAction.includes("等待至") ? "attend-renard-auction" : "assess-renard-injury" }] : [], reason: "完成本轮支线行动" };
          message = { content: null, tool_calls: [{ id: `task-${data.playerVisibleState.turn}`, type: "function", function: { name: "quest__resolve", arguments: JSON.stringify(args) } }] };
        } else {
          const notice = data.turnResolution?.derivedEffects?.narrativeEvents?.find(event => event.id.startsWith("renard-auction-ready:"));
          message = { content: JSON.stringify({ narrative: scenario === "auction" ? notice ? `雷纳德子爵当场递来引荐通知，叮嘱你记清日期：${notice.direction}` : "你等到约定的次日晚上20点，凭引荐通知入场参加拍卖会。" : "委托人核对了已经完成的交付，将约定的一镑报酬交到你手中。", choices: ["继续迟到的整点主线", "调查迟到的整点新线索", "返回迟到的整点的货栈"].map(label => ({ label, intent: "investigate", risk: "low" })) }) };
        }
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message, finish_reason: planning ? "tool_calls" : "stop" }] }), { headers: { "Content-Type": "application/json" } }));
      };
    }, { fixture, scenario, settings: { ...DEFAULT_API_SETTINGS, apiKey: "test", baseUrl: "https://quest.invalid/v1", model: "test", nativeTools: true, stream: false, fastMode: width === 375 } });
    await page.goto(process.env.QUEST_TEST_URL || "http://127.0.0.1:5173/");
    await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    await page.getByRole("button", { name: /继续调查/ }).click();
    await page.getByRole("textbox", { name: "自由行动", exact: true }).fill(scenario === "auction" ? "我继续高窗之下，在宅邸与雷纳德子爵交谈，询问女儿的伤势" : "我向委托人领取送信支线的约定报酬");
    await page.getByRole("button", { name: /提交行动/ }).click();
    await page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === turn, startTurn + 1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game);
    await writeFile(resolve(output, `${scenario}-state.json`), JSON.stringify(saved, null, 2));
    assert.equal(saved.choices.length, 3);
    assert.ok(saved.choices.every(choice => !choice.label.includes("迟到的整点")));
    if (scenario === "auction") {
      assert.match(saved.choices[0].label, /等待至.*20:00开场/);
      assert.ok(saved.triggerState.facts["side.renard.auction-invited"].value);
      const quest = saved.triggerState.active.find(entry => entry.instanceId === "renard-case");
      assert.equal(quest.stage, "secure-treatment");
      assert.ok((await page.locator("body").innerText()).includes(quest.appointments["renard-auction"].startsAt));
    } else {
      assert.equal(saved.quests[0].status, "completed"); assert.equal(moneyToPence(saved.money), before + 240);
      assert.equal(saved.quests[0].lifecycle.rewardReceipt.amountPence, 240);
    }
    await page.getByText(saved.choices[0].label, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `${scenario}-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false); assert.deepEqual(errors, []);
    if (scenario === "auction") {
      await page.getByText(saved.choices[0].label, { exact: true }).click();
      await page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === turn, startTurn + 2);
      const arrived = await page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game);
      const quest = arrived.triggerState.active.find(entry => entry.instanceId === "renard-case");
      assert.equal(quest.stage, "auction-conversation");
      assert.equal(arrived.worldTime, advanceWorldTime(quest.appointments["renard-auction"].startsAt, 10));
      assert.deepEqual(errors, []);
      await writeFile(resolve(output, "auction-arrival-state.json"), JSON.stringify(arrived, null, 2));
    }
    results.push({ scenario, width, fastMode: width === 375, choices: saved.choices.map(choice => choice.label), amountPence: moneyToPence(saved.money) - before, overflow, errors });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, "verification.json"), JSON.stringify(results, null, 2));
process.stdout.write(JSON.stringify(results) + "\n");
