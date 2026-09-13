import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeReadingPreferences, shouldSubmitAction, getAuditRows, RISK_LABELS } from "../src/components/gameUi.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { createAuditBaseline, auditTurnChanges } from "../src/engine/audit.js";
import { moneyFromPence } from "../src/system/money.js";
import { RELEASE_NAME, RELEASE_VERSION } from "../src/data/release.js";
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
  assert.ok(rows.some(row => row.tone === "loss" && row.text === "生命 10 → 8（-2）"));
  assert.ok(rows.some(row => row.text === "资金 −£0 · 1苏勒 · 0便士"));
  assert.ok(rows.some(row => row.text === `获得「${game.inventory[0].name}」×1`));
  assert.equal(rows.length, 3);
});

test("release 1.3.6 updates product metadata without migrating the save format", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(RELEASE_NAME, "1.3.6");
  assert.equal(RELEASE_VERSION, "1.3.6");
  assert.equal(pkg.version, RELEASE_VERSION);
  assert.equal(GAME_SYSTEM_VERSION, 1);
  assert.equal(SAVE_VERSION, 11);
  assert.ok(LATEST_UPDATE.title.startsWith("1.3.6"));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title.startsWith("1.3.5 ·")));
  assert.ok(PREVIOUS_UPDATES.some(update => update.title === "四座教堂列入城区图"));
});
