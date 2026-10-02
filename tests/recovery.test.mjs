import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { executeSpecialAction, specialState } from "../src/engine/specialActions.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { settlePrayer } from "../src/engine/prayer.js";
import { moneyFromPence, moneyToPence } from "../src/system/money.js";
import { migrateSave } from "../src/services/storage.js";
import { medicinePurchaseGate } from "../src/engine/medicineAccess.js";
import { processTriggers, engageTrigger, abandonTrigger } from "../src/engine/triggerEngine.js";
import { visibleGameState } from "../src/services/memory.js";

function fresh() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "恢复测试" });
  game.money = moneyFromPence(100);
  return game;
}
function offeredTreatment() {
  const game = fresh();
  game.location.id = "bridge-docks";
  game.triggerState.facts["watch.formal-quest-unlocked"] = { value: true, firstTurn: 0, evidenceIds: ["test"] };
  processTriggers(game, { action: "抵达南岸货栈", turn: 1 });
  return game;
}
function startedTreatment() {
  const game = offeredTreatment();
  const task = game.triggerState.active.find(entry => entry.definitionId === "side.queens.renard-fall");
  assert.ok(task);
  assert.equal(engageTrigger(game, task.instanceId, 1, "回应求医消息").ok, true);
  return game;
}
const run = (game, operation, id) => executeSpecialAction(game, { operation, id, revision: specialState(game).revision });

test("waiting advances time without inn healing, while complete sleep heals once", () => {
  const game = fresh();
  game.location.id = "soot-lamp";
  game.character.stats.health = 2;
  game.character.stats.sanity = 2;
  const waiting = structuredClone(game);
  const waitProgress = resolveTurnProgress(waiting, "等待八小时", "low");
  assert.equal(waitProgress.elapsedMinutes, 480);
  assert.deepEqual(waitProgress.restRecovery, []);
  assert.equal(waiting.character.stats.health, 2);
  const sleepProgress = resolveTurnProgress(game, "睡眠八小时", "low");
  assert.equal(sleepProgress.timedAction.status, "completed");
  assert.equal(game.character.stats.health, 6);
  assert.equal(game.character.stats.sanity, 6);
});

test("inn sleep heals after ticks, caps recovery, and requires arrival", () => {
  const game = fresh();
  assert.throws(() => run(game, "sleep", "soot-lamp"));
  game.location.id = "soot-lamp";
  game.character.stats.health = 2;
  game.character.stats.sanity = 2;
  game.statusEffects = [{ id: "bleed", name: "流血", tick: { health: -1 } }];
  const result = run(game, "sleep", "soot-lamp");
  assert.equal(result.next.character.stats.health, 5);
  assert.equal(result.next.character.stats.sanity, 6);
  assert.equal(result.progress.elapsedMinutes, 480);
  assert.equal(result.next.turn, game.turn + 1);
  assert.equal(game.character.stats.health, 2);
  for (const [action, minutes, amount] of [["休息一小时", 60, 0], ["睡觉两小时", 120, 1], ["睡觉24小时", 1440, 4], ["不睡觉", 12, 0], ["询问旅店老板能否休息", 10, 0]]) {
    const copy = structuredClone(game);
    copy.statusEffects = [];
    const progress = resolveTurnProgress(copy, action, "low");
    assert.equal(progress.elapsedMinutes, minutes);
    assert.equal(copy.character.stats.health, 2 + amount, action);
  }
  game.location.id = "iron-gate";
  assert.deepEqual(resolveTurnProgress(game, "睡觉", "low").restRecovery, []);
});

test("prayer restores sanity and spirituality with caps and collapse removal", () => {
  const game = fresh();
  game.location.id = "st-samuel";
  game.character.stats.sanity = 0;
  game.character.stats.spirituality = game.character.stats.maxSpirituality - 1;
  game.statusEffects = [{ id: "collapse-sanity" }];
  const result = settlePrayer(game, game.location.id);
  assert.equal(result.sanityRecovered, 2);
  assert.equal(result.recovered, 1);
  assert.ok(!result.next.statusEffects.some(entry => entry.id === "collapse-sanity"));
});

test("recovery caps and failed purchases preserve resources; legacy medicines remain usable", () => {
  const game = fresh();
  game.location.id = "soot-lamp";
  game.character.stats.health -= 1;
  const slept = run(game, "sleep", "soot-lamp");
  assert.equal(slept.progress.restRecovery[0].delta, 1);
  assert.equal(slept.next.character.stats.health, game.character.stats.maxHealth);
  for (const patch of [{ money: moneyFromPence(0) }, { capacity: { maxWeight: 0.01 } }]) {
    const poor = { ...startedTreatment(), ...patch };
    const copy = structuredClone(poor);
    assert.throws(() => run(poor, "buy-medicine", "wound-salve"));
    assert.deepEqual(poor, copy);
  }
  game.inventory.push({ instanceId: "legacy-salve", itemId: "special-wound-salve", quantity: 2, tags: ["普通药剂"] });
  const used = run(game, "use", "legacy-salve").next;
  assert.equal(used.character.stats.health, game.character.stats.maxHealth);
  assert.equal(used.inventory.find(item => item.instanceId === "legacy-salve").quantity, 1);
  assert.throws(() => run(used, "use", "legacy-salve"), /已满/);
});

test("ordinary characters can buy all medicines and use saved stock in inventory without double consumption", () => {
  for (const [id, stat, amount, price] of [["wound-salve", "health", 2, 12], ["soothing-draught", "sanity", 1, 15], ["restorative-tonic", "spirituality", 1, 20]]) {
    const original = startedTreatment();
    const bought = run(original, "buy-medicine", id).next;
    assert.equal(moneyToPence(bought.money), 100 - price);
    const game = migrateSave(bought);
    const item = game.inventory.find(entry => entry.itemId === `special-${id}`);
    const call = { id: "use", name: "item.use", args: { instanceId: item.instanceId }, reason: "主动使用药剂" };
    assert.equal(executeToolCalls(game, [call]).results[0].ok, false);
    assert.equal(item.quantity, 1);
    game.character.stats[stat] = 0;
    const result = run(game, "use", item.instanceId);
    assert.equal(result.next.character.stats[stat], amount);
    assert.ok(!result.next.inventory.some(entry => entry.instanceId === item.instanceId));
    const used = executeToolCalls(game, [call]);
    assert.equal(used.results[0].ok, true);
    assert.equal(used.game.character.stats[stat], amount);
    assert.equal(executeToolCalls(used.game, [call]).results[0].ok, false);
  }
});

test("medicine purchases unlock on accepted treatment, persist after reload and never unlock from an unaccepted rumor", () => {
  for (const game of [fresh(), offeredTreatment()]) {
    const before = structuredClone(game);
    for (const id of ["wound-salve", "soothing-draught", "restorative-tonic"]) {
      assert.throws(() => run(game, "buy-medicine", id), /开始追查「高窗之下」/);
      assert.deepEqual(game, before);
    }
    assert.equal(visibleGameState(game).medicineSales.unlocked, false);
  }
  const declined = offeredTreatment();
  const offer = declined.triggerState.active.find(entry => entry.definitionId === "side.queens.renard-fall");
  assert.equal(abandonTrigger(declined, offer.instanceId, 2).ok, true);
  assert.match(medicinePurchaseGate(migrateSave(declined)), /开始追查/);
  const expired = offeredTreatment();
  processTriggers(expired, { action: "处理日常事务", turn: 30 });
  assert.match(medicinePurchaseGate(migrateSave(expired)), /开始追查/);

  const started = startedTreatment();
  assert.equal(medicinePurchaseGate(migrateSave(started)), "");
  assert.equal(visibleGameState(started).medicineSales.unlocked, true);
  const accepted = started.triggerState.active.find(entry => entry.definitionId === "side.queens.renard-fall");
  assert.equal(abandonTrigger(started, accepted.instanceId, 2).ok, true);
  assert.doesNotThrow(() => run(migrateSave(started), "buy-medicine", "wound-salve"));

  const legacy = fresh();
  legacy.triggerState.facts["side.renard.completed"] = { value: true };
  assert.doesNotThrow(() => run(migrateSave(legacy), "buy-medicine", "wound-salve"));
});

test("narrative inventory tools cannot purchase locked medicines with a different item ID", () => {
  for (const itemId of ["special-wound-salve", "shop-wound-salve"]) {
    const game = fresh();
    const result = executeToolCalls(game, [{ id: "purchase", name: "inventory.add", args: {
      item: { itemId, name: "外伤药膏", description: "从药师处购买的普通外伤药膏。", quantity: 1, weight: 0.1 },
    }, reason: "购买药师的外伤药膏" }], { playerAction: "购买外伤药膏" });
    assert.equal(result.results[0].ok, false);
    assert.match(result.results[0].reason, /开始追查/);
    assert.deepEqual(result.game.inventory, game.inventory);
    assert.deepEqual(result.game.money, game.money);
  }
});
