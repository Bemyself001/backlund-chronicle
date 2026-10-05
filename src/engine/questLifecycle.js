import { allConditionsMatch, conditionMatches } from "./triggerConditions.js";
import { moneyFromPence, moneyToPence } from "../system/money.js";
import { getTriggerDefinition } from "./triggerDefinitions.js";
import { playerVisibleItem } from "../system/items.js";

export const QUEST_LIFECYCLE_VERSION = 1;
export const normalizeQuestStatus = status => ({ active: "engaged", "进行中": "engaged", "已完成": "completed", "失败": "failed", "已失败": "failed", "已放弃": "abandoned", "已过期": "expired" })[status] || status || "engaged";
export const terminalQuestStatus = status => ["completed", "failed", "abandoned", "expired"].includes(normalizeQuestStatus(status));
const clean = value => String(value || "").trim();
const limits = { random: { nodes: 3, obstacles: 1 }, side: { nodes: 5, obstacles: 2 }, main: { nodes: 5, obstacles: 2 }, legacy: { nodes: 5, obstacles: 2 } };
const kinds = new Set(Object.keys(limits));
const conditionTypes = new Set(["location", "item", "fact", "clue", "stat", "relationship", "trigger", "organization", "action", "all", "any", "quest-proof"]);
const validCost = cost => cost == null || typeof cost === "object" && !Array.isArray(cost)
  && (cost.amountPence == null || Number.isInteger(cost.amountPence) && cost.amountPence >= 0)
  && (cost.itemId == null || clean(cost.itemId) && Number.isInteger(cost.quantity) && cost.quantity > 0);
function validCondition(condition) {
  if (!condition || !conditionTypes.has(condition.type)) return false;
  if (condition.type === "quest-proof") return Boolean(clean(condition.nodeId)) && (condition.minPaidPence == null || Number.isInteger(condition.minPaidPence) && condition.minPaidPence >= 0) && (condition.quantity == null || Number.isInteger(condition.quantity) && condition.quantity > 0);
  if (["all", "any"].includes(condition.type)) return Array.isArray(condition.conditions) && condition.conditions.length > 0 && condition.conditions.every(validCondition);
  return ({ location: () => clean(condition.locationId), item: () => clean(condition.itemId || condition.instanceId), fact: () => clean(condition.key), clue: () => clean(condition.clueId), stat: () => clean(condition.key) && (condition.min != null || condition.max != null), relationship: () => clean(condition.npcId || condition.name), trigger: () => clean(condition.definitionId) && condition.status, organization: () => clean(condition.organizationId), action: () => Array.isArray(condition.terms) && condition.terms.some(term => clean(term).length >= 2) })[condition.type]?.();
}

function questConditionMatches(condition, context, quest) {
  if (!["quest-proof", "all", "any"].includes(condition.type)) return conditionMatches(condition, context);
  let matched;
  if (condition.type === "all") matched = condition.conditions.every(item => questConditionMatches(item, context, quest));
  else if (condition.type === "any") matched = condition.conditions.some(item => questConditionMatches(item, context, quest));
  else {
    const receipt = quest.lifecycle?.nodeReceipts?.[condition.nodeId];
    matched = Boolean(receipt) && (!condition.itemId || receipt.consumedItems?.some(item => item.itemId === condition.itemId && item.quantity >= Number(condition.quantity || 1)))
      && (condition.minPaidPence == null || receipt.paidPence >= condition.minPaidPence);
  }
  return condition.not ? !matched : matched;
}

function costBlocker(game, cost = {}) {
  if (Number(cost.amountPence || 0) > moneyToPence(game.money || {})) return `此步骤需支付${cost.amountPence}便士，当前资金不足`;
  if (cost.itemId && (game.inventory || []).filter(item => item.itemId === cost.itemId).reduce((sum, item) => sum + Number(item.quantity || 0), 0) < cost.quantity) return "尚未持有足够的约定交付物品";
  return "";
}

function settleNodeCost(game, quest, node, turn) {
  const cost = node.cost || {};
  game.money = moneyFromPence(moneyToPence(game.money || {}) - Number(cost.amountPence || 0));
  let remaining = cost.itemId ? Number(cost.quantity) : 0;
  for (const item of game.inventory || []) {
    if (item.itemId !== cost.itemId || remaining <= 0) continue;
    const used = Math.min(remaining, Number(item.quantity || 0));
    item.quantity -= used; remaining -= used;
  }
  if (cost.itemId) game.inventory = game.inventory.filter(item => Number(item.quantity) > 0);
  quest.lifecycle.nodeReceipts ||= {};
  quest.lifecycle.nodeReceipts[node.id] = { turn, paidPence: Number(cost.amountPence || 0), consumedItems: cost.itemId ? [{ itemId: cost.itemId, quantity: cost.quantity }] : [] };
}

// A contract is fixed at acceptance. Progress can only consume these nodes; a
// changed objective, extra clue, or renamed task cannot append another errand.
function freezeContract(quest) {
  const supplied = quest.contract || {};
  const kind = kinds.has(quest.kind) ? quest.kind : "legacy";
  const coreGoal = clean(supplied.coreGoal || quest.objective || quest.summary || quest.title);
  const suppliedNodes = Array.isArray(supplied.nodes) && supplied.nodes.length;
  const simpleAgreement = /交付|送信|送达|交还|交给|交到|归还|递交|提交|核对|阅读|查看|交谈|询问|到达/.test(coreGoal) && !/调查|阴谋|真相|谜|寻找|查明|击败|战斗|营救|拯救|治疗|仪式/.test(coreGoal);
  const requiresInvestigation = !suppliedNodes && (!simpleAgreement || quest.dangerous || quest.finale || quest.majorDecision);
  const nodes = suppliedNodes ? structuredClone(supplied.nodes) : [{ id: "fulfil-original-agreement", objective: coreGoal,
    conditions: [{ type: "action", terms: [coreGoal] }, ...(quest.locationId || quest.destinationId ? [{ type: "location", locationId: quest.locationId || quest.destinationId }] : [])], minutes: 10 }];
  return { version: 1, kind, coreGoal, requiresInvestigation,
    nodes, completionConditions: structuredClone(supplied.completionConditions || []), failureConditions: structuredClone(supplied.failureConditions || []),
    rewards: structuredClone(supplied.rewards || []), maxNodes: limits[kind].nodes, maxObstacles: limits[kind].obstacles, maxErrandDepth: 1 };
}

export function migrateQuestLifecycle(game, turn = Number(game.turn || 0)) {
  for (const instance of [...(game.triggerState?.active || [])]) {
    if (instance.status !== "available") continue;
    const definition = instance.definitionSnapshot || getTriggerDefinition(instance.definitionId);
    const random = definition && ["occult-entry", "pathway-quest", "random", "random-opportunity"].includes(definition.category);
    // Fixed main/side content and old entries without known provenance persist.
    instance.expiresTurn = random ? Number(instance.createdTurn || 0) + 10 : definition ? null : instance.expiresTurn ?? null;
    if (random && turn >= instance.expiresTurn) {
      instance.status = "expired"; instance.completedTurn = turn;
      game.triggerState.active = game.triggerState.active.filter(item => item.instanceId !== instance.instanceId);
      game.triggerState.history ||= [];
      if (!game.triggerState.history.some(item => item.instanceId === instance.instanceId)) game.triggerState.history.push(instance);
    }
  }
  for (const quest of game.quests || []) {
    quest.status = normalizeQuestStatus(quest.status);
    if (!quest.lifecycle) {
      const kind = kinds.has(quest.kind) ? quest.kind : ["random", "random-opportunity"].includes(quest.source) ? "random" : "legacy";
      quest.kind = kind;
      quest.lifecycle = { version: 1, createdTurn: Number.isFinite(quest.createdTurn) ? quest.createdTurn : turn,
        acceptedTurn: quest.status === "engaged" ? turn : null, completedNodeIds: [], progressCount: 0 };
      if (quest.status === "engaged") {
        quest.lifecycle.contract = freezeContract(quest);
        quest.objective = quest.lifecycle.contract.nodes[0]?.objective || quest.objective;
      }
    }
    const lifecycle = quest.lifecycle;
    if (quest.kind === "random" && quest.status === "available") {
      lifecycle.offerExpiresTurn ??= lifecycle.createdTurn + 10;
      if (turn >= lifecycle.offerExpiresTurn) { quest.status = "expired"; lifecycle.endedTurn = turn; }
    }
    if (quest.status === "engaged" && Number.isFinite(lifecycle.deadlineTurn) && turn > lifecycle.deadlineTurn) {
      quest.status = "expired"; lifecycle.endedTurn = turn;
    }
  }
  if (game.trackedQuestId) {
    const quest = game.quests?.find(entry => `quest:${entry.id}` === game.trackedQuestId);
    const trigger = game.triggerState?.history?.find(entry => entry.instanceId === game.trackedQuestId);
    if (quest && terminalQuestStatus(quest.status) || trigger && terminalQuestStatus(trigger.status)) game.trackedQuestId = null;
  }
  return game;
}

export function registerQuest(game, input, turn = Number(game.turn || 0) + 1, playerAction = "") {
  if (!clean(input?.id) || !clean(input?.title)) return { ok: false, reason: "任务必须包含 id 与 title" };
  if (game.quests?.some(quest => quest.id === input.id)) return { ok: false, reason: "任务已存在，不能重新接取或领取奖励" };
  if (input.source === "特殊行动") return { ok: false, reason: "特殊委托只能由特殊行动引擎登记" };
  const status = input.status ? normalizeQuestStatus(input.status) : "available";
  if (!["available", "engaged"].includes(status)) return { ok: false, reason: "新任务只能登记为待接取或进行中" };
  if (status === "engaged" && (!/接受|接取|答应|承接|同意|帮忙|帮他|帮她|帮你|我来|委托/.test(playerAction) || /不要|不愿|不想|拒绝|是否|能否|如果|假如/.test(playerAction))) return { ok: false, reason: "进行中任务须有玩家本轮明确接受；新钩子请登记为可选机会" };
  const quest = { id: input.id, title: clean(input.title), summary: clean(input.summary || input.objective || input.title), objective: clean(input.objective || input.summary || input.title),
    status, source: clean(input.source), kind: kinds.has(input.kind) ? input.kind : "random", createdTurn: turn,
    finale: Boolean(input.finale), dangerous: Boolean(input.dangerous), majorDecision: Boolean(input.majorDecision),
    contract: structuredClone(input.contract || {}), deadlineTurns: input.deadlineTurns, locationId: clean(input.locationId) };
  const contract = freezeContract(quest);
  if (contract.requiresInvestigation) return { ok: false, reason: "复杂或危险任务必须登记有限、可核验的contract.nodes，不能把重述目标当作自动结案" };
  if (contract.nodes.length > contract.maxNodes || new Set(contract.nodes.map(node => node.id)).size !== contract.nodes.length || contract.nodes.some(node => !clean(node.id) || !clean(node.objective) || !Array.isArray(node.conditions) || !node.conditions.length || !node.conditions.every(validCondition) || Number(node.errandDepth || 0) > 1 || !validCost(node.cost))
    || contract.nodes.filter(node => node.obstacle).length > contract.maxObstacles
    || !contract.completionConditions.every(validCondition) || !contract.failureConditions.every(validCondition)) return { ok: false, reason: "任务契约须使用有限、可本地验证的目标；随机任务最多3节点/1阻碍，支线或主线章节最多5节点/2阻碍，跑腿最多1层" };
  if (contract.rewards.some(reward => reward.type !== "money" || !Number.isInteger(reward.amountPence) || reward.amountPence < 0)) return { ok: false, reason: "普通任务契约只支持明确的非负便士奖励；物品与特殊奖励使用固定任务引擎" };
  game.quests ||= [];
  game.quests.push(quest);
  migrateQuestLifecycle(game, turn);
  if (status === "engaged" && Number.isInteger(input.deadlineTurns) && input.deadlineTurns > 0) quest.lifecycle.deadlineTurn = turn + input.deadlineTurns;
  return { ok: true, quest };
}

export function acceptOrdinaryQuest(game, quest, turn) {
  migrateQuestLifecycle(game, turn);
  if (quest.status !== "available") return { ok: false, reason: "该任务机会已失效或已接取" };
  quest.status = "engaged";
  quest.lifecycle.acceptedTurn = turn;
  quest.lifecycle.contract = freezeContract(quest);
  quest.objective = quest.lifecycle.contract.nodes[0]?.objective || quest.objective;
  if (Number.isInteger(quest.deadlineTurns) && quest.deadlineTurns > 0) quest.lifecycle.deadlineTurn = turn + quest.deadlineTurns;
  return { ok: true };
}

export function validateQuestPatch(quest, patch = {}) {
  if (quest.source === "特殊行动") return { ok: false, reason: "此委托由特殊行动引擎独立结算" };
  if (terminalQuestStatus(quest.status)) return { ok: false, reason: "已结束任务保留最终记录" };
  if (Object.keys(patch).some(key => key !== "summary")) return { ok: false, reason: "quest.update只能修正摘要；状态、核心目标、条件和奖励必须由本地任务结算确认" };
  return { ok: true };
}

export function ordinaryQuestInspection(game, quest, action = "", turn = Number(game.turn || 0) + 1) {
  const contract = quest.lifecycle?.contract;
  const node = contract?.nodes.find(item => !quest.lifecycle.completedNodeIds.includes(item.id));
  const context = { game, state: game.triggerState || {}, action, turn };
  const finalConditions = node && contract.nodes.at(-1)?.id === node.id ? contract.completionConditions : [];
  const conditions = [...(node?.conditions || []), ...finalConditions];
  const expectedReceipt = node ? { ...quest, lifecycle: { ...quest.lifecycle, nodeReceipts: { ...quest.lifecycle.nodeReceipts,
    [node.id]: { paidPence: Number(node.cost?.amountPence || 0), consumedItems: node.cost?.itemId ? [{ itemId: node.cost.itemId, quantity: node.cost.quantity }] : [] } } } } : quest;
  const missing = [...(node?.conditions || []).filter(condition => !questConditionMatches(condition, context, quest)),
    ...finalConditions.filter(condition => !questConditionMatches(condition, context, expectedReceipt))];
  const paymentBlocker = node ? costBlocker(game, node.cost) : "";
  const describe = condition => condition.type === "location" ? "尚未到达目标地点" : condition.type === "item" ? "尚未持有任务所需物品" : condition.type === "action" ? "尚未执行约定行动" : "尚未满足契约中已登记的证据或状态条件";
  return { node, conditions, missing, requiresInvestigation: Boolean(contract?.requiresInvestigation),
    blockers: contract?.requiresInvestigation ? ["旧任务缺少可核验的完成条件；请依据已知证据一次性补录原目标的有限步骤和完成条件"] : [...new Set([...missing.map(describe), ...(paymentBlocker ? [paymentBlocker] : [])])], paymentBlocker, context };
}

export function resolveOrdinaryQuest(game, quest, args, action, turn) {
  const draft = structuredClone(game);
  const candidate = draft.quests?.find(item => item.id === quest?.id);
  if (!candidate) return { ok: false, reason: "任务不存在" };
  const result = settleOrdinaryQuest(draft, candidate, args, action, turn);
  if (result.ok) {
    const inventoryChanges = (game.inventory || []).flatMap(item => {
      const after = draft.inventory?.find(current => current.instanceId === item.instanceId);
      const delta = Number(after?.quantity || 0) - Number(item.quantity || 0);
      return delta < 0 ? [{ ...playerVisibleItem(item), delta, reason: `履行任务「${quest.title}」的冻结交付条件` }] : [];
    });
    if (inventoryChanges.length) Object.assign(result, { inventoryChanges, inventoryChange: inventoryChanges[0] });
    Object.assign(game, draft);
  }
  return result;
}

function settleOrdinaryQuest(game, quest, args, action, turn) {
  migrateQuestLifecycle(game, turn);
  if (quest.status !== "engaged") return { ok: false, reason: "任务已经结束或尚未接取" };
  if (["progress", "recover"].includes(args.outcome) && /不要|不想|不愿|不再|拒绝|取消|放弃|暂不|先不|是否|能否|如果|假如/.test(action)) return { ok: false, reason: "取消、否定或假设不是实际执行，任务状态与资源保持不变" };
  const lifecycle = quest.lifecycle, contract = lifecycle.contract;
  if (args.legacyPlan) {
    if (args.outcome !== "progress") return { ok: false, reason: "旧任务补录必须来自真实调查，不能以失败或受阻替代登记" };
    const registration = registerLegacyPlan(game, quest, args.legacyPlan, action, turn);
    if (!registration.ok) return registration;
    // Preparing a finite plan records neither a completed node nor a reward.
    // Its first physical action still needs a separate, validated execution.
    return { ok: true, outcome: "planned", completedSteps: [], taskMinutes: 5 };
  }
  const inspection = ordinaryQuestInspection(game, quest, action, turn);
  if (args.outcome === "failed") {
    if (!contract.failureConditions.length || !allConditionsMatch(contract.failureConditions, inspection.context)) return { ok: false, reason: "没有本地状态证实已登记的失败条件" };
    quest.status = "failed"; lifecycle.endedTurn = turn;
    return { ok: true, outcome: "failed", completedSteps: [] };
  }
  if (args.outcome === "blocked") return inspection.missing.length || inspection.paymentBlocker ? { ok: true, outcome: "blocked", evidence: inspection.blockers.join("；"), completedSteps: [] } : { ok: false, reason: "当前没有本地条件证实受阻，不能用叙述虚构障碍" };
  if (Number(game.character?.stats?.health) <= 0) return { ok: false, reason: "生命归零，不能继续完成任务或领取奖励" };
  if (quest.lastProgressTurn === turn) return { ok: false, reason: "普通任务本轮已经结算" };
  if (contract.requiresInvestigation) return { ok: false, reason: inspection.blockers[0] };
  if (!contract.nodes.length) return { ok: false, reason: "旧任务尚无可验证的完成契约，请保留原任务并整理已有事实，不能用新增线索或改名扩展目标" };
  const requested = args.steps || (args.objectiveId ? [{ objectiveId: args.objectiveId }] : []);
  if (!requested.length || requested.length > 3) return { ok: false, reason: "提交一至三个既有普通目标，关键或危险行动须单独决定" };
  const completedSteps = [];
  for (const step of requested) {
    const current = ordinaryQuestInspection(game, quest, action, turn);
    if (!current.node || step.objectiveId !== current.node.id) return { ok: false, reason: "不能跳过、重复或追加冻结契约之外的目标" };
    if (current.node.dangerous || current.node.majorDecision || quest.dangerous || quest.majorDecision || quest.finale) {
      if (requested.length !== 1) return { ok: false, reason: "危险与关键决策必须独立结算" };
    }
    if (current.missing.length || current.paymentBlocker) return { ok: false, reason: current.blockers.join("；") };
    settleNodeCost(game, quest, current.node, turn);
    lifecycle.completedNodeIds.push(current.node.id);
    lifecycle.progressCount += 1;
    completedSteps.push({ from: current.node.id, to: contract.nodes[lifecycle.completedNodeIds.length]?.id || "completed" });
  }
  const next = contract.nodes.find(node => !lifecycle.completedNodeIds.includes(node.id));
  if (!next && !contract.completionConditions.every(condition => questConditionMatches(condition, inspection.context, quest))) return { ok: false, reason: "尚未满足接取时冻结的完成条件" };
  quest.summary = clean(args.evidence);
  quest.objective = next?.objective || contract.coreGoal;
  quest.stage = next?.id || "completed";
  quest.lastProgressTurn = turn;
  if (!next) {
    quest.status = "completed"; lifecycle.endedTurn = turn;
    if (!lifecycle.rewardsClaimed) {
      game.money = moneyFromPence(moneyToPence(game.money || {}) + contract.rewards.reduce((sum, reward) => sum + reward.amountPence, 0));
      lifecycle.rewardsClaimed = true;
    }
  }
  return { ok: true, outcome: "progress", completedSteps, taskMinutes: Math.max(5, requested.reduce((sum, step) => sum + Math.max(5, Number(contract.nodes.find(node => node.id === step.objectiveId)?.minutes || 5)), 0)) };
}

function registerLegacyPlan(game, quest, plan, action, turn) {
  const contract = quest.lifecycle.contract;
  if (!contract.requiresInvestigation || quest.lifecycle.legacyPlanRegistered) return { ok: false, reason: "旧任务的有限契约只能补录一次，之后不能扩展或重写目标" };
  if (clean(plan.coreGoal) !== contract.coreGoal || plan.rewards != null || plan.failureConditions != null) return { ok: false, reason: "补录必须保留原核心目标、奖励与失败条件" };
  if (!/调查|询问|核对|查阅|检查|搜查|交谈|梳理|整理|确认/.test(action) || !action.includes(quest.title) && !action.includes(contract.coreGoal)) return { ok: false, reason: "补录须由玩家真实调查当前旧任务触发" };
  const evidenceIds = [...new Set(Array.isArray(plan.evidenceIds) ? plan.evidenceIds.map(clean).filter(Boolean) : [])];
  if (!evidenceIds.length || evidenceIds.some(id => !(game.clues || []).some(clue => clue.id === id) && !game.triggerState?.facts?.[id])) return { ok: false, reason: "补录须引用已经登记的具体线索或事实，不能编造证据" };
  const nodes = plan.nodes;
  const completion = plan.completionConditions;
  const factual = condition => !condition.not && (["item", "fact", "clue", "stat", "relationship", "trigger", "organization"].includes(condition.type)
    || condition.type === "quest-proof" && nodes?.some(node => node.id === condition.nodeId && (node.cost?.itemId || node.cost?.amountPence > 0 || node.conditions?.some(item => item.type !== "quest-proof" && factual(item))))
    || condition.type === "all" && condition.conditions?.some(factual)
    || condition.type === "any" && condition.conditions?.every(factual));
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 3 || new Set(nodes.map(node => node.id)).size !== nodes.length
    || nodes.some(node => !clean(node.id) || !clean(node.objective) || !Array.isArray(node.conditions) || !node.conditions.length || !node.conditions.every(validCondition) || Number(node.errandDepth || 0) > 1 || !validCost(node.cost))
    || nodes.filter(node => node.obstacle).length > 1 || !Array.isArray(completion) || !completion.length || !completion.every(validCondition) || !completion.some(factual)) return { ok: false, reason: "旧任务补录须有1—3个可验证节点、最多1个阻碍，以及具体事实、物品或状态作为完成条件；重述行动或到场不等于结案" };
  if (!nodes.some(node => node.conditions.some(condition => condition.type === "action"))) return { ok: false, reason: "补录须包含玩家实际执行的约定行动，不能仅因已有线索就自动结案" };
  contract.nodes = structuredClone(nodes);
  contract.completionConditions = structuredClone(completion);
  contract.requiresInvestigation = false;
  contract.maxNodes = 3;
  contract.maxObstacles = 1;
  quest.lifecycle.legacyPlanRegistered = { turn, evidenceIds };
  quest.stage = nodes[0].id;
  quest.objective = nodes[0].objective;
  return { ok: true };
}
