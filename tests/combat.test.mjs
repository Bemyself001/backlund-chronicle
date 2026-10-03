import test from "node:test";
import assert from "node:assert/strict";
import { activeEnemies, isEnemyStunned, MAX_ENEMY_HEALTH, normalizeCombatState } from "../src/system/combat.js";
import { executeCombatTool } from "../src/engine/combat.js";

const fresh = () => ({ turn: 0, character: { stats: { health: 10, maxHealth: 10 } }, statusEffects: [], combat: { enemies: [] } });
const enemy = (id = "foe-a", extra = {}) => ({ id, name: `敌人${id}`, maxHealth: 20, ...extra });
const encounter = (game, enemies = [enemy()]) => executeCombatTool(game, "enemy.encounter", { enemies });

test("combat import rejects malformed entries, bounds HP, preserves zero and defeated states", () => {
  const normalized = normalizeCombatState({ enemies: [
    null, {}, enemy("nan", { maxHealth: NaN }), enemy("infinite", { health: Infinity }), enemy("string", { health: "8" }),
    enemy("zero", { health: 0 }), enemy("dead", { status: "defeated", health: 20 }),
    enemy("large", { maxHealth: MAX_ENEMY_HEALTH * 2, health: MAX_ENEMY_HEALTH * 3 }),
    enemy("fraction", { maxHealth: 12.8, health: 5.9 }), enemy("duplicate"), enemy("duplicate", { health: 0 }),
  ] });
  assert.equal(normalized.enemies.length, 5);
  assert.deepEqual(normalized.enemies.map((entry) => entry.health), [0, 0, MAX_ENEMY_HEALTH, 5, 0]);
  assert.equal(normalized.enemies[3].maxHealth, 12);
  assert.equal(normalized.enemies[4].status, "defeated");
  assert.equal(normalized.enemies[4].lastUpdatedTurn, 0);
  assert.deepEqual(normalizeCombatState(normalized), normalized);
  assert.deepEqual(normalizeCombatState(null), { enemies: [] });
  assert.deepEqual(normalizeCombatState(JSON.parse(JSON.stringify(normalized))), normalized);
});

test("encounter validates the entire batch atomically and retains foes absent from later calls", () => {
  const game = fresh();
  assert.equal(encounter(game, [enemy("a"), enemy("b", { maxHealth: 50 })]).ok, true);
  const original = structuredClone(game);
  assert.equal(encounter(game, [enemy("c"), enemy("bad", { health: -1 })]).ok, false);
  assert.deepEqual(game, original);
  assert.equal(encounter(game, [enemy("c"), enemy("c")]).ok, false);
  assert.deepEqual(game, original);
  assert.equal(encounter(game, [enemy("c")]).ok, true);
  assert.equal(activeEnemies(game).length, 3);
});

test("damage clamps to zero and repeated encounters cannot reset HP, maximum HP, or revive defeated enemies", () => {
  const game = fresh();
  encounter(game);
  const damaged = executeCombatTool(game, "enemy.damage", { enemyId: "foe-a", amount: 8 });
  assert.equal(damaged.data.enemyChanges[0].delta, -8);
  encounter(game, [enemy("foe-a", { maxHealth: 999, health: 999 })]);
  assert.equal(game.combat.enemies[0].health, 12);
  assert.equal(game.combat.enemies[0].maxHealth, 20);
  executeCombatTool(game, "enemy.damage", { enemyId: "foe-a", amount: 100 });
  assert.equal(game.combat.enemies[0].health, 0);
  assert.equal(game.combat.enemies[0].status, "defeated");
  encounter(game);
  assert.equal(game.combat.enemies[0].health, 0);
  assert.equal(activeEnemies(game).length, 0);
  const original = structuredClone(game);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe-a", damage: 3, action: "攻击" }).ok, false);
  assert.deepEqual(game, original);
});

test("withdrawn foes cannot act or take damage and reencounter preserves their injuries and action turn", () => {
  const game = fresh();
  encounter(game);
  executeCombatTool(game, "enemy.damage", { enemyId: "foe-a", amount: 7 });
  executeCombatTool(game, "enemy.act", { enemyId: "foe-a", damage: 0, action: "戒备" });
  assert.equal(executeCombatTool(game, "enemy.leave", { enemyId: "foe-a" }).ok, true);
  assert.equal(activeEnemies(game).length, 0);
  for (const [name, args] of [["enemy.damage", { amount: 1 }], ["enemy.act", { damage: 1, action: "攻击" }]]) {
    assert.equal(executeCombatTool(game, name, { enemyId: "foe-a", ...args }).ok, false);
  }
  encounter(game);
  assert.equal(game.combat.enemies[0].health, 13);
  assert.equal(game.combat.enemies[0].status, "active");
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe-a", damage: 1, action: "攻击" }).ok, false);
});

test("each enemy acts at most once per turn, zero-damage actions count, and stun blocks only through its expiry", () => {
  const game = fresh();
  encounter(game, [enemy("a"), enemy("b")]);
  game.combat.enemies[0].stunnedThroughTurn = 1;
  assert.equal(isEnemyStunned(game.combat.enemies[0], 1), true);
  const original = structuredClone(game);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "a", damage: 2, action: "攻击" }).ok, false);
  assert.deepEqual(game, original);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "b", damage: 0, action: "绕行" }).ok, true);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "b", damage: 2, action: "攻击" }).ok, false);
  game.turn = 1;
  assert.equal(isEnemyStunned(game.combat.enemies[0], 2), false);
  const result = executeCombatTool(game, "enemy.act", { enemyId: "a", damage: 15, action: "重击" });
  assert.equal(result.ok, true);
  assert.equal(result.data.enemyAction.damage, 10);
  assert.equal(result.data.statChanges[0].delta, -10);
  assert.equal(game.combat.enemies[0].lastUpdatedTurn, 2);
  const reloaded = normalizeCombatState(JSON.parse(JSON.stringify(game.combat)));
  assert.equal(reloaded.enemies[0].lastActedTurn, 2);
  assert.equal(reloaded.enemies[0].stunnedThroughTurn, 1);
  assert.equal(reloaded.enemies[0].lastUpdatedTurn, 2);
  assert.equal(game.character.stats.health, 0);
  assert.ok(game.statusEffects.some((status) => status.id === "collapse-health"));
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "a", damage: 0, action: "等待" }, { turn: 1 }).ok, false);
});

test("numeric tool arguments reject coercion, nonfinite values, fractional values, negatives, and overflow without mutation", () => {
  const bad = [null, "3", true, NaN, Infinity, -1, 0.5, MAX_ENEMY_HEALTH + 1];
  for (const value of bad) {
    const game = fresh();
    encounter(game);
    const original = structuredClone(game);
    for (const [name, args] of [
      ["enemy.encounter", { enemies: [enemy("new", { maxHealth: value })] }],
      ["enemy.encounter", { enemies: [enemy("new", { health: value })] }],
      ["enemy.damage", { enemyId: "foe-a", amount: value }],
      ["enemy.act", { enemyId: "foe-a", damage: value, action: "攻击" }],
    ]) {
      assert.equal(executeCombatTool(game, name, args).ok, false, `${name}: ${value}`);
      assert.deepEqual(game, original);
    }
  }
  const game = fresh();
  assert.equal(encounter(game, [enemy("zero", { health: 0 })]).ok, true);
  assert.equal(game.combat.enemies[0].status, "defeated");
  assert.equal(encounter(game, [enemy("bad", { maxHealth: 0 })]).ok, false);
});

test("invalid requests and missing targets never initialize or mutate game state", () => {
  const game = fresh();
  delete game.combat;
  const original = structuredClone(game);
  for (const [name, args] of [
    ["enemy.encounter", null], ["enemy.encounter", { enemies: [] }],
    ["enemy.damage", { enemyId: "unknown", amount: 1 }],
    ["enemy.act", { enemyId: "unknown", damage: 0, action: "等待" }],
    ["enemy.leave", { enemyId: "unknown" }], ["enemy.unknown", {}],
  ]) {
    assert.equal(executeCombatTool(game, name, args).ok, false);
    assert.deepEqual(game, original);
  }
});
