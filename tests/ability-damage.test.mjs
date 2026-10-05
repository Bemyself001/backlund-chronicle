import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_VERSION, PATHWAYS, getUnlockedAbilities } from "../src/content/index.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { resolveAbilityUse } from "../src/engine/abilities.js";
import { executeCombatTool } from "../src/engine/combat.js";
import { migrateSave } from "../src/services/storage.js";
import { initialCharacterStats } from "../src/system/characterStats.js";

function encounter(pathwayId, maxHealth, health = maxHealth) {
  const advancement = { type: "extraordinary", pathwayId, sequence: 5 };
  return {
    turn: 3,
    character: { advancement, stats: initialCharacterStats(advancement) },
    statusEffects: [],
    combat: { enemies: [
      { id: "target", name: "目标", maxHealth, health, status: "active" },
      { id: "other", name: "另一名敌人", maxHealth: 100, health: 100, status: "active" },
    ] },
  };
}

test("every damaging skill scales to maximum HP, rounds up and caps damage at remaining HP", () => {
  const cases = [
    { maxHealth: 1, health: 1, expected: { 7: 1, 5: 1 } },
    { maxHealth: 20, health: 20, expected: { 7: 6, 5: 10 } },
    { maxHealth: 100, health: 100, expected: { 7: 30, 5: 50 } },
    { maxHealth: 101, health: 101, expected: { 7: 31, 5: 51 } },
    { maxHealth: 1_000_000, health: 1_000_000, expected: { 7: 300_000, 5: 500_000 } },
    { maxHealth: 100, health: 35, expected: { 7: 30, 5: 50 } },
  ];
  for (const pathway of PATHWAYS) {
    for (const ability of getUnlockedAbilities(pathway.id, 5).filter(entry => entry.rule.effect === "damage")) {
      const percent = ability.sequence === 5 ? 50 : 30;
      assert.equal(ability.rule.damagePercent, percent, ability.id);
      assert.equal(ability.rule.amount, undefined, "damage must not expose an ambiguous point amount");
      assert.ok(ability.description.includes(`最大生命值${percent}%`), ability.id);
      for (const { maxHealth, health, expected } of cases) {
        const game = encounter(pathway.id, maxHealth, health);
        const spirituality = game.character.stats.spirituality;
        const result = resolveAbilityUse(game, { abilityId: ability.id, targetId: "target", amount: 999, damagePercent: 100 });
        const damage = Math.min(health, expected[ability.sequence]);
        assert.equal(result.ok, true, ability.id);
        assert.equal(result.data.abilityEffect.requestedDamage, expected[ability.sequence], ability.id);
        assert.equal(result.data.abilityEffect.damage, damage, ability.id);
        assert.equal(result.data.abilityEffect.maxHealth, maxHealth);
        assert.equal(game.combat.enemies[0].health, health - damage);
        assert.equal(game.combat.enemies[0].status, health === damage ? "defeated" : "active");
        assert.equal(game.combat.enemies[1].health, 100, "only the selected enemy takes damage");
        assert.equal(game.character.stats.spirituality, spirituality - ability.cost);
        assert.ok(result.log.includes(`${percent}%`));
        assert.ok(result.log.includes(`受到${damage}点伤害`));
      }
    }
  }
});

test("successive casts use the same maximum HP and a defeated target cannot retaliate or consume another cast", () => {
  const game = encounter("warrior", 101);
  const args = { abilityId: "warrior:guardian_strike", targetId: "target" };
  const first = resolveAbilityUse(game, args, { turn: 4 });
  assert.equal(first.data.abilityEffect.damage, 51);
  assert.equal(game.combat.enemies[0].health, 50);
  const second = resolveAbilityUse(game, args, { turn: 5 });
  assert.equal(second.data.abilityEffect.requestedDamage, 51);
  assert.equal(second.data.abilityEffect.damage, 50);
  assert.equal(game.combat.enemies[0].health, 0);
  assert.equal(game.combat.enemies[0].status, "defeated");
  const defeated = structuredClone(game);
  assert.equal(executeCombatTool(game, "enemy.act", { enemyId: "target", damage: 3, action: "反击" }, { turn: 5 }).ok, false);
  assert.equal(resolveAbilityUse(game, args, { turn: 6 }).ok, false);
  assert.deepEqual(game, defeated);
});

test("reloading a save replaces legacy flat-damage rules while retaining money, injuries and ability cooldown", () => {
  const saved = createInitialGame({ ...EMPTY_CHARACTER, name: "旧档测试员", extraordinary: "low", pathway: "战士（序列5）" });
  saved.content.contentVersion = "2026.10.03.3";
  saved.turn = 3;
  saved.money = { pounds: 8, solers: 2, pence: 1 };
  saved.combat = encounter("warrior", 101, 63).combat;
  saved.character.abilityLastUsedTurn = 3;
  saved.character.stats.spirituality -= 2;
  for (const ability of saved.character.advancement.unlockedAbilities.filter(entry => entry.rule.effect === "damage")) {
    delete ability.rule.damagePercent;
    ability.rule.amount = ability.sequence === 5 ? 8 : 6;
    ability.description = `对目标造成${ability.rule.amount}点伤害`;
  }
  const loaded = migrateSave(JSON.parse(JSON.stringify(saved)));
  assert.equal(loaded.content.contentVersion, CONTENT_VERSION);
  assert.deepEqual(loaded.money, saved.money);
  assert.deepEqual(loaded.character.stats, saved.character.stats);
  assert.equal(loaded.combat.enemies[0].health, 63);
  assert.equal(loaded.character.abilityLastUsedTurn, 3);
  const abilities = loaded.character.advancement.unlockedAbilities.filter(entry => entry.rule.effect === "damage");
  assert.deepEqual(abilities.map(ability => ability.rule.damagePercent), [30, 50]);
  assert.ok(abilities.every(ability => ability.rule.amount === undefined));
  const result = resolveAbilityUse(loaded, { abilityId: "warrior:guardian_strike", targetId: "target" });
  assert.equal(result.ok, true);
  assert.equal(result.data.abilityEffect.damage, 51);
  assert.equal(loaded.combat.enemies[0].health, 12);
});
