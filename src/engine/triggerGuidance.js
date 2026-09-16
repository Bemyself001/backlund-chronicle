import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { allConditionsMatch } from "./triggerConditions.js";

export function triggerGuidance(game, instance) {
  const definition = getInstanceTriggerDefinition(instance, game);
  const stage = definition?.stages?.find(entry => entry.id === instance.stage);
  const context = { game, state: game.triggerState, action: "", turn: game.turn, instance };
  const override = (stage?.guidanceRules || []).find(rule => allConditionsMatch(rule.conditions, context));
  const terminal = instance.status === "completed" ? definition?.completionGuidance
    : ["failed", "expired", "abandoned"].includes(instance.status) ? definition?.failureGuidance : null;
  return {
    instanceId: instance.instanceId,
    key: override?.id || instance.stage,
    text: terminal?.guidance || (instance.status === "available" ? instance.presentation?.text : override?.text || stage?.guidance || ""),
    narrativeCue: terminal?.narrativeCue || override?.narrativeCue || stage?.narrativeCue || instance.presentation?.text || "",
    enabled: Boolean(definition?.storyGuidance),
    timers: (definition?.timers || []).filter(timer => instance.status === "engaged" && timer.stages.includes(instance.stage)).map(timer => ({
      id: timer.id,
      remaining: instance.timers?.[timer.id] ? Math.max(0, instance.timers[timer.id].deadline - Number(game.turn || 0)) : timer.turns,
      message: timer.message,
    })),
  };
}
