import { registerQuest, ordinaryQuestInspection } from "./questLifecycle.js";
import { allConditionsMatch } from "./triggerConditions.js";

const history = game => game.storyHistory?.length ? game.storyHistory : game.recentDialogues || [];
const negative = /不要|不想|不愿|拒绝|尚未|没有完成|未完成|如果|假如|打算|准备去/;
function record(game, role, turn, quote) {
  return Number.isInteger(turn) && turn <= Number(game.turn || 0) && typeof quote === "string" && quote.trim().length >= 4
    ? history(game).find(message => message.role === role && message.turn === turn && String(message.content).includes(quote)) : null;
}
function number(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = "零一二三四五六七八九";
  if (value === "两") return 2;
  if (value.includes("十")) { const [left, right] = value.split("十"); return (left ? digits.indexOf(left) : 1) * 10 + (right ? digits.indexOf(right) : 0); }
  return digits.indexOf(value);
}
function promisedAmounts(quote) {
  return [...quote.matchAll(/(?:报酬|酬金|奖励|支付|给你)[^。！？\n]{0,12}?([0-9零一二两三四五六七八九十]+)\s*(镑|磅|苏勒|先令|便士)/g)]
    .map(match => number(match[1]) * ({ 镑: 240, 磅: 240, 苏勒: 12, 先令: 12, 便士: 1 })[match[2]]);
}

// Recovery cites saved conversation, never the current player's assertion. It
// cannot rewrite an existing contract or replay costs from a past delivery.
export function recoverMissingQuest(game, recovery, reference, turn) {
  const input = recovery?.quest, agreement = recovery?.agreement, acceptance = recovery?.acceptance;
  if (!input || ![input.id, `quest:${input.id}`, input.title].includes(reference)) return { ok: false, reason: "恢复任务须提供与原任务对应的编号、原约定和接取记录" };
  const original = record(game, "assistant", agreement?.turn, agreement?.quote);
  const accepted = record(game, "user", acceptance?.turn, acceptance?.quote);
  if (!original || !accepted || acceptance.turn < agreement.turn || !/接受|接取|答应|承接|同意|帮忙|我来|委托/.test(acceptance.quote) || negative.test(accepted.content)) return { ok: false, reason: "尚未找到明确的历史委托和接取记录，无法确认漏登记；请核对原对话" };
  const goal = input.contract?.coreGoal;
  if (!goal || !agreement.quote.includes(goal) || negative.test(agreement.quote)) return { ok: false, reason: "恢复任务必须保留历史原约定中的核心目标，不能新增任务要求" };
  if (!String(accepted.content).includes(goal) && !String(accepted.content).includes(input.title)
    && !history(game).some(message => message.role === "assistant" && message.turn === acceptance.turn && (String(message.content).includes(goal) || String(message.content).includes(input.title)))) return { ok: false, reason: "历史接取记录未能对应这项委托，请引用同一任务的原始记录" };
  const prior = game.quests?.find(quest => quest.title === input.title || quest.lifecycle?.recovery?.agreementTurn === agreement.turn && quest.lifecycle.contract?.coreGoal === goal);
  if (prior) return { ok: false, reason: `这项委托已有记录，请使用任务编号quest:${prior.id}，不能重复恢复或领取` };
  const amount = (input.contract?.rewards || []).reduce((sum, reward) => sum + Number(reward.amountPence || 0), 0);
  if (amount && !promisedAmounts(agreement.quote).includes(amount)) return { ok: false, reason: "恢复报酬必须与历史明确约定的金额一致；金额不清楚时不能臆造补发" };
  if (history(game).some(message => message.role === "assistant" && message.turn >= acceptance.turn
    && (String(message.content).includes(input.title) || String(message.content).includes(goal))
    && /(?:已领取|已支付|已收到|付清|收到了)[^。！？\n]{0,16}(?:报酬|酬金|镑|磅|苏勒|便士)/.test(message.content))) return { ok: false, reason: "历史已有这项委托的付款记录，请核对原结算，不能重复补发" };
  const registered = registerQuest(game, { ...input, status: "engaged" }, turn, acceptance.quote);
  if (!registered.ok) return registered;
  const quest = registered.quest, lifecycle = quest.lifecycle;
  const steps = recovery.completedSteps || [];
  if (!Array.isArray(steps) || steps.length > lifecycle.contract.nodes.length) return { ok: false, reason: "历史进度超出原任务约定" };
  for (const proof of steps) {
    const inspection = ordinaryQuestInspection(game, quest, proof.actionQuote, proof.turn);
    const pastAction = record(game, "user", proof.turn, proof.actionQuote);
    const pastResult = record(game, "assistant", proof.turn, proof.resultQuote);
    if (!pastAction || !pastResult || proof.turn < acceptance.turn || negative.test(pastAction.content) || negative.test(pastResult.content)
      || !/完成|交给|交付|收下|送达|归还|确认|核对|找到|救出|治好/.test(proof.resultQuote)
      || inspection.node?.id !== proof.objectiveId || inspection.node.cost || inspection.node.dangerous || inspection.node.majorDecision || quest.dangerous || quest.finale || quest.majorDecision
      || inspection.missing.length || inspection.paymentBlocker) return { ok: false, reason: "这一步缺少历史完成记录或本地条件不符；已支付和交付须有原始凭证，不能重新扣款或虚构完成" };
    lifecycle.completedNodeIds.push(proof.objectiveId);
    lifecycle.progressCount += 1;
  }
  lifecycle.recovery = { agreementTurn: agreement.turn, acceptanceTurn: acceptance.turn, completedSteps: structuredClone(steps) };
  lifecycle.acceptedTurn = acceptance.turn;
  const next = lifecycle.contract.nodes.find(node => !lifecycle.completedNodeIds.includes(node.id));
  if (!next) {
    if (!allConditionsMatch(lifecycle.contract.completionConditions, { game, state: game.triggerState, action: steps.at(-1)?.actionQuote || "", turn })) return { ok: false, reason: "历史步骤已有记录，但原约定的最终完成条件仍需核实" };
    lifecycle.objectivesCompletedTurn = steps.at(-1)?.turn || turn;
    quest.stage = "awaiting-reward";
    quest.objective = lifecycle.contract.rewardClaim?.objective || "向原委托人领取约定报酬";
  } else { quest.stage = next.id; quest.objective = next.objective; }
  return { ok: true, id: `quest:${quest.id}` };
}

export function questRecoveryHistory(game, query = "") {
  const messages = history(game);
  const relevantTurns = new Set(messages.filter(message => query && (String(message.content).includes(query) || query.length >= 2 && query.split(/[\s，。；：:]+/).some(word => word.length >= 2 && String(message.content).includes(word)))).map(message => message.turn));
  return messages.filter(message => relevantTurns.has(message.turn) || /委托|报酬|酬金|交差|接受|接取/.test(message.content)).slice(-16).map(({ role, turn, content }) => ({ role, turn, content: String(content).slice(0, 1200) }));
}

export const QUEST_RECOVERY_RULE = "任务操作复制taskJournal.id，固定支线复制实例ID，不能用阶段ID或重新quest.add同名预设任务。新委托须在首次接取时登记有限目标和已约定报酬；登记未成功不能叙述接取成功。普通任务完成后由本地一次性发放contract.rewards，禁止再调用money.add重复发钱。原约定须回去交差时，接取时填写contract.rewardClaim的目标和地点；awaiting-reward阶段用quest.resolve outcome=claim领取，不追加调查步骤。固定支线交付仍用progress及当前目标，随目标自动结算。漏登记的历史普通委托可通过quest.resolve.recovery恢复：引用questRecoveryHistory的原约定、玩家接取原话和实际完成记录，保留原目标与报酬；原文不清楚就说明缺少哪项记录，不编造。恢复不能覆盖已有任务、危险决定或无凭证的资源支付，未完成的部分才继续做。";
