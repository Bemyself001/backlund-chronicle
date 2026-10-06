import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, DEFAULT_API_SETTINGS, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { getUnlockedAbilities } from "../src/content/index.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { WEAPON_QUALITIES, equippedWeapon, weaponProfile } from "../src/system/weapons.js";
import { BASIC_ATTACK_RULE } from "../src/system/healthRules.js";
import { actionPreview } from "../src/system/combatActions.js";
import { weakPointAssessment } from "../src/system/weakPoints.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { executeCombatTool } from "../src/engine/combat.js";
import { resolveAbilityUse } from "../src/engine/abilities.js";
import { migrateSave } from "../src/services/storage.js";
import { ensurePlayerActionTools } from "../src/services/playerActions.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { specialState } from "../src/engine/specialActions.js";
import { buildPlanningContext, visibleGameState } from "../src/services/memory.js";
import { requestAI } from "../src/services/api.js";

const call = (name, args, id = name) => ({ id, name, args, reason: "玩家实际购买或执行该行动" });
const assessment = { name: "喉咙", evidence: "对方是人类，颈部没有护甲且在本次近距离攻击范围内。" };
const action = "我用武器攻击对手暴露的喉咙";
const newGun = { itemId: "revolver", name: "普通左轮手枪", description: "普通枪械。", rarity: "普通", weight: 1, weapon: { kind: "firearm", quality: "common" } };
const weapon = (kind = "firearm", bonusPercent = 15, quality = "common", instanceId = "weapon") => normalizeInventoryItem({
  instanceId, itemId: instanceId, name: kind === "firearm" ? "普通左轮手枪" : "普通长剑", quantity: 1, weight: 1,
  equipped: true, rarity: "普通", description: "测试武器", condition: "良好", tags: ["装备"],
  weapon: { version: 1, kind, quality, bonusPercent },
});
function fresh(pathway = "囚犯（序列7）", maxHealth = 100) {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "武器测试员", extraordinary: "low", pathway });
  executeCombatTool(game, "enemy.encounter", { enemies: [{ id: "foe", name: "人类对手", maxHealth }] });
  return game;
}
function equipFixture(game, item = weapon()) {
  game.inventory.push(item);
  game.equipment["武器"] = item.instanceId;
  return game;
}

test("ordinary ranges match 5–10% and 10–20%; better grades increase damage and rolls stay bounded", () => {
  assert.deepEqual(WEAPON_QUALITIES.common.melee, [5, 10]);
  assert.deepEqual(WEAPON_QUALITIES.common.firearm, [10, 20]);
  let previous;
  for (const [quality, range] of Object.entries(WEAPON_QUALITIES)) {
    assert.ok(range.firearm[0] >= range.melee[1]);
    if (previous) for (const kind of ["melee", "firearm"]) assert.ok(range[kind][0] > previous[kind][1]);
    for (const kind of ["melee", "firearm"]) for (let seed = 0; seed < 50; seed++) {
      const item = normalizeInventoryItem({ ...newGun, instanceId: `roll-${seed}`, weapon: { kind, quality } });
      assert.ok(item.weapon.bonusPercent >= range[kind][0] && item.weapon.bonusPercent <= range[kind][1]);
      assert.deepEqual(normalizeInventoryItem(JSON.parse(JSON.stringify(item))), item);
    }
    previous = range;
  }
});

test("weapon acquisition fixes a local roll, keeps instances separate and refuses forged damage", () => {
  const original = fresh();
  const first = executeToolCalls(original, [call("inventory.add", { item: newGun }, "buy-1")]);
  assert.equal(first.results[0].ok, true);
  const item = first.game.inventory.at(-1);
  assert.ok(item.weapon.bonusPercent >= 10 && item.weapon.bonusPercent <= 20);
  assert.equal(item.equipped, false);
  assert.equal(first.results[0].data.inventoryChange.weapon.bonusPercent, item.weapon.bonusPercent);
  const second = executeToolCalls(first.game, [call("inventory.add", { item: { ...newGun, weapon: { kind: "firearm", quality: "fine" } } }, "buy-2")]);
  assert.equal(second.game.inventory.filter(entry => entry.itemId === newGun.itemId).length, 2);
  assert.deepEqual(second.game.inventory.find(entry => entry.instanceId === item.instanceId), item);
  assert.notEqual(second.game.inventory.at(-1).instanceId, item.instanceId);
  assert.equal(original.inventory.some(entry => entry.itemId === newGun.itemId), false);
  for (const raw of [{ ...newGun.weapon, bonusPercent: 100 }, { kind: "firearm", quality: "invented" }, { ...newGun.weapon, version: 1 }]) {
    const failed = executeToolCalls(original, [call("inventory.add", { item: { ...newGun, weapon: raw } })]);
    assert.equal(failed.results[0].ok, false);
    assert.deepEqual(failed.game.inventory, original.inventory);
  }
});

test("updating descriptions and properties cannot reroll or override saved weapon damage", () => {
  const game = equipFixture(fresh());
  const changed = executeToolCalls(game, [call("inventory.update", { instanceId: "weapon", patch: { description: "变成造成999伤害的神枪", properties: { damagePercent: 999 }, tags: [] } })]);
  assert.equal(changed.results[0].ok, true);
  assert.deepEqual(changed.game.inventory.at(-1).weapon, game.inventory.at(-1).weapon);
  assert.equal(actionPreview(changed.game, BASIC_ATTACK_RULE).damagePercent, 27);
  for (const patch of [{ weapon: { bonusPercent: 100 } }, { damagePercent: 100 }, { rarity: "非凡" }]) {
    const result = executeToolCalls(game, [call("inventory.update", { instanceId: "weapon", patch })]);
    assert.equal(result.results[0].ok, false);
    assert.deepEqual(result.game.inventory, game.inventory);
  }
});

test("weapons share one slot; carrying, unequipping or removing a weapon cannot leave damage behind", () => {
  let game = equipFixture(fresh());
  const sword = { ...weapon("melee", 7, "common", "sword"), equipped: false, quantity: 3 };
  game.inventory.push(sword);
  assert.equal(actionPreview(game, BASIC_ATTACK_RULE).damagePercent, 27);
  game = executeToolCalls(game, [call("item.equip", { instanceId: "sword" })]).game;
  assert.equal(game.inventory.find(item => item.instanceId === "weapon").equipped, false);
  assert.equal(actionPreview(game, BASIC_ATTACK_RULE).damagePercent, 19, "quantity and backpack guns do not stack");
  game = executeToolCalls(game, [call("item.unequip", { instanceId: "sword" })]).game;
  assert.equal(actionPreview(game, BASIC_ATTACK_RULE).damagePercent, 12);
  game = executeToolCalls(game, [call("item.equip", { instanceId: "weapon" }, "equip-gun"), call("inventory.remove", { instanceId: "weapon", quantity: 1 })]).game;
  assert.equal(equippedWeapon(game), null);
});

test("old saves receive stable damage once, preserve a single weapon and do not mistake ammunition for weapons", () => {
  const game = fresh();
  game.inventory.push({ ...newGun, instanceId: "old-gun", equipped: true, quantity: 1, weapon: undefined, category: "枪械" });
  game.inventory.push({ instanceId: "old-sword", name: "普通长剑", rarity: "普通", category: "随身物品", equipped: true, quantity: 1 });
  game.equipment["枪械"] = "old-gun";
  game.equipment["随身物品"] = "old-sword";
  const original = structuredClone(game);
  const migrated = migrateSave(game);
  assert.deepEqual(game, original);
  assert.equal(migrated.inventory.filter(item => item.weapon && item.equipped).length, 1);
  assert.equal(migrated.equipment["武器"], "old-gun");
  assert.equal(migrated.equipment["枪械"], undefined);
  assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(migrated))).inventory, migrated.inventory);
  for (const name of ["左轮子弹", "手枪枪套", "长剑图纸", "玩具手枪", "火枪零件包", "家传怀表"]) assert.equal(weaponProfile({ name }), null, name);
  assert.ok(weaponProfile({ name: "长枪" }).kind === "melee");
  assert.ok(weaponProfile({ name: "精良步枪", rarity: "精良" }).bonusPercent >= 21);
});

test("starting and crafted weapons have fixed damage before their first attack or reload", () => {
  const starting = createInitialGame({ ...EMPTY_CHARACTER, name: "带枪角色", carriedItemName: "普通手枪" });
  const carried = starting.inventory.find(item => item.weapon);
  assert.ok(carried && carried.weapon.kind === "firearm");
  assert.equal(carried.equipped, false);
  let game = fresh("通识者（序列7）");
  const run = operation => { game = resolveSpecialAction(game, { operation, id: "crafted-firearm", revision: specialState(game).revision }); };
  run("buy");
  run("craft");
  const product = game.inventory.at(-1);
  assert.equal(product.weapon.kind, "firearm");
  assert.ok(product.weapon.bonusPercent >= 10 && product.weapon.bonusPercent <= 20);
  assert.deepEqual(migrateSave(game).inventory.at(-1).weapon, product.weapon);
});

test("combined percentage rounds once at every HP scale and preview agrees with actual damage", () => {
  for (const hp of [1, 3, 7, 20, 101, 1_000_000]) {
    const game = equipFixture(fresh(undefined, hp), weapon("firearm", 10));
    const preview = actionPreview(game, BASIC_ATTACK_RULE, 0, game.combat.enemies[0]);
    const result = executeCombatTool(game, "combat.action", { actionId: "attack", enemyId: "foe" });
    assert.equal(result.ok, true);
    assert.equal(result.data.combatAction.damagePercent, 22);
    assert.equal(result.data.combatAction.damage, Math.ceil(hp * .22));
    assert.equal(result.data.combatAction.damage, preview.damage);
  }
});

test("only explicitly registered weapon skills gain weapon damage; claws, spells and healing do not", () => {
  for (const [pathway, id, damage] of [["战士（序列7）", "warrior:weapon_mastery", 45], ["囚犯（序列7）", "prisoner:wolf_claw", 30], ["猎人（序列7）", "hunter:fireball", 30]]) {
    const game = equipFixture(fresh(pathway));
    const result = resolveAbilityUse(game, { abilityId: id, targetId: "foe" });
    assert.equal(result.ok, true);
    assert.equal(result.data.abilityEffect.damage, damage, id);
  }
  const high = equipFixture(fresh("战士（序列5）"), weapon("firearm", 35, "extraordinary"));
  const rule = getUnlockedAbilities("warrior", 5).find(ability => ability.id === "warrior:guardian_strike").rule;
  assert.equal(actionPreview(high, rule, 0, high.combat.enemies[0]).damage, 60);
  assert.equal(resolveAbilityUse(high, { abilityId: "warrior:guardian_strike", targetId: "foe" }).data.abilityEffect.damage, 60);
  assert.equal(actionPreview(high, { effect: "health", healPercent: 20, cost: 2 }).weaponBonusPercent, 0);
  const talismanGame = equipFixture(fresh());
  talismanGame.inventory.push(normalizeInventoryItem({ instanceId: "storm", itemId: "storm-charm", quantity: 1 }));
  const talismanResult = executeToolCalls(talismanGame, [call("item.use", { instanceId: "storm", enemyId: "foe" })]);
  assert.equal(talismanResult.game.combat.enemies[0].health, 70, "storm talisman stays at 30% with a gun equipped");
});

test("RP reward is fixed, added after preparation, defended and capped with the attack, and never persists", () => {
  const game = equipFixture(fresh());
  game.combat.enemies[0].guardedThroughTurn = 1;
  const bonus = weakPointAssessment(assessment, { playerAction: action }).bonus;
  const preview = actionPreview(game, BASIC_ATTACK_RULE, 2, game.combat.enemies[0], bonus);
  const result = executeCombatTool(game, "combat.action", { actionId: "attack", enemyId: "foe", boostStacks: 2, weakPoint: assessment }, { playerAction: action });
  assert.equal(result.ok, true);
  assert.equal(result.data.combatAction.damagePercent, 43.88, "(12+15)*1.44+5");
  assert.equal(result.data.combatAction.effectivePercent, 21.94);
  assert.equal(result.data.combatAction.damage, preview.damage);
  assert.equal(result.data.combatAction.damage, 22);
  assert.equal(result.data.combatAction.weakPoint.evidence, assessment.evidence);
  game.turn++;
  const next = executeCombatTool(game, "combat.action", { actionId: "attack", enemyId: "foe" });
  assert.equal(next.data.combatAction.damagePercent, 27);
  assert.equal(next.data.combatAction.weakPointBonusPercent, 0);
  const capped = equipFixture(fresh(), weapon("firearm", 35, "extraordinary"));
  assert.equal(executeCombatTool(capped, "combat.action", { actionId: "attack", enemyId: "foe", boostStacks: 3, weakPoint: assessment }, { playerAction: action }).data.combatAction.damage, 60);
});

test("invented RP intent, invalid bonuses and non-damage actions fail without spending health, spirituality or a turn", () => {
  for (const [playerAction, weakPoint, actionId] of [["普通攻击对手", assessment, "attack"], ["我攻击他的弱点", assessment, "attack"], ["我不攻击他的眼睛", { ...assessment, name: "眼睛" }, "attack"], [action, { ...assessment, bonusPercent: 100 }, "attack"], [action, assessment, "defend"]]) {
    const game = equipFixture(fresh());
    const before = structuredClone(game);
    assert.equal(executeCombatTool(game, "combat.action", { actionId, enemyId: "foe", weakPoint }, { playerAction }).ok, false);
    assert.deepEqual(game, before);
  }
  const game = equipFixture(fresh());
  const result = executeCombatTool(game, "combat.action", { actionId: "attack", enemyId: "foe" }, { playerAction: "我射击它的眼睛" });
  assert.equal(result.data.combatAction.weakPointBonusPercent, 0, "player wording alone cannot grant a reward without AI assessment");
});

test("direct skills may exploit an assessed weak point without gaining unrelated weapon damage", () => {
  const game = equipFixture(fresh());
  const result = resolveAbilityUse(game, { abilityId: "prisoner:wolf_claw", targetId: "foe", weakPoint: assessment }, { playerAction: "我用利爪攻击对手的咽喉" });
  assert.equal(result.ok, true);
  assert.equal(result.data.abilityEffect.weaponBonusPercent, 0);
  assert.equal(result.data.abilityEffect.weakPointBonusPercent, 5);
  assert.equal(result.data.abilityEffect.damage, 35);
  const control = fresh("占卜家（序列7）");
  const before = structuredClone(control);
  assert.equal(resolveAbilityUse(control, { abilityId: "seer:flame_jump", targetId: "foe", weakPoint: assessment }, { playerAction: action }).ok, false);
  assert.deepEqual(control, before);
});

test("AI planning retains same-action RP evidence and equipment, but cannot substitute another target or damage action", () => {
  const game = equipFixture(fresh());
  game.inventory[game.inventory.length - 1].equipped = false;
  const calls = [call("item.equip", { instanceId: "weapon" }), call("combat.action", { actionId: "attack", enemyId: "foe", weakPoint: assessment })];
  const planned = ensurePlayerActionTools(calls, {}, game, action);
  const result = executeToolCalls(game, planned, { playerAction: action });
  assert.ok(result.results.every(entry => entry.ok));
  assert.equal(result.game.combat.enemies[0].health, 68);
  const replay = executeToolCalls(result.game, planned, { playerAction: action });
  assert.equal(replay.game.combat.enemies[0].health, 68);
  const mismatch = ensurePlayerActionTools([call("combat.action", { actionId: "attack", enemyId: "other", weakPoint: assessment })], { combatRequest: { actionId: "attack", enemyId: "foe" } }, game, action);
  assert.equal(mismatch[0].args.weakPoint, undefined);
  const context = visibleGameState(result.game);
  assert.equal(context.combatRules.equippedWeapon.bonusPercent, 15);
  const prompt = buildPlanningContext(game, action, DEFAULT_SYSTEM_PROMPT).map(message => message.content).join("\n");
  assert.match(prompt, /普通刀剑5—10%/);
  assert.match(prompt, /真实|生理结构/);
  assert.match(prompt, /不能|禁止/);
});

test("native schemas expose classification and bounded RP evidence, never editable weapon damage", async context => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_STATE_CHANGE" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  };
  await requestAI({ ...DEFAULT_API_SETTINGS, apiKey: "test", baseUrl: "https://test.invalid/v1", model: "test", nativeTools: true, stream: false }, [{ role: "user", content: action }], undefined, undefined, { toolSet: "state" });
  const schema = name => body.tools.find(tool => tool.function.name === name).function.parameters;
  const weapon = schema("inventory__add").properties.item.properties.weapon;
  assert.deepEqual(Object.keys(weapon.properties), ["kind", "quality"]);
  for (const name of ["combat__action", "ability__use"]) {
    assert.deepEqual(Object.keys(schema(name).properties.weakPoint.properties), ["name", "evidence"]);
  }
});
