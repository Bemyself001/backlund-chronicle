import { engageTrigger, settleQuestStep } from "./triggerEngine.js";
import { questAssistance, syncQuestJournal } from "./questRuntime.js";

export function resolveQuestAction(game, args, action, turn) {
  const draft = structuredClone(game);
  const journal = syncQuestJournal(draft);
  const id = String(args.instanceId || "");
  const entry = journal.entries[id];
  const quote = String(args.actionQuote || "").trim();
  const evidence = String(args.evidence || "").trim();
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
    if (!/整理|请教|求助|帮助|打听/.test(quote) || /不|拒绝|是否|如果/.test(quote)) return { ok: false, reason: "玩家必须明确选择整理证据或寻求帮助" };
    taskMinutes = assistance.recoveryCostMinutes;
  } else if (outcome === "progress") {
    if (entry.source === "quest") {
      // Freeform tasks use the same journal and attempts, but cannot mint rewards.
      const quest = draft.quests.find(item => item.id === entry.questId);
      const objective = String(args.nextObjective || "").trim();
      if (!objective || !evidence) return { ok: false, reason: "普通任务推进必须说明结果与新的当前目标" };
      if (quest.lastProgressTurn === turn) return { ok: false, reason: "普通任务本轮已经结算" };
      quest.summary = evidence;
      quest.objective = objective;
      quest.lastProgressTurn = turn;
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
    questAttempt: { id, stage: entry.stage, outcome, evidence: blockedReason || evidence },
  };
}
