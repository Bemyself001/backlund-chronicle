import { getAdvancement } from "../data/character.js";

export function getPotionAdvancementEligibility(game, potionInstanceId) {
  if (Number(game?.occult?.contact) !== 1) return null;
  const potion = (game?.inventory || []).find((item) => item.instanceId === potionInstanceId);
  if (!potion?.potion?.identified) return null;
  const before = getAdvancement(game.character);
  const expectedSequence = before.type === "ordinary" ? 9 : Number(before.sequence) - 1;
  if (!Number.isInteger(expectedSequence) || expectedSequence < 0) return null;
  if (Number(potion.potion.sequence) !== expectedSequence) return null;
  if (before.type === "extraordinary" && before.pathwayId !== potion.potion.pathwayId) return null;
  const recipe = (game.clues || []).find((clue) => clue.kind === "potion_recipe" && clue.pathwayId === potion.potion.pathwayId && Number(clue.sequence) === expectedSequence);
  if (!recipe) return null;
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
      recipeClueId: eligible.recipe.id,
      evidence: "玩家从物品栏明确选择服用已鉴定魔药，并进入永久晋升确认流程",
    },
    reason: `玩家明确选择服用${eligible.potion.name}并承担晋升结果`,
  };
  const existingIndex = toolCalls.findIndex((call) => String(call?.name || call?.function?.name || "").replace("__", ".") === "advancement.promote");
  if (existingIndex < 0) return [deterministicCall, ...toolCalls];
  return toolCalls.map((call, index) => index === existingIndex ? deterministicCall : call);
}
