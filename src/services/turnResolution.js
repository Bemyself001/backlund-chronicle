export function createTurnResolution(toolCalls = [], results = [], progress = {}) {
  const entries = toolCalls.map((call, index) => {
    const result = results[index] || { ok: false, reason: "本地引擎没有返回执行结果" };
    return {
      name: call.name,
      reason: call.reason || "",
      ok: Boolean(result.ok),
      log: result.log || "",
      rejectionReason: result.ok ? "" : result.reason || "未知校验错误",
      data: result.data || {},
    };
  });
  return {
    accepted: entries.filter((entry) => entry.ok),
    rejected: entries.filter((entry) => !entry.ok),
    derivedEffects: {
      elapsedMinutes: progress.elapsedMinutes || 0,
      worldTime: progress.worldTime || "",
      dangerDelta: progress.dangerDelta || 0,
      occultEntry: progress.occultEntry || null,
    },
  };
}
