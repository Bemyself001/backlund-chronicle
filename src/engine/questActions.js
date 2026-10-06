import { engageTrigger, settleQuestStep } from "./triggerEngine.js";
import { questAssistance, syncQuestJournal } from "./questRuntime.js";
import { inspectQuestRoutes, selectedQuestRoute } from "./questRoutes.js";
import { getMapLocation, normalizeLocationKnowledge } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";
import { acceptOrdinaryQuest, resolveOrdinaryQuest, isRewardClaimAction } from "./questLifecycle.js";
import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { allConditionsMatch } from "./triggerConditions.js";
import { terminalTrigger } from "./triggerState.js";
import { findQuestReference } from "./questIdentity.js";
import { recoverMissingQuest } from "./questRecovery.js";
import { reconcileFixedQuestReward } from "./questRewards.js";

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
  const result = entry.source === "quest"
    ? resolveOrdinaryQuest(game, game.quests.find(quest => quest.id === entry.questId), { outcome: "progress", steps: [{ objectiveId: route.objectiveId }], evidence: route.description }, action, turn)
    : settleQuestStep(game, entry.id, route.objectiveId, turn, action, `按已确认条件完成：${route.description}`, action);
  return { ...result, taskMinutes: result.ok ? Math.max(route.costMinutes, result.taskMinutes || 0) : undefined,
    questAttempt: { id: entry.id, stage: entry.stage, outcome: result.ok ? "progress" : "blocked", evidence: result.reason || route.description } };
}

export function resolveQuestAction(game, args, action, turn) {
  const draft = structuredClone(game);
  let journal = syncQuestJournal(draft);
  let reference = findQuestReference(draft, args.instanceId);
  let recovered = false;
  if (!reference.ok && args.recovery) {
    const restored = recoverMissingQuest(draft, args.recovery, args.instanceId, turn);
    if (!restored.ok) return restored;
    journal = syncQuestJournal(draft);
    reference = findQuestReference(draft, restored.id);
    recovered = true;
  }
  if (!reference.ok) return reference;
  const id = reference.id;
  const entry = journal.entries[id];
  const quote = String(args.actionQuote || "").trim();
  let evidence = String(args.evidence || "").trim();
  if (!entry) return { ok: false, reason: "任务必须已经可见或通过quest.add登记" };
  if (entry.source === "quest" && draft.quests.find(item => item.id === entry.questId)?.source === "特殊行动") return { ok: false, reason: "此委托由特殊行动引擎结算，请在特殊行动内选择处理方式" };
  if (quote.length < 2 || !String(action || "").includes(quote)) return { ok: false, reason: "任务判断必须引用玩家本轮真实行动" };
  if (evidence.length < 4) return { ok: false, reason: "必须提供当前行动的具体结果或受阻原因" };
  if (!["progress", "blocked", "failed", "recover", "claim"].includes(args.outcome)) return { ok: false, reason: "无效的任务行动结果" };
  if (entry.source === "quest" && ["progress", "recover", "claim"].includes(args.outcome) && /不要|不想|不愿|不再|拒绝|取消|放弃|暂不|先不|是否|能否|如果|假如/.test(action)) return { ok: false, reason: "否定、取消、假设或询问意图不能当作普通任务行动已经完成" };
  if (args.outcome === "claim" && !isRewardClaimAction(action)) return { ok: false, reason: "领取报酬须由玩家实际交差或领奖触发" };
  if (recovered && args.outcome === "progress" && !args.steps?.length) {
    Object.assign(game, draft);
    return { ok: true, outcome: "planned", completedSteps: [], taskMinutes: 5, questAttempt: { id, stage: entry.stage, outcome: "planned", evidence: "已根据原始记录恢复委托，保留已核验进度与约定报酬" } };
  }
  if (args.outcome === "claim" && entry.source === "trigger") {
    if (entry.status === "completed") {
      const result = reconcileFixedQuestReward(draft, reference.instance, turn);
      if (result.ok) Object.assign(game, draft);
      return result;
    }
    return { ok: false, reason: "预设支线须完成任务簿中的交付或收尾目标；奖励随该目标自动结算，请使用progress和当前objectiveId" };
  }
  if (entry.status === "available") {
    if (!args.start || /不要|不想|不愿|不再|拒绝|是否|能否|如果|假如|路过|休息|睡觉/.test(quote)) return { ok: false, reason: "尚未明确开始追查，不能自动接取任务" };
    const engagement = entry.source === "quest" ? acceptOrdinaryQuest(draft, draft.quests.find(quest => quest.id === entry.questId), turn) : engageTrigger(draft, id, turn, quote);
    if (!engagement.ok) return engagement;
  } else if (entry.status !== "engaged" && !(args.outcome === "claim" && entry.status === "completed")) return { ok: false, reason: "任务已经结束，不能重复推进或重新发奖" };
  let outcome = args.outcome;
  let taskMinutes;
  let rewardSettlement;
  const completedSteps = [];
  const inventoryChanges = [];
  let blockedReason = "";
  if (["blocked", "failed"].includes(outcome)) {
    if (entry.source === "quest") {
      const result = resolveOrdinaryQuest(draft, draft.quests.find(quest => quest.id === entry.questId), args, action, turn);
      if (!result.ok) return result;
      evidence = result.evidence || evidence;
    } else if (outcome === "blocked") {
      const inspection = inspectQuestRoutes(draft, syncQuestJournal(draft).entries[id]);
      if (inspection.routes.some(route => route.objectiveId && !route.failure)) return { ok: false, reason: "当前存在经本地验证的可执行任务分支，不能宣称整个任务受阻" };
      if (!inspection.blockers.length) return { ok: false, reason: "当前没有本地状态证实这项阻碍，不能凭文字增加障碍" };
      evidence = inspection.blockers.join("；");
    } else {
      const instance = draft.triggerState.active.find(item => item.instanceId === id);
      const definition = getInstanceTriggerDefinition(instance, draft);
      const stage = definition?.stages?.find(item => item.id === instance.stage);
      const conditions = stage?.failWhen || definition?.failWhen || [];
      if (!conditions.length || !allConditionsMatch(conditions, { game: draft, state: draft.triggerState, instance, action, turn })) return { ok: false, reason: "当前状态尚未满足既有任务定义的失败条件" };
      terminalTrigger(draft.triggerState, instance, "failed", turn);
    }
  }
  if (outcome === "recover") {
    const assistance = questAssistance(draft, syncQuestJournal(draft).entries[id]);
    if (!assistance?.recoverable) return { ok: false, reason: "当前任务没有可用的恢复路线，终章和危险阶段不得自动解围" };
    const recovery = resolveSelectedQuestRoute(draft, action, turn, id);
    if (!recovery?.ok) return { ok: false, reason: recovery?.reason || "必须选择当前经过本地核验的具体路线，不能用一段建议替代实际突破" };
    completedSteps.push(recovery);
    inventoryChanges.push(...(recovery.inventoryChanges || []));
    taskMinutes = recovery.taskMinutes;
    evidence = recovery.questAttempt.evidence;
    outcome = "progress";
  } else if (["progress", "claim"].includes(outcome)) {
    if (entry.source === "quest") {
      const quest = draft.quests.find(item => item.id === entry.questId);
      const result = resolveOrdinaryQuest(draft, quest, args, action, turn);
      if (!result.ok) return result;
      completedSteps.push(...result.completedSteps);
      taskMinutes = result.taskMinutes;
      outcome = result.outcome;
      rewardSettlement = result.rewardSettlement;
      inventoryChanges.push(...(result.inventoryChanges || []));
    } else {
      if (!Array.isArray(args.steps) || !args.steps.length || args.steps.length > 3) return { ok: false, reason: "每次必须提交一至三个实际完成的连续目标" };
      for (const step of args.steps) {
        const result = settleQuestStep(draft, id, String(step.objectiveId || ""), turn, action, String(step.evidence || evidence), String(step.actionQuote || quote));
        if (!result.ok) { blockedReason = result.reason; break; }
        completedSteps.push(result);
        taskMinutes = (taskMinutes || 0) + (result.taskMinutes || 0);
        if (result.isolated && completedSteps.length < args.steps.length) { blockedReason = "关键或危险阶段已结算，下一步需玩家另行决定"; break; }
      }
      if (!completedSteps.length) return { ok: false, reason: blockedReason || "任务行动未通过本地校验" };
    }
  }
  syncQuestJournal(draft);
  Object.assign(game, draft);
  return { ok: true, outcome, completedSteps, blockedReason, taskMinutes: taskMinutes || undefined,
    ...(rewardSettlement ? { rewardSettlement } : {}),
    ...(inventoryChanges.length ? { inventoryChanges, inventoryChange: inventoryChanges[0] } : {}),
    questAttempt: { id, stage: entry.stage, outcome, localProgress: completedSteps.some(step => step.questAttempt?.localProgress), evidence: blockedReason || evidence },
  };
}
