import { playerVisibleItem } from "../system/items.js";
import { narrativeEventsForTurn, pendingQuestNarration } from "./narrativeEvents.js";

function playerVisibleResultData(data = {}) {
  if (!data.inventoryChange) return data;
  return { ...data, inventoryChange: playerVisibleItem(data.inventoryChange) };
}

export function createTurnResolution(toolCalls = [], results = [], progress = {}, game = null) {
  const entries = toolCalls.map((call, index) => {
    const result = results[index] || { ok: false, reason: "本地引擎没有返回执行结果" };
    return {
      name: call.name,
      reason: call.reason || "",
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
      ]) : narrativeEventsForTurn(progress.triggerSignals),
      elapsedMinutes: progress.elapsedMinutes || 0,
      restRecovery: progress.restRecovery || [],
      worldTime: progress.worldTime || "",
      dangerDelta: progress.dangerDelta || 0,
      occultEntry: progress.occultEntry || null,
      triggerEvents: progress.triggerEvents || { available: [], engaged: [], advanced: [], completed: [], failed: [], expired: [], abandoned: [] },
    },
  };
}
