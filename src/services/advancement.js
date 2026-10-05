import { getAdvancement } from "../system/character.js";
import { normalizePotion } from "../system/items.js";

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
  if (!request?.potionInstanceId) return toolCalls;
  const eligible = getPotionAdvancementEligibility(game, request.potionInstanceId);
  if (!eligible) return toolCalls;
  const deterministicCall = {
    id: `advancement-${turn}-${eligible.potion.instanceId}`,
    name: "advancement.promote",
    args: {
      pathwayId: eligible.pathwayId,
      sequence: eligible.sequence,
      potionInstanceId: eligible.potion.instanceId,
      ...(eligible.recipe ? { recipeClueId: eligible.recipe.id } : {}),
      evidence: "玩家从物品栏明确选择服用已鉴定魔药，并进入永久晋升确认流程",
    },
    reason: `玩家明确选择服用${eligible.potion.name}并承担晋升结果`,
  };
  const remaining = toolCalls.filter(call => {
    const name = String(call?.name || call?.function?.name || "").replace("__", ".");
    if (name === "advancement.promote") return false;
    const args = call.args || {};
    return !(["item.use", "inventory.remove"].includes(name) && [args.instanceId, args.itemId, args.name, args.itemName].some(id => [eligible.potion.instanceId, eligible.potion.itemId, eligible.potion.name].includes(id) && id));
  });
  return [deterministicCall, ...remaining];
}
