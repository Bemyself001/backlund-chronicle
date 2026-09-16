import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { allConditionsMatch, conditionMatches } from "./triggerConditions.js";
import { renderContentData } from "./contentTemplates.js";
import { getMapLocation } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";

const locationConditions = (conditions, context) => conditions.flatMap(condition => condition.not || conditionMatches(condition, context) ? [] : condition.type === "location" ? [condition] : locationConditions(condition.conditions || [], context));

// Routes describe existing transitions, never invent facts or waive prerequisites.
export function inspectQuestRoutes(game, entry) {
  if (entry.source !== "trigger" || entry.status !== "engaged") return { routes: [], blockers: [] };
  const instance = game.triggerState?.active?.find(item => item.instanceId === entry.id);
  const definition = getInstanceTriggerDefinition(instance, game);
  const stage = definition?.stages?.find(item => item.id === instance?.stage);
  const routes = [], blockers = [];
  for (const transition of stage?.transitions || []) {
    if (!transition.objectiveId) continue;
    const description = renderContentData(entry.policy.isolated ? entry.objective : transition.description || stage.guidance || entry.objective, { game });
    const label = `处理「${entry.title}」：${description}`;
    const context = { game, state: game.triggerState, instance, action: label, signals: [], turn: Number(game.turn || 0) + 1 };
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
    if (transition.rejectActionTerms?.some(term => label.includes(term))) continue;
    routes.push({ objectiveId: transition.objectiveId, label, description, failure: Boolean(transition.fail),
      automatic: entry.policy.canRecover && !transition.fail,
      costMinutes: Math.max(20, Number(transition.elapsedMinutes || 0)),
    });
  }
  return { routes, blockers: [...new Set(blockers)] };
}

export function selectedQuestRoute(game, entries, action) {
  for (const entry of Object.values(entries)) {
    const attempt = game.questJournal?.attempts?.[entry.id];
    if (attempt?.stage !== entry.stage || attempt.hintLevel < 3) continue;
    const route = inspectQuestRoutes(game, entry).routes.find(item => item.automatic && `花${item.costMinutes}分钟${item.label}` === String(action || "").trim());
    if (route) return { entry, route };
  }
  return null;
}
