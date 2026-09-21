import { SPECIAL_RECIPES } from "../content/index.js";
import { applyStatDelta } from "./statChanges.js";
import { restMinutes } from "./restTime.js";

export function medicineRecipe(item) {
  if (!item || item.potion) return null;
  return SPECIAL_RECIPES.find(recipe => recipe.stat && item.itemId === `special-${recipe.id}`) || null;
}

export function consumeMedicine(game, item) {
  const recipe = medicineRecipe(item);
  if (!recipe || !(item.quantity > 0)) throw new Error("没有可使用的药剂");
  const change = applyStatDelta(game, recipe.stat, recipe.delta);
  if (!change) throw new Error("对应属性已满，无需消耗药剂");
  item.quantity -= 1;
  if (!item.quantity) {
    game.inventory = game.inventory.filter(entry => entry.instanceId !== item.instanceId);
    if (game.specialActions?.products) delete game.specialActions.products[item.instanceId];
  }
  return change;
}

export function settleInnRest(game, action, elapsedMinutes) {
  if (game.location?.id !== "soot-lamp" || restMinutes(action, game.worldTime) === null) return [];
  // 每睡满两小时恢复一点，单次最多按八小时结算。
  const amount = Math.min(4, Math.floor(elapsedMinutes / 120));
  return ["health", "sanity"].map(stat => applyStatDelta(game, stat, amount)).filter(Boolean);
}
