import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_SYSTEM_PROMPT } from "../src/system/game.js";
import { PATHWAYS, getUnlockedAbilities } from "../src/content/index.js";
import { executeCombatTool } from "../src/engine/combat.js";
import { resolveAbilityUse } from "../src/engine/abilities.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { resolveTurnProgress, settleStatusTicks } from "../src/engine/turn.js";
import { addHealthOverTime, damageEnemy, stealLife } from "../src/engine/healthEffects.js";
import { actionPreview, preparationGate } from "../src/system/combatActions.js";
import { ensurePlayerActionTools, validatePlayerActions } from "../src/services/playerActions.js";
import { migrateSave } from "../src/services/storage.js";
import { buildPlanningContext, visibleGameState } from "../src/services/memory.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { ensureTalismanToolCall } from "../src/services/talismans.js";

const call = (name, args, id = name) => ({ id, name, args, reason: "玩家确认行动" });
function fresh(pathway = "囚犯（序列7）", maxHealth = 100) {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "百分比战斗测试员", extraordinary: "low", pathway });
  executeCombatTool(game, "enemy.encounter", { enemies: [{ id: "foe", name: "对手", maxHealth }] });
  return game;
}

test("ordinary attacks have the same percentage at all HP scales, and share the main-action budget", () => {
  for (const [maxHealth, damage] of [[1, 1], [20, 3], [100, 12], [101, 13], [1000, 120], [1_000_000, 120_000]]) {
    const game = fresh(undefined, maxHealth);
    const result = executeCombatTool(game, "combat.action", { actionId: "attack", enemyId: "foe" });
    assert.equal(result.ok, true);
    assert.equal(result.data.combatAction.damage, damage);
    assert.equal(result.data.combatAction.damagePercent, 12);
    assert.equal(game.combat.enemies[0].health, maxHealth - damage);
    const after = structuredClone(game);
    assert.equal(resolveAbilityUse(game, { abilityId: "prisoner:wolf_claw", targetId: "foe" }).ok, false);
    assert.deepEqual(game, after);
  }
});

test("wolf preparation costs and attack are atomic, last one round, and never carry into the next", () => {
  for (const [stacks, expected] of [[0, 30], [1, 36], [2, 44], [3, 52]]) {
    const game = fresh();
    const spirituality = game.character.stats.spirituality;
    const before = structuredClone(game);
    const preview = actionPreview(game, getUnlockedAbilities("prisoner", 7)[3].rule, stacks, game.combat.enemies[0]);
    assert.deepEqual(game, before, "preparing is read-only and cancellable");
    assert.equal(preview.damage, expected);
    const result = resolveAbilityUse(game, { abilityId: "prisoner:wolf_claw", targetId: "foe", boostStacks: stacks });
    assert.equal(result.ok, true);
    assert.equal(result.data.abilityEffect.damage, expected);
    assert.equal(game.character.stats.spirituality, spirituality - 2 - stacks);
    resolveTurnProgress(game, "狼人利爪", "low");
    assert.equal(game.character.combatBoost, undefined);
    game.turn += 1;
    assert.equal(resolveAbilityUse(game, { abilityId: "prisoner:wolf_claw", targetId: "foe" }).data.abilityEffect.damagePercent, 30);
  }
  const enemy = { id: "e", name: "对手", health: 100, maxHealth: 100, status: "active" };
  assert.equal(damageEnemy(enemy, 50, 3, 1).damage, 60, "all damage multipliers are capped before rounding");
});

test("invalid targets, unavailable preparation, invalid layers and insufficient resources never spend anything", () => {
  for (const patch of [{ boostStacks: -1 }, { boostStacks: 4 }, { boostStacks: "2" }, { boostStacks: 1.5 }, { targetId: "missing" }]) {
    const game = fresh();
    const before = structuredClone(game);
    assert.equal(resolveAbilityUse(game, { abilityId: "prisoner:wolf_claw", targetId: "foe", ...patch }).ok, false);
    assert.deepEqual(game, before);
  }
  const empty = fresh();
  empty.character.stats.spirituality = 4;
  const before = structuredClone(empty);
  assert.equal(resolveAbilityUse(empty, { abilityId: "prisoner:wolf_claw", targetId: "foe", boostStacks: 3 }).ok, false);
  assert.deepEqual(empty, before);
  assert.throws(() => validatePlayerActions(empty, "强化三次", { abilityRequest: { abilityId: "prisoner:wolf_claw", targetId: "foe", boostStacks: 3 } }), /灵性不足/);
  const other = fresh("猎人（序列7）");
  assert.equal(executeCombatTool(other, "combat.action", { actionId: "attack", enemyId: "foe", boostStacks: 1 }).ok, false);
});

test("every healing skill uses its own maximum HP percentage, caps overhealing and rejects attack boosts", () => {
  for (const pathway of PATHWAYS) for (const ability of getUnlockedAbilities(pathway.id, 5).filter(entry => entry.rule.effect === "health")) {
    const game = fresh(`${pathway.name}（序列5）`);
    game.character.stats.maxHealth = 37;
    game.character.stats.health = 1;
    const result = resolveAbilityUse(game, { abilityId: ability.id });
    assert.equal(result.ok, true);
    assert.equal(game.character.stats.health, ability.sequence === 5 ? 12 : 8, ability.id);
    game.turn += 1;
    game.character.stats.health = 36;
    assert.equal(resolveAbilityUse(game, { abilityId: ability.id }).data.abilityEffect.healing, 1);
    game.turn += 1;
    const before = structuredClone(game);
    assert.equal(resolveAbilityUse(game, { abilityId: ability.id }).ok, false);
    assert.deepEqual(game, before);
  }
  assert.match(preparationGate(fresh(), { effect: "health", healPercent: 20, cost: 2 }, 1), /只能用于/);
});

test("health costs reserve one HP; life steal uses actual lost health ratio instead of raw enemy points", () => {
  const game = fresh();
  game.character.stats.maxHealth = 100;
  game.character.stats.health = 10;
  assert.match(preparationGate(game, { effect: "damage", damagePercent: 30, cost: 2, healthCostPercent: 10 }), /至少保留1点/);
  game.character.stats.health = 11;
  assert.equal(preparationGate(game, { effect: "damage", damagePercent: 30, cost: 2, healthCostPercent: 10 }), "");
  assert.equal(stealLife(game, 10, 100, { ratio: .3, maxHealPercent: 10 }).delta, 3);
  assert.equal(stealLife(game, 10_000, 100_000, { ratio: .3, maxHealPercent: 10 }).delta, 3);
  assert.equal(stealLife(game, 100, 100, { ratio: .3, maxHealPercent: 10 }).delta, 10);
  assert.equal(stealLife(game, 0, 100, { ratio: .3, maxHealPercent: 10 }), null);
});

test("enemy moves are local, heavy attacks require telegraph and cooldown, and defense halves the percentage", () => {
  const game = fresh();
  game.character.stats.health = game.character.stats.maxHealth = 100;
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe", moveId: "heavy" }).ok, false);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe", moveId: "windup" }).ok, true);
  assert.equal(game.character.stats.health, 100);
  game.turn += 1;
  assert.equal(executeCombatTool(game, "combat.action", { actionId: "defend" }).ok, true);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe", moveId: "heavy" }).data.enemyAction.damage, 10);
  game.turn += 1;
  const before = structuredClone(game);
  for (const args of [{ moveId: "windup" }, { moveId: "heavy" }, { moveId: "attack", damage: 999 }, { moveId: "made-up" }]) {
    assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe", ...args }).ok, false);
    assert.deepEqual(game, before);
  }
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe", moveId: "attack" }).data.enemyAction.damage, 12);
  game.turn = 4;
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "foe", moveId: "windup" }).ok, true);
});

test("generic updates and invented statuses cannot bypass combat health or the action budget", () => {
  const game = fresh();
  game.character.stats.health -= 2;
  const execution = executeToolCalls(game, [
    call("character.update", { patch: { health: 999 } }),
    call("character.update", { patch: { health: -999 }, damageSource: "environment" }, "env"),
    call("status.add", { status: { id: "fake", name: "流血", tick: { health: -3 } } }),
    call("status.add", { status: { id: "fake2", name: "恢复", healthEffect: { percent: 100, remainingTurns: null } } }, "fake2"),
    call("enemy.damage", { enemyId: "foe", amount: 999 }),
  ]);
  assert.ok(execution.results.every(result => !result.ok));
  assert.equal(execution.game.character.stats.health, game.character.stats.health);
  assert.equal(execution.game.combat.enemies[0].health, 100);
  assert.deepEqual(execution.game.statusEffects, game.statusEffects);
});

test("percentage status effects refresh rather than stack, start next turn, tick once and expire", () => {
  const game = fresh();
  const ability = { id: "registered-burn", name: "灼伤", rule: { healthOverTime: { percent: -5, duration: 3 } } };
  addHealthOverTime(game.combat.enemies[0].statusEffects, ability, 1);
  addHealthOverTime(game.combat.enemies[0].statusEffects, ability, 1);
  assert.equal(game.combat.enemies[0].statusEffects.length, 1);
  settleStatusTicks(game);
  assert.equal(game.combat.enemies[0].health, 100);
  for (let turn = 1; turn <= 3; turn++) {
    game.turn = turn;
    settleStatusTicks(game);
    assert.equal(game.combat.enemies[0].health, 100 - turn * 5);
    settleStatusTicks(game);
    assert.equal(game.combat.enemies[0].health, 100 - turn * 5);
  }
  assert.deepEqual(game.combat.enemies[0].statusEffects, []);
  game.character.stats.health = 1;
  addHealthOverTime(game.statusEffects, ability, 4);
  game.turn = 4;
  settleStatusTicks(game);
  assert.equal(game.character.stats.health, 0);
  assert.ok(game.statusEffects.some(status => status.id === "collapse-health"));
});

test("save migration preserves existing injuries, converts old ticks and cannot revive or carry preparation", () => {
  const game = fresh();
  game.version = 13;
  game.turn = 8;
  game.character.stats.health = 0;
  game.character.combatBoost = { stacks: 3, expiresTurn: 8 };
  game.statusEffects.push({ id: "old-bleed", name: "旧伤", tick: { health: -2 } });
  const saved = JSON.parse(JSON.stringify(game));
  const loaded = migrateSave(saved);
  assert.equal(loaded.version, 14);
  assert.equal(loaded.character.stats.health, 0);
  assert.equal(loaded.character.combatBoost, undefined);
  assert.deepEqual(loaded.money, game.money);
  assert.equal(loaded.statusEffects.find(status => status.id === "old-bleed").tick.health, undefined);
  assert.equal(saved.statusEffects.find(status => status.id === "old-bleed").tick.health, -2, "migration does not mutate the input save");
  const again = migrateSave(JSON.parse(JSON.stringify(loaded)));
  assert.deepEqual(again.statusEffects, loaded.statusEffects);
});

test("UI intent reaches the model, missing enemy reactions are filled, and replay cannot pay or hit twice", () => {
  const game = fresh();
  const requests = { abilityRequest: { abilityId: "prisoner:wolf_claw", targetId: "foe", boostStacks: 2 } };
  const messages = buildPlanningContext(game, "强化两次后用利爪", DEFAULT_SYSTEM_PROMPT, requests);
  const context = messages.map(message => message.content).join("\n");
  assert.match(context, /requestedCombatPreview/);
  assert.match(context, /43\.2/);
  assert.equal(visibleGameState(game).combatRules.enemyMoves.heavy.damagePercent, 20);
  const calls = ensurePlayerActionTools([], requests, game);
  assert.deepEqual(calls.map(entry => entry.name), ["ability.use", "enemy.act"]);
  const before = structuredClone(game);
  const result = executeToolCalls(game, calls);
  assert.deepEqual(game, before, "candidate state cannot change the committed save before narration succeeds");
  assert.equal(result.game.combat.enemies[0].health, 56);
  const replay = executeToolCalls(result.game, calls);
  assert.ok(replay.results.every(entry => !entry.ok));
  assert.deepEqual(replay.game.character.stats, result.game.character.stats);
  assert.equal(replay.game.combat.enemies[0].health, 56);
});

test("a clicked attack or talisman cannot be replaced by an AI ability, and both receive enemy responses", () => {
  const game = fresh();
  const suggestions = [call("ability.use", { abilityId: "prisoner:wolf_claw", targetId: "foe", boostStacks: 3 })];
  const attackCalls = ensurePlayerActionTools(suggestions, { combatRequest: { actionId: "attack", enemyId: "foe" } }, game);
  assert.deepEqual(attackCalls.map(entry => entry.name), ["combat.action", "enemy.act"]);
  const attack = executeToolCalls(game, attackCalls);
  assert.equal(attack.game.combat.enemies[0].health, 88);
  assert.equal(attack.game.character.stats.spirituality, game.character.stats.spirituality);
  game.inventory.push(normalizeInventoryItem({ instanceId: "storm", itemId: "storm-charm", quantity: 1 }));
  const request = { instanceId: "storm", enemyId: "foe" };
  const charmCalls = ensurePlayerActionTools(ensureTalismanToolCall(suggestions, request, game), { talismanRequest: request }, game);
  assert.deepEqual(charmCalls.map(entry => entry.name), ["item.use", "enemy.act"]);
  const charm = executeToolCalls(game, charmCalls);
  assert.ok(charm.results.every(entry => entry.ok));
  assert.equal(charm.game.combat.enemies[0].health, 70);
  assert.ok(charm.game.character.stats.health < game.character.stats.health);
  assert.equal(charm.game.inventory.some(item => item.instanceId === "storm"), false);
});

test("newly registered and numerous enemies cannot lose their reactions at the tool-call limit", () => {
  const game = fresh();
  game.combat.enemies = [];
  const enemies = Array.from({ length: 15 }, (_, index) => ({ id: `foe-${index}`, name: `对手${index}`, maxHealth: 100 }));
  const calls = ensurePlayerActionTools([
    call("enemy.encounter", { enemies }), call("combat.action", { actionId: "attack", enemyId: "foe-0" }),
  ], {}, game);
  assert.equal(game.combat.enemies.length, 0, "reaction planning is read-only");
  assert.equal(calls.length, 17);
  const result = executeToolCalls(game, calls);
  assert.equal(result.results.length, calls.length);
  assert.ok(result.results.every(entry => entry.ok));
  assert.ok(result.game.combat.enemies.every(enemy => enemy.lastActedTurn === 1));
  assert.equal(result.game.combat.enemies[0].health, 88);
});
