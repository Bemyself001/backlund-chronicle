import { getTriggerDefinition } from "./triggerDefinitions.js";

export const questNameAliases = title => [...new Set([String(title || ""), ...String(title || "").replace(/[《》「」]/g, "").split(/[：:]/)])].filter(name => name.length >= 3);

// Match only stable identifiers or exact names. Never guess between two saves
// of the same story, or turn a hidden definition into a visible quest.
export function findQuestReference(game, reference) {
  const value = String(reference || "").trim();
  if (!value) return { ok: false, reason: "缺少任务标识，请使用任务簿中的任务编号" };
  const entries = [
    ...(game.quests || []).map(quest => ({ id: `quest:${quest.id}`, quest,
      aliases: [`quest:${quest.id}`, quest.id, ...questNameAliases(quest.title)] })),
    ...[...(game.triggerState?.active || []), ...(game.triggerState?.history || [])]
      .filter(instance => instance.status !== "eligible").map(instance => ({ id: instance.instanceId, instance,
        aliases: [instance.instanceId, instance.definitionId, ...questNameAliases(instance.presentation?.title), ...questNameAliases(getTriggerDefinition(instance.definitionId)?.presentation?.title)] })),
  ];
  const exact = entries.filter(entry => entry.id === value);
  const matches = exact.length ? exact : entries.filter(entry => entry.aliases.includes(value));
  const unique = [...new Map(matches.map(entry => [entry.id, entry])).values()];
  if (unique.length === 1) return { ok: true, ...unique[0] };
  return { ok: false, reason: unique.length ? "任务标识对应多条记录，请使用任务簿中的唯一编号"
    : "未找到对应的任务记录：请核对任务编号；若是历史对话中漏登记的委托，请引用原始记录恢复，不能重新编造任务或报酬" };
}
