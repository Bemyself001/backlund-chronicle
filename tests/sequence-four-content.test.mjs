import assert from "node:assert/strict";
import test from "node:test";
import { PATHWAYS, getUnlockedAbilities, getSequenceName } from "../src/content/index.js";
import { abilityRule } from "../src/content/backlund/abilityRules.js";
import { SEQUENCE_FOUR_PROFILES, SEQUENCE_FOUR_POTIONS, SEQUENCE_FOUR_RESEARCH_SOURCES } from "../src/content/backlund/sequenceFour.js";
import { resolveAbilityUse } from "../src/engine/abilities.js";
import { normalizeInventoryItem, normalizePotion } from "../src/system/items.js";

const SEQUENCE_NAMES = [
  "诡法师", "秘法师", "操纵师", "灾难主祭", "无暗者", "预言家", "守夜人", "不死者",
  "猎魔者", "神秘学家", "炼金术士", "铁血骑士", "寄生者", "绝望", "律令法师", "堕落伯爵",
  "木偶", "魔鬼", "古代炼金师", "巫王", "厄运法师", "黑骑士",
];

function fresh(pathwayId, sequence = 4) {
  return {
    turn: 8,
    character: {
      advancement: { type: "extraordinary", pathwayId, sequence },
      stats: { health: 1, maxHealth: 101, sanity: 1, maxSanity: 100, spirituality: 50, maxSpirituality: 50 },
    },
    inventory: [],
    statusEffects: [],
    clues: [{ id: "evidence", title: "现场脚印", detail: "窗下的泥土留有鞋印。", analysisProgress: 0 }],
    combat: { enemies: [
      { id: "target", name: "对手", health: 101, maxHealth: 101, status: "active", lastActedTurn: -1, stunnedThroughTurn: -1 },
      { id: "bystander", name: "未选择目标", health: 101, maxHealth: 101, status: "active", lastActedTurn: -1, stunnedThroughTurn: -1 },
    ] },
  };
}

const demigodAbilities = pathwayId => getUnlockedAbilities(pathwayId, 4).filter(ability => ability.sequence === 4);
const targetId = ability => ability.target.kind === "enemy" ? "target" : ability.target.kind === "clue" ? "evidence" : undefined;

test("all 22 sequence-four profiles match the existing canonical names and retain pathway order", () => {
  const pathwayIds = PATHWAYS.map(pathway => pathway.id);
  assert.deepEqual(Object.keys(SEQUENCE_FOUR_PROFILES), pathwayIds);
  assert.deepEqual(Object.values(SEQUENCE_FOUR_PROFILES).map(profile => profile.sequenceName), SEQUENCE_NAMES);
  assert.deepEqual(Object.keys(SEQUENCE_FOUR_RESEARCH_SOURCES), pathwayIds);
  for (const pathway of PATHWAYS) {
    const profile = SEQUENCE_FOUR_PROFILES[pathway.id];
    assert.equal(profile.sequenceName, getSequenceName(pathway.id, 4));
    assert.equal(profile.potionName, `${profile.sequenceName}魔药`);
    assert.ok(profile.summary.length >= 20, pathway.id);
    assert.match(SEQUENCE_FOUR_RESEARCH_SOURCES[pathway.id], /^https:\/\/lordofthemysteries\.fandom\.com\/wiki\/.+_Pathway\/Abilities$/);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(SEQUENCE_FOUR_PROFILES)), SEQUENCE_FOUR_PROFILES);
});

test("sequence-four potions are recognized important consumables without a shared instance identity", () => {
  assert.equal(SEQUENCE_FOUR_POTIONS.length, 22);
  assert.equal(new Set(SEQUENCE_FOUR_POTIONS.map(potion => potion.itemId)).size, 22);
  for (const [index, potion] of SEQUENCE_FOUR_POTIONS.entries()) {
    const pathway = PATHWAYS[index];
    assert.equal(potion.itemId, `potion-${pathway.id}-4`);
    assert.equal(potion.name, SEQUENCE_FOUR_PROFILES[pathway.id].potionName);
    assert.equal(potion.category, "魔药");
    assert.equal(potion.rarity, "半神");
    assert.equal(potion.importance, "important");
    assert.equal(potion.quantity, 1);
    assert.equal(potion.weight, 0.2);
    assert.deepEqual(potion.tags, ["魔药", "消耗品", "非凡物品"]);
    assert.equal(Object.hasOwn(potion, "instanceId"), false);
    assert.deepEqual(potion.potion, { pathwayId: pathway.id, sequence: 4, identified: true });
    assert.match(potion.description, /同途径序列5.*服用晋升/);
    assert.deepEqual(normalizePotion(potion), { pathwayId: pathway.id, pathwayName: pathway.name, sequence: 4, identified: true });
    const normalized = normalizeInventoryItem(potion);
    assert.equal(normalized.importance, "important");
    assert.equal(normalized.potion.sequence, 4);
    assert.equal(normalized.potion.identified, true);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(SEQUENCE_FOUR_POTIONS)), SEQUENCE_FOUR_POTIONS);
});

test("sequence four adds two abilities to every pathway while preserving sequence-nine through five growth", () => {
  const abilityIds = [];
  for (const pathway of PATHWAYS) {
    const ranks = [9, 8, 7, 6, 5, 4].map(sequence => getUnlockedAbilities(pathway.id, sequence));
    assert.deepEqual(ranks.map(abilities => abilities.length), [3, 3, 4, 4, 5, 7], pathway.id);
    assert.deepEqual(ranks[5].slice(0, 5), ranks[4], `${pathway.id}: old rules must remain unchanged`);
    const added = demigodAbilities(pathway.id);
    assert.equal(added.length, 2);
    assert.ok(added.every(ability => !ranks[4].some(old => old.id === ability.id)));
    for (let sequence = 3; sequence >= 0; sequence--) assert.deepEqual(getUnlockedAbilities(pathway.id, sequence), ranks[5]);
    abilityIds.push(...ranks[5].map(ability => ability.id));
  }
  assert.equal(new Set(abilityIds).size, abilityIds.length);
});

test("the new demigod rule tier keeps costs, targets and magnitudes local and fixed", () => {
  const targets = { damage: "enemy", stun: "enemy", control: "enemy", analysis: "clue", health: "self", sanity: "self" };
  for (const pathway of PATHWAYS) for (const ability of demigodAbilities(pathway.id)) {
    assert.equal(ability.cost, 4, ability.id);
    assert.equal(ability.kind, "active");
    assert.equal(ability.cooldown, 1);
    assert.equal(ability.target.kind, targets[ability.rule.effect]);
    assert.match(ability.description, /原著职业特色的游戏改编/);
    assert.match(ability.description, /消耗4点灵性/);
    if (ability.rule.effect === "damage") {
      assert.equal(ability.rule.damagePercent, 55);
      assert.equal(ability.rule.amount, undefined);
    }
    if (ability.rule.effect === "health") assert.equal(ability.rule.healPercent, 40);
    if (ability.rule.effect === "analysis") assert.equal(ability.rule.amount, 4);
    if (ability.rule.effect === "sanity") assert.equal(ability.rule.amount, 5);
    if (ability.rule.effect === "stun") assert.equal(ability.rule.duration, 2);
  }
  assert.equal(abilityRule("damage", 4, true).damagePercent, 60);
});

test("previous active rule tiers preserve their costs, percentages and one-turn control", () => {
  for (const [sequence, cost, damagePercent, healPercent, analysis] of [[9, 1, 20, 10, 1], [8, 1, 20, 10, 1], [7, 2, 30, 20, 2], [6, 2, 30, 20, 2], [5, 3, 50, 30, 3]]) {
    assert.deepEqual(abilityRule("damage", sequence), { effect: "damage", target: { kind: "enemy" }, cost, damagePercent, duration: 0 });
    assert.equal(abilityRule("health", sequence).healPercent, healPercent);
    assert.equal(abilityRule("analysis", sequence).amount, analysis);
    assert.equal(abilityRule("stun", sequence).duration, 1);
    assert.equal(abilityRule("damage", sequence, true).damagePercent, damagePercent + 10);
  }
});

test("all 44 new abilities execute locally, ignore invented magnitudes and use one major action", () => {
  for (const pathway of PATHWAYS) for (const ability of demigodAbilities(pathway.id)) {
    const game = fresh(pathway.id);
    const originalDetail = game.clues[0].detail;
    const result = resolveAbilityUse(game, { abilityId: ability.id, targetId: targetId(ability), amount: 999, damagePercent: 100, healPercent: 100, duration: 99, cost: 0 });
    assert.equal(result.ok, true, ability.id);
    assert.equal(game.character.stats.spirituality, 46, ability.id);
    assert.equal(game.character.mainActionLastUsedTurn, 9);
    assert.equal(game.clues[0].detail, originalDetail);
    assert.equal(game.clues.length, 1);
    assert.equal(game.inventory.length, 0);
    assert.equal(game.combat.enemies[1].health, 101);
    assert.equal(game.combat.enemies[1].stunnedThroughTurn, -1);
    const effect = ability.rule.effect;
    if (effect === "damage") {
      assert.equal(result.data.abilityEffect.damage, 56);
      assert.equal(game.combat.enemies[0].health, 45);
    } else if (effect === "stun") {
      assert.equal(game.combat.enemies[0].stunnedThroughTurn, 10);
    } else if (effect === "control") {
      assert.equal(game.character.abilityControl.target, 1);
      assert.equal(game.combat.enemies[0].stunnedThroughTurn, -1);
    } else if (effect === "analysis") {
      assert.equal(game.clues[0].analysisProgress, 4);
    } else if (effect === "health") {
      assert.equal(game.character.stats.health, 41);
    } else if (effect === "sanity") {
      assert.equal(game.character.stats.sanity, 6);
    }
    const after = structuredClone(game);
    assert.equal(resolveAbilityUse(game, { abilityId: ability.id, targetId: targetId(ability) }).ok, false);
    assert.deepEqual(game, after);
  }
});

test("locked demigod abilities, insufficient spirituality and unknown targets fail atomically", () => {
  for (const pathway of PATHWAYS) for (const ability of demigodAbilities(pathway.id)) {
    for (const reason of ["locked", "cost", ...(ability.target.kind === "self" ? [] : ["target"])]) {
      const game = fresh(pathway.id, reason === "locked" ? 5 : 4);
      if (reason === "cost") game.character.stats.spirituality = 3;
      const before = structuredClone(game);
      assert.equal(resolveAbilityUse(game, { abilityId: ability.id, targetId: reason === "target" ? "invented-target" : targetId(ability) }).ok, false, `${ability.id}: ${reason}`);
      assert.deepEqual(game, before);
    }
  }
});

test("sequence-four control only stuns after three paid actions and never creates permanent servants", () => {
  for (const pathwayId of ["spectator", "marauder"]) {
    const ability = demigodAbilities(pathwayId).find(entry => entry.rule.effect === "control");
    const game = fresh(pathwayId);
    for (const turn of [9, 11, 14]) {
      assert.equal(resolveAbilityUse(game, { abilityId: ability.id, targetId: "target", amount: 3 }, { turn }).ok, true);
    }
    assert.equal(game.character.stats.spirituality, 38);
    assert.equal(game.character.abilityControl.target, 0);
    assert.equal(game.combat.enemies[0].stunnedThroughTurn, 15);
    assert.equal(game.combat.enemies[0].status, "active");
    assert.equal(game.combat.enemies.length, 2);
    assert.equal(game.people, undefined);
  }
});

test("demigod healing caps at maximum health and cannot revive a collapsed character", () => {
  for (const pathway of PATHWAYS) for (const ability of demigodAbilities(pathway.id).filter(entry => entry.rule.effect === "health")) {
    const game = fresh(pathway.id);
    game.character.stats.health = 100;
    assert.equal(resolveAbilityUse(game, { abilityId: ability.id }).data.abilityEffect.healing, 1);
    assert.equal(game.character.stats.health, 101);
    const collapsed = fresh(pathway.id);
    collapsed.character.stats.health = 0;
    const before = structuredClone(collapsed);
    assert.equal(resolveAbilityUse(collapsed, { abilityId: ability.id }).ok, false);
    assert.deepEqual(collapsed, before);
  }
});
