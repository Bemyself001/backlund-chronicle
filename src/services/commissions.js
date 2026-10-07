import { VISITABLE_PEOPLE } from "../content/index.js";
import { hasMetPerson } from "../engine/visitablePeople.js";
import { commissionIdentity, commissionProposalIntent, isIssuedCommission, restoreCommission } from "../engine/commissions.js";
import { visibleQuestJournal } from "../engine/questRuntime.js";

// Register a reviewable quote even when the planner omits its state tool.
export function inferCommissionInquiry(game, action) {
  const text = String(action || "");
  if (!commissionProposalIntent(text) || /不委托|别.*(?:委托|调查|寻找)/.test(text)) return null;
  const person = VISITABLE_PEOPLE.find(entry => entry.locationId === game.location?.id && hasMetPerson(game, entry)
    && [entry.name, ...entry.name.split("·")].some(name => text.includes(name)));
  if (!person) return null;
  const goal = text.match(/(?:寻找|查找|查访|调查|核对|查明|找)([^，。；！？,;!?\n]{2,100})/);
  if (!goal || /^(?:服务|工作|方式|哪些|如何)/.test(goal[1])) return null;
  const objective = `${goal[0]}`.replace(/(?:，|；)?(?:先|再)?(?:商定|讨论|确认|询问).*(?:费用|报价|时间).*$/, "").trim().slice(0, 120);
  if (objective.length < 4) return null;
  const related = /舅舅|雷金纳德/.test(objective) && visibleQuestJournal(game).find(entry => !entry.commission && ["engaged", "available"].includes(entry.status) && /舅舅|怀表/.test(entry.title));
  return { npcId: person.id, objective, feePence: 240, durationMinutes: 1440,
    relatedQuestId: related?.id || null, sourceClueIds: (game.clues || []).filter(clue => /舅舅|怀表|雷金纳德/.test(`${clue.title} ${clue.detail}`)).slice(-2).map(clue => clue.id) };
}

export function ensureCommissionOfferTool(calls, inquiry, game) {
  if (!inquiry) return calls;
  const proposed = calls.find(call => call.name === "commission.offer" && call.args?.npcId === inquiry.npcId);
  const fee = proposed?.args?.feePence, duration = proposed?.args?.durationMinutes;
  return [{ id: `commission-offer:${game.turn + 1}:${commissionIdentity(inquiry.npcId, inquiry.objective)}`, name: "commission.offer",
    args: { ...inquiry, feePence: Number.isInteger(fee) && fee >= 0 && fee <= 240000 ? fee : inquiry.feePence,
      durationMinutes: Number.isInteger(duration) && duration >= 60 && duration <= 10080 ? duration : inquiry.durationMinutes },
    reason: "玩家向已见面的侦探提出调查委托；登记范围与报价，待玩家确认后付款" }];
}

export function inferCommissionTrackingRequest(game, action) {
  const text = String(action || "");
  if (/不要|不想|暂不|是否|能否|如果|假如|昨天|已经领取|上次|明天|改天/.test(text)) return null;
  const operation = /领取|取回|拿取|拿到/.test(text) && /报告/.test(text) ? "collect"
    : /取消|撤销/.test(text) && /委托/.test(text) ? "cancel"
      : /确认|同意|接受|支付|付费/.test(text) && /委托|报价|调查费用/.test(text) ? "accept"
        : /询问|问问|催问/.test(text) && /调查进度|委托进度|调查报告/.test(text) ? "check"
          : /查看|查询|追踪/.test(text) && /委托|调查进度/.test(text) ? "status" : null;
  if (!operation) return null;
  const allIssued = (game.quests || []).filter(isIssuedCommission);
  const active = allIssued.filter(quest => !["collected", "cancelled"].includes(quest.commission.phase));
  const issued = active.length ? active : allIssued;
  const exact = issued.filter(quest => text.includes(quest.title) || text.includes(quest.commission.scope));
  const candidates = exact.length ? exact : issued.filter(quest => /舅舅|雷金纳德/.test(text) && /舅舅|雷金纳德/.test(quest.commission.scope)
    || VISITABLE_PEOPLE.some(person => person.id === quest.commission.npcId && person.name.split("·").some(name => text.includes(name))));
  const bareRequest = /^(?:查看|查询|追踪)(?:我发布的|我的)?委托(?:进度)?[。！!\s]*$|^(?:领取|取回|拿取)(?:调查)?报告[。！!\s]*$/.test(text);
  if (candidates.length > 1 || !candidates.length && bareRequest && issued.length > 1) throw new Error("有多项调查委托，请在任务簿选择要操作的具体委托");
  const quest = candidates.length === 1 ? candidates[0] : candidates.length === 0 && bareRequest && issued.length === 1 ? issued[0] : null;
  if (!quest) return null;
  const entry = visibleQuestJournal(game).find(entry => entry.id === `quest:${quest.id}`);
  return { id: entry.id, revision: entry.revision, routeId: `commission:${operation}` };
}

export function restoreCommissionRecord(game, request) {
  const draft = structuredClone(game);
  const result = restoreCommission(draft, request);
  return result.ok ? { ...result, game: draft } : result;
}

export function appendCommissionReport(narrative, resolution) {
  const report = resolution.accepted.find(result => result.data?.commissionReport)?.data.commissionReport;
  if (!report) return narrative;
  return `${narrative}\n\n【${report.title}】\n${report.clues.map((clue, index) => `${index + 1}. ${clue.title}\n${clue.detail}`).join("\n\n")}`;
}
