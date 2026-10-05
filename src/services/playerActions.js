import { getAdvancement, isExplicitAdvancementIntent } from "../system/character.js";
import { getPotionUseGate } from "./advancement.js";
import { identificationGate } from "../engine/potionIdentification.js";
import { abilityAvailability } from "../engine/abilities.js";
import { combatActionAvailability, executeCombatTool } from "../engine/combat.js";
import { activeEnemies } from "../system/combat.js";

// Resolve unambiguous prose to the same immutable IDs carried by UI buttons.
export function inferPotionRequest(game, action, supplied) {
  if (supplied) return supplied;
  if (!isExplicitAdvancementIntent(action)) return null;
  const bottles = game.inventory.filter(item => item.potion && item.quantity > 0 && String(action).includes(item.name));
  if (bottles.length === 1) return { potionInstanceId: bottles[0].instanceId };
  const allBottles = game.inventory.filter(item => item.potion && item.quantity > 0);
  return !bottles.length && allBottles.length === 1 && /魔药/.test(action) ? { potionInstanceId: allBottles[0].instanceId } : null;
}

export function validatePlayerActions(game, action, options) {
  const advancementRequest = inferPotionRequest(game, action, options.advancementRequest);
  if (advancementRequest) {
    const gate = getPotionUseGate(game, advancementRequest.potionInstanceId);
    if (gate) throw new Error(gate);
  }
  const identificationRequest = options.identificationRequest;
  if (identificationRequest) {
    const gate = identificationGate(game, identificationRequest.instanceId);
    if (gate) throw new Error(gate);
    if (identificationRequest.feePence !== 240) throw new Error("请先确认每瓶一镑的鉴定费用。");
  }
  const abilityRequest = options.abilityRequest;
  if (abilityRequest) {
    const gate = abilityAvailability(game, abilityRequest.abilityId, abilityRequest.targetId, game.turn + 1, abilityRequest.boostStacks ?? 0);
    if (gate) throw new Error(gate);
  }
  const combatRequest = options.combatRequest;
  if (combatRequest) {
    const gate = combatActionAvailability(game, combatRequest);
    if (gate) throw new Error(gate);
  }
  if (abilityRequest && combatRequest) throw new Error("每回合只能选择一项主要行动");
  return { advancementRequest, identificationRequest, abilityRequest, combatRequest };
}

function completeEnemyReactions(calls, game) {
  // Project registrations only; this cannot spend resources or mutate the committed game.
  const projected = { ...game, combat: structuredClone(game.combat) };
  for (const call of calls.filter(call => call.name === "enemy.encounter")) executeCombatTool(projected, call.name, call.args);
  const reactions = calls.filter(call => ["enemy.act", "enemy.leave"].includes(call.name));
  for (const enemy of activeEnemies(projected)) if (!reactions.some(call => call.args?.enemyId === enemy.id)) {
    reactions.push({ id: `reaction:${game.turn + 1}:${enemy.id}`, name: "enemy.act", args: { enemyId: enemy.id,
      moveId: enemy.windupTurn >= 0 && enemy.windupTurn < game.turn + 1 && (enemy.heavyReadyTurn ?? -1) <= game.turn + 1 ? "heavy" : "attack" }, reason: "本地补全当前敌人的回应" });
  }
  return [...calls.filter(call => !["enemy.act", "enemy.leave"].includes(call.name)), ...reactions];
}

export function ensurePlayerActionTools(calls, requests, game, playerAction = "") {
  const requestedMain = requests.abilityRequest || requests.combatRequest || requests.talismanRequest;
  const identificationRequest = requests.identificationRequest || (!requestedMain && calls.find(call => call.name === "potion.identify")?.args);
  const abilityRequest = requests.abilityRequest || (!requestedMain && calls.find(call => call.name === "ability.use")?.args);
  const combatRequest = requests.combatRequest || (!abilityRequest && calls.find(call => call.name === "combat.action")?.args);
  if (identificationRequest) {
    return [{ id: `identify:${game.turn + 1}:${identificationRequest.instanceId}`, name: "potion.identify", args: { ...identificationRequest }, reason: "玩家确认以一镑鉴定一瓶魔药" }];
  }
  if (requests.talismanRequest) return completeEnemyReactions(calls.filter(call => !["ability.use", "combat.action"].includes(call.name)), game);
  if (abilityRequest || combatRequest) {
    const request = abilityRequest || combatRequest;
    const boostStacks = requests.abilityRequest || requests.combatRequest || /强化|狂化/.test(playerAction) ? request.boostStacks ?? 0 : 0;
    const ability = abilityRequest && getAdvancement(game.character).unlockedAbilities.find(entry => entry.id === abilityRequest.abilityId);
    const encounters = calls.filter(call => call.name === "enemy.encounter");
    const reactions = calls.filter(call => ["enemy.act", "enemy.leave"].includes(call.name));
    return completeEnemyReactions([...encounters, { id: `main:${game.turn + 1}`, name: abilityRequest ? "ability.use" : "combat.action", args: { ...request, boostStacks }, reason: `玩家执行${ability?.name || "战斗行动"}` }, ...reactions], game);
  }
  return calls.some(call => call.name === "item.use") ? completeEnemyReactions(calls, game) : calls;
}

export const PLAYER_ACTION_RULES = "【成品魔药与能力】已持有的已鉴定魔药可以直接服用，不要求配方或先接触非凡世界；普通人只能服序列9，同途径逐级晋升，禁止跳级。服用必须调用advancement.promote且以本地确认结果为准，不能只写正文，也不能另用inventory.remove或character.update重复结算。未知魔药只能由夏洛克在明斯克街15号当面鉴定，每瓶1镑=240便士，玩家明确同意费用后使用potion.identify；不能通过item.inspect免费揭示真实身份或随机编造途径。主动能力只使用ability.use，沿用unlockedAbilities的ID、目标和限制；所有生命相关技能按最大生命值百分比由本地结算：伤害使用rule.damagePercent、治疗使用rule.healPercent、耗血使用rule.healthCostPercent；灵性仍按点数支付。狼人强化仅在解锁rule.preparation后可用，玩家明确要求时把boostStacks填为0至3，倍率为1.2的层数次方，每层1点灵性，当回合结束清空；它与主要行动合并提交，不单独推进回合。每回合一次主要行动，强化后单次伤害比例最高60%。不得通过character.update或status.add重复或绕过生命效果；实际伤害、治疗、消耗与击败以工具结果为准。被动能力使用dice.check并传已解锁的abilityId和匹配rule.checkKind的checkKind，不额外传modifier，本地决定强化加值；工具负责资源与效果，不再调用character.update/enemy.damage/status.add重复给予同一效果。鉴定和服药叙事完成后统一提交，未成功的工具调用是技术或规则反馈，不是NPC故意阻拦的剧情。";
