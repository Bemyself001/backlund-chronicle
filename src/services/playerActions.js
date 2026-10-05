import { getAdvancement, isExplicitAdvancementIntent } from "../system/character.js";
import { getPotionUseGate } from "./advancement.js";
import { identificationGate } from "../engine/potionIdentification.js";
import { abilityAvailability } from "../engine/abilities.js";

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
    const gate = abilityAvailability(game, abilityRequest.abilityId, abilityRequest.targetId);
    if (gate) throw new Error(gate);
  }
  return { advancementRequest, identificationRequest, abilityRequest };
}

export function ensurePlayerActionTools(calls, requests, game) {
  const identificationRequest = requests.identificationRequest || calls.find(call => call.name === "potion.identify")?.args;
  const abilityRequest = requests.abilityRequest || calls.find(call => call.name === "ability.use")?.args;
  if (identificationRequest) {
    return [{ id: `identify:${game.turn + 1}:${identificationRequest.instanceId}`, name: "potion.identify", args: { ...identificationRequest }, reason: "玩家确认以一镑鉴定一瓶魔药" }];
  }
  if (abilityRequest) {
    const ability = getAdvancement(game.character).unlockedAbilities.find(entry => entry.id === abilityRequest.abilityId);
    // Costs and effects are owned by the ability rule. Retain enemy reactions only.
    return [{ id: `ability:${game.turn + 1}:${abilityRequest.abilityId}`, name: "ability.use", args: { ...abilityRequest }, reason: `玩家主动使用${ability?.name || "非凡能力"}` }, ...calls.filter(call => call.name === "enemy.act")];
  }
  return calls;
}

export const PLAYER_ACTION_RULES = "【成品魔药与能力】已持有的已鉴定魔药可以直接服用，不要求配方或先接触非凡世界；普通人只能服序列9，同途径逐级晋升，禁止跳级。服用必须调用advancement.promote且以本地确认结果为准，不能只写正文，也不能另用inventory.remove或character.update重复结算。未知魔药只能由夏洛克在明斯克街15号当面鉴定，每瓶1镑=240便士，玩家明确同意费用后使用potion.identify；不能通过item.inspect免费揭示真实身份或随机编造途径。主动能力只使用ability.use，沿用unlockedAbilities的ID、目标和限制；被动能力使用dice.check并传已解锁的abilityId和匹配rule.checkKind的checkKind，不额外传modifier，本地决定强化加值；工具负责资源与效果，不再调用character.update/enemy.damage/status.add重复给予同一效果。鉴定和服药叙事完成后统一提交，未成功的工具调用是技术或规则反馈，不是NPC故意阻拦的剧情。";
