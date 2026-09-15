import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { PATHWAYS, SPECIAL_ACTIONS, SPECIAL_RECIPES, SPECIAL_CONTACTS, CONTENT_VERSION, getOrganization, validateContentPack } from "../src/content/index.js";
import { actionGate, commissionOffer, executeSpecialAction, specialState, watchContactText, registrationGate } from "../src/engine/specialActions.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { migrateSave } from "../src/services/storage.js";
import { moneyFromPence, moneyToPence } from "../src/system/money.js";
import { visibleGameState } from "../src/services/memory.js";
import { executeToolCalls } from "../src/engine/tools.js";

function fresh(pathwayId = "seer", sequence = 9) {
  const pathway = PATHWAYS.find((entry) => entry.id === pathwayId);
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "工作测试员", extraordinary: "low", pathway: `${pathway.name}（序列${sequence}）` });
  game.money = moneyFromPence(300);
  return game;
}
function run(game, operation, id, optionId) {
  return resolveSpecialAction(game, { operation, id, optionId, revision: specialState(game).revision });
}
function qualify(game, definition) {
  if (definition.locationId) game.location.id = definition.locationId;
  if (definition.license) game.specialActions = { ...specialState(game), gravekeeper: true };
  if (definition.organizationId) game.organizationState = { membership: { ...getOrganization(definition.organizationId), organizationId: definition.organizationId, status: "active" } };
  return game;
}

test("22 pathways have at least three authored scenes or recipes; definitions are serializable", () => {
  for (const pathway of PATHWAYS) {
    const scenes = SPECIAL_ACTIONS.filter((entry) => entry.pathwayId === pathway.id).flatMap((entry) => entry.pool);
    const recipes = SPECIAL_RECIPES.filter((entry) => entry.pathwayId === pathway.id);
    assert.ok(scenes.length + recipes.length >= 3, pathway.id);
    assert.equal(new Set(scenes.map((entry) => entry.title)).size, scenes.length);
    for (const scene of scenes) assert.equal(scene.options.length, 2);
  }
  assert.equal(SPECIAL_ACTIONS.reduce((sum, entry) => sum + entry.pool.length, 0), 66);
  assert.deepEqual(validateContentPack(), []);
});

test("every commission can be accepted, saved and settled with history, audit and time", () => {
  for (const definition of SPECIAL_ACTIONS) {
    const game = qualify(fresh(definition.pathwayId), definition);
    const copy = structuredClone(game);
    const accepted = run(game, "accept", definition.id);
    assert.deepEqual(game, copy, definition.id);
    assert.equal(accepted.turn, game.turn + 1);
    const loaded = migrateSave(accepted);
    assert.deepEqual(loaded.specialActions.active, accepted.specialActions.active);
    const id = loaded.specialActions.active.id;
    const settled = run(loaded, "resolve", id, "limited");
    assert.equal(settled.turn, game.turn + 2);
    assert.equal(settled.specialActions.active, null);
    assert.equal(settled.quests.find((entry) => entry.id === id).status, "completed");
    assert.equal(settled.recentDialogues.at(-1).source, "fixed");
    assert.equal(settled.memoryState.pending.at(-1).turn, settled.turn);
    assert.equal(settled.lastTurnAudit.turn, settled.turn);
    assert.notEqual(settled.worldTime, game.worldTime);
    assert.throws(() => run(settled, "resolve", id, "limited"), /已结算/);
    assert.throws(() => run(settled, "accept", definition.id), /还需 3/);
    settled.turn += 3;
    assert.doesNotThrow(() => run(settled, "accept", definition.id));
  }
});

test("place, pathway, registration, membership, health and stale request gates cannot be bypassed", () => {
  const game = fresh("seer");
  const request = { operation: "accept", id: "work-seer", revision: 0 };
  assert.throws(() => executeSpecialAction(game, request), /指定地点/);
  game.location.id = "divination-association";
  assert.throws(() => run(game, "accept", "work-reader"), /途径/);
  assert.throws(() => run(game, "accept", "work-sleepless"), /正式加入/);
  const next = run(game, "accept", "work-seer");
  assert.throws(() => executeSpecialAction(next, request), /状态已更新/);
  assert.throws(() => run(next, "accept", "work-seer"), /当前委托/);
  next.character.stats.health = 0;
  assert.throws(() => run(next, "resolve", next.specialActions.active.id, "careful"), /先恢复/);
  assert.doesNotThrow(() => run(next, "abandon", next.specialActions.active.id));
  const corpse = fresh("corpse_collector");
  corpse.location.id = SPECIAL_CONTACTS.registrationLocation;
  assert.throws(() => run(corpse, "accept", "work-corpse_collector"), /守墓人/);
  const registered = run(corpse, "register", "gravekeeper");
  assert.equal(registered.specialActions.gravekeeper, true);
  assert.doesNotThrow(() => run(registered, "accept", "work-corpse_collector"));
});

test("all 22 pathways may join nighthawks explicitly, never replacing an active membership", () => {
  for (const pathway of PATHWAYS) {
    const game = fresh(pathway.id);
    game.location.id = SPECIAL_CONTACTS.organizationLocation;
    const joined = run(game, "register", "organization");
    assert.equal(joined.organizationState.membership.organizationId, SPECIAL_CONTACTS.organizationId);
    assert.ok(joined.organizationState.membership.tags.includes("official"));
    assert.doesNotThrow(() => run(joined, "accept", "work-sleepless"));
    assert.match(registrationGate(joined, "organization"), /已有/);
  }
});

test("fixed offer does not reroll on reload and completed scene is not immediately repeated", () => {
  let game = qualify(fresh("spectator"), SPECIAL_ACTIONS.find((entry) => entry.id === "work-spectator"));
  const definition = SPECIAL_ACTIONS.find((entry) => entry.id === "work-spectator");
  assert.deepEqual(commissionOffer(game, definition), commissionOffer(migrateSave(game), definition));
  game = run(game, "accept", definition.id);
  const previous = game.specialActions.active.offer.id;
  game = run(game, "resolve", game.specialActions.active.id, "careful");
  game.turn += 3;
  assert.notEqual(commissionOffer(game, definition).id, previous);
});

test("casino wins, ties and losses are capped; cancellation refunds reserved stakes", () => {
  for (const [roll, net] of [[0, 6], [44, 6], [45, 0], [64, 0], [65, -6], [99, -6]]) {
    const original = fresh("monster");
    const game = run(original, "accept", "work-monster");
    game.specialActions.active.roll = roll;
    const loaded = migrateSave(game);
    const final = run(loaded, "resolve", loaded.specialActions.active.id, "careful");
    assert.equal(moneyToPence(final.money) - moneyToPence(original.money), net);
  }
  const start = fresh("monster");
  const accepted = run(start, "accept", "work-monster");
  const cancelled = run(accepted, "abandon", accepted.specialActions.active.id);
  assert.equal(moneyToPence(cancelled.money), moneyToPence(start.money));
  const poor = fresh("monster"); poor.money = moneyFromPence(5);
  assert.throws(() => run(poor, "accept", "work-monster"), /资金不足/);
});

test("crafting deducts money and materials, yields sellable usable products and preserves progression gates", () => {
  for (const recipe of SPECIAL_RECIPES) {
    let game = fresh(recipe.pathwayId, recipe.maxSequence);
    const balance = moneyToPence(game.money);
    assert.throws(() => run(game, "craft", recipe.id), /材料/);
    game = run(game, "buy", recipe.id);
    assert.equal(moneyToPence(game.money), balance - recipe.cost);
    game = run(game, "craft", recipe.id);
    const item = game.inventory.at(-1);
    assert.equal(item.name, recipe.name);
    assert.equal(item.potion, undefined);
    assert.equal(game.specialActions.materials[recipe.id], 0);
    assert.throws(() => run(game, "craft", recipe.id), /材料/);
    const sold = run(migrateSave(game), "sell", item.instanceId);
    assert.equal(moneyToPence(sold.money), balance - recipe.cost + recipe.sale);
    assert.throws(() => run(sold, "sell", item.instanceId), /不在行囊/);
    if (recipe.stat) {
      assert.throws(() => run(game, "use", item.instanceId), /已满/);
      game.character.stats[recipe.stat] = 0;
      const used = run(game, "use", item.instanceId);
      assert.equal(used.character.stats[recipe.stat], recipe.delta);
      assert.ok(!used.inventory.find((entry) => entry.instanceId === item.instanceId));
      const ordinaryUse = executeToolCalls(game, [{ id: "bypass", name: "item.use", args: { instanceId: item.instanceId }, reason: "使用制作成品" }]);
      assert.equal(ordinaryUse.results[0].ok, false);
    }
  }
  const early = fresh("generalist", 8);
  assert.throws(() => run(early, "buy", "crafted-firearm"), /序列7/);
});

test("inventory capacity and status ticks are respected; watch outcomes stay unchanged", () => {
  let game = fresh("apothecary");
  game = run(game, "buy", "wound-salve");
  game.capacity.maxWeight = 0.01;
  assert.throws(() => run(game, "craft", "wound-salve"), /负重/);
  game.capacity.maxWeight = 12;
  game.statusEffects.push({ id: "bleeding", name: "失血", tick: { health: -1 } });
  const crafted = run(game, "craft", "wound-salve");
  assert.equal(crafted.character.stats.health, game.character.stats.health - 1);
  const assassin = fresh("assassin");
  assassin.triggerState.facts[SPECIAL_CONTACTS.watchOutcomeFact] = { value: "escaped-via-known-drain" };
  const before = structuredClone(assassin.triggerState.facts);
  assert.match(watchContactText(assassin), /排水道/);
  const accepted = run(assassin, "accept", "work-assassin");
  assert.match(accepted.recentDialogues.at(-1).content, /排水道/);
  assert.equal(accepted.triggerState.facts[SPECIAL_CONTACTS.watchOutcomeFact].value, before[SPECIAL_CONTACTS.watchOutcomeFact].value);
  assert.deepEqual(assassin.triggerState.facts, before);
});

test("old saves gain empty special state and new map rumors; private outcomes stay out of AI context", () => {
  const game = fresh("monster");
  delete game.specialActions;
  game.content.contentVersion = "2026.09.14.1";
  const loaded = migrateSave(game);
  assert.equal(loaded.specialActions.revision, 0);
  assert.equal(loaded.content.contentVersion, CONTENT_VERSION);
  assert.equal(loaded.locationKnowledge["divination-association"].status, "rumored");
  assert.equal(loaded.locationKnowledge["city-cemetery"].status, "rumored");
  const accepted = run(loaded, "accept", "work-monster");
  const context = visibleGameState(accepted);
  assert.equal(context.specialWork.active.roll, undefined);
  assert.equal(context.specialWork.active.options, undefined);
  assert.equal(actionGate(fresh("seer"), SPECIAL_RECIPES[0]), "当前途径不可用");
});
