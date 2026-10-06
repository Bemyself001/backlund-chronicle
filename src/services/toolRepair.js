import { dedupeToolCalls, isRepairableToolError, normalizeToolCalls, validateToolCall } from "../engine/tools.js";

function repairLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.floor(parsed));
}

export async function repairToolCallsConcurrently(game, calls = [], repairToolCall, options = {}) {
  const normalized = normalizeToolCalls(calls, game);
  const createdIds = new Set(normalized.filter(call => call.name === "quest.add").flatMap(call => [call.args?.quest?.id, `quest:${call.args?.quest?.id}`]));
  const checkedCalls = normalized.map(call => {
    const checked = validateToolCall(game, call);
    if (call.name === "quest.resolve" && createdIds.has(call.args?.instanceId) && checked.error.startsWith("任务标识参数需要修复")) checked.error = "";
    return checked;
  });
  const candidateIndexes = checkedCalls
    .map((checked, index) => ({ checked, index }))
    .filter(({ checked }) => checked.error && isRepairableToolError(checked.call, checked.error))
    .slice(0, repairLimit(options.maxRepairs))
    .map(({ index }) => index);
  const candidateSet = new Set(candidateIndexes);

  if (candidateIndexes.length) options.onRepairsStarted?.(candidateIndexes.length);

  const repairedCalls = await Promise.all(checkedCalls.map(async (checked, index) => {
    if (!candidateSet.has(index) || typeof repairToolCall !== "function") return checked.call;

    try {
      const repairResponseCalls = await repairToolCall({ call: checked.call, error: checked.error, index });
      const repaired = normalizeToolCalls(repairResponseCalls, game).find((call) => call.name === checked.call.name);
      return repaired ? validateToolCall(game, repaired).call : checked.call;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return checked.call;
    }
  }));

  return {
    calls: dedupeToolCalls(repairedCalls),
    repairCount: candidateIndexes.length,
  };
}
