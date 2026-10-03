import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_SYSTEM_PROMPT } from "../src/data/defaults.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { collectImportantItemConfirmations, createAuditBaseline, auditTurnChanges } from "../src/engine/audit.js";
import { buildRenderingContext } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";
import { migrateSave } from "../src/services/storage.js";
import { CONTENT_VERSION } from "../src/content/index.js";

const action = "服用已鉴定的魔药，正式晋升";
function fresh(sequence = 9, talent = "none") {
  return createInitialGame({ ...EMPTY_CHARACTER, name: "晋升验收员", talent,
    extraordinary: sequence === null ? "ordinary" : "low", pathway: sequence === null ? "无" : `占卜家（序列${sequence}）` });
}
function ready(sequence, talent = "none") {
  const game = fresh(sequence === 9 ? null : sequence + 1, talent);
  game.turn = 4;
  game.occult.contact = 1;
  game.character.stats.health = 3;
  game.character.stats.sanity = 2;
  game.character.stats.spirituality -= 4;
  game.inventory.push({ instanceId: `potion-${sequence}`, itemId: `potion-seer-${sequence}`, name: `占卜家序列${sequence}魔药`,
    category: "非凡物品", quantity: 1, importance: "important", tags: ["非凡物品"],
    potion: { pathwayId: "seer", sequence, identified: true } });
  game.clues.push({ id: `recipe-${sequence}`, title: `序列${sequence}配方`, detail: "已经核对过的完整配方", kind: "potion_recipe", pathwayId: "seer", sequence });
  const call = { id: `promote-${sequence}`, name: "advancement.promote", reason: "玩家明确选择服用魔药晋升",
    args: { pathwayId: "seer", sequence, potionInstanceId: `potion-${sequence}`, recipeClueId: `recipe-${sequence}`, evidence: "玩家主动服用已验证配方且已鉴定的魔药" } };
  return { game, call };
}
function promote(game, calls, options = {}) {
  const execution = executeToolCalls(game, calls, { playerAction: action, ...options });
  const progress = resolveTurnProgress(execution.game, action, "low", calls, execution.results);
  return { ...execution, progress };
}

test("every promotion grants the agreed spirituality amount and restores health and sanity", () => {
  for (const [sequence, growth] of [[9, 3], [8, 2], [7, 3], [6, 4], [5, 5], [4, 6], [3, 7], [2, 8], [1, 9], [0, 10]]) {
    const { game, call } = ready(sequence);
    const original = structuredClone(game);
    const result = promote(game, [call]);
    assert.equal(result.results[0].ok, true, `序列${sequence}`);
    const stats = result.game.character.stats;
    assert.equal(stats.spirituality, game.character.stats.spirituality + growth);
    assert.equal(stats.maxSpirituality, game.character.stats.maxSpirituality + growth);
    assert.equal(stats.maxSpirituality - stats.spirituality, 4);
    assert.equal(stats.health, 20);
    assert.equal(stats.sanity, 10);
    assert.equal(result.game.inventory.some(item => item.instanceId === call.args.potionInstanceId), false);
    assert.equal(result.results[0].data.advancement.spiritualGrowth, growth);
    assert.deepEqual(game, original, "preview execution must not mutate the saved original");
    assert.equal(fresh(sequence).character.stats.maxSpirituality, stats.maxSpirituality);
  }
});

test("promotion restores talent-adjusted maxima and clears only stat collapse statuses", () => {
  const { game, call } = ready(8, "hardy");
  game.character.stats = { ...game.character.stats, health: 0, sanity: 0, spirituality: 0, maxSanity: 13 };
  game.statusEffects = [
    ...["health", "sanity", "spirituality"].map(stat => ({ id: `collapse-${stat}`, name: stat, kind: "danger" })),
    { id: "curse", name: "尚未解除的诅咒", kind: "danger" },
  ];
  const result = promote(game, [call]);
  assert.equal(result.results[0].ok, true);
  assert.deepEqual(result.game.character.stats, { health: 22, maxHealth: 22, sanity: 13, maxSanity: 13, spirituality: 2, maxSpirituality: 10 });
  assert.deepEqual(result.game.statusEffects, [{ id: "curse", name: "尚未解除的诅咒", kind: "danger" }]);
  assert.equal(result.results[0].data.autoStatuses.length, 3);
});

test("promotion finishes at full health and sanity after same-turn damage; ongoing statuses still tick next turn", () => {
  const { game, call } = ready(8);
  game.statusEffects.push({ id: "bleeding", name: "失血与恐惧", kind: "danger", tick: { health: -2, sanity: -1, spirituality: -1 } });
  const calls = [call, { name: "character.update", args: { patch: { health: -30, sanity: -20 } }, reason: "晋升仪式中的额外消耗" }];
  const result = promote(game, calls);
  assert.ok(result.results.every(entry => entry.ok));
  assert.equal(result.game.character.stats.health, 20);
  assert.equal(result.game.character.stats.sanity, 10);
  assert.equal(result.game.character.stats.spirituality, 5);
  assert.deepEqual(result.game.statusEffects.map(status => status.id), ["bleeding"]);
  assert.deepEqual(result.progress.advancementRecovery.map(change => change.stat), ["health", "sanity"]);
  const resolution = createTurnResolution(calls, result.results, result.progress, result.game);
  assert.deepEqual(resolution.derivedEffects.advancementRecovery, result.progress.advancementRecovery);
  const later = resolveTurnProgress(result.game, "等待片刻", "low");
  assert.equal(result.game.character.stats.health, 18);
  assert.equal(result.game.character.stats.sanity, 9);
  assert.deepEqual(later.advancementRecovery, []);
});

test("declined, invalid, and replayed promotions neither restore stats nor consume another potion", () => {
  for (const rejected of ["declined", "missing recipe", "wrong sequence", "no player intent"]) {
    const { game, call } = ready(8);
    if (rejected === "missing recipe") game.clues = [];
    if (rejected === "wrong sequence") call.args.sequence = 7;
    const result = promote(game, [call], rejected === "declined" ? { blockedCallIndexes: [0] } : rejected === "no player intent" ? { playerAction: "观察房间" } : {});
    assert.equal(result.results[0].ok, false, rejected);
    assert.deepEqual(result.game.character, game.character);
    assert.deepEqual(result.game.inventory, game.inventory);
    assert.deepEqual(result.progress.advancementRecovery, []);
  }
  const { game, call } = ready(8);
  const accepted = promote(game, [call]);
  accepted.game.character.stats.health = 7;
  accepted.game.character.stats.sanity = 4;
  const replay = promote(accepted.game, [call]);
  assert.equal(replay.results[0].ok, false);
  assert.deepEqual(replay.game.character, accepted.game.character);
  assert.deepEqual(replay.progress.advancementRecovery, []);
});

test("confirmation, audit, and AI rendering agree on promotion gains and restoration", () => {
  const { game, call } = ready(8);
  const result = promote(game, [call]);
  const confirmation = collectImportantItemConfirmations([call], result.results)[0];
  assert.deepEqual(confirmation.advancement.statChanges, {
    health: { before: 3, after: 20 }, sanity: { before: 2, after: 10 },
    spirituality: { before: 4, after: 6 }, maxSpirituality: { before: 8, after: 10 },
  });
  const audit = auditTurnChanges(createAuditBaseline(game), result.game);
  assert.deepEqual(audit.character.stats.health, { before: 3, after: 20, delta: 17 });
  const resolution = createTurnResolution([call], result.results, result.progress, result.game);
  const context = buildRenderingContext(game, result.game, action, DEFAULT_SYSTEM_PROMPT, resolution);
  assert.match(JSON.stringify(context), /生命和理智恢复至各自上限/);
  assert.match(JSON.stringify(context), /spiritualGrowth/);
});

test("legacy saves receive stat differences exactly once without losing wounds, spiritual deficit, or progress", () => {
  const old = fresh(7, "sensitive");
  old.turn = 6;
  old.initialStatsVersion = 1;
  delete old.advancementStatsVersion;
  old.character.stats = { health: 7, maxHealth: 12, sanity: 4, maxSanity: 11, spirituality: 4, maxSpirituality: 12 };
  old.statusEffects.push({ id: "curse", name: "诅咒", tick: { sanity: -1 } });
  const original = structuredClone(old);
  const migrated = migrateSave(old);
  assert.deepEqual(migrated.character.stats, { health: 17, maxHealth: 22, sanity: 4, maxSanity: 11, spirituality: 7, maxSpirituality: 15 });
  for (const key of ["inventory", "money", "clues", "statusEffects"]) assert.deepEqual(migrated[key], old[key], key);
  assert.deepEqual(migrated.relationships.filter(person => person.id !== "sherlock-moriarty"), old.relationships);
  const advertisedDetectives = migrated.relationships.filter(person => person.id === "sherlock-moriarty");
  assert.equal(advertisedDetectives.length, 1);
  assert.equal(advertisedDetectives[0].contact, "heard");
  assert.equal(advertisedDetectives[0].value, 0);
  assert.deepEqual(advertisedDetectives[0].dossier.questIds, []);
  assert.doesNotMatch(JSON.stringify(advertisedDetectives), /克莱恩|愚者|序列|非凡/);
  assert.equal(migrated.turn, 6);
  assert.equal(migrated.initialStatsVersion, 2);
  assert.equal(migrated.advancementStatsVersion, 2);
  for (const key of ["character", "relationships", "statusEffects", "initialStatsVersion", "advancementStatsVersion"]) {
    assert.deepEqual(old[key], original[key], "stat migration must not mutate the raw save");
  }
  const reloaded = migrateSave(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(reloaded.character.stats, migrated.character.stats);
  assert.deepEqual(reloaded.statusEffects, migrated.statusEffects);
  assert.deepEqual(reloaded.relationships, migrated.relationships);
});

test("legacy spirituality catch-up covers all ranks and is independent of the health version", () => {
  const oldMaxima = [27, 23, 20, 17, 15, 13, 11, 10, 9, 8];
  const newMaxima = [62, 52, 43, 35, 28, 22, 17, 13, 10, 8];
  for (let sequence = 0; sequence <= 9; sequence += 1) {
    const old = fresh(sequence);
    delete old.advancementStatsVersion;
    old.character.stats.health = 7;
    old.character.stats.spirituality = oldMaxima[sequence] - 4;
    old.character.stats.maxSpirituality = oldMaxima[sequence];
    const migrated = migrateSave(old);
    assert.equal(migrated.character.stats.maxSpirituality, newMaxima[sequence]);
    assert.equal(migrated.character.stats.spirituality, newMaxima[sequence] - 4);
    assert.equal(migrated.character.stats.health, 7);
    assert.equal(migrated.character.stats.maxHealth, 20);
  }
  const { game, call } = ready(8);
  const promoted = promote(game, [call]).game;
  promoted.character.stats.health = 5;
  promoted.character.stats.sanity = 2;
  assert.deepEqual(migrateSave(promoted).character.stats, promoted.character.stats);
});

test("content migration exposes MI9 rumors without downgrading known headquarters", () => {
  for (const status of ["unknown", "rumored", "discovered", "visited"]) {
    const game = fresh();
    game.content.contentVersion = "2026.10.03.1";
    game.locationKnowledge["mi9-headquarters"] = { status, note: "已有笔记" };
    const migrated = migrateSave(game);
    assert.equal(migrated.locationKnowledge["mi9-headquarters"].status, status === "unknown" ? "rumored" : status);
    assert.equal(migrated.content.contentVersion, CONTENT_VERSION);
    if (status !== "unknown") assert.equal(migrated.locationKnowledge["mi9-headquarters"].note, "已有笔记");
    assert.equal(migrated.discoveredLocations.some(location => location.id === "mi9-headquarters"), false);
  }
});
