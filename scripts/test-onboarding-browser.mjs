import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.ONBOARDING_TEST_URL || "http://localhost:5173/";
const origin = new URL(url).origin;
const output = resolve(".shots/onboarding");
const key = "mist-onboarding-v1";
const steps = [["import", "导入存档"], ["api", "API 设置"], ["changelog", "更新日志"], ["diagnostics", "启动诊断"], ["privacy", "隐私政策"]];
const summary = [];
const setupOnly = process.argv.includes("--setup-only");
const tourOnly = setupOnly || process.argv.includes("--tour-only");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });

async function setup(viewport, { legacy = false, fixture = null } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.addInitScript(({ legacy, fixture }) => {
    if (fixture && !localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "自动存档", updatedAt: new Date().toISOString(), turn: fixture.turn, characterName: fixture.character.name, game: fixture }]));
    if (legacy) {
      window.structuredClone = undefined;
      Array.prototype.at = undefined;
      Array.prototype.findLast = undefined;
      Object.hasOwn = undefined;
      String.prototype.replaceAll = undefined;
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    }
  }, { legacy, fixture });
  // Every remote request is intercepted; even the character-creation AI is a local fixture.
  await page.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin === origin) return route.continue();
    externalRequests.push(request.url());
    if (request.url().includes("/chat/completions")) {
      const body = request.postDataJSON();
      const isLoadout = body.messages.some(message => message.content.includes("开局行装整理"));
      if (!isLoadout) return route.fulfill({ status: 400, body: "Unexpected AI request in onboarding test" });
      const content = JSON.stringify({ clothes: [{ name: "白衬衫", description: "普通的白色棉布衬衫。", slot: "上装", weight: 0.4 }], carriedItem: null });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }) });
    }
    return route.fulfill({ status: 404, body: "isolated browser test" });
  });
  const enterWelcome = async (reload = false) => {
    if (reload) await page.reload();
    else await page.goto(url);
    if (legacy) await page.evaluate(() => document.documentElement.classList.add("no-flex-gap"));
    await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    await page.getByRole("navigation", { name: "辅助操作" }).waitFor();
  };
  return { context, page, errors, externalRequests, enterWelcome };
}

async function progress(page, expected) {
  await page.waitForFunction(({ key, expected }) => {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return saved?.step === expected;
  }, { key, expected });
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.deepEqual(saved, { step: expected }, "onboarding storage must contain only its step, never settings, keys, or character data");
}

async function noOverflow(page, label) {
  const measurements = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(measurements.document <= measurements.width + 1 && measurements.body <= measurements.width + 1, `${label}: horizontal overflow ${JSON.stringify(measurements)}`);
}

async function keyboardActivate(page, locator) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate(element => document.activeElement === element)) {
      await page.keyboard.press("Enter");
      return;
    }
  }
  throw new Error(`Keyboard Tab could not reach ${await locator.innerText()}`);
}

async function setupGeometry(page, prefix) {
  await page.waitForFunction(() => document.activeElement?.matches('[aria-label="新手教程"] h2'));
  const measurements = await page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height,
        whollyInViewport: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth };
    };
    const skip = document.querySelector(".skip-link");
    const style = getComputedStyle(skip);
    return {
      viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
      activeElement: { tag: document.activeElement.tagName, text: document.activeElement.textContent, className: document.activeElement.className },
      skipLink: { rect: rect(skip), top: style.top, inset: style.inset, transform: style.transform, position: style.position, focused: document.activeElement === skip },
      guide: rect(document.querySelector('[aria-label="新手教程"]')),
      target: rect(document.querySelector('[data-onboarding-target="api"]')),
    };
  });
  await writeFile(resolve(output, `${prefix}-setup-geometry.json`), JSON.stringify(measurements, null, 2));
  await page.screenshot({ path: resolve(output, `${prefix}-setup-viewport.png`), fullPage: false });
  return measurements;
}

async function tourStep(page, id, title) {
  const guide = page.getByRole("region", { name: "新手教程", exact: true });
  await guide.getByRole("heading", { name: title, exact: true }).waitFor();
  const target = page.getByRole("navigation", { name: "辅助操作" }).locator(`[data-onboarding-target="${id}"]`);
  assert.equal(await target.count(), 1);
  assert.equal(await target.getAttribute("aria-describedby"), "onboarding-description");
  assert.ok(await target.isVisible());
  assert.equal(await page.locator("#onboarding-description").count(), 1);
  assert.equal(await page.locator('[aria-describedby="onboarding-description"]').count(), 1);
  await progress(page, id);
  await noOverflow(page, `tour-${id}`);
  return guide;
}

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 768, height: 1024 }]) {
    const legacy = viewport.width === 375;
    const session = await setup(viewport, { legacy });
    const { page, context, errors, externalRequests, enterWelcome } = session;
    const prefix = `${viewport.width}x${viewport.height}`;
    const guide = page.getByRole("region", { name: "新手教程", exact: true });
    try {
      await enterWelcome();
      await guide.getByRole("heading", { name: "先连接你的 AI 叙事伙伴", exact: true }).waitFor();
      await progress(page, "setup");
      assert.doesNotMatch(await guide.innerText(), /https?:\/\/|www\./i);
      assert.equal(await guide.locator("li").count(), 3, "the first card must explain API setup in three steps");
      await page.getByRole("navigation", { name: "辅助操作" }).getByRole("button", { name: /API 设置/ }).waitFor({ state: "visible" });
      await noOverflow(page, `${prefix}-setup`);
      if (legacy) {
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains("no-flex-gap")), true);
        assert.equal(await page.evaluate(() => JSON.parse(window.__startupDiagnostics.report()).capabilitiesBeforePolyfills.structuredClone), false);
      }
      await page.screenshot({ path: resolve(output, `${prefix}-setup.png`), fullPage: true });
      const geometry = await setupGeometry(page, prefix);
      assert.equal(geometry.skipLink.focused, false);
      assert.ok(geometry.skipLink.rect.bottom <= 0, "the unfocused skip link must stay outside the real viewport");
      assert.equal(geometry.guide.whollyInViewport, true, "the setup guide must fit in the real viewport");
      assert.equal(geometry.target.whollyInViewport, true, "the highlighted API target must fit in the real viewport");
      if (setupOnly) {
        summary.push({ viewport, legacy, scenario: "setup-geometry", result: "PASS", geometry });
        console.log(`${prefix}: actual viewport focus, guide and target geometry passed.`);
        continue;
      }
      await keyboardActivate(page, guide.getByRole("button", { name: "前往 API 设置", exact: true }));
      const dialog = page.getByRole("dialog", { name: "AI 接口设置", exact: true });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: /DeepSeek/ }).click();
      assert.ok(await dialog.getByLabel("当前模型", { exact: true }).inputValue());
      await dialog.getByLabel(/^API Key/).fill("");
      await dialog.getByRole("button", { name: "下一步 · 保存并返回首页", exact: true }).click();
      assert.ok(await dialog.getByRole("alert").isVisible());
      await progress(page, "setup");
      assert.ok(await dialog.isVisible());
      await noOverflow(page, `${prefix}-api-error`);
      await dialog.getByLabel(/^API Key/).fill("mock-onboarding-key");
      await page.screenshot({ path: resolve(output, `${prefix}-api-settings.png`), fullPage: true });
      if (legacy) await page.screenshot({ path: resolve(output, `${prefix}-api-settings-viewport.png`), fullPage: false });
      await dialog.getByRole("button", { name: "下一步 · 保存并返回首页", exact: true }).click();
      await tourStep(page, "import", "导入存档");
      assert.equal(externalRequests.filter(value => /chat\/completions|\/models/.test(value)).length, 0, "configuration must not send credentials or test requests");

      for (let index = 0; index < steps.length; index += 1) {
        const [id, title] = steps[index];
        await tourStep(page, id, title);
        if (index > 0) assert.ok(await guide.getByRole("button", { name: "上一步", exact: true }).isVisible());
        if (id === "api") {
          await guide.getByRole("button", { name: "上一步", exact: true }).click();
          await tourStep(page, "import", "导入存档");
          await guide.getByRole("button", { name: "下一步", exact: true }).click();
          await tourStep(page, id, title);
          await enterWelcome(true);
          await tourStep(page, id, title);
          await page.getByRole("button", { name: /建立新档案/ }).click();
          await page.getByRole("button", { name: "← 返回", exact: true }).click();
          await tourStep(page, id, title);
        }
        if (id === "diagnostics") {
          await keyboardActivate(page, page.locator('[data-onboarding-target="diagnostics"]'));
          await page.locator("#startup-panel").waitFor({ state: "visible" });
          assert.match(await page.locator("#startup-title").innerText(), /启动诊断/);
          assert.doesNotMatch(await page.locator("#startup-message").innerText(), /自动热更新已暂停|暂停热更新/);
          await noOverflow(page, `${prefix}-diagnostics`);
          await page.screenshot({ path: resolve(output, `${prefix}-diagnostics-panel.png`), fullPage: true });
          if (legacy) await page.screenshot({ path: resolve(output, `${prefix}-diagnostics-panel-viewport.png`), fullPage: false });
          await page.locator("#startup-close").click();
          await page.locator("#startup-panel").waitFor({ state: "hidden" });
          await tourStep(page, id, title);
        }
        await page.screenshot({ path: resolve(output, `${prefix}-${id}.png`), fullPage: true });
        await guide.getByRole("button", { name: index === steps.length - 1 ? "完成教程" : "下一步", exact: true }).click();
      }
      await progress(page, "complete");
      assert.equal(await guide.count(), 0);
      await enterWelcome(true);
      assert.equal(await guide.count(), 0);
      await progress(page, "complete");
      assert.deepEqual(errors, []);
      summary.push({ viewport, legacy, scenario: "full-tour", result: "PASS" });
      console.log(`${prefix}${legacy ? " missing APIs + no-flex-gap" : ""}: API validation, all steps, back, reload, navigation, diagnostics, keyboard and overflow passed.`);
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${prefix}-failure.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }

  for (const scenario of tourOnly ? [] : ["skip-and-create", "existing-save"]) {
    const fixture = scenario === "existing-save" ? createInitialGame({ ...EMPTY_CHARACTER, name: "已有档案验收员" }) : null;
    const { context, page, errors, enterWelcome } = await setup({ width: 1440, height: 900 }, { fixture });
    const guide = page.getByRole("region", { name: "新手教程", exact: true });
    try {
      await enterWelcome();
      if (scenario === "skip-and-create") await guide.getByRole("button", { name: "跳过教程", exact: true }).click();
      await progress(page, "complete");
      assert.equal(await guide.count(), 0);
      await enterWelcome(true);
      assert.equal(await guide.count(), 0);
      if (scenario === "skip-and-create") {
        await page.getByRole("navigation", { name: "辅助操作" }).getByRole("button", { name: "API 设置", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "AI 接口设置", exact: true });
        await dialog.getByRole("button", { name: /DeepSeek/ }).click();
        await dialog.getByLabel(/^API Key/).fill("mock-onboarding-key");
        await dialog.getByRole("button", { name: "保存全部设置", exact: true }).click();
        await page.getByRole("button", { name: /建立新档案/ }).click();
        await page.getByLabel(/^姓名/).fill("教程后新角色");
        await page.getByLabel(/^个人背景/).fill("在贝克兰德寻找一份普通工作。");
        await page.getByLabel(/^衣着描述/).fill("白衬衫");
        await page.getByRole("button", { name: "整理开局行装", exact: true }).click();
        await page.getByRole("button", { name: "确认行装并进入贝克兰德", exact: true }).click();
        await page.getByRole("button", { name: "菜单", exact: true }).click();
        await page.getByRole("button", { name: /返回档案首页/ }).click();
        assert.equal(await guide.count(), 0);
        await progress(page, "complete");
      } else {
        assert.ok(await page.getByRole("button", { name: /继续调查/ }).isVisible());
      }
      assert.deepEqual(errors, []);
      summary.push({ scenario, result: "PASS" });
      console.log(`${scenario}: permanent completion and return-to-home passed.`);
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${scenario}-failure.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(resolve(output, setupOnly ? "setup-result.json" : tourOnly ? "tour-result.json" : "result.json"), JSON.stringify(summary, null, 2));
  console.log("All onboarding browser scenarios passed. Missing-API checks simulate compatibility gaps, not a complete older Chromium engine.");
} finally { await browser.close(); }
