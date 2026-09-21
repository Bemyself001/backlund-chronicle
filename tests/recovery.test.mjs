import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { executeSpecialAction, specialState } from "../src/engine/specialActions.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { settlePrayer } from "../src/engine/prayer.js";
import { moneyFromPence, moneyToPence } from "../src/system/money.js";
import { migrateSave } from "../src/services/storage.js";

function fresh() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "恢复测试" });
  game.money = moneyFromPence(100);
  return game;
}
const run = (game, operation, id) => executeSpecialAction(game, { operation, id, revision: specialState(game).revision });

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
    const poor = { ...game, ...patch };
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
    const original = fresh();
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
