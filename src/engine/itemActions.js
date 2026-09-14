import { getItemBehavior } from "../content/index.js";
import { allConditionsMatch, anyConditionMatches } from "./triggerConditions.js";
import { normalizeTriggerState } from "./triggerState.js";

function appendDiscovery(item, text) {
  const current = String(item.discoveredInfo || item.description || "").trim();
  if (!current.includes(text)) item.discoveredInfo = `${current} ${text}`.trim();
}

function renderTemplate(value, item) {
  return String(value || "").replaceAll("{itemName}", String(item.name || item.itemId || "物品"));
}

function actionContext(game, item, turn, playerAction) {
  return {
    game,
    state: normalizeTriggerState(game),
    signals: [],
    action: String(playerAction || ""),
    turn,
    item,
  };
}

function matchingAction(actions, context) {
  return actions.find((action) => !action.fallback && allConditionsMatch(action.when || [], context))
    || actions.find((action) => action.fallback)
    || null;
}

export function executeItemContentAction(game, item, actionName, { turn, playerAction = "" } = {}) {
  const behavior = getItemBehavior(item?.itemId);
  const actions = behavior?.actions?.[actionName];
  if (!Array.isArray(actions) || !actions.length) return null;
  const context = actionContext(game, item, turn, playerAction);
  const action = matchingAction(actions, context);
  if (!action) return null;
  if (action.denyWhen?.length && anyConditionMatches(action.denyWhen, context)) {
    return { handled: true, ok: false, reason: action.denyMessage || "本地内容规则不允许这样使用该物品" };
  }
  const result = action.result || {};
  const text = renderTemplate(result.text || result.logTemplate, item);
  if (result.appendDiscovery && text) appendDiscovery(item, text);
  const triggerSignals = [];
  for (const [index, effect] of (result.effects || []).entries()) {
    const base = {
      id: `signal:${turn}:item-action:${action.id}:${item.instanceId}:${index}`,
      itemId: item.itemId,
      instanceId: item.instanceId,
      evidenceIds: [`item-action:${action.id}:${turn}`],
    };
    if (effect.type === "discover-fact") triggerSignals.push({ ...base, kind: "fact.discovered", factId: effect.factId, text });
    if (effect.type === "signal") triggerSignals.push({ ...base, kind: effect.kind, text: renderTemplate(effect.text, item) });
  }
  const data = structuredClone(result.data || {});
  if (triggerSignals.length) data.triggerSignals = triggerSignals;
  return { handled: true, ok: true, actionId: action.id, text, logTemplate: Boolean(result.logTemplate), data };
}
