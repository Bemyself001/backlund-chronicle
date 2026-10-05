import { applyStatDelta, syncStatCollapseStatuses } from "./statChanges.js";
import { processTriggers } from "./triggerEngine.js";
import { timedAction } from "./restTime.js";
import { advanceWorldTime } from "./worldTime.js";
import { settleInnRest } from "./recovery.js";
import { resolveSelectedQuestRoute } from "./questActions.js";

export { advanceWorldTime } from "./worldTime.js";

// 每轮结算：所有带 tick 的状态对角色数值生效（截断与归零联动由 applyStatDelta 统一处理）。
export function settleStatusTicks(game) {
  const ticks = [];
  for (const status of game.statusEffects || []) {
    for (const [stat, delta] of Object.entries(status.tick || {})) {
      const change = applyStatDelta(game, stat, delta);
      if (change) ticks.push({ status: status.name, ...change });
    }
  }
  return ticks;
}

const DANGEROUS_ACTION = /(?:强行|闯入|破门|袭击|搏斗|开枪|追逐|追踪|尾随|冒险|仪式|召唤|通灵|窥探|潜入|偷窃|威胁|独自进入|不顾危险)/i;
const TRAVEL_ACTION = /(?:乘火车|搭火车|乘船|搭船|跨区|长途|前往郊外|离开贝克兰德)/i;
const INVESTIGATE_ACTION = /(?:调查|搜查|查阅|研究|检查|检视|跟踪|打听|寻找|勘察|监听|观察)/i;
const SOCIAL_ACTION = /(?:交谈|询问|请教|拜访|谈判|购买|购物|吃饭|用餐|喝茶|喝酒|工作|应聘)/i;
const QUICK_ACTION = /(?:看一眼|环顾|倾听|等待片刻|整理|装备|卸下)/i;

function successfulTool(toolCalls, toolResults, predicate) {
  return toolCalls.some((call, index) => toolResults[index]?.ok && predicate(call));
}

export function minutesForTurn(action, toolCalls = [], toolResults = [], worldTime = "") {
  const text = String(action || "");
  const taskMinutes = toolResults.filter(result => result?.ok).map(result => result.data?.taskMinutes).filter(value => Number.isInteger(value) && value > 0);
  if (taskMinutes.length) return Math.max(...taskMinutes);
  const timing = timedAction(text, worldTime);
  if (timing) return timing.elapsedMinutes;
  if (TRAVEL_ACTION.test(text)) return 75;
  const movementIndex = toolCalls.findIndex((call, index) => call.name === "location.move" && toolResults[index]?.ok);
  if (movementIndex >= 0) return Math.max(1, Number(toolResults[movementIndex]?.data?.travelMinutes) || 35);
  if (INVESTIGATE_ACTION.test(text)) return 25;
  if (SOCIAL_ACTION.test(text)) return 10;
  if (QUICK_ACTION.test(text)) return 5;
  return 12;
}

export function dangerDeltaForTurn({ action, selectedRisk, toolCalls = [], toolResults = [] }) {
  if (selectedRisk === "high" || (!selectedRisk && DANGEROUS_ACTION.test(String(action || "")))) return 1;
  const dangerousStatusAccepted = successfulTool(toolCalls, toolResults, (call) => (
    call.name === "status.add" && call.args?.status?.kind === "danger"
  ));
  return dangerousStatusAccepted ? 1 : 0;
}

export function occultEntryForTurn(game, nextTurn) {
  const clone = structuredClone(game);
  const result = processTriggers(clone, { action: "调查异常线索", turn: nextTurn });
  const entry = result.occultEntry;
  return entry ? { id: entry.instanceId, turn: entry.createdTurn, ...entry.presentation } : null;
}

export function resolveTurnProgress(game, action, selectedRisk, toolCalls = [], toolResults = [], options = {}) {
  const timing = timedAction(action, game.worldTime);
  // Execute the player's exact local route even when the AI omitted quest.resolve.
  const recovery = resolveSelectedQuestRoute(game, action, Number(game.turn || 0) + 1);
  if (recovery) toolResults = [...toolResults, { ok: recovery.ok, data: recovery }];
  const elapsedMinutes = Number.isInteger(options.elapsedMinutes) && options.elapsedMinutes > 0
    ? options.elapsedMinutes : minutesForTurn(action, toolCalls, toolResults, game.worldTime);
  const localTaskTiming = toolResults.find(result => result?.ok && Number.isInteger(result.data?.taskMinutes) && result.data.taskMinutes > 0);
  const dangerDelta = dangerDeltaForTurn({ action, selectedRisk, toolCalls, toolResults });
  const statusTicks = settleStatusTicks(game);
  const restRecovery = settleInnRest(game, action, elapsedMinutes);
  const statusTickLogs = statusTicks.map((tick) => `状态「${tick.status}」结算：${tick.label} ${tick.before}→${tick.after}（${tick.delta > 0 ? "+" : ""}${tick.delta}）${tick.autoStatus ? `；${tick.autoStatus}` : ""}`);
  const nextTurn = Number(game.turn || 0) + 1;
  statusTickLogs.push(...restRecovery.map(change => `旅馆休息：${change.label} ${change.before}→${change.after}`));
  const worldTime = advanceWorldTime(game.worldTime, elapsedMinutes);
  game.worldTime = worldTime;
  const triggerProgress = processTriggers(game, { action, toolCalls, toolResults, turn: nextTurn, travelOnly: Boolean(options.travelOnly) });
  // Promotion recovery is the final stat settlement of this turn; ongoing effects remain.
  const advancementRecovery = successfulTool(toolCalls, toolResults, call => call.name === "advancement.promote")
    ? ["health", "sanity"].map(stat => {
      const maxKey = `max${stat[0].toUpperCase()}${stat.slice(1)}`;
      return applyStatDelta(game, stat, game.character.stats[maxKey] - game.character.stats[stat]);
    }).filter(Boolean) : [];
  if (advancementRecovery.length) {
    syncStatCollapseStatuses(game);
    statusTickLogs.push(...advancementRecovery.map(change => `晋升恢复：${change.label} ${change.before}→${change.after}`));
  }
  const occultEntry = triggerProgress.occultEntry ? { id: triggerProgress.occultEntry.instanceId, turn: triggerProgress.occultEntry.createdTurn, ...triggerProgress.occultEntry.presentation } : null;
  return {
    elapsedMinutes,
    timedAction: timing ? {
      ...timing,
      requestedMinutes: timing.elapsedMinutes,
      elapsedMinutes,
      status: elapsedMinutes < timing.elapsedMinutes ? "interrupted" : timing.source === "unresolvedEnd" && !localTaskTiming ? "pending" : "completed",
      // Only accepted local task/fixed-action timing can shorten this action.
      interruptionReason: elapsedMinutes < timing.elapsedMinutes
        ? localTaskTiming?.log || "本地事件结算提前结束了本次行动"
        : null,
    } : null,
    restRecovery,
    advancementRecovery,
    dangerDelta,
    statusTicks,
    statusTickLogs,
    worldTime,
    occult: game.occult,
    triggerState: game.triggerState,
    triggerEvents: triggerProgress.events,
    triggerSignals: triggerProgress.signals,
    newTrigger: triggerProgress.newTrigger,
    occultEntry,
    hiddenDanger: {
      ...game.hiddenDanger,
      stage: Math.min(5, Math.max(0, Number(game.hiddenDanger?.stage || 0) + dangerDelta)),
    },
  };
}
