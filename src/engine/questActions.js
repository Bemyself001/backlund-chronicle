import { engageTrigger, settleQuestStep } from "./triggerEngine.js";
import { questAssistance, syncQuestJournal } from "./questRuntime.js";
import { selectedQuestRoute } from "./questRoutes.js";
import { getMapLocation, normalizeLocationKnowledge } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";

export function resolveSelectedQuestRoute(game, action, turn, expectedId) {
  const selected = selectedQuestRoute(game, syncQuestJournal(game).entries, action);
  if (!selected) return null;
  const { entry, route } = selected;
  if (expectedId && entry.id !== expectedId) return { ok: false, reason: "所选路线不属于本次提交的任务" };
  if (route.locationId) {
    const location = getMapLocation(route.locationId, game);
    const travel = travelToLocation(game, route.locationId);
    if (!travel) return { ok: false, reason: "当前地图无法到达目的地" };
    game.location = { id: location.id, name: location.name, district: `贝克兰德${location.district}` };
    game.locationKnowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, location.id, game);
    game.locationKnowledge[location.id] = { ...game.locationKnowledge[location.id], status: "visited", visitedAt: `第${turn}轮` };
    return { ok: true, taskMinutes: route.costMinutes,
      questAttempt: { id: entry.id, stage: entry.stage, outcome: "progress", localProgress: true, evidence: route.description } };
  }
  const result = settleQuestStep(game, entry.id, route.objectiveId, turn, action, `按已确认条件完成：${route.description}`, action);
  return { ...result, taskMinutes: result.ok ? Math.max(route.costMinutes, result.taskMinutes || 0) : undefined,
    questAttempt: { id: entry.id, stage: entry.stage, outcome: result.ok ? "progress" : "blocked", evidence: result.reason || route.description } };
}

export function resolveQuestAction(game, args, action, turn) {
  const draft = structuredClone(game);
  const journal = syncQuestJournal(draft);
  const id = String(args.instanceId || "");
  const entry = journal.entries[id];
  const quote = String(args.actionQuote || "").trim();
  let evidence = String(args.evidence || "").trim();
  if (!entry) return { ok: false, reason: "任务必须已经可见或通过quest.add登记" };
  if (entry.source === "quest" && draft.quests.find(item => item.id === entry.questId)?.source === "特殊行动") return { ok: false, reason: "此委托由特殊行动引擎结算，请在特殊行动内选择处理方式" };
  if (quote.length < 2 || !String(action || "").includes(quote)) return { ok: false, reason: "任务判断必须引用玩家本轮真实行动" };
  if (evidence.length < 4) return { ok: false, reason: "必须提供当前行动的具体结果或受阻原因" };
  if (!["progress", "blocked", "failed", "recover"].includes(args.outcome)) return { ok: false, reason: "无效的任务行动结果" };
  if (entry.status === "available") {
    if (!args.start || /不要|不想|不愿|不再|拒绝|是否|能否|如果|假如|路过|休息|睡觉/.test(quote)) return { ok: false, reason: "尚未明确开始追查，不能自动接取任务" };
    const engagement = engageTrigger(draft, id, turn, quote);
    if (!engagement.ok) return engagement;
  } else if (entry.status !== "engaged") return { ok: false, reason: "任务已经结束，不能重复推进或重新发奖" };
  let outcome = args.outcome;
  let taskMinutes;
  const completedSteps = [];
  let blockedReason = "";
  if (outcome === "recover") {
    const assistance = questAssistance(draft, syncQuestJournal(draft).entries[id]);
    if (!assistance?.recoverable) return { ok: false, reason: "当前任务没有可用的恢复路线，终章和危险阶段不得自动解围" };
    const recovery = resolveSelectedQuestRoute(draft, action, turn, id);
    if (!recovery?.ok) return { ok: false, reason: recovery?.reason || "必须选择当前经过本地核验的具体路线，不能用一段建议替代实际突破" };
    completedSteps.push(recovery);
    taskMinutes = recovery.taskMinutes;
    evidence = recovery.questAttempt.evidence;
    outcome = "progress";
  } else if (outcome === "progress") {
    if (entry.source === "quest") {
      // Freeform tasks use the same journal and attempts, but cannot mint rewards.
      const quest = draft.quests.find(item => item.id === entry.questId);
      const objective = String(args.nextObjective || "").trim();
      if (!objective || !evidence) return { ok: false, reason: "普通任务推进必须说明结果与新的当前目标" };
      if (quest.lastProgressTurn === turn) return { ok: false, reason: "普通任务本轮已经结算" };
      const evidenceIds = [...new Set(Array.isArray(args.evidenceIds) ? args.evidenceIds : [])];
      if (!evidenceIds.length || evidenceIds.some(id => !draft.clues.some(clue => clue.id === id && clue.discoveredTurn === turn) || quest.progressEvidenceIds?.includes(id))) return { ok: false, reason: "普通任务推进需要本轮通过clue.add登记的新证据及evidenceIds；改写目标或重复旧线索不算进展" };
      if (objective === entry.objective) return { ok: false, reason: "当前目标没有变化，不能重复结算相同步骤" };
      quest.summary = evidence;
      quest.objective = objective;
      quest.lastProgressTurn = turn;
      quest.progressEvidenceIds = [...(quest.progressEvidenceIds || []), ...evidenceIds];
      completedSteps.push({ from: entry.objective, to: objective });
    } else {
      if (!Array.isArray(args.steps) || !args.steps.length || args.steps.length > 3) return { ok: false, reason: "每次必须提交一至三个实际完成的连续目标" };
      for (const step of args.steps) {
        const result = settleQuestStep(draft, id, String(step.objectiveId || ""), turn, action, String(step.evidence || evidence), String(step.actionQuote || quote));
        if (!result.ok) { blockedReason = result.reason; break; }
        completedSteps.push(result);
        taskMinutes = (taskMinutes || 0) + (result.taskMinutes || 0);
        if (result.isolated && completedSteps.length < args.steps.length) { blockedReason = "关键或危险阶段已结算，下一步需玩家另行决定"; break; }
      }
      if (!completedSteps.length) outcome = "blocked";
    }
  }
  syncQuestJournal(draft);
  Object.assign(game, draft);
  return { ok: true, outcome, completedSteps, blockedReason, taskMinutes: taskMinutes || undefined,
    questAttempt: { id, stage: entry.stage, outcome, localProgress: completedSteps.some(step => step.questAttempt?.localProgress), evidence: blockedReason || evidence },
  };
}
