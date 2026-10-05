import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { quickWaitGate, quickWaitPreview } from "../src/engine/quickWait.js";
import { executeSpecialAction, specialState } from "../src/engine/specialActions.js";
import { processTriggers } from "../src/engine/triggerEngine.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { migrateSave } from "../src/services/storage.js";
import { buildPlanningContext } from "../src/services/memory.js";

function fresh() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "等候测试员" });
  game.worldTime = "1349年 10月17日 · 周二 · 18:20";
  return game;
}
const request = (game, hours) => ({ operation: "wait", hours, revision: specialState(game).revision, expectedTurn: game.turn, expectedWorldTime: game.worldTime });

test("quick wait previews and settles 1–24 hours with exact minutes and calendar rollover", () => {
  for (const [start, hours, expected, day] of [
    ["1349年 10月17日 · 周二 · 18:20", 1, "1349年 10月17日 · 周二 · 19:20", "今日"],
    ["1349年 10月17日 · 周二 · 18:20", 6, "1349年 10月18日 · 周三 · 00:20", "次日"],
    ["1349年 10月17日 · 周二 · 18:20", 24, "1349年 10月18日 · 周三 · 18:20", "次日"],
    ["1349年 10月31日 · 周二 · 23:20", 1, "1349年 11月1日 · 周三 · 00:20", "次日"],
    ["1349年 12月31日 · 周日 · 23:20", 24, "1350年 1月1日 · 周一 · 23:20", "次日"],
  ]) {
    const game = fresh();
    game.worldTime = start;
    const before = structuredClone(game);
    const preview = quickWaitPreview(game, hours);
    assert.equal(preview.worldTime, expected);
    assert.equal(preview.dayLabel, day);
    const { next, progress } = executeSpecialAction(game, request(game, hours));
    assert.equal(next.worldTime, expected);
    assert.equal(next.turn, game.turn + 1);
    assert.equal(next.world.turn, next.turn);
    assert.equal(progress.elapsedMinutes, hours * 60);
    assert.equal(progress.timedAction.kind, "wait");
    assert.equal(progress.timedAction.status, "completed");
    assert.deepEqual(next.money, game.money);
    assert.deepEqual(next.location, game.location);
    assert.deepEqual(game, before);
  }
});

test("invalid durations and unrecognizable time cannot advance or mutate the game", () => {
  const game = fresh();
  const before = structuredClone(game);
  for (const hours of [undefined, null, "2", 0, -1, 25, 1.5, NaN, Infinity]) {
    assert.equal(quickWaitPreview(game, hours), null);
    assert.throws(() => executeSpecialAction(game, request(game, hours)), /1至24小时/);
  }
  assert.deepEqual(game, before);
  game.worldTime = "未知时间";
  assert.equal(quickWaitPreview(game, 1), null);
  assert.throws(() => executeSpecialAction(game, request(game, 1)), /时间无法识别/);
});

test("old confirmations cannot replay after a special action, normal turn or clock change", () => {
  const game = fresh();
  const old = request(game, 3);
  const settled = resolveSpecialAction(game, old);
  assert.throws(() => resolveSpecialAction(settled, old), /行动状态已更新/);
  assert.throws(() => resolveSpecialAction({ ...game, turn: game.turn + 1 }, old), /时间或回合已更新/);
  assert.throws(() => resolveSpecialAction({ ...game, worldTime: "1349年 10月17日 · 周二 · 19:20" }, old), /时间或回合已更新/);
  assert.throws(() => resolveSpecialAction(game, { ...old, expectedTurn: undefined }), /时间或回合已更新/);
});

test("combat, collapsed stats and an already spent main action block waiting in the engine", () => {
  const game = fresh();
  game.combat = { enemies: [{ id: "foe", status: "active", health: 1, stunnedThroughTurn: 99 }] };
  assert.match(quickWaitGate(game, 24), /战斗中/);
  assert.throws(() => executeSpecialAction(game, request(game, 24)), /战斗中/);
  for (const status of ["withdrawn", "defeated"]) {
    game.combat.enemies[0].status = status;
    assert.equal(quickWaitGate(game, 1), "");
  }
  for (const stat of ["health", "sanity"]) {
    const invalid = fresh();
    invalid.character.stats[stat] = 0;
    assert.throws(() => executeSpecialAction(invalid, request(invalid, 1)), /归零/);
  }
  game.character.mainActionLastUsedTurn = game.turn + 1;
  assert.throws(() => executeSpecialAction(game, request(game, 1)), /主要行动/);
});

test("24 hours costs one turn, ticks existing effects once and grants no inn sleep recovery", () => {
  const game = fresh();
  game.location = { ...game.location, id: "soot-lamp", name: "雾鸦旅店" };
  game.character.stats = { ...game.character.stats, health: 80, maxHealth: 100, sanity: 8, maxSanity: 10 };
  game.character.combatBoost = { expiresTurn: game.turn + 1 };
  game.specialActions.availableTurn = game.turn + 3;
  game.statusEffects = [{ id: "injury", name: "旧伤", healthEffect: { percent: -5, remainingTurns: 3, startsTurn: game.turn + 1, lastTickTurn: game.turn } }];
  const { next, progress } = executeSpecialAction(game, request(game, 24));
  assert.equal(next.character.stats.health, 75);
  assert.equal(next.character.stats.sanity, 8);
  assert.equal(next.statusEffects[0].healthEffect.remainingTurns, 2);
  assert.equal(next.statusEffects[0].healthEffect.lastTickTurn, next.turn);
  assert.equal(next.character.combatBoost, undefined);
  assert.equal(next.specialActions.availableTurn - next.turn, 2);
  assert.equal(progress.statusTicks.length, 1);
  assert.deepEqual(progress.restRecovery, []);
  const uninjured = fresh();
  uninjured.location.id = "soot-lamp";
  uninjured.character.stats.health = 1;
  const waited = executeSpecialAction(uninjured, request(uninjured, 24)).next;
  assert.equal(waited.character.stats.health, 1);
});

test("quick wait settles pending trigger expiry at the next turn", () => {
  const game = fresh();
  processTriggers(game, { action: "调查车站公告上的异常符号", turn: 1 });
  const entry = game.triggerState.active.find(item => item.category === "occult-entry" && item.status === "available");
  assert.ok(entry);
  game.turn = entry.expiresTurn - 1;
  const { next, progress } = executeSpecialAction(game, request(game, 24));
  assert.equal(next.triggerState.active.some(item => item.instanceId === entry.instanceId), false);
  assert.equal(next.triggerState.history.find(item => item.instanceId === entry.instanceId)?.status, "expired");
  assert.ok(progress.triggerEvents.expired.some(item => item.instanceId === entry.instanceId));
});

test("wait history, authoritative time, audit and future AI context survive a save reload", () => {
  const game = fresh();
  const waited = resolveSpecialAction(game, request(game, 12));
  assert.equal(waited.recentDialogues.at(-1).source, "fixed");
  assert.match(waited.recentDialogues.at(-1).content, /等候了12小时/);
  assert.ok(waited.recentDialogues.at(-1).content.includes(waited.worldTime));
  assert.equal(waited.memoryState.pending.at(-1).turn, waited.turn);
  assert.equal(waited.lastTurnAudit.turn, waited.turn);
  const loaded = migrateSave(JSON.parse(JSON.stringify(waited)));
  assert.equal(loaded.worldTime, waited.worldTime);
  assert.equal(loaded.turn, waited.turn);
  const context = JSON.stringify(buildPlanningContext(loaded, "观察街道", ""));
  assert.ok(context.includes(loaded.worldTime));
  assert.match(context, /原地等待12小时/);
  const again = resolveSpecialAction(loaded, request(loaded, 1));
  assert.equal(again.worldTime, "1349年 10月18日 · 周三 · 07:20");
  assert.equal(again.turn, game.turn + 2);
});
