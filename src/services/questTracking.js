import { syncQuestJournal, visibleQuestJournal } from "../engine/questRuntime.js";
import { getInstanceTriggerDefinition } from "../engine/triggerDefinitions.js";
import { acceptOrdinaryQuest, migrateQuestLifecycle, ordinaryQuestInspection } from "../engine/questLifecycle.js";
import { engageTrigger } from "../engine/triggerEngine.js";
import { inspectQuestRoutes } from "../engine/questRoutes.js";
import { resolveQuestAction } from "../engine/questActions.js";
import { getMapLocation, normalizeLocationKnowledge } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";
import { SPECIAL_ACTIONS } from "../content/index.js";
import { specialState } from "../engine/specialActions.js";

const locationIds = conditions => (conditions || []).flatMap(condition => condition.not ? [] : condition.type === "location" ? [condition.locationId].filter(Boolean) : locationIds(condition.conditions));
const knownLocation = (game, id) => game.location?.id === id || game.discoveredLocations?.some(location => location.id === id) || ["discovered", "visited"].includes(game.locationKnowledge?.[id]?.status);

// Only id/revision are needed for a simple pursuit. Optional routeId is selected
// from a previous local choice; it is validated again against the current stage.
export function inspectQuestTracking(game, request) {
  game = migrateQuestLifecycle(structuredClone(game));
  let entry = visibleQuestJournal(game).find(item => item.id === request?.id);
  if (!entry || !["engaged", "available"].includes(entry.status)) return { ok: false, kind: "stale", reason: "这项任务已结束、过期或不存在，请刷新任务列表" };
  if (entry.revision !== request.revision) return { ok: false, kind: "stale", reason: "任务阶段已改变，请按最新目标继续" };
  if (Number(game.character?.stats?.health) <= 0) return { ok: false, kind: "blocked", reason: "生命归零，当前无法继续执行任务行动" };
  const quest = entry.source === "quest" ? game.quests?.find(item => item.id === entry.questId) : null;
  if (quest?.source === "特殊行动") {
    const special = specialState(game);
    const commission = special.active;
    if (!commission || commission.id !== quest.id) return { ok: false, kind: "stale", reason: "特殊委托状态已改变" };
    const definition = SPECIAL_ACTIONS.find(item => item.id === commission.definitionId);
    const targetId = definition?.locationId;
    if (targetId && targetId !== game.location?.id && knownLocation(game, targetId)) return travelPlan(game, entry, targetId);
    if (targetId && targetId !== game.location?.id) return { ok: true, kind: "investigate", entry, action: `调查「${entry.title}」的已知委托线索`, reason: "委托地点尚未发现，先核实既有线索" };
    return { ok: true, kind: "special-action", entry, action: `处理「${entry.title}」的特殊委托`, specialAction: { id: commission.id, revision: special.revision, operation: "resolve" } };
  }
  if (entry.status === "available") {
    const accepted = quest ? acceptOrdinaryQuest(game, quest, Number(game.turn || 0) + 1) : engageTrigger(game, entry.id, Number(game.turn || 0) + 1, "预览接取后当前步骤");
    if (!accepted.ok) return { ...accepted, kind: "stale" };
    const current = syncQuestJournal(game).entries[entry.id];
    entry = { ...current, status: "available", revision: entry.revision };
  }
  let targets = [];
  if (quest) {
    targets = quest.stage === "awaiting-reward" && quest.lifecycle?.contract?.rewardClaim?.locationId
      ? [quest.lifecycle.contract.rewardClaim.locationId] : locationIds(ordinaryQuestInspection(game, quest).conditions);
  } else {
    const instance = game.triggerState?.active?.find(item => item.instanceId === entry.id);
    const definition = getInstanceTriggerDefinition(instance, game);
    const stage = definition?.stages?.find(item => item.id === (entry.status === "available" ? definition.engagedStage || instance.stage : instance.stage));
    targets = (stage?.transitions || []).flatMap(transition => locationIds([...(transition.when || []), ...(transition.requirements || [])]));
  }
  targets = [...new Set(targets)];
  const localTargets = targets.filter(id => knownLocation(game, id));
  const currentTarget = localTargets.includes(game.location?.id);
  if (!currentTarget && targets.length) {
    if (!localTargets.length) return { ok: true, kind: "investigate", entry, action: `根据已有线索调查「${entry.title}」的去向：${entry.objective}`, reason: "目的地尚未发现，先调查现有线索" };
    const choices = localTargets.map(id => { const location = getMapLocation(id, game); return { routeId: `travel:${id}`, label: `前往${location?.name || "已知地点"}`, locationId: id }; });
    if (choices.length > 1 && !request.routeId) return { ok: true, kind: "choice", entry, choices, reason: "当前目标有多个已知目的地，请选择路线" };
    const choice = request.routeId ? choices.find(item => item.routeId === request.routeId) : choices[0];
    if (!choice) return { ok: false, kind: "stale", reason: "所选目的地已不属于任务当前阶段" };
    return travelPlan(game, entry, choice.locationId);
  }
  const pursuitEntry = entry.status === "available" ? { ...entry, status: "engaged" } : entry;
  if (quest && ordinaryQuestInspection(game, quest).requiresInvestigation) return { ok: true, kind: "investigate", entry,
    action: `梳理「${entry.title}」的已知证据，确认原目标「${quest.lifecycle.contract.coreGoal}」的有限步骤与完成条件`,
    reason: "保持原核心目标与奖励，按已登记证据一次性补录可执行阶段后继续" };
  const routes = inspectQuestRoutes(game, pursuitEntry).routes.filter(route => !route.locationId);
  const choices = routes.map(route => ({ routeId: `objective:${route.objectiveId}`, label: route.label, objectiveId: route.objectiveId }));
  if (!choices.length) return { ok: true, kind: "investigate", entry, action: `继续「${entry.title}」：${entry.objective}`, reason: inspectQuestRoutes(game, pursuitEntry).blockers.join("；") || "先按当前已知目标调查" };
  if ((entry.policy.isolated || choices.length > 1) && !request.routeId) return { ok: true, kind: "choice", entry, choices, reason: entry.policy.isolated ? "这是关键或危险阶段，请明确选择行动" : "当前有多条可行路线，请选择行动" };
  const route = request.routeId ? routes.find(item => `objective:${item.objectiveId}` === request.routeId) : routes[0];
  if (request.routeId && !route) return { ok: false, kind: "stale", reason: "所选行动已不属于任务当前阶段" };
  if (!route) return { ok: true, kind: "investigate", entry, action: `继续「${entry.title}」：${entry.objective}`, reason: inspectQuestRoutes(game, entry).blockers.join("；") || "先按当前已知目标调查" };
  const action = entry.status === "available" ? `接受并${route.action || route.label}` : route.action || route.label;
  return { ok: true, kind: "progress", entry, action, independentTurn: Boolean(entry.policy.isolated), questArgs: { instanceId: entry.id, actionQuote: action, outcome: "progress", evidence: `按已确认条件执行：${route.description}`, start: entry.status === "available", steps: [{ objectiveId: route.objectiveId }] } };
}

function travelPlan(game, entry, locationId) {
  const location = getMapLocation(locationId, game);
  const travel = location && travelToLocation(structuredClone(game), locationId);
  if (!travel) return { ok: false, kind: "blocked", reason: "当前地图无法到达任务目的地" };
  return { ok: true, kind: "travel", entry, locationId, action: `为「${entry.title}」前往${location.name}`, taskMinutes: Math.max(1, travel.minutes), travel, independentTurn: true };
}

// This performs only the selected local operation. The caller must run the usual
// turn/time/risk settlement once for travel/progress; no remote quest completion
// is allowed in a travel turn. Investigation and special-action results are UI
// dispatch plans, not settled gameplay turns.
export function resolveQuestTrackingRequest(game, request, turn = Number(game.turn || 0) + 1) {
  const plan = inspectQuestTracking(game, request);
  if (!plan.ok) return plan;
  if (!["travel", "progress"].includes(plan.kind)) return plan;
  const draft = structuredClone(game);
  const result = settleTrackingPlan(draft, plan, turn);
  if (result.ok) Object.assign(game, draft);
  return result;
}

function settleTrackingPlan(game, plan, turn) {
  if (plan.kind === "travel") {
    if (plan.entry.status === "available") {
      const accepted = plan.entry.source === "quest" ? acceptOrdinaryQuest(game, game.quests.find(quest => quest.id === plan.entry.questId), turn) : engageTrigger(game, plan.entry.id, turn, plan.action);
      if (!accepted.ok) return accepted;
    }
    const location = getMapLocation(plan.locationId, game);
    const travel = travelToLocation(game, plan.locationId);
    if (!travel) return { ok: false, kind: "blocked", reason: "地图行程未能结算" };
    game.location = { id: location.id, name: location.name, district: `贝克兰德${location.district}` };
    game.locationKnowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, location.id, game);
    game.locationKnowledge[location.id] = { ...game.locationKnowledge[location.id], status: "visited", visitedAt: `第${turn}轮` };
    game.trackedQuestId = plan.entry.id;
    return { ...plan, travel, travelMinutes: plan.taskMinutes };
  }
  if (plan.kind === "progress") {
    const result = resolveQuestAction(game, plan.questArgs, plan.action, turn);
    if (!result.ok) return { ...result, kind: "blocked" };
    game.trackedQuestId = plan.entry.id;
    return { ...plan, ...result };
  }
  return plan;
}
