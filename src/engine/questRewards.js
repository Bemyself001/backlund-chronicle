import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { moneyFromPence, moneyToPence } from "../system/money.js";

// Only a recorded terminal transition can repair a missed fixed cash reward.
// Ambiguous historical branches are left intact; no costs/items are replayed.
export function reconcileFixedQuestReward(game, instance, turn) {
  const definition = getInstanceTriggerDefinition(instance, game);
  const last = instance?.stageHistory?.at(-1);
  if (instance?.status !== "completed" || !definition || !last || last.to !== instance.stage) return { ok: false, reason: "这条预设任务缺少明确的完成记录，暂不能核实报酬；请保留原任务记录" };
  const candidates = definition.stages.flatMap(stage => stage.transitions || []).filter(step => step.complete && step.nextStage === last.to);
  const monetary = rewards => (rewards || []).filter(reward => reward.type === "money" && Number.isInteger(reward.amountPence) && reward.amountPence > 0);
  const variants = [...new Map(candidates.map(step => {
    const rewards = [...new Map([...monetary(step.rewards), ...monetary(definition.rewards)].map(reward => [reward.id, reward])).values()].sort((a, b) => a.id.localeCompare(b.id));
    return [JSON.stringify(rewards), rewards];
  })).values()];
  if (variants.length !== 1) return { ok: false, reason: "历史完成分支对应的报酬不唯一，需要核对原结算记录，不能猜测补发" };
  const claimed = new Set(game.triggerState.rewardsClaimed || []);
  const missing = variants[0].filter(reward => !claimed.has(reward.id));
  if (missing.length && Number(game.character?.stats?.health) <= 0) return { ok: false, reason: "生命归零，不能领取任务报酬" };
  const amountPence = missing.reduce((sum, reward) => sum + reward.amountPence, 0);
  if (missing.length) {
    game.money = moneyFromPence(moneyToPence(game.money || {}) + amountPence);
    game.triggerState.rewardsClaimed = [...claimed, ...missing.map(reward => reward.id)];
  }
  return { ok: true, outcome: "claimed", completedSteps: [], taskMinutes: 5,
    rewardSettlement: { questId: instance.instanceId, amountPence, alreadyClaimed: !missing.length, repaired: Boolean(missing.length), turn } };
}
