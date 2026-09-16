import { getInstanceTriggerDefinition, getTriggerDefinition } from "./triggerDefinitions.js";
import { inspectQuestRoutes } from "./questRoutes.js";
import { triggerGuidance } from "./triggerGuidance.js";

export const QUEST_ENGINE_RULE = "【最高优先级：任务引擎契约】任何已开始任务必须通过工具登记名称、简要信息、当前目标；禁止只在正文宣称接受、推进、完成任务。已有特殊任务使用quest.resolve，新产生的普通任务使用quest.add并提供summary和objective。每次与任务相关的行动都调用quest.resolve：引用玩家原话actionQuote，说明实际结果evidence；steps仅包含本轮真实完成的目标，普通阶段可连续至多三个，重大选择、危险、倒计时、终章必须单独行动。自然语言等价行动不必匹配固定关键词，但不得把否定、假设、意图当作完成。失败或受阻也要登记outcome=failed或blocked；休息、闲逛和无关行动不登记。连续两次无进展明确提示，第三次提供可执行的替代调查途径；普通失败可花时间整理证据并寻求帮助，恢复路线必须经过本地条件验证，玩家明确选择后才结算。普通任务推进必须提供新登记线索的evidenceIds，不能靠改写summary或objective伪造进展。连续碰壁不得增加无依据的新障碍，不得重复推荐已被本地拒绝的行动；先说明实际缺少的条件。恢复失败不能清空停滞次数。终章和危险阶段没有保成功、免代价或自动解围兜底。叙事、手记和行动选项必须服从本地确认的任务状态及当前目标；不得提前透露后续真相。";

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
    startedTurn: instance.engagedTurn ?? instance.createdTurn, updatedTurn: game.turn,
    policy: questStagePolicy(definition, stage),
  };
}

export function syncQuestJournal(game) {
  const previous = game.questJournal && typeof game.questJournal === "object" ? game.questJournal : {};
  const entries = { ...(previous.entries || {}) };
  for (const instance of [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])]) {
    if (instance.status === "eligible") continue;
    const entry = journalEntry(game, instance);
    entries[entry.id] = { ...entries[entry.id], ...entry };
  }
  for (const quest of game.quests || []) {
    const status = ({ active: "engaged", "进行中": "engaged", "已完成": "completed", "失败": "failed", "已失败": "failed", "已放弃": "abandoned" })[quest.status] || quest.status || "engaged";
    const id = `quest:${quest.id}`;
    const summary = text(quest.summary) || `你已开始调查「${quest.title || "未命名任务"}」。`;
    const objective = status === "engaged" ? text(quest.objective) || quest.objectives?.find(item => !item.completed)?.text || summary : ({ completed: "任务已完成", failed: "任务失败，后果已保留", abandoned: "已主动放弃" }[status]) || summary;
    entries[id] = { ...entries[id], id, source: "quest", questId: quest.id, title: text(quest.title) || "未命名任务", summary, objective, status,
      stage: String(quest.stage || "investigate"), revision: `${status}:${quest.stage || "investigate"}:${objective}:${summary}`,
      policy: quest.source === "特殊行动" ? { finale: false, isolated: true, canChain: false, canRecover: false } : questStagePolicy(quest, quest), startedTurn: entries[id]?.startedTurn ?? game.turn, updatedTurn: game.turn };
  }
  game.questJournal = { version: 1, entries, attempts: { ...(previous.attempts || {}) } };
  return game.questJournal;
}

export function visibleQuestJournal(game) {
  const projection = { ...game, questJournal: structuredClone(game.questJournal), triggerState: structuredClone(game.triggerState) };
  return Object.values(syncQuestJournal(projection).entries);
}

export function recordQuestAttempt(game, id, { outcome, evidence = "", stage, turn }) {
  const journal = syncQuestJournal(game);
  const entry = journal.entries[id];
  if (!entry || entry.status !== "engaged") return;
  const previous = journal.attempts[id] || {};
  if (previous.lastTurn === turn) return;
  const progressed = outcome === "progress" || previous.stage && previous.stage !== entry.stage;
  const stalled = progressed ? 0 : (previous.stage === entry.stage ? Number(previous.stalled || 0) : 0) + 1;
  journal.attempts[id] = {
    stage: entry.stage, lastTurn: turn, stalled, hintLevel: Math.min(3, stalled), outcome,
    evidence: text(evidence), recoveryUsed: progressed ? false : previous.recoveryUsed || outcome === "recover",
    recoveryLead: outcome === "recover" ? text(evidence) : progressed ? "" : previous.recoveryLead || "",
    attemptedStage: stage || entry.stage,
  };
}

export function questAssistance(game, entry) {
  const attempt = game.questJournal?.attempts?.[entry.id];
  if (!attempt || attempt.stage !== entry.stage || entry.status !== "engaged") return null;
  const level = attempt.hintLevel || 0;
  const inspection = inspectQuestRoutes(game, entry);
  const routes = level >= 3 ? inspection.routes.filter(route => route.automatic) : [];
  const recoveryAction = routes[0] ? `花${routes[0].costMinutes}分钟${routes[0].label}` : "";
  const blocker = inspection.blockers.join("；") || attempt.evidence;
  return { level, recoverable: routes.length > 0, recoveryAction,
    recoveryCostMinutes: routes[0]?.costMinutes || 20, routes, availableActions: inspection.routes, blockers: inspection.blockers,
    text: level >= 2 ? `${entry.objective}\n${blocker ? `当前阻碍：${blocker}。` : ""}${routes.length ? "已有可行的行动路线，可以选择其中一条继续。" : entry.policy.isolated ? "这是关键或危险阶段，需要权衡当前条件与行动后果。" : "请先解决上述条件；仅仅重复打听并不能带来新的进展。"}` : "",
  };
}

export function settleQuestAttempts(game, calls, results, turn, action = "") {
  syncQuestJournal(game);
  const attempts = new Map();
  const priority = { blocked: 0, failed: 1, recover: 2, progress: 3 };
  for (const [index, call] of calls.entries()) {
    const result = results[index];
    let attempt = result?.data?.questAttempt;
    if (!attempt && ["trigger.progress", "quest.update", "quest.resolve"].includes(call.name)) {
      const id = call.name === "quest.update" ? `quest:${call.args?.questId}` : call.args?.instanceId;
      attempt = { id, outcome: "blocked", evidence: result?.reason || call.args?.evidence };
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
      if (entry.status !== "engaged" || attempts.has(entry.id)) continue;
      const instance = game.triggerState?.active?.find(item => item.instanceId === entry.id);
      const definition = instance && getInstanceTriggerDefinition(instance, game);
      const stage = definition?.stages?.find(item => item.id === instance.stage);
      const words = `${entry.objective}${entry.title}`;
      const specific = Array.from(words).some((_, index) => {
        const word = words.slice(index, index + 2);
        return /^[\u4e00-\u9fff]{2}$/.test(word) && !/调查|询问|了解|线索|继续|查找|记录|寻找|前往|查阅|确认|已经|相关|资料|完成|任务|当前|一步|进行|处理/.test(word) && action.includes(word);
      });
      const matches = specific && (/调查|询问|寻找|查阅|检查|打听|核对|请教|帮忙|查看|交谈/.test(action) || stage?.transitions?.some(transition => transition.actionTerms?.some(term => term.length >= 2 && action.includes(term))));
      if (action.includes(entry.title) || matches) attempts.set(entry.id, { id: entry.id, outcome: "blocked", evidence: "本轮未确认阶段推进或新增任务证据" });
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
      choices: engaged ? [
        { label: assistance?.recoverable ? assistance.recoveryAction : assistance?.level >= 2 && assistance.availableActions[0] ? assistance.availableActions[0].label : assistance?.level >= 2 && assistance.blockers[0] ? `先解决「${entry.title}」的条件：${assistance.blockers[0]}` : `继续调查「${entry.title}」：${entry.objective}`, intent: "investigate", risk: entry.policy.isolated ? "medium" : "low" },
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
