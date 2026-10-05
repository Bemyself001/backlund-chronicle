import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { allConditionsMatch, conditionMatches } from "./triggerConditions.js";
import { renderContentData } from "./contentTemplates.js";
import { getMapLocation } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";
import { ordinaryQuestInspection } from "./questLifecycle.js";

const locationConditions = (conditions, context) => conditions.flatMap(condition => condition.not || conditionMatches(condition, context) ? [] : condition.type === "location" ? [condition] : locationConditions(condition.conditions || [], context));

// Routes describe existing transitions, never invent facts or waive prerequisites.
export function inspectQuestRoutes(game, entry) {
  if (entry.source === "quest" && entry.status === "engaged") {
    const quest = game.quests?.find(item => item.id === entry.questId);
    if (!quest || quest.source === "特殊行动") return { routes: [], blockers: [] };
    const current = ordinaryQuestInspection(game, quest);
    if (!current.node) return { routes: [], blockers: ["这条旧任务尚未登记可本地验证的完成契约"] };
    if (current.requiresInvestigation) return { routes: [], blockers: current.blockers };
    const cost = current.node.cost;
    const costLabel = [cost?.amountPence ? `支付${cost.amountPence}便士` : "", cost?.itemId ? `交付${game.inventory?.find(item => item.itemId === cost.itemId)?.name || cost.itemId}×${cost.quantity}` : ""].filter(Boolean).join("，");
    const actions = current.node.conditions.filter(condition => condition.type === "action" && !condition.not).map(condition => condition.terms?.[0]).filter(term => term && !current.node.objective.includes(term));
    const details = [...actions, costLabel].filter(Boolean).join("，");
    const label = `处理「${entry.title}」：${current.node.objective}${details ? `（${details}）` : ""}`;
    const check = ordinaryQuestInspection(game, quest, `花${Math.max(5, Number(current.node.minutes || 5))}分钟${label}`);
    const routes = check.missing.length || check.paymentBlocker ? [] : [{ objectiveId: current.node.id, label, description: current.node.objective,
      automatic: entry.policy.canRecover && !current.node.dangerous && !current.node.majorDecision, costMinutes: Math.max(5, Number(current.node.minutes || 5)) }];
    for (const condition of locationConditions(current.conditions, check.context)) {
      const location = getMapLocation(condition.locationId, game);
      if (!location || !game.discoveredLocations?.some(item => item.id === location.id)) continue;
      const travel = travelToLocation(structuredClone(game), location.id);
      if (travel) routes.push({ locationId: location.id, label: `处理「${entry.title}」的地点条件：前往${location.name}`, description: `实际到达${location.name}`, automatic: true, costMinutes: Math.max(1, travel.minutes) });
    }
    return { routes, blockers: check.blockers };
  }
  if (entry.source !== "trigger" || entry.status !== "engaged") return { routes: [], blockers: [] };
  const instance = game.triggerState?.active?.find(item => item.instanceId === entry.id);
  const definition = getInstanceTriggerDefinition(instance, game);
  const stage = definition?.stages?.find(item => item.id === instance?.stage);
  const routes = [], blockers = [];
  for (const transition of stage?.transitions || []) {
    if (!transition.objectiveId) continue;
    const description = renderContentData(entry.policy.isolated ? entry.objective : transition.description || stage.guidance || entry.objective, { game });
    const label = `处理「${entry.title}」：${description}`;
    const routeAction = transition.actionTerms?.length ? `${label}（${transition.actionTerms[0]}）` : label;
    const context = { game, state: game.triggerState, instance, action: routeAction, signals: [], turn: Number(game.turn || 0) + 1 };
    if (!allConditionsMatch([...(transition.when || []), ...(transition.requirements || [])], context)) {
      blockers.push(transition.requirementMessage || "这条分支的必要条件尚未满足，请先按当前目标取得条件");
      if (entry.policy.canRecover && Number(game.character?.stats?.health) > 0) {
        for (const condition of locationConditions([...(transition.when || []), ...(transition.requirements || [])], context)) {
          const location = getMapLocation(condition.locationId, game);
          if (!location || game.location?.id === location.id || !game.discoveredLocations?.some(item => item.id === location.id)) continue;
          if (routes.some(route => route.locationId === location.id)) continue;
          const travel = travelToLocation(structuredClone(game), location.id);
          if (travel) routes.push({ locationId: location.id, label: `处理「${entry.title}」的地点条件：前往${location.name}`,
            description: `实际到达${location.name}，解决调查的地点条件`, automatic: true, costMinutes: Math.max(1, travel.minutes) });
        }
      }
      continue;
    }
    if (Number(game.character?.stats?.health) <= 0 && !transition.fail) continue;
    if (transition.rejectActionTerms?.some(term => routeAction.includes(term))) continue;
    routes.push({ objectiveId: transition.objectiveId, label: routeAction, description,
      action: routeAction, failure: Boolean(transition.fail),
      automatic: entry.policy.canRecover && !transition.fail,
      costMinutes: Math.max(20, Number(transition.elapsedMinutes || 0)),
    });
  }
  return { routes, blockers: routes.some(route => route.objectiveId && !route.failure) ? [] : [...new Set(blockers)] };
}

export function selectedQuestRoute(game, entries, action) {
  for (const entry of Object.values(entries)) {
    const attempt = game.questJournal?.attempts?.[entry.id];
    if (attempt?.stage !== entry.stage || attempt.hintLevel < 2) continue;
    const route = inspectQuestRoutes(game, entry).routes.find(item => item.automatic && `花${item.costMinutes}分钟${item.label}` === String(action || "").trim());
    if (route) return { entry, route };
  }
  return null;
}
