import { getAdvancement } from "../system/character.js";
import { normalizePotion } from "../system/items.js";
import { CHARACTERISTIC_MAX_SEQUENCE, normalizeCharacteristic } from "../system/characteristics.js";

export function getCharacteristicUseGate(game, characteristicInstanceId) {
  const item = (game?.inventory || []).find(entry => entry.instanceId === characteristicInstanceId);
  if (!item || !Number.isInteger(item.quantity) || item.quantity < 1) return "背包中没有可用的这份非凡特性";
  const characteristic = normalizeCharacteristic(item);
  if (!characteristic) return "该物品不是完整的非凡特性";
  if (!characteristic.identified) return "必须先可靠确认非凡特性的途径和序列";
  if (characteristic.sequence > CHARACTERISTIC_MAX_SEQUENCE) return "只有序列7及以上的非凡特性可以直接晋升；序列8和9的低序列特性仍需调制为魔药";
  const before = getAdvancement(game.character);
  if (before.type === "ordinary") return "普通人只能先服用序列9魔药，不能直接吸收高序列非凡特性";
  if (before.sequence === 0) return "已达到序列0，无法继续晋升";
  if (characteristic.pathwayId !== before.pathwayId) return "只能吸收当前途径的下一序列非凡特性";
  return characteristic.sequence === before.sequence - 1 ? "" : "必须逐级晋升，不能跳级或重复吸收";
}

export function getAdvancementRequestGate(game, request = {}) {
  if (Boolean(request.potionInstanceId) === Boolean(request.characteristicInstanceId)) return "晋升必须且只能指定一瓶魔药或一份非凡特性";
  return request.characteristicInstanceId ? getCharacteristicUseGate(game, request.characteristicInstanceId) : getPotionUseGate(game, request.potionInstanceId);
}

export function getPotionUseGate(game, potionInstanceId) {
  const item = (game?.inventory || []).find(entry => entry.instanceId === potionInstanceId);
  if (!item || !Number.isInteger(item.quantity) || item.quantity < 1) return "背包中没有可用的这瓶魔药";
  const potion = normalizePotion(item);
  if (!potion) return "该物品不是成品魔药";
  if (!potion.identified) return "未知魔药必须先由夏洛克鉴定";
  const before = getAdvancement(game.character);
  if (before.type === "ordinary") return potion.sequence === 9 ? "" : "普通人只能服用序列9魔药";
  if (before.sequence === 0) return "已达到序列0，无法继续晋升";
  if (potion.pathwayId !== before.pathwayId) return "只能服用当前途径的下一序列魔药";
  return potion.sequence === before.sequence - 1 ? "" : "必须逐级晋升，不能跳级或重复服用";
}

export function getPotionAdvancementEligibility(game, potionInstanceId) {
  if (getPotionUseGate(game, potionInstanceId)) return null;
  const item = (game?.inventory || []).find((entry) => entry.instanceId === potionInstanceId);
  const potion = { ...item, potion: normalizePotion(item) };
  const before = getAdvancement(game.character);
  const expectedSequence = before.type === "ordinary" ? 9 : Number(before.sequence) - 1;
  if (!Number.isInteger(expectedSequence) || expectedSequence < 0) return null;
  if (Number(potion.potion.sequence) !== expectedSequence) return null;
  if (before.type === "extraordinary" && before.pathwayId !== potion.potion.pathwayId) return null;
  const recipe = (game.clues || []).find((clue) => clue.kind === "potion_recipe" && clue.pathwayId === potion.potion.pathwayId && Number(clue.sequence) === expectedSequence);
  return { potion, recipe, before, pathwayId: potion.potion.pathwayId, pathwayName: potion.potion.pathwayName, sequence: expectedSequence };
}

export function ensureRequestedAdvancementToolCall(toolCalls = [], request, turn, game) {
  if (!request || getAdvancementRequestGate(game, request)) return toolCalls;
  const method = request.characteristicInstanceId ? "characteristic" : "potion";
  const instanceId = request.characteristicInstanceId || request.potionInstanceId;
  const item = game.inventory.find(entry => entry.instanceId === instanceId);
  const identity = method === "characteristic" ? normalizeCharacteristic(item) : normalizePotion(item);
  const recipe = method === "potion" ? getPotionAdvancementEligibility(game, instanceId)?.recipe : null;
  const deterministicCall = {
    id: `advancement-${turn}-${item.instanceId}`,
    name: "advancement.promote",
    args: {
      pathwayId: identity.pathwayId,
      sequence: identity.sequence,
      [method === "characteristic" ? "characteristicInstanceId" : "potionInstanceId"]: item.instanceId,
      ...(recipe ? { recipeClueId: recipe.id } : {}),
      evidence: method === "characteristic" ? "玩家明确选择吸收已确认的非凡特性直接晋升，接受生命、理智和灵性在晋升增长后的当前值各扣除50%，并进入永久晋升确认流程" : "玩家从物品栏明确选择服用已鉴定魔药，并进入永久晋升确认流程",
    },
    reason: `玩家明确选择${method === "characteristic" ? "吸收" : "服用"}${item.name}并承担晋升结果`,
  };
  const remaining = toolCalls.filter(call => {
    const name = String(call?.name || call?.function?.name || "").replace("__", ".");
    if (name === "advancement.promote") return false;
    const args = call.args || {};
    return !(["item.use", "inventory.remove"].includes(name) && [args.instanceId, args.itemId, args.name, args.itemName].some(id => [item.instanceId, item.itemId, item.name].includes(id) && id));
  });
  return [deterministicCall, ...remaining];
}
