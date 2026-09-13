import { hasActionTerms } from "./triggerConditions.js";

const INVESTIGATION_TERMS = ["调查", "检查", "检视", "研究", "查阅", "追查", "打听", "询问", "寻找", "观察", "接近", "搜查", "使用", "占卜", "灵视"];

function stableSignalId(turn, call, index, suffix = "") {
  const callId = call?.id || `${call?.name || "action"}-${index}`;
  return `signal:${turn}:${callId}${suffix ? `:${suffix}` : ""}`;
}

export function buildTriggerSignals(game, action, toolCalls = [], toolResults = [], turn = Number(game.turn || 0) + 1) {
  const signals = [];
  if (hasActionTerms(action, INVESTIGATION_TERMS)) signals.push({ id: `signal:${turn}:action:investigate`, kind: "action.investigate", action, text: action });

  toolCalls.forEach((call, index) => {
    const result = toolResults[index];
    if (!result?.ok) return;
    const base = { id: stableSignalId(turn, call, index), toolName: call.name, action, text: `${call.reason || ""} ${action || ""}`.trim() };
    if (call.name === "item.inspect") {
      const item = (game.inventory || []).find((entry) => entry.instanceId === call.args?.instanceId);
      signals.push({ ...base, kind: "item.inspected", itemId: item?.itemId, instanceId: item?.instanceId });
    }
    if (call.name === "clue.add") signals.push({ ...base, kind: "clue.added", clueId: call.args?.clue?.id, title: call.args?.clue?.title, detail: call.args?.clue?.detail });
    if (call.name === "location.move" || call.name === "location.discover") signals.push({ ...base, kind: "location.changed", locationId: result.data?.locationId || call.args?.locationId });
    if (call.name === "relationship.update") signals.push({ ...base, kind: "relationship.changed", npcId: call.args?.npcId });
    if (call.name === "trigger.engage" || call.name === "occult.contact") signals.push({ ...base, kind: "trigger.engaged", instanceId: call.args?.instanceId || call.args?.entryId });
    if (call.name === "trigger.abandon") signals.push({ ...base, kind: "trigger.abandoned", instanceId: call.args?.instanceId });
    for (const [signalIndex, signal] of (result.data?.triggerSignals || []).entries()) {
      signals.push({ ...signal, id: signal.id || stableSignalId(turn, call, index, String(signalIndex)), action, toolName: call.name });
    }
  });
  return signals;
}
