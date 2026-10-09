import { applyStatDelta, syncStatCollapseStatuses } from "./statChanges.js";
import { processTriggers } from "./triggerEngine.js";
import { timedAction } from "./restTime.js";
import { advanceWorldTime } from "./worldTime.js";
import { settleInnRest } from "./recovery.js";
import { resolveSelectedQuestRoute, resolveQuestAction } from "./questActions.js";
import { isRewardClaimAction } from "./questLifecycle.js";
import { settleHealthEffects } from "./healthEffects.js";
import { chooseQuestFocus } from "./questFocus.js";
import { syncIssuedCommissions } from "./commissions.js";
import { advancementHealthTarget } from "../system/characterStats.js";

export { advanceWorldTime } from "./worldTime.js";

// 每轮结算：所有带 tick 的状态对角色数值生效（截断与归零联动由 applyStatDelta 统一处理）。
export function settleStatusTicks(game) {
  const turn = Number(game.turn || 0) + 1;
  const ticks = settleHealthEffects(game, turn);
  for (const status of game.statusEffects || []) {
    if (status.lastTickTurn >= turn) continue;
    for (const [stat, delta] of Object.entries(status.tick || {})) {
      if (stat === "health") continue;
      const change = applyStatDelta(game, stat, delta);
      if (change) ticks.push({ status: status.name, ...change });
    }
    if (Object.keys(status.tick || {}).some(key => key !== "health")) status.lastTickTurn = turn;
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
  const timing = timedAction(text, worldTime);
  const movementIndex = toolCalls.findIndex((call, index) => call.name === "location.move" && toolResults[index]?.ok);
  const travelMinutes = movementIndex >= 0 ? Math.max(1, Number(toolResults[movementIndex]?.data?.travelMinutes) || 35) : 0;
  // Even an on-site task cannot make a confirmed trip shorter than its route.
  // Completing an unrelated task cannot shorten an explicit calendar/time skip.
  if (timing?.kind === "skip" && timing.source !== "unresolvedEnd") return Math.max(travelMinutes, timing.elapsedMinutes);
  const taskMinutes = toolResults.filter(result => result?.ok).map(result => result.data?.taskMinutes).filter(value => Number.isInteger(value) && value > 0);
  if (taskMinutes.length) return Math.max(travelMinutes, ...taskMinutes);
  if (timing) return Math.max(travelMinutes, timing.elapsedMinutes);
  if (travelMinutes) return travelMinutes;
  if (TRAVEL_ACTION.test(text)) return 75;
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
  const focus = chooseQuestFocus(game, action, toolCalls, toolResults);
  let rewardClaimed = false;
  const pending = game.quests?.find(quest => `quest:${quest.id}` === focus?.id && quest.stage === "awaiting-reward");
  if (!options.commissionOnly && pending && isRewardClaimAction(action)) {
    const payment = resolveQuestAction(game, { instanceId: focus.id, actionQuote: action, evidence: "玩家向委托人领取已登记的约定报酬", outcome: "claim" }, action, Number(game.turn || 0) + 1);
    if (payment.ok) { toolResults = [...toolResults, { ok: true, data: payment }]; rewardClaimed = true; }
  }
  // Execute the player's exact local route even when the AI omitted quest.resolve.
  const recovery = options.commissionOnly ? null : resolveSelectedQuestRoute(game, action, Number(game.turn || 0) + 1);
  if (recovery) toolResults = [...toolResults, { ok: recovery.ok, data: recovery }];
  const elapsedMinutes = Number.isInteger(options.elapsedMinutes) && options.elapsedMinutes > 0
    ? options.elapsedMinutes : minutesForTurn(action, toolCalls, toolResults, game.worldTime);
  const localTaskTiming = toolResults.find(result => result?.ok && Number.isInteger(result.data?.taskMinutes) && result.data.taskMinutes > 0);
  const dangerDelta = dangerDeltaForTurn({ action, selectedRisk, toolCalls, toolResults });
  const statusTicks = settleStatusTicks(game);
  if (game.character?.combatBoost?.expiresTurn <= Number(game.turn || 0) + 1) delete game.character.combatBoost;
  if (game.character?.guardedThroughTurn <= Number(game.turn || 0) + 1) delete game.character.guardedThroughTurn;
  const restRecovery = settleInnRest(game, action, elapsedMinutes);
  const statusTickLogs = statusTicks.map((tick) => `状态「${tick.status}」结算：${tick.label} ${tick.before}→${tick.after}（${tick.delta > 0 ? "+" : ""}${tick.delta}）${tick.autoStatus ? `；${tick.autoStatus}` : ""}`);
  const nextTurn = Number(game.turn || 0) + 1;
  statusTickLogs.push(...restRecovery.map(change => `旅馆休息：${change.label} ${change.before}→${change.after}`));
  const worldTime = advanceWorldTime(game.worldTime, elapsedMinutes);
  game.worldTime = worldTime;
  const commissionUpdates = syncIssuedCommissions(game);
  const triggerProgress = processTriggers(game, { action: options.commissionOnly ? "处理玩家发布的调查委托" : action, toolCalls, toolResults, turn: nextTurn, travelOnly: Boolean(options.travelOnly || options.commissionOnly) });
  game.questFocus = chooseQuestFocus(game, action, toolCalls, toolResults) || (rewardClaimed ? focus : null);
  // Use the accepted local result, never an AI-supplied method or an old save field.
  const promotionIndex = toolCalls.findIndex((call, index) => call.name === "advancement.promote" && toolResults[index]?.ok);
  const promotionMethod = promotionIndex >= 0 ? toolResults[promotionIndex].data?.advancement?.method : null;
  const advancementRecovery = promotionIndex >= 0
    ? ["health", "sanity"].map(stat => {
      const maxKey = `max${stat[0].toUpperCase()}${stat.slice(1)}`;
      const target = stat === "health" ? advancementHealthTarget(game.character.stats, promotionMethod) : game.character.stats[maxKey];
      return applyStatDelta(game, stat, target - game.character.stats[stat]);
    }).filter(Boolean) : [];
  if (advancementRecovery.length) {
    syncStatCollapseStatuses(game);
    statusTickLogs.push(...advancementRecovery.map(change => `${promotionMethod === "characteristic" ? "特性晋升结算（生命50%）" : "晋升恢复"}：${change.label} ${change.before}→${change.after}`));
  }
  const occultEntry = triggerProgress.occultEntry ? { id: triggerProgress.occultEntry.instanceId, turn: triggerProgress.occultEntry.createdTurn, ...triggerProgress.occultEntry.presentation } : null;
  return {
    playerAction: action,
    questRewardSettlements: toolResults.filter(result => result.ok && result.data?.rewardSettlement).map(result => result.data.rewardSettlement),
    elapsedMinutes,
    commissionUpdates,
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
