import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, DEFAULT_API_SETTINGS, EMPTY_CHARACTER } from "../src/system/game.js";
import { computeMemoryUpdate } from "../src/services/memory.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const origin = process.env.CACHE_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/cache-context");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const choices = ["观察站台", "询问车夫", "整理行囊"].map(label => ({ label, intent: "observe", risk: "low" }));
let fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "缓存验证员" });
for (let index = 1; index <= 9; index++) {
  const next = { ...fixture, turn: index };
  fixture = { ...next, ...computeMemoryUpdate(fixture, `第${index}次观察`, `你完成第${index}次观察，记录了所见。`, null, { settledGame: next }).updates };
}
fixture.choices = choices;
const results = [];
try {
  for (const [width, height, fastMode] of [[375, 812, false], [768, 1024, false], [1440, 900, true]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], requests = [];
    let planningCount = 0, fail = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ fixture, settings, legacy }) => {
      if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", game: fixture, turn: fixture.turn, updatedAt: "2026-10-05T00:00:00Z" }]));
      localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
      if (legacy) {
        window.structuredClone = undefined; Array.prototype.at = undefined; Object.hasOwn = undefined; String.prototype.replaceAll = undefined;
        const match = window.matchMedia.bind(window);
        window.matchMedia = query => { const result = match(query); result.addEventListener = undefined; result.removeEventListener = undefined; return result; };
      }
    }, { fixture, legacy: width === 375, settings: { ...DEFAULT_API_SETTINGS, provider: "deepseek", baseUrl: "https://cache-test.invalid", model: "cache-fixture", apiKey: "PRIVATE_TEST_KEY", customHeaders: "", nativeTools: false, stream: true, fastMode } });
    await page.route("**/*", async route => {
      if (route.request().url().startsWith(new URL(origin).origin)) return route.continue();
      if (!route.request().url().endsWith("/chat/completions")) return route.fulfill({ status: 404, body: "isolated" });
      const body = route.request().postDataJSON();
      const system = body.messages.filter(message => message.role === "system").map(message => message.content).join("\n");
      const stage = system.includes("【长期记忆整理】") ? "memory" : system.includes("【阶段 A：状态决策】") ? "planning" : system.includes("【快速模式：并发剧情呈现】") ? "draft" : system.includes("【行动选项重新生成】") ? "choices" : "narrative";
      requests.push({ stage, body });
      if (fail && stage === "planning") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "fixture failure" } }) });
      let content, finish = "stop";
      if (stage === "planning" && ++planningCount === 1 && !fastMode) { content = ""; finish = "length"; }
      else if (stage === "planning") content = JSON.stringify({ toolCalls: [] });
      else if (stage === "memory") content = JSON.stringify({ memory: { people: [], events: [{ summary: "玩家完成了前十轮观察。", certainty: "confirmed", sourceTurns: [1, 10] }], openThreads: [] } });
      else content = JSON.stringify({ narrative: stage === "draft" ? "你仔细查看站台，等待确认。" : "你完成了观察，确认站台上的人们正各自忙碌。", choices });
      const hit = stage === "memory" || finish === "length" ? 0 : 700;
      const usage = { prompt_tokens: 1000, prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: 1000 - hit, completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 20 } };
      if (!body.stream || finish === "length") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage }) });
      assert.equal(body.stream_options.include_usage, true);
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage })}\n\ndata: [DONE]\n\n` });
    });
    const button = name => page.getByRole("button", { name, exact: true });
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game);
    const usage = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-request-usage-v1") || "[]").flatMap(entry => entry.events));
    const enter = async () => { await page.goto(origin); await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click(); await page.getByRole("button", { name: /继续调查/ }).click(); };
    try {
      await enter();
      await page.getByLabel("自由行动", { exact: true }).fill("观察站台");
      await page.getByRole("button", { name: /提交行动/ }).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game.memoryState.revision === 1);
      const game = await saved();
      assert.equal(game.turn, 10);
      assert.equal(game.lastTurnMetrics.modelRequests, 3);
      assert.equal(game.choices.length, 3);
      assert.equal((await usage()).length, 4);
      assert.equal(requests.filter(request => request.stage === "choices").length, 0);
      assert.equal(JSON.stringify(await usage()).includes("PRIVATE_TEST_KEY"), false);
      for (const { stage, body } of requests.filter(entry => ["planning", "narrative", "draft"].includes(entry.stage))) {
        const firstData = body.messages.findIndex(message => message.role !== "system");
        assert.equal(body.messages.slice(firstData).some(message => message.role === "system"), false, stage);
        if (stage === "narrative") assert.equal(body.messages.at(-1).content.includes('"visibleStateBefore"'), false);
      }
      fail = true;
      await page.getByLabel("自由行动", { exact: true }).fill("继续观察站台");
      await page.getByRole("button", { name: /提交行动/ }).click();
      await page.getByText(/HTTP 503/).waitFor();
      // Fast mode starts its draft independently, and it too must remain in the ledger.
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("mist-request-usage-v1") || "[]").some(item => item.events.some(event => event.httpStatus === 503)));
      assert.equal((await saved()).turn, 10);
      assert.ok((await usage()).some(event => event.status === "failed" && event.promptTokens === null));
      await button("手记").click(); await button("记录").click();
      const details = page.locator("details").filter({ has: page.getByText("技术详情与性能", { exact: true }) });
      await details.locator("summary").click();
      await details.getByText(/统计不完整/).waitFor();
      await details.locator("summary").focus();
      assert.equal(await details.locator("summary").evaluate(element => element === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(output, `${width}-metrics.png`), fullPage: true });
      await details.getByRole("heading", { name: "按阶段查看" }).scrollIntoViewIfNeeded();
      assert.equal(await details.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await page.screenshot({ path: resolve(output, `${width}-stages.png`), fullPage: true });
      await enter();
      assert.ok((await usage()).some(event => event.httpStatus === 503));
      assert.equal((await saved()).memoryState.revision, 1);
      assert.deepEqual(errors, []);
      results.push({ width, fastMode, actualRequests: (await usage()).length, errors, passed: true });
      console.log(`${width}: ${fastMode ? "fast final choices" : "internal retry"}, summary, failure persistence, focus and overflow passed`);
    } catch (error) {
      const current = await saved();
      console.log(JSON.stringify({ stages: requests.map(request => request.stage), turn: current.turn, memory: current.memoryState, errors, usage: await usage(), text: (await page.locator("body").innerText()).slice(-1800) }));
      await page.screenshot({ path: resolve(output, `${width}-failure.png`), fullPage: true });
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
