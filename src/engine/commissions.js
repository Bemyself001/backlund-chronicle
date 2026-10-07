import { VISITABLE_PEOPLE, commissionReportLeads } from "../content/index.js";
import { visitPersonGate } from "./visitablePeople.js";
import { advanceWorldTime, formatWorldTime, parseWorldTime } from "./worldTime.js";
import { getMapLocations, normalizeLocationKnowledge, isDiscoveredLocationStatus } from "../system/map.js";
import { moneyFromPence, moneyToPence, formatMoney } from "../system/money.js";
import { ensureWorld } from "../system/hexworld.js";

export const COMMISSION_RULE = "【玩家发布的调查委托】玩家是委托人，夏洛克是受托人。明确提出寻人或调查请求时使用commission.offer登记报价与调查范围；报价不代表已支付或开始调查，不用普通quest.add把玩家当执行者。确认接单、付款、询问、取消和领取报告由任务簿quest.track本地执行，不另调money.remove、clue.add或quest.resolve重复结算。查看委托进度不消耗回合；调查按游戏时钟推进，询问不重置交付时间。每份领取的报告必有1—2条本地确认的调查线索，以commissionReport.clues为准，全文必须交代这些线索；报告提供查访方向，不替玩家完成固定主线、危险步骤或重大决定，不提前揭露后续真相。领取前不得叙述报告已交付、线索已入册。";
export const COMMISSION_PHASE_LABELS = { offered: "待确认委托", investigating: "调查中", ready: "报告可领取", collected: "报告已领取", cancelled: "已取消" };
const clean = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const personFor = id => VISITABLE_PEOPLE.find(person => person.id === id);
const timeNumber = value => parseWorldTime(value)?.getTime() ?? null;
const failed = reason => ({ ok: false, reason });
export const isIssuedCommission = quest => quest?.source === "玩家委托" && quest.commission?.version === 1;
export function commissionProposalIntent(action) {
  const text = String(action || "");
  const prefix = text.slice(0, Math.max(0, text.search(/委托|雇佣|聘请|请|让/)));
  return /委托|雇佣|聘请|(?:请|让).*(?:帮|替|去).*(?:寻找|查找|调查|查访|找)/.test(text)
    && !/不委托|(?:不要|不想|不愿|拒绝|取消|别).{0,20}(?:委托|雇佣|聘请|寻找|查找|调查|查访|找|请|让)/.test(text)
    && !/是否|能否|如果|假如|昨天|刚才|上次|已经|明天|改天|下次/.test(prefix);
}

export function commissionIdentity(npcId, objective) {
  const subject = /舅舅|雷金纳德/.test(objective) ? "uncle-inquiry" : String(objective).replace(/[\s，。；、,.!?！？“”「」]/g, "");
  let hash = 2166136261;
  for (const char of `${npcId}:${subject}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `issued-${(hash >>> 0).toString(36)}`;
}

export function commissionPhase(game, quest) {
  const data = quest.commission;
  const current = timeNumber(game.worldTime), due = timeNumber(data.dueAt);
  if (data.phase === "investigating" && current !== null && due !== null && current >= due) return "ready";
  return data.phase;
}

export function commissionView(game, quest) {
  const data = quest.commission;
  const phase = commissionPhase(game, quest);
  const current = timeNumber(game.worldTime), start = timeNumber(data.acceptedAt), due = timeNumber(data.dueAt);
  const remainingMinutes = due !== null && current !== null ? Math.max(0, Math.ceil((due - current) / 60000)) : null;
  const progress = phase === "ready" || phase === "collected" ? 100 : phase === "investigating" && start !== null && due > start && current !== null
    ? Math.min(99, Math.max(0, Math.floor((current - start) / (due - start) * 100))) : 0;
  return { phase, label: COMMISSION_PHASE_LABELS[phase], issuer: "player", executorId: data.npcId,
    executorName: personFor(data.npcId)?.name || "受托人", feePence: data.feePence, feePaid: Boolean(data.feePaid),
    durationMinutes: data.durationMinutes, acceptedAt: data.acceptedAt || null, dueAt: data.dueAt || null,
    remainingMinutes, progress, relatedQuestId: data.relatedQuestId || null,
    report: phase === "collected" ? structuredClone(data.report) : null,
    history: structuredClone(data.history || []),
  };
}

export function issuedCommissionObjective(game, quest) {
  const view = commissionView(game, quest);
  return view.phase === "offered" ? `确认${view.executorName}的调查范围、${formatMoney(moneyFromPence(view.feePence))}费用与${view.durationMinutes}分钟交付时间，再决定是否委托。`
    : view.phase === "investigating" ? `${view.executorName}正在调查；约定于${view.dueAt}交回报告，尚余${view.remainingMinutes}分钟。`
      : view.phase === "ready" ? `调查报告已备妥，前往${view.executorName}的接待地点领取1—2条调查线索。`
        : view.phase === "collected" ? `已领取报告，${view.report.clues.length}条线索已记入调查手记。` : "委托已取消，原调查任务仍保留。";
}

export function publicCommissionQuest(game, quest) {
  if (!isIssuedCommission(quest)) return quest;
  return { id: quest.id, title: quest.title, summary: quest.summary, objective: issuedCommissionObjective(game, quest),
    source: quest.source, kind: quest.kind, status: quest.status, locationId: quest.locationId, commission: commissionView(game, quest) };
}

export function syncIssuedCommissions(game) {
  const changed = [];
  for (const quest of game.quests || []) {
    if (!isIssuedCommission(quest)) continue;
    const phase = commissionPhase(game, quest);
    if (phase !== quest.commission.phase) {
      quest.commission.phase = phase;
      quest.commission.revision += 1;
      quest.commission.history.push({ phase, worldTime: quest.commission.dueAt, note: "约定的调查时间已到，报告可领取" });
      quest.commission.history = quest.commission.history.slice(-50);
      changed.push({ questId: quest.id, phase });
    }
    quest.status = ["collected", "cancelled"].includes(phase) ? phase === "collected" ? "completed" : "abandoned" : "engaged";
    quest.objective = issuedCommissionObjective(game, quest);
  }
  return changed;
}

export function offerCommission(game, input, action, turn = Number(game.turn || 0) + 1) {
  const npcId = clean(input.npcId, 80), objective = clean(input.objective, 120);
  const person = personFor(npcId);
  if (!person) return failed("受托人必须是当前可以拜访的侦探");
  const gate = visitPersonGate(game, npcId, { conversation: true });
  if (gate) return failed(gate);
  if (objective.length < 4 || !commissionProposalIntent(action) || /不委托|别.*(?:委托|调查|寻找)/.test(action)
    || !String(action).includes(objective)) return failed("须先明确提出调查委托及其范围");
  if (!Number.isInteger(input.feePence) || input.feePence < 0 || input.feePence > 240000) return failed("委托费用必须是0—240000的整数便士");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 60 || input.durationMinutes > 10080) return failed("调查时间必须是60—10080分钟");
  if (timeNumber(game.worldTime) === null) return failed("当前游戏时钟无法确定交付时间");
  const baseId = commissionIdentity(npcId, objective);
  const previous = (game.quests || []).filter(quest => quest.id === baseId || typeof quest.id === "string" && quest.id.startsWith(`${baseId}-`));
  const conflict = previous.find(quest => !isIssuedCommission(quest));
  if (conflict) return failed("委托编号与已有任务冲突");
  const existing = previous.find(quest => !["collected", "cancelled"].includes(quest.commission.phase));
  if (existing) return { ok: true, quest: publicCommissionQuest(game, existing), reused: true, taskMinutes: 10 };
  let id = baseId, attempt = 2;
  while (previous.some(quest => quest.id === id)) id = `${baseId}-${attempt++}`;
  const relatedId = clean(input.relatedQuestId, 100);
  const related = relatedId && [...(game.quests || []).map(quest => `quest:${quest.id}`), ...(game.triggerState?.active || []).filter(entry => entry.status !== "eligible").map(entry => entry.instanceId)].includes(relatedId) ? relatedId : null;
  const clueIds = Array.isArray(input.sourceClueIds) ? input.sourceClueIds.filter(id => game.clues?.some(clue => clue.id === id)).slice(0, 2) : [];
  const quest = { id, title: `委托${person.name}：${objective}`, summary: `由你发布，${person.name}调查「${objective}」并交回含1—2条线索的报告。`,
    source: "玩家委托", kind: "side", status: "engaged", locationId: person.locationId, createdTurn: turn,
    commission: { version: 1, revision: 0, npcId, phase: "offered", feePence: input.feePence, feePaid: false,
      durationMinutes: input.durationMinutes, scope: objective, relatedQuestId: related, sourceClueIds: clueIds,
      acceptedAt: null, dueAt: null, report: null, history: [{ phase: "offered", worldTime: game.worldTime, note: "调查范围与报价已登记，尚未付费或接单" }] } };
  game.quests ||= [];
  game.quests.push(quest);
  syncIssuedCommissions(game);
  return { ok: true, quest: publicCommissionQuest(game, quest), taskMinutes: 10 };
}

export function settleCommission(game, questId, operation, turn = Number(game.turn || 0) + 1) {
  const quest = game.quests?.find(entry => entry.id === questId && isIssuedCommission(entry));
  if (!quest) return failed("这项玩家委托不存在");
  const view = commissionView(game, quest);
  const gate = visitPersonGate(game, view.executorId, { conversation: true });
  if (gate) return failed(gate);
  const data = quest.commission;
  if (timeNumber(game.worldTime) === null) return failed("当前游戏时钟无法确定委托进度");
  syncIssuedCommissions(game);
  if (operation === "accept") {
    if (view.phase !== "offered") return failed("委托已经确认或结束，无需再次支付");
    if (moneyToPence(game.money) < data.feePence) return failed("资金不足，委托未确认，也未扣费");
    data.acceptedAt = advanceWorldTime(game.worldTime, 10);
    data.dueAt = advanceWorldTime(data.acceptedAt, data.durationMinutes);
    if (timeNumber(data.dueAt) === null) return failed("无法确定委托交付时间，委托未确认");
    game.money = moneyFromPence(moneyToPence(game.money) - data.feePence);
    data.feePaid = true; data.phase = "investigating";
    data.history.push({ phase: data.phase, worldTime: data.acceptedAt, note: "费用已支付，受托人开始调查" });
  } else if (operation === "collect") {
    if (view.phase !== "ready") return failed(view.phase === "collected" ? "报告已经领取，不能重复登记线索" : "报告尚未完成，请按约定时间再来");
    if (!data.feePaid) return failed("委托尚未确认付款，不能领取报告");
    const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location?.id, game);
    const known = getMapLocations(game).filter(location => isDiscoveredLocationStatus(knowledge[location.id]?.status));
    const sources = (data.sourceClueIds || []).map(id => game.clues?.find(clue => clue.id === id)).filter(Boolean);
    const leads = commissionReportLeads(data.scope, known, sources);
    if (leads.length < 1 || leads.length > 2 || leads.some(lead => !lead.title || !lead.detail)) return failed("调查报告缺少可登记的1—2条线索，委托仍待领取");
    const clues = leads.map((lead, index) => ({ ...lead, id: `clue-${quest.id}-${index + 1}`, kind: "investigation_lead",
      source: `${view.executorName}的调查报告`, commissionId: quest.id, relatedQuestId: data.relatedQuestId,
      discoveredAt: `第${turn}轮`, discoveredTurn: turn, isNew: true }));
    if (clues.some(clue => game.clues?.some(existing => existing.id === clue.id))) return failed("报告线索已经登记，请核对已有报告");
    game.clues ||= [];
    game.clues.push(...clues);
    // A report can supply an address, while the player stays at the detective's office.
    game.locationKnowledge = knowledge;
    game.discoveredLocations ||= [];
    for (const clue of clues) {
      const location = getMapLocations(game).find(entry => entry.id === clue.locationId);
      if (!location || isDiscoveredLocationStatus(knowledge[location.id]?.status)) continue;
      knowledge[location.id] = { ...knowledge[location.id], status: "discovered", note: clue.detail,
        discoveredAt: `第${turn}轮`, source: clue.source };
      if (!game.discoveredLocations.some(entry => entry.id === location.id)) game.discoveredLocations.push({ id: location.id, name: location.name, note: clue.detail });
    }
    ensureWorld(game);
    data.report = { title: `${data.scope} · 调查报告`, summary: `${view.executorName}交回了${clues.length}条可以继续查访的线索。`,
      collectedAt: advanceWorldTime(game.worldTime, 10), collectedTurn: turn, clues: structuredClone(clues) };
    data.phase = "collected";
    data.history.push({ phase: data.phase, worldTime: data.report.collectedAt, note: `报告已领取，${clues.length}条线索已入册` });
  } else if (operation === "cancel") {
    if (["collected", "cancelled"].includes(view.phase)) return failed("这项委托已经结束");
    data.phase = "cancelled";
    data.history.push({ phase: data.phase, worldTime: advanceWorldTime(game.worldTime, 10), note: data.feePaid ? "玩家取消委托；已开展调查的费用不退还" : "玩家取消尚未确认的委托，未扣费" });
  } else if (operation === "check") {
    if (!["investigating", "ready"].includes(view.phase)) return failed("当前没有正在执行的调查可询问");
    data.history.push({ phase: view.phase, worldTime: advanceWorldTime(game.worldTime, 10), note: "当面询问进度，约定交付时间保持不变" });
  } else return failed("无效的委托操作");
  data.revision += 1;
  data.history = data.history.slice(-50);
  syncIssuedCommissions(game);
  return { ok: true, taskMinutes: 10, commission: publicCommissionQuest(game, quest),
    ...(operation === "collect" ? { commissionReport: structuredClone(data.report) } : {}) };
}

// Explicit bookkeeping repair for old narrative-only commissions. The UI must
// confirm acceptance/payment and the remaining time; this never deducts money.
export function restoreCommission(game, request) {
  if (request?.acceptedAndPaid !== true) return failed("请确认旧剧情中侦探已经接单，且约定费用已经支付");
  if (!Number.isInteger(request.remainingMinutes) || request.remainingMinutes < 0 || request.remainingMinutes > 10080 || request.remainingMinutes > 0 && request.remainingMinutes < 60) return failed("补录的剩余调查时间须为0或60—10080分钟");
  const baseId = commissionIdentity(request.npcId, request.objective);
  const previous = game.quests?.filter(quest => quest.id === baseId || typeof quest.id === "string" && quest.id.startsWith(`${baseId}-`)) || [];
  const existing = previous.find(quest => isIssuedCommission(quest) && !["collected", "cancelled"].includes(quest.commission.phase)) || previous.at(-1);
  if (existing) return isIssuedCommission(existing) && existing.commission.phase !== "offered"
    ? { ok: true, reused: true, quest: publicCommissionQuest(game, existing) } : failed("已有待确认报价，请从任务簿确认委托");
  const draft = structuredClone(game);
  const offered = offerCommission(draft, { ...request, durationMinutes: Math.max(60, request.remainingMinutes) }, `委托${personFor(request.npcId)?.name}：${request.objective}`, game.turn);
  if (!offered.ok) return offered;
  const quest = draft.quests.find(entry => entry.id === offered.quest.id), data = quest.commission;
  data.acceptedAt = request.remainingMinutes > 0 ? game.worldTime : formatWorldTime(new Date(timeNumber(game.worldTime) - data.durationMinutes * 60000));
  data.dueAt = advanceWorldTime(data.acceptedAt, request.remainingMinutes || data.durationMinutes);
  data.phase = "investigating"; data.feePaid = true; data.paymentSource = "player-restored"; data.revision += 1;
  data.history = [{ phase: "investigating", worldTime: game.worldTime, note: `玩家补录已接单、已付费的旧委托；剩余${request.remainingMinutes}分钟，本次未扣费` }];
  syncIssuedCommissions(draft);
  draft.trackedQuestId = `quest:${quest.id}`;
  Object.assign(game, draft);
  return { ok: true, quest: publicCommissionQuest(game, quest) };
}

export function validateCommissionRecords(game) {
  for (const quest of Array.isArray(game.quests) ? game.quests : []) {
    if (quest?.source !== "玩家委托") continue;
    // Older AI-created quests could already use this source label without any
    // structured NPC contract. Preserve those records for explicit UI repair.
    if (!Object.hasOwn(quest, "commission")) continue;
    const data = quest.commission;
    const invalid = () => { throw new Error("存档中的玩家委托记录不完整或格式错误，原存档未被覆盖。"); };
    if (!isIssuedCommission(quest) || !personFor(data.npcId) || !Object.hasOwn(COMMISSION_PHASE_LABELS, data.phase)
      || !Number.isInteger(data.revision) || data.revision < 0 || typeof data.scope !== "string" || data.scope.trim().length < 4 || data.scope.length > 120
      || !Number.isInteger(data.feePence) || data.feePence < 0 || data.feePence > 240000 || typeof data.feePaid !== "boolean"
      || !Number.isInteger(data.durationMinutes) || data.durationMinutes < 60 || data.durationMinutes > 10080
      || quest.locationId !== personFor(data.npcId).locationId || !Array.isArray(data.history) || data.history.some(entry => !entry || typeof entry.note !== "string")
      || !Array.isArray(data.sourceClueIds)) invalid();
    if (["investigating", "ready", "collected"].includes(data.phase) || data.feePaid) {
      const start = timeNumber(data.acceptedAt), due = timeNumber(data.dueAt);
      if (!data.feePaid || start === null || due === null || due - start !== data.durationMinutes * 60000) invalid();
    }
    if (data.phase === "offered" && (data.feePaid || data.acceptedAt || data.dueAt || data.report)) invalid();
    if (data.phase === "collected") {
      const clues = data.report?.clues;
      if (!Array.isArray(clues) || clues.length < 1 || clues.length > 2 || timeNumber(data.report.collectedAt) === null
        || clues.some((clue, index) => !clue || clue.id !== `clue-${quest.id}-${index + 1}` || !clean(clue.title) || !clean(clue.detail)
          || !game.clues?.some(entry => entry.id === clue.id && entry.commissionId === quest.id))) invalid();
    } else if (data.report) invalid();
  }
  return game;
}
