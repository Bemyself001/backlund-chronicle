import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.CANCEL_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/cancellation");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const [width, fastMode] of [[1440, false], [375, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ fixture, settings, fastMode }) => {
      localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "测试", updatedAt: new Date().toISOString(), game: fixture }]));
      localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
      const realFetch = window.fetch.bind(window);
      window.cancelTest = { calls: 0, late: [], streamClosed: 0, complete: false, signals: [], clicks: [] };
      document.addEventListener("click", event => { if (event.target.closest("button")) window.cancelTest.clicks.push(event.target.closest("button").textContent); }, true);
      window.fetch = (url, init) => {
        if (!String(url).startsWith("https://cancel.invalid")) return realFetch(url, init);
        const state = window.cancelTest;
        state.calls++;
        state.signals.push(init.signal);
        const body = JSON.parse(init.body);
        const planning = body.tools?.some(tool => tool.function.name === "location__move");
        const jsonResponse = content => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
        if (state.complete) return Promise.resolve(jsonResponse(planning ? "NO_STATE_CHANGE" : JSON.stringify({ narrative: "你翻开新的一页，重新开始这次调查。", choices: ["查看目录", "询问馆员", "合上书本"].map(label => ({ label, intent: "observe", risk: "low" })) })));
        if (fastMode && planning) return Promise.resolve(jsonResponse("NO_STATE_CHANGE"));
        if (fastMode) return Promise.resolve(new Response(new ReadableStream({
          start(stream) { stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你正在阅读旧的草稿"}}]}\n\n')); },
          cancel() { state.streamClosed++; },
        }), { headers: { "Content-Type": "text/event-stream" } }));
        // Deliberately ignore AbortSignal to reproduce an uncooperative provider.
        return new Promise(resolve => state.late.push(() => resolve(jsonResponse(""))));
      };
    }, { fixture: createInitialGame({ ...EMPTY_CHARACTER, name: "中止操作验收" }), settings: { ...DEFAULT_API_SETTINGS, apiKey: "test", baseUrl: "https://cancel.invalid/v1", model: "test", nativeTools: true, stream: true, fastMode }, fastMode });
    await page.goto(url);
    await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    await page.getByRole("button", { name: /继续调查/ }).click();
    const input = page.getByRole("textbox", { name: "自由行动", exact: true });
    const turn = () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn);
    for (let i = 0; i < 2; i++) {
      const draft = `取消后可编辑的草稿${i}`;
      await input.fill(draft);
      await page.getByRole("button", { name: /提交行动/ }).click();
      await page.waitForFunction(previous => window.cancelTest.calls > previous, i * (fastMode ? 2 : 1));
      if (fastMode) await page.getByText("你正在阅读旧的草稿", { exact: true }).waitFor();
      await page.getByRole("button", { name: "中止生成", exact: true }).click();
      await input.waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('textarea[aria-label="自由行动"]').disabled, null, { timeout: 1500 }).catch(async error => {
        await page.screenshot({ path: resolve(output, `${width}-failed.png`) });
        console.log(JSON.stringify({ width, fastMode, i, errors, diagnostics: await page.evaluate(() => ({ calls: window.cancelTest.calls, aborted: window.cancelTest.signals.map(signal => signal.aborted), closed: window.cancelTest.streamClosed, clicks: window.cancelTest.clicks })), text: (await page.locator("main").innerText()).slice(-700) }));
        throw error;
      });
      assert.equal(await input.inputValue(), draft);
      await input.fill(`修改后的草稿${i}`);
      const calls = await page.evaluate(() => window.cancelTest.calls);
      await page.evaluate(() => { window.cancelTest.late.splice(0).forEach(release => release()); });
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => window.cancelTest.calls), calls);
      assert.equal(await input.inputValue(), `修改后的草稿${i}`);
      assert.equal(await turn(), 0);
    }
    await page.evaluate(() => { window.cancelTest.complete = true; });
    await input.fill("翻开新的一页");
    await page.getByRole("button", { name: /提交行动/ }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === 1);
    await page.waitForFunction(() => !document.querySelector('textarea[aria-label="自由行动"]').disabled);
    assert.equal(await input.inputValue(), "");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(output, `${width}-${fastMode ? "fast" : "normal"}.png`) });
    results.push({ width, fastMode, editableAfterTwoCancellations: true, nextTurn: await turn(), errors });
    await page.close();
  }
  await writeFile(resolve(output, "verification.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
