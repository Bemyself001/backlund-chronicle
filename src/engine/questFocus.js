import { visibleQuestJournal } from "./questRuntime.js";
import { findQuestReference, questNameAliases } from "./questIdentity.js";

const unrelated = /暂时搁置|处理其他事情|换个话题|休息|睡觉|闲逛|吃饭|喝茶|装备|卸下/;
const continuation = /继续|然后|接着|交谈|询问|他|她|他们|委托人|报酬|酬金|交差|领奖|结算|等待|通知/;

export function chooseQuestFocus(game, action = "", calls = [], results = []) {
  const entries = visibleQuestJournal(game);
  if (unrelated.test(action)) return null;
  const issued = calls.flatMap((call, index) => {
    if (!results[index]?.ok) return [];
    const quest = call.name === "commission.offer" ? results[index].data?.quest
      : call.name === "quest.track" ? game.quests?.find(item => `quest:${item.id}` === call.args?.id) : null;
    return quest?.commission ? [`quest:${quest.id}`] : [];
  });
  if (new Set(issued).size === 1) return { id: issued[0], turn: Number(game.turn || 0) + 1 };
  if (/怀表|纸条/.test(action)) {
    const watch = game.triggerState?.active?.find(instance => instance.definitionId === "watch.heirloom.hidden-note" && ["available", "engaged"].includes(instance.status));
    if (watch) return { id: watch.instanceId, turn: Number(game.turn || 0) + 1 };
  }
  const named = entries.filter(entry => questNameAliases(entry.title).some(name => action.includes(name)) || action.includes(entry.id));
  if (named.length === 1) return { id: named[0].id, turn: Number(game.turn || 0) + 1 };
  const touched = calls.flatMap((call, index) => {
    if (!results[index]?.ok || !["quest.resolve", "trigger.engage", "trigger.progress", "quest.track", "quest.add"].includes(call.name)) return [];
    const reference = findQuestReference(game, call.args?.instanceId || call.args?.id || call.args?.quest?.id);
    return reference.ok ? [reference.id] : [];
  });
  if (new Set(touched).size === 1) return { id: touched[0], turn: Number(game.turn || 0) + 1 };
  // Recover an old save's conversational subject without requiring the player
  // to know the task title. Only a unique, specific phrase is sufficient.
  const topical = entries.filter(entry => entry.status === "engaged" && [...String(action)].some((_, index) => {
    const phrase = action.slice(index, index + 3);
    return /^[\u4e00-\u9fff]{3}$/.test(phrase) && !/继续|任务|调查|报酬|酬金|完成|领取|约定|当前|委托|通知|等待/.test(phrase) && `${entry.title}${entry.objective}`.includes(phrase);
  }));
  if (topical.length === 1) return { id: topical[0].id, turn: Number(game.turn || 0) + 1 };
  const contextual = entries.filter(entry => entry.status === "engaged" && game.questJournal?.attempts?.[entry.id]?.lastTurn === Number(game.turn || 0) + 1);
  if (contextual.length === 1) return { id: contextual[0].id, turn: Number(game.turn || 0) + 1 };
  const previous = entries.find(entry => entry.id === game.questFocus?.id && entry.status === "engaged");
  return previous && continuation.test(action) ? { id: previous.id, turn: Number(game.turn || 0) + 1 } : null;
}

export function questFocusContext(game, action = "") {
  const focus = chooseQuestFocus(game, action);
  const entry = visibleQuestJournal(game).find(item => item.id === focus?.id);
  return entry ? { id: entry.id, title: entry.title, objective: entry.objective, status: entry.status } : null;
}

export const QUEST_FOCUS_RULE = "【当前行动优先】围绕玩家本轮正在处理的支线、人物和交付结算延续正文与选项。currentQuestFocus是当前关注事项，追踪中的主线不是强制目标。未结束且可推进的支线至少保留一个继续处理的选项，其余提供当前场景的不同做法或离开；领奖时提供核对约定、领取报酬、交谈等选项。不能把三个选项全改成返回另一任务。已完成支线先交代实际到账与收尾；后续主线只作为可选方向。旧任务提示不能打断当前行动，真实危险倒计时可提醒但不替玩家转向。";
