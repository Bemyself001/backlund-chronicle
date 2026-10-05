import assert from "node:assert/strict";
import test from "node:test";
import { PATHWAYS, getUnlockedAbilities, getSequenceName } from "../src/content/index.js";
import { applyAdvancement, getAdvancement } from "../src/system/character.js";
import { initialCharacterStats, totalRankGrowth } from "../src/system/characterStats.js";
import { migrateCharacterStatRules } from "../src/services/statMigrations.js";
import { getPotionUseGate, ensureRequestedAdvancementToolCall } from "../src/services/advancement.js";
import { normalizeInventoryItem, normalizePotion, isPotion, playerVisibleItem } from "../src/system/items.js";
import { identifyPotion, identificationGate } from "../src/engine/potionIdentification.js";
import { abilityAvailability, resolveAbilityUse, passiveAbilityModifier } from "../src/engine/abilities.js";
import { isExplicitAdvancementIntent } from "../src/system/character.js";

function character(sequence = 9, pathwayId = "seer") {
  const advancement = sequence === null ? { type: "ordinary" } : { type: "extraordinary", pathwayId, sequence };
  return { advancement, stats: initialCharacterStats(advancement) };
}
function game(sequence = 9, pathwayId = "seer") {
  return { turn: 3, character: character(sequence, pathwayId), inventory: [], money: { pounds: 2, solers: 0, pence: 0 }, location: { id: "minsk-street-15" }, statusEffects: [], clues: [{ id: "clue", title: "已知脚印", detail: "泥土中有鞋印。" }], combat: { enemies: [{ id: "enemy", name: "袭击者", health: 20, maxHealth: 20, status: "active", lastActedTurn: -1, stunnedThroughTurn: -1 }] } };
}
function bottle(extra = {}) {
  return { instanceId: "bottle", name: "占卜家魔药", itemId: "hidden-seer", quantity: 1, potion: { pathwayId: "seer", sequence: 9, identified: false }, ...extra };
}
const identificationConsent = { playerAction: "请夏洛克鉴定这瓶魔药，我同意支付1镑。" };
function prepareIdentification(state) {
  state.combat.enemies = [];
  state.triggerState = { facts: { "person.sherlock-moriarty.met": { value: true } } };
  return state;
}

test("all 22 pathways have stable 3/3/4/4/5 ability growth and named ranks", () => {
  assert.equal(PATHWAYS.length, 22);
  for (const pathway of PATHWAYS) {
    const ranks = [9, 8, 7, 6, 5].map(rank => getUnlockedAbilities(pathway.id, rank));
    assert.deepEqual(ranks.map(list => list.length), [3, 3, 4, 4, 5]);
    for (let index = 1; index < ranks.length; index++) {
      assert.deepEqual(ranks[index].slice(0, ranks[index - 1].length).map(a => a.id), ranks[index - 1].map(a => a.id));
    }
    for (const [earlier, later] of [[0, 1], [2, 3]]) {
      assert.equal(ranks[earlier].filter((a, i) => JSON.stringify(a.rule) !== JSON.stringify(ranks[later][i].rule)).length, 1);
    }
    for (let sequence = 4; sequence >= 0; sequence--) assert.deepEqual(getUnlockedAbilities(pathway.id, sequence), ranks[4]);
    for (let sequence = 0; sequence <= 9; sequence++) assert.equal(getSequenceName(pathway.id, sequence), pathway.sequences[9 - sequence]);
  }
});

test("promotion grows all maxima by each rank and preserves spirituality deficit", () => {
  let current = character(null);
  assert.deepEqual(current.stats, { health: 20, maxHealth: 20, sanity: 10, maxSanity: 10, spirituality: 5, maxSpirituality: 5 });
  for (let sequence = 9; sequence >= 0; sequence--) {
    current.stats.health = 1;
    current.stats.sanity = 1;
    current.stats.spirituality = current.stats.maxSpirituality - 2;
    const promoted = applyAdvancement(current, "seer", sequence, "test");
    assert.ok(promoted);
    assert.equal(promoted.stats.health, 20 + totalRankGrowth(sequence));
    assert.equal(promoted.stats.sanity, 10 + totalRankGrowth(sequence));
    assert.equal(promoted.stats.maxSpirituality - promoted.stats.spirituality, 2);
    assert.equal(getAdvancement(promoted).sequenceName, getSequenceName("seer", sequence));
    assert.equal(applyAdvancement(promoted, "seer", sequence, "duplicate"), null);
    current = promoted;
  }
  assert.equal(applyAdvancement(character(null), "seer", 8), null);
  assert.equal(applyAdvancement(character(9), "warrior", 8), null);
});

test("independent migration retains talent maxima, wound deficits and zero collapse without repeated bonuses", () => {
  const state = game(7);
  state.initialStatsVersion = 2;
  state.advancementStatsVersion = 2;
  state.character.stats = { health: 8, maxHealth: 22, sanity: 0, maxSanity: 13, spirituality: 4, maxSpirituality: 13 };
  state.statusEffects = [{ id: "curse", name: "诅咒" }];
  migrateCharacterStatRules(state);
  assert.deepEqual(state.character.stats, { health: 13, maxHealth: 27, sanity: 0, maxSanity: 18, spirituality: 4, maxSpirituality: 13 });
  assert.ok(state.statusEffects.some(status => status.id === "curse"));
  const once = structuredClone(state);
  migrateCharacterStatRules(state);
  assert.deepEqual(state, once);
});

test("a pre-base-stat-version collapsed save is never revived by any migration layer", () => {
  const state = game(7);
  state.character.stats = { health: 0, maxHealth: 12, sanity: 0, maxSanity: 11, spirituality: 0, maxSpirituality: 10 };
  migrateCharacterStatRules(state);
  assert.equal(state.character.stats.health, 0);
  assert.equal(state.character.stats.sanity, 0);
  assert.equal(state.character.stats.maxHealth, 27);
  assert.equal(state.character.stats.maxSanity, 16);
  assert.ok(state.statusEffects.some(status => status.id === "collapse-health"));
  assert.ok(state.statusEffects.some(status => status.id === "collapse-sanity"));
});

test("potion recognition covers rank names, explicit ranks, unknowns and exclusion cases", () => {
  for (const pathway of PATHWAYS) for (let sequence = 0; sequence <= 9; sequence++) {
    assert.deepEqual(normalizePotion({ name: `${getSequenceName(pathway.id, sequence)}魔药` }), { pathwayId: pathway.id, pathwayName: pathway.name, sequence, identified: true });
    assert.equal(normalizePotion({ name: `${pathway.name}序列${sequence}魔药` }).sequence, sequence);
  }
  for (const name of ["占卜家魔药配方", "小丑魔药材料", "魔药空瓶", "魔药教授的药膏", "魔药笔记"]) assert.equal(isPotion({ name }), false, name);
  assert.deepEqual(normalizePotion({ name: "神秘魔药" }), { identified: false });
  assert.equal(normalizePotion(bottle()).identified, false);
  assert.deepEqual(normalizePotion(bottle({ potion: { pathwayId: "fake", sequence: 9, identified: true } })), { identified: false });
  assert.equal(normalizeInventoryItem({ name: "小丑魔药" }).importance, "important");
});

test("unidentified public projection reveals neither hidden names nor nested identity", () => {
  const visible = playerVisibleItem(bottle({ description: "seer占卜家", tags: ["占卜家"], hiddenInfo: "seer", properties: { pathwayId: "seer" }, discoveredInfo: "占卜家" }));
  assert.doesNotMatch(JSON.stringify(visible), /seer|占卜家|pathwayId/);
  assert.equal(visible.potionStatus, "unidentified");
});

test("finished potions need no contact or recipe but obey sequential same-path advancement", () => {
  const state = game(null);
  state.inventory = [bottle({ potion: { pathwayId: "seer", sequence: 9, identified: true } })];
  assert.equal(getPotionUseGate(state, "bottle"), "");
  assert.equal(ensureRequestedAdvancementToolCall([], { potionInstanceId: "bottle" }, 4, state)[0].name, "advancement.promote");
  state.inventory[0].potion.sequence = 8;
  assert.match(getPotionUseGate(state, "bottle"), /普通人/);
  state.character = character(9);
  assert.equal(getPotionUseGate(state, "bottle"), "");
  state.inventory[0].potion.pathwayId = "warrior";
  assert.match(getPotionUseGate(state, "bottle"), /当前途径/);
  state.inventory[0].potion.pathwayId = "seer";
  state.inventory[0].potion.sequence = 7;
  assert.match(getPotionUseGate(state, "bottle"), /跳级/);
});

test("identification charges exactly one pound and splits only one potion from a stack", () => {
  const state = prepareIdentification(game(null));
  state.inventory = [bottle({ quantity: 3 })];
  const result = identifyPotion(state, { instanceId: "bottle", feePence: 240, pathwayId: "warrior", sequence: 0 }, identificationConsent);
  assert.equal(result.ok, true);
  assert.deepEqual(state.money, { pounds: 1, solers: 0, pence: 0 });
  assert.equal(state.inventory[0].quantity, 2);
  assert.equal(state.inventory[0].potion.identified, false);
  assert.equal(state.inventory[1].quantity, 1);
  assert.equal(state.inventory[1].potion.pathwayId, "seer");
  assert.equal(state.inventory[1].potion.identified, true);
  const before = structuredClone(state);
  assert.equal(identifyPotion(state, { instanceId: state.inventory[1].instanceId, feePence: 240 }, identificationConsent).ok, false);
  assert.deepEqual(state, before);
});

test("untrusted identity, wrong location or insufficient funds never charge or mutate", () => {
  for (const failure of ["identity", "location", "money"]) {
    const state = prepareIdentification(game());
    state.inventory = [bottle()];
    if (failure === "identity") state.inventory[0] = { instanceId: "bottle", name: "未知魔药", quantity: 1 };
    if (failure === "location") state.location.id = "elsewhere";
    if (failure === "money") state.money.pounds = 0;
    assert.ok(identificationGate(state, "bottle"));
    const before = structuredClone(state);
    assert.equal(identifyPotion(state, { instanceId: "bottle", feePence: 240, pathwayId: "seer", sequence: 9 }, identificationConsent).ok, false);
    assert.deepEqual(state, before);
  }
});

test("ability execution uses local costs and damage percentages, rejects wrong targets and repeat casts atomically", () => {
  const state = game(7, "warrior");
  const ability = getUnlockedAbilities("warrior", 7)[3];
  const initialSpirituality = state.character.stats.spirituality;
  const wrongTarget = structuredClone(state);
  assert.equal(resolveAbilityUse(state, { abilityId: ability.id, targetId: "missing" }).ok, false);
  assert.deepEqual(state, wrongTarget);
  const result = resolveAbilityUse(state, { abilityId: ability.id, targetId: "enemy", amount: 999, damagePercent: 100, cost: 0 });
  assert.equal(result.ok, true);
  assert.equal(state.combat.enemies[0].health, 14);
  assert.equal(result.data.abilityEffect.damagePercent, 30);
  assert.equal(state.character.stats.spirituality, initialSpirituality - ability.rule.cost);
  const before = structuredClone(state);
  assert.match(abilityAvailability(state, ability.id, "enemy"), /已经使用/);
  assert.equal(resolveAbilityUse(state, { abilityId: ability.id, targetId: "enemy" }).ok, false);
  assert.deepEqual(state, before);
});

test("analysis develops only existing evidence; spirit threads require three paid casts", () => {
  const analyst = game(7, "generalist");
  const originalDetail = analyst.clues[0].detail;
  assert.equal(resolveAbilityUse(analyst, { abilityId: "generalist:artifact_analysis", targetId: "clue" }).ok, true);
  assert.equal(analyst.clues[0].analysisProgress, 2);
  assert.equal(analyst.clues[0].detail, originalDetail);
  assert.equal(analyst.clues.length, 1);
  const state = game(5);
  for (let turn = 5; turn <= 7; turn++) {
    assert.equal(resolveAbilityUse(state, { abilityId: "seer:spirit_threads", targetId: "enemy" }, { turn }).ok, true);
    assert.equal(state.combat.enemies[0].stunnedThroughTurn, turn === 7 ? 8 : -1);
  }
});

test("initial abilities are passive thematic checks, upgraded once and never direct healing or stun", () => {
  for (const pathway of PATHWAYS) {
    const state = game(9, pathway.id);
    for (const ability of getUnlockedAbilities(pathway.id, 9)) {
      assert.equal(ability.kind, "passive");
      assert.equal(passiveAbilityModifier(state, ability.id, ability.rule.checkKind), 1);
      assert.equal(passiveAbilityModifier(state, ability.id, "invalid"), 0);
      const before = structuredClone(state);
      assert.equal(resolveAbilityUse(state, { abilityId: ability.id, targetId: "enemy" }).ok, false);
      assert.deepEqual(state, before);
    }
    const upgraded = game(5, pathway.id);
    const abilities = getUnlockedAbilities(pathway.id, 5);
    assert.deepEqual(abilities.slice(0, 3).map(ability => passiveAbilityModifier(upgraded, ability.id, ability.rule.checkKind)), [2, 3, 1]);
  }
});

test("negated or planned promotion cannot authorize consuming a potion", () => {
  for (const action of ["我不喝下魔药", "考虑服用魔药", "明天正式晋升", "能否服用魔药？", "取消晋升"]) assert.equal(isExplicitAdvancementIntent(action), false, action);
  assert.equal(isExplicitAdvancementIntent("现在喝下魔药，正式晋升"), true);
});

test("deterministic requests remove duplicate promotions and duplicate potion consumption", () => {
  const state = game(null);
  state.inventory = [bottle({ potion: { pathwayId: "seer", sequence: 9, identified: true } })];
  const calls = ensureRequestedAdvancementToolCall([
    { name: "advancement.promote", args: {} }, { name: "advancement__promote", args: {} },
    { name: "item.use", args: { instanceId: "bottle" } }, { name: "inventory.remove", args: { itemId: "hidden-seer" } },
    { name: "money.inspect", args: {} },
  ], { potionInstanceId: "bottle" }, 4, state);
  assert.deepEqual(calls.map(call => call.name), ["advancement.promote", "money.inspect"]);
});

test("identification requires meeting, no active enemies and explicit exact-fee consent", () => {
  for (const failure of ["meeting", "combat", "fee", "consent", "negative"]) {
    const state = prepareIdentification(game());
    state.inventory = [bottle()];
    if (failure === "meeting") state.triggerState.facts = {};
    if (failure === "combat") state.combat = game().combat;
    const before = structuredClone(state);
    const args = { instanceId: "bottle", feePence: failure === "fee" ? 1 : 240 };
    const context = failure === "consent" ? {} : failure === "negative" ? { playerAction: "我不同意支付1镑鉴定" } : identificationConsent;
    assert.equal(identifyPotion(state, args, context).ok, false, failure);
    assert.deepEqual(state, before);
  }
});

test("stack identification cannot double-charge within one turn, but can identify next turn", () => {
  const state = prepareIdentification(game());
  state.inventory = [bottle({ quantity: 3 })];
  const args = { instanceId: "bottle", feePence: 240 };
  assert.equal(identifyPotion(state, args, { ...identificationConsent, turn: 4 }).ok, true);
  const once = structuredClone(state);
  assert.equal(identifyPotion(state, args, { ...identificationConsent, turn: 4 }).ok, false);
  assert.deepEqual(state, once);
  state.turn = 4;
  assert.equal(identifyPotion(state, args, { ...identificationConsent, turn: 5 }).ok, true);
  assert.equal(state.money.pounds, 0);
  assert.equal(state.inventory.filter(item => item.potion.identified).length, 2);
});

test("fallen characters and malformed stack quantities never spend money or spirituality", () => {
  for (const quantity of [-1, 0, 1.5, NaN, "1"]) {
    const state = prepareIdentification(game());
    state.inventory = [bottle({ quantity })];
    const before = structuredClone(state);
    assert.equal(identifyPotion(state, { instanceId: "bottle", feePence: 240 }, identificationConsent).ok, false);
    assert.ok(getPotionUseGate(state, "bottle"));
    assert.deepEqual(state, before);
  }
  for (const stat of ["health", "sanity"]) {
    const state = prepareIdentification(game(7, "warrior"));
    state.inventory = [bottle()];
    state.character.stats[stat] = 0;
    const before = structuredClone(state);
    assert.equal(identifyPotion(state, { instanceId: "bottle", feePence: 240 }, identificationConsent).ok, false);
    assert.equal(resolveAbilityUse(state, { abilityId: "warrior:weapon_mastery", targetId: "enemy" }).ok, false);
    assert.deepEqual(state, before);
  }
});

test("control progress is explicitly cumulative across separated turns and stays target-specific", () => {
  const state = game(5);
  state.combat.enemies.push({ ...state.combat.enemies[0], id: "other" });
  for (const [turn, targetId] of [[4, "enemy"], [20, "other"], [30, "enemy"], [50, "enemy"]]) {
    state.character.stats.spirituality = state.character.stats.maxSpirituality;
    assert.equal(resolveAbilityUse(state, { abilityId: "seer:spirit_threads", targetId }, { turn }).ok, true);
  }
  assert.equal(state.combat.enemies[0].stunnedThroughTurn, 51);
  assert.equal(state.combat.enemies[1].stunnedThroughTurn, -1);
  assert.equal(state.character.abilityControl.other, 1);
});
