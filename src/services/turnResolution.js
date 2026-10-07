import { playerVisibleItem } from "../system/items.js";
import { narrativeEventsForTurn, pendingQuestNarration } from "./narrativeEvents.js";

function playerVisibleResultData(data = {}) {
  return { ...data, ...(data.inventoryChange ? { inventoryChange: playerVisibleItem(data.inventoryChange) } : {}),
    ...(data.inventoryChanges ? { inventoryChanges: data.inventoryChanges.map(playerVisibleItem) } : {}) };
}

export function createTurnResolution(toolCalls = [], results = [], progress = {}, game = null) {
  const entries = toolCalls.map((call, index) => {
    const result = results[index] || { ok: false, reason: "本地引擎没有返回执行结果" };
    const item = result.data?.inventoryChange || call.args?.item || game?.inventory?.find(entry => entry.instanceId === call.args?.instanceId);
    const unidentified = item && playerVisibleItem(item).potionStatus === "unidentified";
    return {
      name: call.name,
      reason: unidentified ? "对未鉴定魔药的操作；真实身份尚未揭示" : call.reason || "",
      ok: Boolean(result.ok),
      log: result.log || "",
      rejectionReason: result.ok ? "" : result.reason || "未知校验错误",
      data: playerVisibleResultData(result.data || {}),
    };
  });
  return {
    accepted: entries.filter((entry) => entry.ok),
    rejected: entries.filter((entry) => !entry.ok),
    derivedEffects: {
      narrativeEvents: game ? pendingQuestNarration(game, [
        ...(progress.triggerEvents?.completed || []), ...(progress.triggerEvents?.failed || []),
        ...(progress.triggerEvents?.expired || []), ...(progress.triggerEvents?.abandoned || []),
      ], { action: progress.playerAction, changedIds: Object.values(progress.triggerEvents || {}).flat().map(event => event.instanceId) }) : narrativeEventsForTurn(progress.triggerSignals),
      elapsedMinutes: progress.elapsedMinutes || 0,
      questRewardSettlements: progress.questRewardSettlements || [],
      commissionUpdates: progress.commissionUpdates || [],
      timedAction: progress.timedAction || null,
      restRecovery: progress.restRecovery || [],
      advancementRecovery: progress.advancementRecovery || [],
      worldTime: progress.worldTime || "",
      dangerDelta: progress.dangerDelta || 0,
      occultEntry: progress.occultEntry || null,
      triggerEvents: progress.triggerEvents || { available: [], engaged: [], advanced: [], completed: [], failed: [], expired: [], abandoned: [] },
    },
  };
}
