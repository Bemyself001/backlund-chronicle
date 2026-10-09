import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeReadingPreferences, shouldSubmitAction, getAuditRows, RISK_LABELS, worldTimeDisplay } from "../src/components/gameUi.js";
import { advanceWorldTime } from "../src/engine/worldTime.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { createAuditBaseline, auditTurnChanges } from "../src/engine/audit.js";
import { moneyFromPence } from "../src/system/money.js";
import { NATIVE_RELEASE_VERSION, RELEASE_NAME, RELEASE_VERSION } from "../src/data/release.js";
import { GAME_SYSTEM_VERSION, SAVE_VERSION } from "../src/system/version.js";
import { LATEST_UPDATE, PREVIOUS_UPDATES } from "../src/data/changelog.js";

test("reading preferences clamp font size and retain only the presentation whitelist", () => {
  assert.deepEqual(normalizeReadingPreferences(null), { theme: "paper", fontSize: 18 });
  assert.deepEqual(normalizeReadingPreferences({ theme: "night", fontSize: 99, apiKey: "must-not-persist" }), { theme: "night", fontSize: 22 });
  assert.deepEqual(normalizeReadingPreferences({ theme: "invalid", fontSize: -1 }), { theme: "paper", fontSize: 16 });
  assert.equal(normalizeReadingPreferences({ fontSize: "broken" }).fontSize, 18);
});

test("Enter submits while Chinese IME confirmation and Shift+Enter do not", () => {
  assert.equal(shouldSubmitAction({ key: "Enter" }), true);
  for (const event of [
    { key: "Enter", shiftKey: true }, { key: "Enter", isComposing: true },
    { key: "Enter", nativeEvent: { isComposing: true } }, { key: "Enter", keyCode: 229 },
    { key: "a" },
  ]) assert.equal(shouldSubmitAction(event), false);
});

test("risk labels describe risk, not an invented action type", () => {
  assert.deepEqual(RISK_LABELS, { low: "低风险", medium: "中风险", high: "高风险", unknown: "风险未标注" });
});

test("world clock follows the game calendar across midnight without changing stored time", () => {
  const original = "1349年 10月17日 · 周二 · 23:40";
  const start = worldTimeDisplay(original);
  assert.equal(start.label, original);
  assert.equal(start.weekday, "星期二");
  assert.equal(start.period, "深夜");
  const arrival = worldTimeDisplay(advanceWorldTime(original, 20));
  assert.equal(arrival.dateTime, "1349-10-18T00:00:00.000Z");
  assert.equal(arrival.monthDay, "10月18日");
  assert.equal(arrival.weekday, "星期三");
  assert.equal(`${arrival.hour}:${arrival.minute}`, "00:00");
  assert.equal(arrival.period, "凌晨");
});

test("clock presentation accepts legacy punctuation and falls back for unrecognized dates", () => {
  assert.equal(worldTimeDisplay("1349年 10月17日 · 星期二 · 6：05").hour, "06");
  for (const value of [null, "旧存档中的未知时刻", "1349年 13月17日 · 周二 · 18:20", "1349年 10月17日 · 周二 · 24:00"]) {
    assert.equal(worldTimeDisplay(value), null);
  }
});

test("UI summaries use actual confirmed audit deltas and ignore narrative claims", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "UI测试员", startingMoneyPence: 240 });
  const baseline = createAuditBaseline(game, 1);
  assert.deepEqual(getAuditRows(null), []);
  assert.deepEqual(getAuditRows(auditTurnChanges(baseline, game)), []);
  game.character.stats.health -= 2;
  game.money = moneyFromPence(228);
  game.inventory[0].quantity += 1;
  const audit = auditTurnChanges(baseline, game);
  audit.narrative = "你获得了一百万镑。";
  const rows = getAuditRows(audit);
  assert.ok(rows.some(row => row.tone === "loss" && row.text === "生命 20 → 18（-2）"));
  assert.ok(rows.some(row => row.text === "资金 −£0 · 1苏勒 · 0便士"));
  assert.ok(rows.some(row => row.text === `获得「${game.inventory[0].name}」×1`));
  assert.equal(rows.length, 3);
});

test("release metadata remains aligned across UI, package, changelog and APK workflow", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(RELEASE_NAME, RELEASE_VERSION);
  assert.match(RELEASE_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, RELEASE_VERSION);
  assert.equal(GAME_SYSTEM_VERSION, 2);
  assert.equal(SAVE_VERSION, 14);
  const publishedUpdate = [LATEST_UPDATE, ...PREVIOUS_UPDATES].find(update => !update.pending && update.channel !== "native");
  if (LATEST_UPDATE.pending && LATEST_UPDATE.channel === "web") {
    assert.equal(LATEST_UPDATE.version, RELEASE_VERSION);
    assert.ok(LATEST_UPDATE.title.includes(`${RELEASE_VERSION} Web APK`));
    assert.ok(publishedUpdate, "待发布的Web版本仍保留上一版公开更新记录");
  } else {
    assert.ok(publishedUpdate.title.startsWith(`${RELEASE_VERSION} ·`));
  }
  if (LATEST_UPDATE.pending) assert.match(LATEST_UPDATE.title, /^开发中 ·/);
  if (LATEST_UPDATE.channel === "native") {
    assert.ok(LATEST_UPDATE.title.startsWith(`${NATIVE_RELEASE_VERSION} ·`));
    assert.match(NATIVE_RELEASE_VERSION, /^\d+\.\d+\.\d+-native\.\d+$/);
  }
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.9 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.7 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.6 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.5 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.4 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.3 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.2 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.4.0 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.3.6 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title === "四座教堂列入城区图"));
  const workflow = readFileSync(new URL("../.github/workflows/build-android-apk.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes(`PRODUCT_VERSION: "${RELEASE_VERSION}"`), "workflow PRODUCT_VERSION 必须与 release.js 的 RELEASE_VERSION 一致");
});
