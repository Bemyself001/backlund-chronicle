import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_SYSTEM_PROMPT } from "../src/data/defaults.js";
import { CHURCH_TALISMANS, getOrganization } from "../src/content/index.js";
import { executeToolCalls, normalizeToolCalls, validateToolCall } from "../src/engine/tools.js";
import { executeSpecialAction } from "../src/engine/specialActions.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { getChurchTalisman } from "../src/system/talismans.js";
import { migrateSave } from "../src/services/storage.js";
import { ensureTalismanToolCall, validateTalismanRequest } from "../src/services/talismans.js";
import { buildPlanningContext, visibleGameState } from "../src/services/memory.js";
import { requestAI } from "../src/services/api.js";
import { normalizeAIResponse } from "../src/services/protocol.js";

const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: "符咒测试员", extraordinary: "low", pathway: "占卜家（序列9）" });
const call = (name, args, id) => ({ name, args, reason: "玩家本轮明确采取的行动", ...(id ? { id } : {}) });
function addCharm(game, itemId, quantity = 1) {
  const item = normalizeInventoryItem({ instanceId: `${itemId}-test`, itemId, quantity, condition: "完好", tags: [] });
  game.inventory.push(item);
  return item;
}
function encounter(game, enemies = [{ id: "guard", name: "持械守卫", maxHealth: 101, health: 80 }]) {
  return executeToolCalls(game, [call("enemy.encounter", { enemies })]).game;
}
const clue = { id: "clue-clock", title: "重新上紧的发条", detail: "发条旋钮上有新鲜指印，说明停摆前不久有人重新调整过时钟。" };

test("each official church grants its canonical charm through AI and local registration", () => {
  for (const definition of CHURCH_TALISMANS) {
    const organization = getOrganization(definition.organizationId);
    const game = fresh();
    const joined = executeToolCalls(game, [call("organization.join", { organizationId: organization.id, name: organization.name, kind: "official", evidence: "已完成正式宣誓登记" })], { playerAction: `加入${organization.name}` });
    assert.equal(joined.results[0].ok, true);
    assert.equal(joined.results[0].data.inventoryChange.itemId, definition.itemId);
    assert.equal(joined.game.inventory.find(item => item.itemId === definition.itemId).quantity, 1);
    assert.equal(joined.game.organizationState.talismanGrants[definition.organizationId], true);
    const localGame = fresh();
    localGame.location.id = organization.headquarters;
    const local = executeSpecialAction(localGame, { operation: "register", id: organization.id, revision: 0 });
    assert.equal(local.next.inventory.find(item => item.itemId === definition.itemId).quantity, 1);
    assert.match(local.narrative, new RegExp(definition.name));
  }
});

test("legacy member grant survives saves and never replenishes a consumed charm", () => {
  const game = fresh();
  game.organizationState = { membership: { organizationId: "machinery-hivemind", name: "机械之心", status: "active", kind: "official" } };
  delete game.combat;
  const migrated = migrateSave(game);
  assert.deepEqual(migrated.combat, { enemies: [] });
  const charm = migrated.inventory.find(item => item.itemId === "knowledge-charm");
  assert.equal(charm.quantity, 1);
  const used = executeToolCalls(migrated, [call("item.use", { instanceId: charm.instanceId, clue })]);
  assert.equal(used.results[0].ok, true);
  const reloaded = migrateSave(JSON.parse(JSON.stringify(used.game)));
  assert.equal(reloaded.inventory.some(item => item.itemId === charm.itemId), false);
  assert.equal(migrateSave(reloaded).inventory.some(item => item.itemId === charm.itemId), false);
  assert.equal(reloaded.clues.filter(entry => entry.id === clue.id).length, 1);
});

test("ordinary people and nonchurch members do not get an automatic charm", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "普通人" });
  game.organizationState = { membership: { organizationId: "nighthawks", status: "active" } };
  assert.equal(migrateSave(game).inventory.some(item => getChurchTalisman(item)), false);
  const government = fresh();
  government.organizationState = { membership: { organizationId: "mi9", status: "active" } };
  assert.equal(migrateSave(government).inventory.some(item => getChurchTalisman(item)), false);
});

test("storm damage uses maximum HP, rounds upward, clamps at zero and consumes exactly once", () => {
  let game = encounter(fresh());
  const charm = addCharm(game, "storm-charm", 2);
  const request = call("item.use", { instanceId: charm.instanceId, enemyId: "guard" }, "storm-once");
  const result = executeToolCalls(game, [request]);
  assert.equal(result.results[0].data.talismanEffect.damage, 31);
  assert.equal(result.game.combat.enemies[0].health, 49);
  assert.equal(result.game.inventory.find(item => item.instanceId === charm.instanceId).quantity, 1);
  const replay = executeToolCalls(result.game, [request]);
  assert.equal(replay.results[0].ok, false);
  assert.equal(replay.game.combat.enemies[0].health, 49);
  game = result.game;
  game.turn += 1;
  game.combat.enemies[0].health = 2;
  const killed = executeToolCalls(game, [call("item.use", request.args, "storm-two"), call("enemy.act", { enemyId: "guard", moveId: "attack", action: "反击" }), call("character.update", { patch: { health: -3 } })]);
  assert.equal(killed.game.combat.enemies[0].health, 0);
  assert.equal(killed.game.combat.enemies[0].status, "defeated");
  assert.equal(killed.game.combat.enemies[0].lastUpdatedTurn, game.turn + 1);
  assert.equal(killed.results[1].ok, false);
  assert.equal(killed.results[2].ok, false);
  assert.equal(killed.game.character.stats.health, game.character.stats.health);
  assert.equal(killed.game.inventory.some(item => item.instanceId === charm.instanceId), false);
});

test("crimson prevents exactly one turn of the selected enemy, leaving other enemies able to act", () => {
  const game = encounter(fresh(), [{ id: "guard", name: "守卫", maxHealth: 40 }, { id: "hound", name: "猎犬", maxHealth: 12 }]);
  const charm = addCharm(game, "crimson-charm");
  const calls = ensureTalismanToolCall([
    call("enemy.act", { enemyId: "guard", moveId: "attack", action: "抡起棍棒" }, "guard-one"),
    call("enemy.act", { enemyId: "hound", moveId: "attack", action: "扑击" }, "hound-one"),
  ], { instanceId: charm.instanceId, enemyId: "guard" }, game);
  const result = executeToolCalls(game, calls);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[1].ok, false);
  assert.equal(result.results[2].ok, true);
  assert.equal(result.game.character.stats.health, 17);
  result.game.turn += 1;
  const next = executeToolCalls(result.game, [call("enemy.act", { enemyId: "guard", moveId: "attack", action: "恢复行动" }, "guard-two")]);
  assert.equal(next.results[0].ok, true);
  assert.equal(next.game.character.stats.health, 14);
});

test("missing and stale targets do not consume charms; invalid UI requests fail before planning", () => {
  const game = fresh();
  const charm = addCharm(game, "crimson-charm");
  for (const enemyId of [undefined, "missing"]) {
    const result = executeToolCalls(game, [call("item.use", { instanceId: charm.instanceId, enemyId })]);
    assert.equal(result.results[0].ok, false);
    assert.deepEqual(result.game.inventory, game.inventory);
  }
  assert.throws(() => validateTalismanRequest(game, { instanceId: charm.instanceId, enemyId: "missing" }), /选择/);
});

test("knowledge charm and a genuinely new clue commit atomically; invalid and duplicate clues never spend it", () => {
  const game = fresh();
  const charm = addCharm(game, "knowledge-charm", 2);
  for (const invalid of [undefined, {}, { ...clue, detail: "" }, { ...clue, kind: "potion_recipe" }]) {
    const result = executeToolCalls(game, [call("item.use", { instanceId: charm.instanceId, clue: invalid })]);
    assert.equal(result.results[0].ok, false);
    assert.equal(result.game.clues.length, 0);
    assert.equal(result.game.inventory.find(item => item.instanceId === charm.instanceId).quantity, 2);
  }
  const success = executeToolCalls(game, [call("item.use", { instanceId: charm.instanceId, clue })]);
  assert.equal(success.results[0].ok, true);
  assert.equal(success.game.clues.length, 1);
  assert.equal(success.game.clues[0].discoveredTurn, 1);
  for (const duplicate of [clue, { ...clue, id: "changed-id" }, { ...clue, id: "changed-id", title: "另一个标题" }]) {
    const result = executeToolCalls(success.game, [call("item.use", { instanceId: charm.instanceId, clue: duplicate })]);
    assert.equal(result.results[0].ok, false);
    assert.equal(result.game.clues.length, 1);
    assert.equal(result.game.inventory.find(item => item.instanceId === charm.instanceId).quantity, 1);
  }
});

test("both typed actions and UI requests discard duplicate spending and damage proposals", () => {
  for (const explicit of [false, true]) {
    const game = encounter(fresh());
    const charm = addCharm(game, "storm-charm", 2);
    const args = { instanceId: charm.instanceId, enemyId: "guard" };
    const calls = ensureTalismanToolCall([
      call("item.use", args), call("enemy.damage", { enemyId: "guard", amount: 31 }),
      call("inventory.remove", { instanceId: charm.instanceId, quantity: 1 }),
    ], explicit ? args : null, game);
    assert.equal(calls.length, 1);
    const result = executeToolCalls(game, calls);
    assert.equal(result.game.combat.enemies[0].health, 49);
    assert.equal(result.game.inventory.find(item => item.instanceId === charm.instanceId).quantity, 1);
  }
});

test("forced clue use adopts a separate clue call, survives repair and preserves chosen target IDs", () => {
  const game = encounter(fresh());
  const charm = addCharm(game, "knowledge-charm");
  const request = { instanceId: charm.instanceId };
  const missing = ensureTalismanToolCall([], request, game);
  assert.match(validateToolCall(game, missing[0]).error, /缺少参数 clue/);
  const calls = ensureTalismanToolCall([call("clue.add", { clue })], request, game);
  assert.equal(calls.length, 1);
  assert.deepEqual(ensureTalismanToolCall(calls, request, game), calls);
  assert.equal(executeToolCalls(game, calls).results[0].ok, true);
  const combatCharm = addCharm(game, "crimson-charm");
  const locked = ensureTalismanToolCall([call("item.use", { instanceId: combatCharm.instanceId, enemyId: "wrong-target" })], { instanceId: combatCharm.instanceId, enemyId: "guard" }, game);
  assert.equal(locked[0].args.enemyId, "guard");
});

test("canonical item ID wins over conflicting names and untrusted effect properties", () => {
  const item = normalizeInventoryItem({ itemId: "storm-charm", name: "深红符咒", properties: { damage: 999 }, tags: ["装备"], importance: "important" });
  assert.equal(item.name, "风暴符咒");
  assert.equal(getChurchTalisman(item).effect, "damage");
  assert.equal(item.importance, "normal");
  assert.equal(item.properties.damage, undefined);
});

test("combat HP and charm intent reach AI contexts and survive save round trips", () => {
  const game = encounter(fresh());
  game.combat.enemies[0].stunnedThroughTurn = 1;
  const charm = addCharm(game, "crimson-charm");
  const request = { instanceId: charm.instanceId, enemyId: "guard" };
  assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(game))).combat, game.combat);
  assert.deepEqual(visibleGameState(game).combat, game.combat);
  const context = buildPlanningContext(game, "使用符咒", DEFAULT_SYSTEM_PROMPT, { talismanRequest: request, nativeTools: false });
  assert.match(context.at(-1).content, /requestedTalisman/);
  assert.match(context.map(message => message.content).join(""), /enemy\.encounter|enemy\.act/);
  const parsed = normalizeAIResponse(JSON.stringify({ toolCalls: [call("combat.action", { enemyId: "guard", actionId: "attack" })] }));
  assert.equal(executeToolCalls(game, normalizeToolCalls(parsed.toolCalls, game)).game.combat.enemies[0].health, 67);
});

test("native AI schemas include validated enemy tools and atomic talisman clue fields", async context => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_STATE_CHANGE" } }] }), { headers: { "Content-Type": "application/json" } });
  };
  await requestAI({ baseUrl: "https://example.test/v1", apiKey: "test", customHeaders: "", model: "test", nativeTools: true, stream: false, maxTokens: 1000 }, [{ role: "user", content: "测试" }]);
  const tools = Object.fromEntries(body.tools.map(entry => [entry.function.name, entry.function.parameters]));
  for (const name of ["enemy__encounter", "combat__action", "enemy__act", "enemy__leave"]) assert.ok(tools[name]);
  assert.deepEqual(tools.item__use.properties.clue.required, ["id", "title", "detail"]);
  assert.ok(tools.item__use.properties.enemyId);
});
