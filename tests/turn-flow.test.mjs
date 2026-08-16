import assert from "node:assert/strict";
import test from "node:test";
import { buildRejectedToolNarrative } from "../src/engine/tools.js";
import { advanceWorldTime, dangerDeltaForTurn, minutesForTurn, occultEntryForTurn, resolveTurnProgress } from "../src/engine/turn.js";
import { extractNarrativePreview } from "../src/services/streamPreview.js";

test("stream preview exposes only the partial narrative from JSON", () => {
  assert.equal(extractNarrativePreview('{"narrative":"煤气灯在雨中'), "煤气灯在雨中");
  assert.equal(extractNarrativePreview('{"narrative":"第一行\\n第二行","choices":['), "第一行\n第二行");
  assert.equal(extractNarrativePreview('{"choices":['), "");
  assert.equal(extractNarrativePreview('```json\n{"response":"备用字段正在流入'), "备用字段正在流入");
  assert.equal(extractNarrativePreview("接口直接返回的普通文本"), "接口直接返回的普通文本");
});

test("rejected tool-only turns can finish locally without another model request", () => {
  const narrative = buildRejectedToolNarrative("用不存在的钥匙开门", [{ ok: false, reason: "找不到要使用的物品" }]);
  assert.match(narrative, /不存在的钥匙/);
  assert.match(narrative, /找不到要使用的物品/);
});

test("turn duration follows the action and successful movement", () => {
  assert.equal(minutesForTurn("向报童询问最近的消息"), 10);
  assert.equal(minutesForTurn("仔细调查候车室"), 25);
  assert.equal(minutesForTurn("睡到天亮"), 600);
  assert.equal(minutesForTurn("前往已知地点", [{ name: "location.move" }], [{ ok: true }]), 35);
  assert.equal(minutesForTurn("前往未知地点", [{ name: "location.move" }], [{ ok: false }]), 12);
});

test("world time advances across midnight with the weekday", () => {
  assert.equal(advanceWorldTime("1349年 10月17日 · 周二 · 23:50", 25), "1349年 10月18日 · 周三 · 00:15");
});

test("unselected high-risk choices no longer advance hidden danger", () => {
  assert.equal(dangerDeltaForTurn({ action: "询问售票员", selectedRisk: "low" }), 0);
  assert.equal(dangerDeltaForTurn({ action: "强行闯入封锁区域" }), 1);
  assert.equal(dangerDeltaForTurn({ action: "观察站台", selectedRisk: "low", toolCalls: [{ name: "status.add", args: { status: { kind: "danger" } } }], toolResults: [{ ok: true }] }), 1);
});

test("turn progress applies elapsed time and actual danger only", () => {
  const game = { worldTime: "1349年 10月17日 · 周二 · 18:20", hiddenDanger: { stage: 0, revealed: false } };
  const progress = resolveTurnProgress(game, "谨慎观察周围", "low");
  assert.equal(progress.elapsedMinutes, 25);
  assert.equal(progress.worldTime, "1349年 10月17日 · 周二 · 18:45");
  assert.equal(progress.hiddenDanger.stage, 0);
});

test("ordinary characters receive optional occult entry windows every five turns", () => {
  const game = { turn: 4, worldTime: "1349年 10月17日 · 周二 · 18:20", character: { extraordinary: "ordinary" }, occult: { contact: 0, entryAvailable: false } };
  assert.equal(occultEntryForTurn(game, 5)?.id, "occult-entry-5");
  assert.equal(occultEntryForTurn(game, 6), null);
  const next = resolveTurnProgress(game, "观察车站", "low");
  assert.equal(next.occult.contact, 0);
  assert.equal(next.occult.entryAvailable, true);
  assert.equal(next.occultEntry.turn, 5);
  assert.equal(occultEntryForTurn({ ...game, turn: 9 }, 10)?.id, "occult-entry-10");
  assert.equal(occultEntryForTurn({ ...game, occult: { contact: 1 } }, 5), null);
});
