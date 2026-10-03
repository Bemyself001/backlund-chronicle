// Production artifacts only; every scenario uses a new browser context with no player data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = resolve(".shots/startup-checks");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webp": "image/webp", ".jpg": "image/jpeg" };
const summary = [];
const variants = process.argv.slice(2);
if (variants.some(variant => !["standard", "diagnostic", "compat"].includes(variant))) throw new Error("Unknown startup variant");
try {
  for (const variant of variants.length ? variants : ["diagnostic", "compat"]) {
    const latest = variant === "standard" ? null : JSON.parse(await readFile(`.shots/startup-builds/${variant}/latest.json`, "utf8"));
    const root = latest ? resolve(latest.output, "web") : resolve("dist/client");
    const server = createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try { res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream"); res.end(await readFile(file)); }
      catch { res.writeHead(404).end(); }
    });
    await new Promise(done => server.listen(0, "127.0.0.1", done));
    const url = `http://127.0.0.1:${server.address().port}/`;
    try {
      for (const scenario of ["fresh", "missing-script", "syntax-error", "render-error", "blocked-storage", "missing-style", ...(variant === "standard" ? [] : ["offline-html"]), ...(variant !== "diagnostic" ? ["missing-apis"] : ["timeout", "stalled-script"])]) {
        const context = await browser.newContext({ viewport: { width: 393, height: 820 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.name));
        try {
          if (scenario === "missing-apis") await page.addInitScript(() => {
            window.structuredClone = undefined; Array.prototype.at = undefined; Array.prototype.findLast = undefined;
            Object.hasOwn = undefined; String.prototype.replaceAll = undefined;
            Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
          });
          if (scenario === "missing-script") await page.route("**/assets/*.js", route => route.abort());
          if (scenario === "syntax-error") await page.route("**/assets/*.js", route => route.fulfill({ contentType: "application/javascript", body: "const broken = ;" }));
          if (scenario === "timeout") await page.route("**/assets/*.js", route => route.fulfill({ contentType: "application/javascript", body: "/* stalled startup */" }));
          if (scenario === "stalled-script") await page.route("**/assets/*.js", () => {});
          if (scenario === "missing-style") await page.route("**/assets/*.css", route => route.abort());
          if (scenario === "render-error") await page.addInitScript(() => localStorage.setItem("mist-api-settings-v1", "null"));
          if (scenario === "blocked-storage") await page.addInitScript(() => {
            Object.defineProperty(window, "localStorage", { get() { throw new DOMException("private sk-test-secret", "SecurityError"); } });
          });
          await page.goto(url + (scenario === "offline-html" ? "离线启动测试.html" : ""), { waitUntil: scenario === "stalled-script" ? "commit" : "domcontentloaded" });
          const succeeds = ["fresh", "missing-apis", "offline-html"].includes(scenario);
          if (succeeds) {
            await page.waitForFunction(() => JSON.parse(window.__startupDiagnostics.report()).completed);
            assert.equal(await page.locator("#startup-panel").isVisible(), false);
            assert.equal(await page.locator("#splash-title").isVisible(), true);
            assert.deepEqual(pageErrors, []);
            if (scenario === "missing-apis") {
              assert.equal(await page.evaluate(() => typeof structuredClone === "function" && [1].at(-1) === 1 && Object.hasOwn({ a: 1 }, "a") && /^.{8}-.{4}-4.{3}-[89ab].{3}-.{12}$/.test(crypto.randomUUID())), true);
              assert.equal(await page.evaluate(() => JSON.parse(window.__startupDiagnostics.report()).capabilitiesBeforePolyfills.structuredClone), false);
            }
            if (scenario === "fresh") {
              await page.screenshot({ path: resolve(output, `${variant}-first-screen.png`) });
              if (variant === "standard") assert.equal(await page.locator("#startup-open").isVisible(), false);
              else {
                await page.locator("#startup-open").click();
                assert.equal(await page.locator("#startup-panel").isVisible(), true);
                await page.locator("#startup-copy").click();
                await page.locator("#startup-close").click();
                assert.equal(await page.locator("#startup-panel").isVisible(), false);
              }
            }
          } else {
            await page.waitForFunction(() => JSON.parse(window.__startupDiagnostics.report()).failed, null, { timeout: 20000 });
            assert.equal(await page.locator("#startup-panel").isVisible(), true);
            assert.equal(await page.locator("#startup-title").textContent(), "游戏启动未完成");
            assert.equal(await page.locator("#startup-details").getAttribute("open"), "");
            assert.doesNotMatch(await page.locator("#startup-report").inputValue(), /sk-test-secret|private/);
            await page.locator("#startup-copy").click();
            assert.match(await page.locator("#startup-copy").textContent(), /已复制|请长按/);
            if (scenario === "syntax-error") await page.screenshot({ path: resolve(output, `${variant}-failure.png`) });
          }
          summary.push(`${variant}/${scenario}: PASS`);
          console.log(summary[summary.length - 1]);
        } finally { await context.close(); }
      }
    } finally { await new Promise(done => server.close(done)); }
  }
} finally { await browser.close(); }
console.log(`${summary.length} browser startup checks passed. These simulate missing APIs; they do not emulate an actual old Chromium engine.`);
