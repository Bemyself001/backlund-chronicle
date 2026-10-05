// Run against an existing dev/preview server. All data and requests stay in isolated contexts.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { getMapLocation } from "../src/system/map.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const postcss = createRequire(require.resolve("vite/package.json"))("postcss");
const url = process.env.COMPAT_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/webview-compat");
await mkdir(output, { recursive: true });

// Remove newer declarations *before* CSS parsing so earlier fallback declarations survive.
function legacyCss(source) {
  const tree = postcss.parse(source);
  tree.walkRules(rule => { if (/:has\(|:focus-visible/.test(rule.selector)) rule.remove(); });
  tree.walkDecls(decl => {
    if (/^(inset|aspect-ratio|accent-color|scrollbar-width|scrollbar-color)$/.test(decl.prop)
      || /^(margin|padding|border|scroll-margin)-(block|inline)$/.test(decl.prop)
      || /\b[\d.]+[sdl]v[hw]\b|color-mix\(|\bclip\b/.test(decl.value)
      || (decl.prop === "align-items" && ["start", "end"].includes(decl.value))) decl.remove();
  });
  return tree.toString();
}

const fixture = createInitialGame({ ...EMPTY_CHARACTER, name: "兼容验收员", extraordinary: "low", pathway: "占卜家（序列9）" });
fixture.location = { ...getMapLocation("soot-lamp") };
fixture.character.stats.health = 12;
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const summary = [];

async function tabTo(page, target) {
  for (let count = 0; count < 100; count += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate(element => document.activeElement === element)) return;
  }
  throw new Error(`Tab navigation did not reach ${await target.innerText()}`);
}

async function visibleFocus(target, label) {
  const result = await target.evaluate(element => {
    const style = getComputedStyle(element);
    return { focused: document.activeElement === element, outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth, outlineColor: style.outlineColor,
      legacy: document.documentElement.classList.contains("legacy-focus") };
  });
  assert.equal(result.focused, true, `${label}: expected keyboard focus`);
  assert.ok(!["none", "hidden"].includes(result.outlineStyle) && parseFloat(result.outlineWidth) > 0
    && !["transparent", "rgba(0, 0, 0, 0)"].includes(result.outlineColor), `${label}: invisible outline ${JSON.stringify(result)}`);
  if (result.legacy) {
    assert.ok(["rgb(230, 197, 135)", "rgb(214, 181, 110)"].includes(result.outlineColor),
      `${label}: legacy focus must use the authored gold fallback, not a dark browser-default outline ${JSON.stringify(result)}`);
    assert.equal(result.outlineStyle, "solid", `${label}: legacy fallback must have a solid focus ring`);
    assert.ok(parseFloat(result.outlineWidth) >= 2, `${label}: legacy fallback must have at least a 2px focus ring`);
  }
}

async function tabBoundary(page, container, label) {
  // Use the real DOM tab stops, including expanded summaries and enabled form controls.
  const focusEdge = async last => container.evaluate((element, last) => {
    const controls = [...element.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]')]
      .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length
        && getComputedStyle(control).visibility !== "hidden" && !control.closest("[inert]"));
    if (!controls.length) throw new Error("dialog has no usable tab stops");
    controls[last ? controls.length - 1 : 0].focus();
    return controls.length;
  }, last);
  const assertInside = async () => {
    const focus = await container.evaluate(element => ({ inside: element.contains(document.activeElement), tag: document.activeElement.tagName,
      id: document.activeElement.id, role: document.activeElement.getAttribute("role"), name: document.activeElement.getAttribute("aria-label") }));
    assert.equal(focus.inside, true, `${label}: keyboard focus escaped the dialog ${JSON.stringify(focus)}`);
  };
  const count = await focusEdge(true);
  await page.keyboard.press("Tab");
  await assertInside();
  await focusEdge(false);
  await page.keyboard.press("Shift+Tab");
  await assertInside();
  // Check intermediate stops too, not just a selector or implementation detail.
  for (let index = 0; index < Math.min(count + 2, 70); index += 1) {
    await page.keyboard.press("Tab");
    await assertInside();
  }
  return count;
}

try {
  for (const width of [360, 390, 1440]) for (const legacy of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ fixture, legacy }) => {
      if (!sessionStorage.getItem("compat-fixture-seeded")) {
        localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "兼容验收", updatedAt: new Date().toISOString(), game: fixture, turn: fixture.turn, characterName: fixture.character.name }]));
        sessionStorage.setItem("compat-fixture-seeded", "true");
      }
      if (!legacy) return;
      window.structuredClone = undefined;
      Array.prototype.at = undefined;
      Array.prototype.findLast = undefined;
      Object.hasOwn = undefined;
      String.prototype.replaceAll = undefined;
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
      const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight").get;
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() {
        return this.hasAttribute("data-flex-gap-probe") ? 2 : originalHeight.call(this);
      } });
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => args[0] === "selector(:focus-visible)" ? false : supports(...args);
    }, { fixture, legacy });
    await page.route("**/*", async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== new URL(url).origin) return route.fulfill({ status: 404, body: "isolated compatibility check" });
      if (!legacy || !requestUrl.pathname.endsWith(".css")) return route.continue();
      const response = await route.fetch();
      let body = await response.text();
      if (response.headers()["content-type"]?.includes("javascript")) {
        body = body.replace(/(const __vite__css = )("(?:\\.|[^"\\])*")/, (_match, prefix, css) => prefix + JSON.stringify(legacyCss(JSON.parse(css))));
      } else body = legacyCss(body);
      return route.fulfill({ response, body });
    });
    const checkWidth = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}px page overflow`);
    const screenshot = stage => page.screenshot({ path: resolve(output, `${width}-${legacy ? "legacy" : "native"}-${stage}.png`) });
    try {
      await page.goto(url);
      await page.waitForFunction(() => JSON.parse(window.__startupDiagnostics.report()).completed);
      const startup = await page.evaluate(() => JSON.parse(window.__startupDiagnostics.report()));
      assert.equal(startup.variant, "standard", "compatibility must retain the standard OTA identity");
      assert.equal(startup.capabilitiesBeforePolyfills.structuredClone, !legacy);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains("no-flex-gap")), legacy);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains("legacy-focus")), legacy);
      const background = await page.locator("#main > picture").boundingBox();
      assert.ok(background.width >= width - 1 && background.height >= 800, "splash background lost its inset fallback");
      await checkWidth();
      await screenshot("splash");
      await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
      await checkWidth();
      const auxiliary = page.getByRole("navigation", { name: "辅助操作" });
      const api = auxiliary.getByRole("button", { name: "API 设置", exact: true });
      await tabTo(page, api);
      await visibleFocus(api, "home API button");
      await screenshot("api-button-focus");
      await page.keyboard.press("Enter");
      const apiDialog = page.getByRole("dialog", { name: "AI 接口设置", exact: true });
      await apiDialog.waitFor();
      assert.equal(await apiDialog.evaluate(element => element.tagName), "DIALOG", "API settings must use a native modal dialog");
      const apiTabStops = await tabBoundary(page, apiDialog, "API settings");
      await page.keyboard.press("Escape");
      await apiDialog.waitFor({ state: "hidden" });
      await visibleFocus(api, "API trigger after Escape");

      const diagnostic = auxiliary.getByRole("button", { name: "启动诊断", exact: true });
      await tabTo(page, diagnostic);
      await visibleFocus(diagnostic, "home diagnostics button");
      await page.keyboard.press("Enter");
      const diagnosticPanel = page.locator("#startup-panel");
      await diagnosticPanel.waitFor({ state: "visible" });
      await visibleFocus(page.locator("#startup-close"), "initial diagnostics close button");
      assert.doesNotMatch(await page.locator("#startup-message").innerText(), /自动热更新已暂停|暂停热更新/);
      const diagnosticTabStops = await tabBoundary(page, diagnosticPanel, "startup diagnostics");
      await screenshot("diagnostics-focus");
      await page.keyboard.press("Escape");
      await diagnosticPanel.waitFor({ state: "hidden" });
      await visibleFocus(diagnostic, "diagnostics trigger after Escape");
      await page.keyboard.press("Enter");
      await diagnosticPanel.waitFor({ state: "visible" });
      // Opening puts focus on Return to game; Enter must close and restore the trigger.
      await visibleFocus(page.locator("#startup-close"), "diagnostics Return to game");
      await page.keyboard.press("Enter");
      await diagnosticPanel.waitFor({ state: "hidden" });
      await visibleFocus(diagnostic, "diagnostics trigger after Return to game");
      await page.getByRole("button", { name: /继续调查/ }).click();
      await page.getByLabel("自由行动", { exact: true }).waitFor();
      await checkWidth();
      await screenshot("game");
      await page.getByRole("button", { name: "特殊行动", exact: true }).click();
      const panel = page.getByRole("complementary", { name: "特殊行动" });
      const panelBounds = await panel.boundingBox();
      assert.ok(panelBounds.height > 300 && panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= width + 1, "dossier fallback must stay on screen");
      await panel.getByRole("button", { name: "补给", exact: true }).click();
      await panel.getByRole("button", { name: "睡觉8小时 · 1回合", exact: true }).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game.turn === 1);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.slotId === "autosave").game.character.stats.health), 16);
      await page.getByRole("button", { name: "关闭资料，返回剧情", exact: true }).click();
      await page.getByRole("button", { name: "菜单", exact: true }).click();
      await page.getByRole("button", { name: /存档柜.*保存、读取与导出/ }).click();
      const dialog = page.getByRole("dialog", { name: "存档柜" });
      await dialog.getByRole("button", { name: "保存到此处", exact: true }).first().click();
      await dialog.getByText("已保存到存档位 1。", { exact: true }).waitFor();
      const saveId = await page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1")).find(slot => slot.manualSlot === 1).slotId);
      assert.match(saveId, /^slot-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 901);
      await screenshot("saves");
      // The tutorial belongs to this isolated installation, so discard only this test's saves.
      for (const [step, finish] of [["setup", "跳过教程"], ["privacy", "完成教程"]]) {
        await page.evaluate(step => {
          localStorage.removeItem("mist-chronicle-saves-v1");
          localStorage.setItem("mist-onboarding-v1", JSON.stringify({ step }));
        }, step);
        await page.reload();
        await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
        const guide = page.getByRole("region", { name: "新手教程", exact: true });
        await guide.waitFor();
        await tabTo(page, guide.getByRole("button", { name: finish, exact: true }));
        await page.keyboard.press("Enter");
        await guide.waitFor({ state: "hidden" });
        const start = page.getByRole("navigation", { name: "开始调查" }).getByRole("button", { name: /建立新档案/ });
        await page.waitForFunction(() => document.activeElement?.closest('[aria-label="开始调查"]'));
        await visibleFocus(start, `new archive after ${finish}`);
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("mist-onboarding-v1"))), { step: "complete" });
        await screenshot(step === "setup" ? "tutorial-skip-focus" : "tutorial-complete-focus");
        await checkWidth();
      }
      assert.deepEqual(errors, []);
      summary.push({ width, legacy, result: "PASS", saveId, apiTabStops, diagnosticTabStops, focusChecks: "API and diagnostics outlines, bidirectional Tab boundaries, Escape/return restoration, tutorial completion and skip" });
      console.log(`${width}px / ${legacy ? "missing APIs + legacy CSS" : "native"}: PASS`);
    } catch (error) {
      await screenshot("failure").catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await writeFile(resolve(output, "results.json"), JSON.stringify(summary, null, 2));
console.log("Six isolated browser checks passed. Capability removal is not an actual Chromium 80 or Android WebView test.");
