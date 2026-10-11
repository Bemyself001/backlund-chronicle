import { executeSpecialAction } from "../engine/specialActions.js";
import { computeMemoryUpdate } from "./memory.js";
import { createAuditBaseline, auditTurnChanges } from "../engine/audit.js";
import { injectOccultEntryChoice } from "./choices.js";
import { makeId } from "../utils/id.js";
import { createTurnResolution } from "./turnResolution.js";
import { eventDirections, markNarrativeEventsDelivered } from "./narrativeEvents.js";
import { visitablePerson } from "../engine/visitablePeople.js";
import { gatheringView } from "../engine/gatherings.js";

export function resolveSpecialAction(game, request) {
  const result = executeSpecialAction(game, request);
  const { next, action, narrative, progress, logs } = result;
  const baseline = createAuditBaseline(game, next.turn);
  const audit = auditTurnChanges(baseline, next);
  const resolution = createTurnResolution([], [], progress, next);
  const hints = eventDirections(resolution.derivedEffects.narrativeEvents);
  const memory = computeMemoryUpdate(game, action, [narrative, hints].filter(Boolean).join('\n\n'), { ...resolution, specialAction: { operation: request.operation, action }, audit }, { settledGame: next });
  // 自由书信包含模型回信，其余本地事件使用固定正文。
  for (const entry of memory.updates.storyHistory.slice(-2)) entry.source = request.operation === "conversation-send" ? "ai" : "fixed";
  const trigger = progress.newTrigger?.presentation || next.triggerState?.active?.find((entry) => entry.status === "available")?.presentation;
  const visitedPerson = request.operation === "visit-person" ? visitablePerson(request.id) : null;
  const gathering = request.operation?.startsWith("gathering-") ? gatheringView(next) : null;
  const choices = gathering ? [
    { label: gathering.inside ? "向聚会主持人询问已知商品与交易规矩" : "向旅店联络人询问聚会规矩", intent: "social", risk: "low" },
    { label: "整理已经取得的配方、物品与线索", intent: "investigate", risk: "low" },
    { label: "暂时放下聚会，继续自己的调查", intent: "redirect", risk: "low" },
  ] : visitedPerson ? visitedPerson.topics.map(topic => ({ label: topic.action, intent: "social", risk: "low" })) : game.choices;
  return markNarrativeEventsDelivered({ ...next, ...memory.updates,
    choices: next.questFocus?.id ? choices : injectOccultEntryChoice(choices, trigger),
    worldEvents: [...game.worldEvents, ...(progress.newTrigger ? [{ id: makeId("event"), turn: next.turn, text: `特殊事件出现：${progress.newTrigger.presentation.title}` }] : [])].slice(-40),
    changeLog: [...game.changeLog, { id: makeId("log"), turn: next.turn, text: action, tone: "success" },
      ...logs.map((text) => ({ id: makeId("log"), turn: next.turn, text, tone: "neutral" })), ...progress.statusTickLogs].slice(-100),
    lastTurnBaseline: baseline, lastTurnAudit: audit, lastTurnMetrics: null,
  }, resolution.derivedEffects.narrativeEvents, { action });
}
