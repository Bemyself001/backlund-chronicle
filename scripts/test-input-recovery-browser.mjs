// Browser/bridge integration tests. The simulated mismatch is not an Android IME test.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const source = await readFile(new URL("../src/services/inputFocus.js", import.meta.url));
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/inputFocus.js" ? "application/javascript" : "text/html");
  res.end(req.url === "/inputFocus.js" ? source : `<!doctype html><button id="outside">Outside</button>
    <input id="field" value="existing text"><input id="other"><dialog><input id="modal"></dialog>`);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
let count = 0;
async function scenario(name, options, run) {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async options => {
      const { watchInput } = await import("/inputFocus.js");
      window.calls = [];
      window.records = [];
      window.mismatch = options.mismatch !== false;
      const hasFocus = document.hasFocus.bind(document);
      document.hasFocus = () => window.mismatch ? false : hasFocus();
      window.monitor = watchInput(window, {
        recover: options.recover !== false,
        publish: records => { window.records = records; },
        nativeRecovery: async id => {
          window.calls.push(id);
          if (options.defer) await new Promise(resolve => { window.releaseRecovery = resolve; });
          if (!window.__startupInputRecovery?.check(id)) return { status: "stale", attempted: false };
          if (!options.keepMismatch) window.mismatch = false;
          return { status: "reset", attempted: true, restarted: true };
        },
      });
    }, options);
    await run(page);
    assert.deepEqual(errors, [], name);
    console.log(`PASS ${name}`);
    count++;
  } finally { await context.close(); }
}
const calls = page => page.evaluate(() => window.calls.length);
const result = page => page.evaluate(() => window.records.findLast(r => r.type === "native-recovery-result"));
try {
  await scenario("healthy input keeps native focus and selected text", { mismatch: false }, async page => {
    await page.locator("#field").tap();
    await page.locator("#field").press("Home");
    await page.keyboard.insertText("中");
    assert.equal(await page.locator("#field").inputValue(), "中existing text");
    assert.equal(await calls(page), 0);
  });
  await scenario("matching Vivo flags request native repair and verify document focus", {}, async page => {
    await page.locator("#field").tap();
    await page.waitForFunction(() => window.records.some(r => r.type === "native-recovery-result"));
    assert.equal(await calls(page), 1);
    assert.equal((await result(page)).verified, true);
    assert.equal(await page.locator("#field").inputValue(), "existing text");
    assert.equal(await page.evaluate(() => window.records.some(r => r.type === "focus-recovered")), false);
    await page.keyboard.insertText("中文");
    assert.match(await page.locator("#field").inputValue(), /中文/);
  });
  await scenario("activeElement alone never reports recovered focus", { keepMismatch: true }, async page => {
    await page.locator("#field").tap();
    await page.waitForFunction(() => window.records.some(r => r.type === "native-recovery-result"));
    assert.equal((await result(page)).verified, false);
    assert.equal(await page.evaluate(() => window.records.some(r => r.type === "focus-recovered")), false);
  });
  await scenario("diagnostic variant only observes the mismatch", { recover: false }, async page => {
    await page.locator("#field").tap();
    assert.equal(await calls(page), 0);
  });
  await scenario("cancelled click respects the application", {}, async page => {
    await page.locator("#field").evaluate(field => field.addEventListener("click", e => e.preventDefault()));
    await page.locator("#field").tap();
    assert.equal(await calls(page), 0);
  });
  await scenario("read-only inputs never request repair", {}, async page => {
    await page.locator("#field").evaluate(field => { field.readOnly = true; });
    await page.locator("#field").tap();
    assert.equal(await calls(page), 0);
  });
  await scenario("synthetic clicks never request repair", {}, async page => {
    await page.locator("#field").evaluate(field => { field.focus(); field.click(); });
    assert.equal(await calls(page), 0);
  });
  for (const action of ["another-tap", "composition", "paste", "typing", "disabled", "removed", "modal", "hidden", "window-blur", "stop"]) {
    await scenario(`queued repair is cancelled by ${action}`, { defer: true }, async page => {
      await page.locator("#field").tap();
      await page.waitForFunction(() => Boolean(window.releaseRecovery));
      if (action === "another-tap") await page.locator("#outside").tap();
      else await page.evaluate(action => {
        const field = document.querySelector("#field");
        if (action === "composition") field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "private" }));
        if (action === "paste") field.dispatchEvent(new Event("paste", { bubbles: true }));
        if (action === "typing") field.dispatchEvent(new InputEvent("input", { bubbles: true, data: "private" }));
        if (action === "disabled") field.disabled = true;
        if (action === "removed") field.remove();
        if (action === "modal") document.querySelector("dialog").showModal();
        if (action === "hidden") field.style.display = "none";
        if (action === "window-blur") window.dispatchEvent(new Event("blur"));
        if (action === "stop") window.monitor.stop();
      }, action);
      await page.evaluate(() => window.releaseRecovery());
      if (action !== "stop") {
        await page.waitForFunction(() => window.records.some(r => r.type === "native-recovery-result"));
        assert.equal((await result(page)).status, "stale");
        assert.equal((await result(page)).attempted, false);
      } else assert.equal(await page.evaluate(() => window.__startupInputRecovery), undefined);
      assert.doesNotMatch(await page.evaluate(() => JSON.stringify(window.records)), /existing text|private/);
    });
  }
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
console.log(`${count} input recovery checks passed; native focus transitions still require Android verification.`);
