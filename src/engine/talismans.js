import { getAdvancement } from "../system/character.js";
import { normalizeCombatState } from "../system/combat.js";
import { getChurchTalisman, normalizeTalismanItem, organizationTalisman } from "../system/talismans.js";
import { makeId } from "../utils/id.js";
import { damageEnemy } from "./healthEffects.js";

export function grantOrganizationTalisman(game, turn = Number(game.turn || 0)) {
  const membership = game.organizationState?.membership;
  if (membership?.status !== "active" || getAdvancement(game.character).type !== "extraordinary") return null;
  const definition = organizationTalisman(membership.organizationId);
  if (!definition || game.organizationState.talismanGrants?.[definition.organizationId]) return null;
  const existing = game.inventory.find(item => getChurchTalisman(item)?.itemId === definition.itemId && item.quantity > 0);
  game.organizationState.talismanGrants = { ...game.organizationState.talismanGrants, [definition.organizationId]: true };
  if (existing) return null;
  const item = normalizeTalismanItem({ instanceId: makeId("talisman"), itemId: definition.itemId, quantity: 1,
    condition: "完好", source: `${membership.name}首次配发`, acquiredAt: `第 ${turn} 轮`, isNew: true });
  game.inventory.push(item);
  return { ...item, delta: 1, reason: item.source };
}

const clueText = value => typeof value === "string" ? value.trim() : "";
const comparable = value => clueText(value).replace(/[\s，。！？、；：,.!?;:「」“”]/g, "");

export function validateTalismanClue(game, clue) {
  if (!clue || typeof clue !== "object" || Array.isArray(clue)) return "缺少参数 clue：通识符咒必须提供一条新线索（id、title、detail）";
  if (!clueText(clue.id) || clueText(clue.title).length < 2 || clueText(clue.detail).length < 8) return "线索参数必须包含 id、至少两个字的 title 和至少八个字的具体 detail";
  if (clue.id.length > 160 || clue.title.length > 120 || clue.detail.length > 2000) return "线索参数过长，请保留本轮发现的具体信息";
  if (clue.kind && clue.kind !== "investigation") return "通识符咒提供场景调查线索，不能直接生成魔药配方或特殊任务奖励";
  if ((game.clues || []).some(entry => entry.id === clue.id.trim() || comparable(entry.title) === comparable(clue.title) || comparable(entry.detail) === comparable(clue.detail))) return "线索参数重复：通识符咒必须提供尚未记录的新线索";
  return "";
}

export function executeTalismanUse(game, item, args = {}, { turn = Number(game.turn || 0) + 1, reason = "使用符咒" } = {}) {
  const definition = getChurchTalisman(item);
  if (!definition) return null;
  const fail = message => ({ ok: false, reason: message });
  if (!Number.isInteger(item.quantity) || item.quantity < 1) return fail("符咒数量不足");
  let effect;
  let log;
  if (definition.effect === "clue") {
    const invalid = validateTalismanClue(game, args.clue);
    if (invalid) return fail(invalid);
    const clue = { id: args.clue.id.trim(), title: args.clue.title.trim(), detail: args.clue.detail.trim(), kind: "investigation",
      source: definition.name, discoveredAt: `第 ${turn} 轮`, discoveredTurn: turn, isNew: true };
    game.clues = [...(game.clues || []), clue];
    effect = { effect: "clue", clue };
    log = `使用「${definition.name}」：发现新线索「${clue.title}」，已记入调查手记。`;
  } else {
    const combat = normalizeCombatState(game.combat);
    const enemy = combat.enemies.find(entry => entry.id === args.enemyId);
    if (!enemy || enemy.status !== "active" || enemy.health <= 0) return fail("必须选择仍在当前遭遇中、生命值大于零的敌人");
    const before = enemy.health;
    enemy.lastUpdatedTurn = turn;
    if (definition.effect === "stun") {
      // If it already acted before the cast, its next action is the one skipped.
      const blockedTurn = enemy.lastActedTurn >= turn ? turn + 1 : turn;
      enemy.stunnedThroughTurn = Math.max(enemy.stunnedThroughTurn, blockedTurn);
      effect = { effect: "stun", enemyId: enemy.id, enemyName: enemy.name, stunnedThroughTurn: enemy.stunnedThroughTurn };
      log = `使用「${definition.name}」：${enemy.name}在第 ${blockedTurn} 轮无法行动（一回合）。`;
    } else {
      effect = { effect: "damage", ...damageEnemy(enemy, 30, 0, turn) };
      log = `使用「${definition.name}」：${enemy.name}受到 ${before - enemy.health} 点伤害，生命值 ${before}→${enemy.health} / ${enemy.maxHealth}${enemy.health === 0 ? "，已被击败" : ""}。`;
    }
    game.combat = combat;
  }
  const inventoryChange = { ...normalizeTalismanItem(item), delta: -1, reason };
  item.quantity -= 1;
  if (item.quantity === 0) game.inventory = game.inventory.filter(entry => entry.instanceId !== item.instanceId);
  return { ok: true, log, data: { inventoryChange, talismanEffect: effect } };
}
