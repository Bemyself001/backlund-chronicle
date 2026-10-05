import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";
import { executeToolCalls } from "../src/engine/tools.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.QUICK_WAIT_TEST_URL || "http://127.0.0.1:5173/";
const output = resolve(".shots/quick-wait");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const errors = [];
const apiRequests = [];
const checks = [];

function fresh() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "钟表验收员" });
  game.turn = 3;
  game.worldTime = "1349年 12月31日 · 周日 · 18:20";
  game.storyHistory = game.recentDialogues = [{ id: "wait-scene", role: "assistant", turn: 3, content: "你站在熟悉的街角，考虑接下来的安排。" }];
  return game;
}

async function scenario(fixture, viewport, hasTouch = false) {
  const context = await browser.newContext({ viewport, hasTouch, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ fixture, settings }) => {
    if (!localStorage.getItem("mist-chronicle-saves-v1")) localStorage.setItem("mist-chronicle-saves-v1", JSON.stringify([{ slotId: "autosave", label: "自动存档", updatedAt: new Date().toISOString(), turn: fixture.turn, characterName: fixture.character.name, game: fixture }]));
    localStorage.setItem("mist-api-settings-v1", JSON.stringify(settings));
  }, { fixture, settings: { ...DEFAULT_API_SETTINGS, baseUrl: "https://wait-test.invalid/v1", apiKey: "", customHeaders: "" } });
  await page.route("**/*", route => {
    if (route.request().url().startsWith(new URL(url).origin)) return route.continue();
    if (route.request().url().includes("/chat/completions")) apiRequests.push(route.request().url());
    return route.fulfill({ status: 404, body: "test-isolated" });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const enter = async () => {
    await page.getByRole("button", { name: /签署档案并进入贝克兰德/ }).click();
    await page.getByRole("button", { name: /继续调查/ }).click();
    await button("特殊行动").click();
    await button("等待").click();
  };
  await page.goto(url);
  await enter();
  return {
    context, page, button, enter,
    region: page.getByRole("region", { name: "快速等待", exact: true }),
    slider: page.getByRole("slider", { name: "等待时长", exact: true }),
    saved: () => page.evaluate(() => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game),
    waitTurn: turn => page.waitForFunction(turn => JSON.parse(localStorage.getItem("mist-chronicle-saves-v1"))[0].game.turn === turn, turn),
  };
}

async function ringPoint(slider, angle) {
  const rect = await slider.boundingBox();
  const radians = angle * Math.PI / 180;
  return { x: rect.x + rect.width / 2 + Math.sin(radians) * rect.width * 114 / 320, y: rect.y + rect.height / 2 - Math.cos(radians) * rect.height * 114 / 320 };
}

let current;
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["tablet", { width: 768, height: 1024 }], ["mobile", { width: 375, height: 812 }]]) {
    current = await scenario(fresh(), viewport, name === "mobile");
    const { page, slider, region, button, saved, waitTurn } = current;
    const before = await saved();
    assert.equal(await slider.getAttribute("aria-valuenow"), "1");
    await button("6h").click();
    assert.equal(await slider.getAttribute("aria-valuenow"), "6");
    assert.match(await region.innerText(), /00:20/);
    assert.match(await region.innerText(), /1350年1月1日/);
    await button("增加1小时").click();
    await button("减少1小时").click();
    assert.equal(await slider.getAttribute("aria-valuenow"), "6");
    await slider.focus();
    await page.keyboard.press("End");
    assert.equal(await slider.getAttribute("aria-valuenow"), "24");
    await page.keyboard.press("Home");
    await page.keyboard.press("PageUp");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await slider.getAttribute("aria-valuenow"), "6");
    assert.ok(await slider.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth) >= 2));
    await page.keyboard.press("Tab");
    assert.equal(await button("减少1小时").evaluate(element => document.activeElement === element), true);
    await slider.scrollIntoViewIfNeeded();
    const start = await ringPoint(slider, 275 + 6 * 15);
    if (name === "mobile") await page.touchscreen.tap(start.x, start.y);
    else await page.mouse.click(start.x, start.y);
    assert.equal(await slider.getAttribute("aria-valuenow"), "6");
    if (name === "mobile") {
      const touch = await current.context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 0 }] });
      for (let hours = 6.25; hours <= 12; hours += .25) {
        const end = await ringPoint(slider, 275 + hours * 15);
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...end, id: 0 }] });
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const cancelPoint = await ringPoint(slider, 275 + 15 * 15);
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...cancelPoint, id: 0 }] });
      assert.equal(await slider.getAttribute("aria-valuenow"), "15");
      await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await touch.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (let hours = 7; hours <= 12; hours++) {
        const end = await ringPoint(slider, 275 + hours * 15);
        await page.mouse.move(end.x, end.y, { steps: 4 });
      }
      await page.mouse.up();
    }
    assert.equal(await slider.getAttribute("aria-valuenow"), "12");
    assert.equal((await saved()).turn, before.turn, "adjustments are only a draft");
    await button("委托").click();
    await button("等待").click();
    assert.equal(await slider.getAttribute("aria-valuenow"), "1");
    assert.equal((await saved()).turn, before.turn, "leaving the tab discards the draft");
    await button("24h").click();
    await slider.scrollIntoViewIfNeeded();
    const boundary = await ringPoint(slider, 275);
    await page.mouse.move(boundary.x, boundary.y);
    await page.mouse.down();
    const pastBoundary = await ringPoint(slider, 290);
    await page.mouse.move(pastBoundary.x, pastBoundary.y, { steps: 4 });
    await page.mouse.up();
    assert.equal(await slider.getAttribute("aria-valuenow"), "24", "dragging past a full circle stays at 24h");
    assert.equal(await button("增加1小时").isDisabled(), true);
    assert.deepEqual((await saved()).character.stats, before.character.stats);
    await slider.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const box = await region.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${name}: control stays within viewport`);
    await button("确认等待 24 小时").dblclick();
    await waitTurn(4);
    const result = await saved();
    assert.equal(result.worldTime, "1350年 1月1日 · 周一 · 18:20");
    assert.deepEqual(result.character.stats, before.character.stats);
    assert.deepEqual(result.money, before.money);
    assert.match(result.recentDialogues.at(-1).content, /等候了24小时/);
    assert.equal(await slider.getAttribute("aria-valuenow"), "1");
    assert.equal(await button("确认等待 1 小时").evaluate(element => document.activeElement === element), true);
    await page.reload();
    await current.enter();
    assert.equal((await saved()).turn, 4);
    assert.match(await region.innerText(), /1350年1月1日/);
    await button("确认等待 1 小时").click();
    await waitTurn(5);
    assert.equal((await saved()).worldTime, "1350年 1月1日 · 周一 · 19:20");
    checks.push(`${name}: presets, +/- buttons, keyboard/focus, ring selection, ${name === "mobile" ? "touch drag/cancel" : "mouse drag"}, full-circle limit, draft cancellation, 24h rollover, double-click, reload, no overflow`);
    await current.context.close();
    current = null;
  }
  const combat = executeToolCalls(fresh(), [{ name: "enemy.encounter", args: { enemies: [{ id: "wait-foe", name: "巷口对手", maxHealth: 80 }] }, reason: "等待限制验收" }]).game;
  current = await scenario(combat, { width: 375, height: 812 }, true);
  assert.equal(await current.slider.getAttribute("aria-disabled"), "true");
  assert.equal(await current.button("确认等待 1 小时").isDisabled(), true);
  assert.equal(await current.button("24h").isDisabled(), true);
  assert.match(await current.region.innerText(), /战斗中无法快速等待/);
  assert.equal((await current.saved()).turn, 3);
  checks.push("Active combat disables quick waiting; all waiting works with no API key or AI requests.");
  assert.deepEqual(apiRequests, []);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "report.json"), JSON.stringify({ checks, apiRequests, errors }, null, 2));
  console.log(JSON.stringify({ checks, apiRequests, errors }, null, 2));
} catch (error) {
  if (current) await current.page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
