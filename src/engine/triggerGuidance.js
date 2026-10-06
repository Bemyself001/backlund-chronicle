import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { allConditionsMatch } from "./triggerConditions.js";
import { triggerAppointment } from "./triggerAppointments.js";

export function triggerGuidance(game, instance) {
  const definition = getInstanceTriggerDefinition(instance, game);
  const stage = definition?.stages?.find(entry => entry.id === instance.stage);
  const context = { game, state: game.triggerState, action: "", turn: game.turn, instance };
  const override = (stage?.guidanceRules || []).find(rule => allConditionsMatch(rule.conditions, context));
  const renardOutcome = instance.definitionId === "side.queens.renard-fall" && instance.status === "completed" && instance.lastProgressEvidence?.includes("二十镑")
    ? { guidance: instance.lastProgressEvidence, narrativeCue: "在宅邸明确描写小姐获救、子爵当场支付二十镑；药师合作时玩家按约定获得十镑。" } : null;
  const terminal = renardOutcome || (instance.status === "completed" ? definition?.completionGuidance
    : ["failed", "expired", "abandoned"].includes(instance.status) ? definition?.failureGuidance : null);
  const appointment = triggerAppointment(game, instance);
  return {
    instanceId: instance.instanceId,
    key: `${override?.id || instance.stage}${appointment ? `:${appointment.startsAt}:${appointment.remainingMinutes ? 'upcoming' : 'open'}` : ''}`,
    text: [terminal?.guidance || (instance.status === "available" ? instance.presentation?.text : override?.text || stage?.guidance || ""), appointment?.text].filter(Boolean).join("\n"),
    narrativeCue: [terminal?.narrativeCue || override?.narrativeCue || stage?.narrativeCue || instance.presentation?.text || "", appointment && `在正文明确交代这份通知的日期和时间：${appointment.text}不得随回合推移改成新的明天。`].filter(Boolean).join("\n"),
    enabled: Boolean(definition?.storyGuidance),
    timers: (definition?.timers || []).filter(timer => instance.status === "engaged" && timer.stages.includes(instance.stage)).map(timer => ({
      id: timer.id,
      remaining: instance.timers?.[timer.id] ? Math.max(0, instance.timers[timer.id].deadline - Number(game.turn || 0)) : timer.turns,
      message: timer.message,
    })),
  };
}
