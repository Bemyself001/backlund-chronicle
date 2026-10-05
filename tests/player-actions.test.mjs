import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { getAdvancement } from "../src/system/character.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { collectImportantItemConfirmations, auditInventoryChanges } from "../src/engine/audit.js";
import { createTurnResolution } from "../src/services/turnResolution.js";
import { ensurePlayerActionTools, validatePlayerActions } from "../src/services/playerActions.js";
import { ensureRequestedAdvancementToolCall } from "../src/services/advancement.js";
import { registerQuest } from "../src/engine/questLifecycle.js";
import { visibleQuestJournal } from "../src/engine/questRuntime.js";

const fresh = character => createInitialGame({ ...EMPTY_CHARACTER, name: "集成验收员", ...character });
const call = (name, args, id = name) => ({ id, name, args, reason: "玩家实际执行约定行动" });

test("plain potion use reaches the same deterministic atomic promotion as the UI", () => {
  const game = fresh();
  game.inventory.push(normalizeInventoryItem({ instanceId: "bottle", itemId: "potion", name: "占卜家魔药", description: "成品魔药", quantity: 1, tags: [], weight: .1 }));
  const before = structuredClone(game);
  const action = "使用占卜家魔药";
  const requests = validatePlayerActions(game, action, {});
  const calls = ensureRequestedAdvancementToolCall([call("item.use", { instanceId: "bottle" })], requests.advancementRequest, 1, game);
  assert.equal(calls.length, 1);
  const result = executeToolCalls(game, calls, { playerAction: action });
  assert.equal(result.results[0].ok, true);
  assert.equal(getAdvancement(result.game.character).sequence, 9);
  assert.equal(result.game.occult.contact, 1);
  assert.equal(collectImportantItemConfirmations(calls, result.results)[0].confirmationKind, "advancement");
  assert.deepEqual(game, before, "candidate promotion must not commit the current game before narrative");
});

test("passive checks use a fixed applicable bonus and reject duplicate AI modifiers", () => {
  const game = fresh({ extraordinary: "low", pathway: "占卜家（序列8）" });
  const ability = getAdvancement(game.character).unlockedAbilities[0];
  const checked = executeToolCalls(game, [call("dice.check", { difficulty: 12, abilityId: ability.id, checkKind: ability.rule.checkKind })]);
  assert.equal(checked.results[0].data.total - checked.results[0].data.roll, 2);
  const forged = executeToolCalls(game, [call("dice.check", { difficulty: 12, abilityId: ability.id, checkKind: ability.rule.checkKind, modifier: 10 })]);
  assert.equal(forged.results[0].ok, false);
});

test("active ability requests keep one local effect and avoid duplicate model costs or damage", () => {
  const game = fresh({ extraordinary: "low", pathway: "猎人（序列7）" });
  game.combat.enemies.push({ id: "enemy", name: "袭击者", health: 30, maxHealth: 30, status: "active", stunnedThroughTurn: -1, lastActedTurn: -1 });
  const ability = getAdvancement(game.character).unlockedAbilities.find(ability => ability.sequence === 7);
  const requests = { abilityRequest: { abilityId: ability.id, targetId: "enemy" } };
  const calls = ensurePlayerActionTools([call("enemy.damage", { enemyId: "enemy", amount: 9 }), call("character.update", { patch: { spirituality: -9 } })], requests, game);
  assert.deepEqual(calls.map(call => call.name), ["ability.use"]);
  const result = executeToolCalls(game, calls);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.game.character.stats.spirituality, game.character.stats.spirituality - ability.cost);
  assert.equal(result.game.combat.enemies[0].health, 30 - ability.rule.amount);
});

test("unknown potion names and private metadata remain absent from logs, audit and rendering", () => {
  const game = fresh();
  const calls = [call("inventory.add", { item: { itemId: "hidden-id", name: "PRIVATE_MAGIC魔药", description: "PRIVATE_MAGIC", source: "PRIVATE_MAGIC", quantity: 1, properties: { identity: "PRIVATE_MAGIC" }, potion: { pathwayId: "seer", sequence: 8, identified: false } } })];
  calls[0].reason = "PRIVATE_MAGIC";
  const result = executeToolCalls(game, calls);
  assert.equal(result.results[0].ok, true);
  const publicData = [result.logs, collectImportantItemConfirmations(calls, result.results), auditInventoryChanges(game.inventory, result.game.inventory), createTurnResolution(calls, result.results, {}, result.game)];
  assert.equal(JSON.stringify(publicData).includes("PRIVATE_MAGIC"), false);
});

test("consumable categories use and remove one item even without a legacy consumable tag", () => {
  const game = fresh();
  game.inventory.push({ instanceId: "bread", itemId: "bread", name: "面包", category: "食物", quantity: 2, tags: [] });
  const result = executeToolCalls(game, [call("item.use", { instanceId: "bread" })]);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.game.inventory.find(item => item.instanceId === "bread").quantity, 1);
});

test("multi-item task delivery confirms every important item and declining any rolls back the entire task", () => {
  const game = fresh();
  for (const id of ["seal", "letter"]) game.inventory.push({ instanceId: id, itemId: id, name: id, quantity: 1, tags: ["任务物品"], importance: "important" });
  const quest = { id: "delivery", title: "归还凭证", status: "engaged", objective: "交付印章和信件", kind: "side", contract: { nodes: [
    { id: "seal", objective: "交付印章", conditions: [{ type: "action", terms: ["交付印章"] }], cost: { itemId: "seal", quantity: 1 } },
    { id: "letter", objective: "交付信件", conditions: [{ type: "action", terms: ["交付信件"] }], cost: { itemId: "letter", quantity: 1 } },
  ], rewards: [{ type: "money", amountPence: 12 }] } };
  assert.equal(registerQuest(game, quest, 0, "我接受委托").ok, true);
  const action = "交付印章，然后交付信件";
  const calls = [call("quest.resolve", { instanceId: "quest:delivery", actionQuote: action, outcome: "progress", evidence: "两件约定物品已经交付", steps: [{ objectiveId: "seal" }, { objectiveId: "letter" }] })];
  const result = executeToolCalls(game, calls, { playerAction: action });
  assert.equal(result.results[0].ok, true, result.results[0].reason);
  const confirmations = collectImportantItemConfirmations(calls, result.results);
  assert.equal(confirmations.length, 2);
  assert.notEqual(confirmations[0].key, confirmations[1].key);
  const declined = executeToolCalls(game, calls, { playerAction: action, blockedCallIndexes: [confirmations[1].callIndex] });
  assert.deepEqual(declined.game.inventory, game.inventory);
  assert.deepEqual(declined.game.money, game.money);
  assert.equal(visibleQuestJournal(declined.game).find(task => task.id === "quest:delivery").status, "engaged");
});
