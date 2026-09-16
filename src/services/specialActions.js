import { executeSpecialAction } from "../engine/specialActions.js";
import { computeMemoryUpdate } from "./memory.js";
import { createAuditBaseline, auditTurnChanges } from "../engine/audit.js";
import { injectOccultEntryChoice } from "./choices.js";
import { makeId } from "../utils/id.js";
import { createTurnResolution } from "./turnResolution.js";
import { eventDirections, markNarrativeEventsDelivered } from "./narrativeEvents.js";

export function resolveSpecialAction(game, request) {
  const result = executeSpecialAction(game, request);
  const { next, action, narrative, progress, logs } = result;
  const baseline = createAuditBaseline(game, next.turn);
  const audit = auditTurnChanges(baseline, next);
  const resolution = createTurnResolution([], [], progress, next);
  const hints = eventDirections(resolution.derivedEffects.narrativeEvents);
  const memory = computeMemoryUpdate(game, action, [narrative, hints].filter(Boolean).join('\n\n'), { ...resolution, specialAction: { operation: request.operation, action }, audit }, { settledGame: next });
  // 固定内容明确标注来源，既写入阅读历史，也保留给后续 AI 的场景上下文。
  for (const entry of memory.updates.storyHistory.slice(-2)) entry.source = "fixed";
  const trigger = progress.newTrigger?.presentation || next.triggerState?.active?.find((entry) => entry.status === "available")?.presentation;
  return { ...markNarrativeEventsDelivered(next, resolution.derivedEffects.narrativeEvents), ...memory.updates,
    choices: injectOccultEntryChoice(game.choices, trigger),
    worldEvents: [...game.worldEvents, ...(progress.newTrigger ? [{ id: makeId("event"), turn: next.turn, text: `特殊事件出现：${progress.newTrigger.presentation.title}` }] : [])].slice(-40),
    changeLog: [...game.changeLog, { id: makeId("log"), turn: next.turn, text: action, tone: "success" },
      ...logs.map((text) => ({ id: makeId("log"), turn: next.turn, text, tone: "neutral" })), ...progress.statusTickLogs].slice(-100),
    lastTurnBaseline: baseline, lastTurnAudit: audit, lastTurnMetrics: null,
  };
}
