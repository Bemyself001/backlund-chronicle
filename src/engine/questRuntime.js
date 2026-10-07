import { getInstanceTriggerDefinition, getTriggerDefinition } from "./triggerDefinitions.js";
import { inspectQuestRoutes } from "./questRoutes.js";
import { triggerGuidance } from "./triggerGuidance.js";
import { syncKnownPeople } from "./people.js";
import { migrateQuestLifecycle, normalizeQuestStatus } from "./questLifecycle.js";
import { commissionView, isIssuedCommission, issuedCommissionObjective } from "./commissions.js";

export const QUEST_ENGINE_RULE = "【最高优先级：任务引擎契约】开始任务必须通过工具登记名称、摘要、当前目标；固定调查使用quest.resolve，source=特殊行动的委托必须通过特殊行动引擎处理。普通任务用quest.add登记有限contract：coreGoal、nodes[{id,objective,conditions,minutes}]、completionConditions、failureConditions、rewards；conditions只引用当前可验证的地点、物品、事实、线索或行动，不能自造已满足事实。接取时冻结核心目标、条件与奖励。随机小任务2—3必要节点、最多1主要阻碍；支线3—5节点、最多2阻碍；主线每章3—5节点，跑腿最多1层。真实到达、交付、治疗、谈话、战斗及既有证据均可推进，不要求每回合新增线索或新目标。普通步骤最多串行3个，危险、重大选择、倒计时、终章独立结算。引用真实actionQuote并提交冻结目标的steps，不能把意图、否定、假设当作完成。blocked/failed必须有本地现存状态验证；技术工具失败不能改写成NPC阻碍或消耗时间。第一次无进展说明具体原因，第二次展示本地验证的执行路线，玩家选后才执行。语义改名、重复线索不重置停滞；证据和许可持续有效，除非有真实事件改变。完成则按冻结条件结算并归档；后续钩子只能是可选的新任务。quest.update不得改变状态、目标、条件或奖励。未接随机机会10回合到期，接取后只受自身期限约束，固定主支线保留。叙事必须服从本地状态，不提前揭露未知目的地或后续真相。旧复杂任务requiresInvestigation时，玩家调查原任务后通过quest.resolve.legacyPlan一次性补录：coreGoal须逐字不变，evidenceIds引用已登记线索/事实，nodes限定1—3个真实可验证阶段，completionConditions至少包含具体事实、物品或状态；不得改奖励。补录只固定计划，不算完成或进展，后续执行steps才能结案。有契约后不得再次补录。付款/交付可用节点cost{amountPence,itemId,quantity}原子扣除；后续用quest-proof{nodeId,minPaidPence,itemId,quantity}核验永久凭证，不能要求已交付物品仍留在背包。不要再重复调用扣款/移除物品工具。";

const text = value => typeof value === "string" ? value.trim() : "";
const active = status => ["available", "engaged"].includes(status);
export function questStagePolicy(definition, stage) {
  const currentStage = getTriggerDefinition(definition?.id)?.stages?.find(entry => entry.id === stage?.id);
  stage = { ...stage, finale: stage?.finale || currentStage?.finale, dangerous: stage?.dangerous || currentStage?.dangerous, majorDecision: stage?.majorDecision || currentStage?.majorDecision, irreversible: stage?.irreversible || currentStage?.irreversible };
  const finale = Boolean(definition?.finale || stage?.finale);
  const timed = Boolean(definition?.timers?.some(timer => timer.stages.includes(stage?.id)));
  const isolated = finale || timed || Boolean(stage?.dangerous || stage?.majorDecision || stage?.irreversible);
  return { finale, isolated, canChain: !isolated, canRecover: !isolated };
}

function journalEntry(game, instance) {
  const definition = getInstanceTriggerDefinition(instance, game);
  const stage = definition?.stages?.find(entry => entry.id === instance.stage);
  const guidance = triggerGuidance(game, instance);
  const terminal = !active(instance.status);
  const goal = guidance.text || (terminal ? ({ completed: "任务已完成", failed: "任务失败，后果已保留", abandoned: "已主动放弃", expired: "线索已失效" }[instance.status])
    : stage?.guidance || stage?.transitions?.[0]?.description || instance.presentation?.text || "调查已知线索，确认下一步行动");
  return {
    id: instance.instanceId, source: "trigger", title: text(instance.presentation?.title) || text(definition?.presentation?.title) || "未命名调查",
    summary: text(instance.lastProgressEvidence) || text(instance.presentation?.text) || text(goal), objective: text(goal),
    status: instance.status, stage: instance.stage, revision: `${instance.status}:${instance.stage}:${instance.stageHistory?.length || 0}:${guidance.key}`,
    expiresAtTurn: instance.status === "available" ? instance.expiresTurn : undefined,
    ...(instance.definitionId === "side.queens.renard-fall" ? { treatmentReady: instance.treatmentReady === 1 ? 1 : 0 } : {}),
    startedTurn: instance.engagedTurn ?? instance.createdTurn, updatedTurn: game.turn,
    policy: questStagePolicy(definition, stage),
  };
}

export function syncQuestJournal(game) {
  migrateQuestLifecycle(game);
  const previous = game.questJournal && typeof game.questJournal === "object" ? game.questJournal : {};
  const entries = { ...(previous.entries || {}) };
  for (const instance of [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])]) {
    if (instance.status === "eligible") continue;
    const entry = journalEntry(game, instance);
    entries[entry.id] = { ...entries[entry.id], ...entry };
  }
  for (const quest of game.quests || []) {
    const status = normalizeQuestStatus(quest.status);
    const id = `quest:${quest.id}`;
    if (isIssuedCommission(quest)) {
      const commission = commissionView(game, quest);
      entries[id] = { id, source: "quest", questId: quest.id, title: quest.title, summary: quest.summary,
        objective: issuedCommissionObjective(game, quest), status: quest.status, kind: "side", stage: commission.phase,
        revision: `commission:${commission.phase}:${quest.commission.revision}`, locationId: quest.locationId, commission,
        policy: { finale: false, isolated: true, canChain: false, canRecover: false }, startedTurn: quest.createdTurn, updatedTurn: game.turn };
      continue;
    }
    const summary = text(quest.summary) || `你已开始调查「${quest.title || "未命名任务"}」。`;
    const currentNode = quest.lifecycle?.contract?.nodes?.find(node => !quest.lifecycle.completedNodeIds.includes(node.id));
    const objective = status === "engaged" ? text(quest.objective) || quest.objectives?.find(item => !item.completed)?.text || summary : ({ completed: "任务已完成", failed: "任务失败，后果已保留", abandoned: "已主动放弃" }[status]) || summary;
    entries[id] = { ...entries[id], id, source: "quest", questId: quest.id, title: text(quest.title) || "未命名任务", summary, objective, status,
      stage: String(quest.stage || currentNode?.id || "investigate"), revision: `${status}:${quest.stage || "investigate"}:${quest.lifecycle?.progressCount || 0}:${objective}`,
      kind: quest.kind, expiresTurn: status === "available" ? quest.lifecycle?.offerExpiresTurn : quest.lifecycle?.deadlineTurn,
      expiresAtTurn: status === "available" ? quest.lifecycle?.offerExpiresTurn : quest.lifecycle?.deadlineTurn,
      policy: quest.source === "特殊行动" ? { finale: false, isolated: true, canChain: false, canRecover: false } : questStagePolicy(quest, { ...quest, dangerous: quest.dangerous || currentNode?.dangerous, majorDecision: quest.majorDecision || currentNode?.majorDecision }), startedTurn: entries[id]?.startedTurn ?? game.turn, updatedTurn: game.turn };
  }
  game.questJournal = { version: 1, entries, attempts: { ...(previous.attempts || {}) } };
  syncKnownPeople(game);
  return game.questJournal;
}

export function visibleQuestJournal(game) {
  const projection = { ...game, quests: structuredClone(game.quests), questJournal: structuredClone(game.questJournal), triggerState: structuredClone(game.triggerState) };
  return Object.values(syncQuestJournal(projection).entries);
}

export function projectQuestJournal(game) {
  const entries = visibleQuestJournal(game);
  const byTracked = (a, b) => Number(b.id === game.trackedQuestId) - Number(a.id === game.trackedQuestId);
  return { active: entries.filter(entry => entry.status === "engaged").sort(byTracked),
    opportunities: entries.filter(entry => entry.status === "available").sort(byTracked),
    archive: entries.filter(entry => !["available", "engaged"].includes(entry.status)),
    issued: entries.filter(entry => entry.commission).sort(byTracked) };
}

export function recordQuestAttempt(game, id, { outcome, evidence = "", stage, turn }) {
  const journal = syncQuestJournal(game);
  const entry = journal.entries[id];
  if (!entry || entry.commission || entry.status !== "engaged") return;
  const previous = journal.attempts[id] || {};
  if (previous.lastTurn === turn) return;
  const progressed = outcome === "progress";
  const stalled = progressed ? 0 : Number(previous.stalled || 0) + 1;
  journal.attempts[id] = {
    stage: entry.stage, lastTurn: turn, stalled, hintLevel: Math.min(3, stalled), outcome,
    evidence: text(evidence), recoveryUsed: progressed ? false : previous.recoveryUsed || outcome === "recover",
    recoveryLead: outcome === "recover" ? text(evidence) : progressed ? "" : previous.recoveryLead || "",
    attemptedStage: stage || entry.stage,
  };
}

export function questAssistance(game, entry) {
  if (entry.commission) return null;
  const attempt = game.questJournal?.attempts?.[entry.id];
  if (!attempt || attempt.stage !== entry.stage || entry.status !== "engaged") return null;
  const level = attempt.hintLevel || 0;
  const inspection = inspectQuestRoutes(game, entry);
  const routes = level >= 2 ? inspection.routes.filter(route => route.automatic) : [];
  const recoveryAction = routes[0] ? `花${routes[0].costMinutes}分钟${routes[0].label}` : "";
  const blocker = inspection.blockers.join("；") || attempt.evidence;
  return { level, recoverable: routes.length > 0, recoveryAction,
    recoveryCostMinutes: routes[0]?.costMinutes || 20, routes, availableActions: inspection.routes, blockers: inspection.blockers,
    text: level >= 1 ? `${entry.objective}\n${blocker ? `本轮未推进原因：${blocker}。` : "尚未确认约定行动已经实际完成。"}${routes.length ? "已有可行的行动路线，可以选择其中一条继续。" : entry.policy.isolated ? "这是关键或危险阶段，需要权衡当前条件与行动后果。" : "按已登记的目标与条件执行即可，无须额外寻找新线索。"}` : "",
  };
}

export function settleQuestAttempts(game, calls, results, turn, action = "") {
  syncQuestJournal(game);
  const attempts = new Map();
  const priority = { unconfirmed: -1, planned: -1, blocked: 0, failed: 1, recover: 2, progress: 3, claimed: 3 };
  for (const [index, call] of calls.entries()) {
    const result = results[index];
    let attempt = result?.data?.questAttempt;
    if (!attempt && ["trigger.progress", "quest.update", "quest.resolve"].includes(call.name)) {
      const id = call.name === "quest.update" ? `quest:${call.args?.questId}` : call.args?.instanceId;
      attempt = { id, outcome: "unconfirmed", evidence: result?.ok === false ? "任务工具未通过本地校验，尚未产生游戏内结果" : "尚未确认实际目标进展" };
    }
    if (attempt && (!attempts.has(attempt.id) || priority[attempt.outcome] >= priority[attempts.get(attempt.id).outcome])) attempts.set(attempt.id, attempt);
  }
  for (const result of results.slice(calls.length)) {
    const attempt = result?.data?.questAttempt;
    if (attempt) attempts.set(attempt.id, attempt);
  }
  // Recover focused attempts even when the model omits or rejects its tool call.
  if (!/暂时搁置|放弃|休息|睡觉|闲逛|不要|不想|不愿|是否|如果/.test(action)) {
    for (const entry of Object.values(game.questJournal.entries)) {
      if (entry.commission || entry.status !== "engaged" || attempts.has(entry.id)) continue;
      const instance = game.triggerState?.active?.find(item => item.instanceId === entry.id);
      const definition = instance && getInstanceTriggerDefinition(instance, game);
      const stage = definition?.stages?.find(item => item.id === instance.stage);
      const words = `${entry.objective}${entry.title}`;
      const specific = Array.from(words).some((_, index) => {
        const word = words.slice(index, index + 2);
        return /^[\u4e00-\u9fff]{2}$/.test(word) && !/调查|询问|了解|线索|继续|查找|记录|寻找|前往|查阅|确认|已经|相关|资料|完成|任务|当前|一步|进行|处理/.test(word) && action.includes(word);
      });
      const matches = specific && (/调查|询问|寻找|查阅|检查|打听|核对|请教|帮忙|查看|交谈/.test(action) || stage?.transitions?.some(transition => transition.actionTerms?.some(term => term.length >= 2 && action.includes(term))));
      if (action.includes(entry.title) || matches) attempts.set(entry.id, { id: entry.id, outcome: "unconfirmed", evidence: "本轮尚未确认约定行动已经完成，无须另外制造线索或障碍" });
    }
  }
  for (const attempt of attempts.values()) {
    const instance = game.triggerState?.active?.find(entry => entry.instanceId === attempt.id);
    const advanced = instance?.stageHistory?.some(entry => entry.turn === turn && entry.from !== entry.to && !["eligible", "available"].includes(entry.from));
    const quest = game.quests?.find(item => `quest:${item.id}` === attempt.id);
    const confirmed = advanced || quest?.lastProgressTurn === turn || attempt.localProgress;
    recordQuestAttempt(game, attempt.id, { ...attempt, outcome: confirmed ? "progress" : attempt.outcome === "progress" ? "blocked" : attempt.outcome, turn });
  }
}

export function questJournalEvents(game) {
  return visibleQuestJournal(game).filter(entry => entry.status !== "available").flatMap(entry => {
    const assistance = questAssistance(game, entry);
    const id = `task-journal:${entry.id}:${entry.revision}:${assistance?.level || 0}:${assistance?.level >= 2 ? game.questJournal?.attempts?.[entry.id]?.lastTurn : ""}:${JSON.stringify(assistance?.routes || [])}`;
    if (game.narrativeEventsDelivered?.[id]) return [];
    const engaged = entry.status === "engaged";
    return [{ id, title: entry.title, questId: entry.id, reason: "任务状态与当前方向已由本地引擎确认",
      direction: assistance?.text || entry.objective, narrativeCue: "承接刚取得的结果，只描写当前已知目标，不重复开局或提前揭露后续。",
      choices: entry.commission && engaged ? [
        { label: `查看「${entry.title}」的委托进度`, intent: "commission", risk: "low" },
        { label: entry.commission.phase === "offered" ? `确认「${entry.title}」的报价并支付${entry.commission.feePence}便士调查费用` : entry.commission.phase === "ready" ? `领取「${entry.title}」的调查报告` : `向${entry.commission.executorName}询问「${entry.title}」的委托进度`, intent: "commission", risk: "low" },
        { label: "等待调查期间处理自己的其他事情", intent: "redirect", risk: "low" },
      ] : engaged ? [
        { label: entry.stage === "awaiting-reward" ? `向「${entry.title}」的委托人交差，领取约定报酬` : assistance?.recoverable ? assistance.recoveryAction : assistance?.level >= 2 && assistance.availableActions[0] ? assistance.availableActions[0].label : assistance?.level >= 2 && assistance.blockers[0] ? `先解决「${entry.title}」的条件：${assistance.blockers[0]}` : `继续调查「${entry.title}」：${entry.objective}`, intent: "investigate", risk: entry.policy.isolated ? "medium" : "low" },
        { label: assistance?.routes?.[1] ? `花${assistance.routes[1].costMinutes}分钟${assistance.routes[1].label}` : `梳理「${entry.title}」的已有线索，确认仍缺少的条件`, intent: "investigate", risk: "low" },
        { label: `暂时搁置「${entry.title}」，处理其他事情`, intent: "redirect", risk: "low" },
      ] : [
        { label: `回顾「${entry.title}」的调查结果`, intent: "observe", risk: "low" },
        { label: "查看手记中的其他线索，选择下一件要调查的事", intent: "investigate", risk: "low" },
        { label: "暂时结束调查，安排接下来的日常生活", intent: "redirect", risk: "low" },
      ],
    }];
  });
}
