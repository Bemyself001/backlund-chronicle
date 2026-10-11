import { DIALOGUE_PEOPLE } from "../content/index.js";
import { activeEnemies } from "../system/combat.js";
import { advanceWorldTime } from "./worldTime.js";
import { setTriggerFact, normalizeTriggerState } from "./triggerState.js";

export const MAX_LETTER_LENGTH = 600;
export const MAX_REPLY_LENGTH = 2000;
export const CONVERSATION_RULE = "【人物书信】人物对话中的往来信件是已发生的通信。铜哨召来阿兹克的信使递信，不传送阿兹克本人，不召唤战斗援军。只有本地conversations记录代表已寄出或收到的信；聊天文字不会发放道具、修改属性、完成主线或授予塔罗会身份。人物只知道玩家已实际分享的事，意见和推测不自动成为已确认线索。";
const whole = value => Number.isInteger(value) && value >= 0 ? value : 0;

export function conversationPerson(id) { return DIALOGUE_PEOPLE.find(person => person.id === id) || null; }

export function conversationState(game) {
  const threads = {};
  for (const person of DIALOGUE_PEOPLE) {
    const raw = game.conversations?.threads?.[person.id];
    if (!raw || typeof raw !== "object") continue;
    const seen = new Set();
    const messages = (Array.isArray(raw.messages) ? raw.messages : []).filter(entry => entry && ["user", "assistant"].includes(entry.role)
      && typeof entry.content === "string" && typeof entry.id === "string" && !seen.has(entry.id) && seen.add(entry.id)).map(entry => ({
      id: entry.id, role: entry.role, content: Array.from(entry.content).slice(0, entry.role === "user" ? MAX_LETTER_LENGTH : MAX_REPLY_LENGTH).join(""),
      turn: whole(entry.turn), worldTime: String(entry.worldTime || ""), source: entry.source === "fixed" ? "fixed" : "ai",
    }));
    threads[person.id] = { revision: whole(raw.revision), messages };
  }
  return { version: 1, threads };
}

export function conversationGate(game, personId) {
  const person = conversationPerson(personId);
  if (!person) return "尚未开放与这位人物的对话";
  if (!(game.inventory || []).some(item => item.itemId === person.requiredItemId && item.quantity > 0)) return "获得阿兹克铜哨后可开启书信对话";
  if (activeEnemies(game).length) return "请先结束当前遭遇，再写信联系";
  if (!(game.character?.stats?.health > 0) || !(game.character?.stats?.sanity > 0)) return "请先恢复身心状态，再写信联系";
  if (game.triggerState?.active?.some(entry => entry.category === "mainline" && entry.stage === "tarot-oath" && entry.status === "engaged")) return "请先结束灰雾会面，回到旅店后再召来信使";
  return "";
}

export function conversationView(game, personId) {
  const person = conversationPerson(personId), thread = conversationState(game).threads[personId] || { revision: 0, messages: [] };
  return { person, ...thread, gate: conversationGate(game, personId) };
}

export function validateLetter(text) {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value || Array.from(value).length > MAX_LETTER_LENGTH) throw new Error(`信件需填写1至${MAX_LETTER_LENGTH}字`);
  return value;
}

export function validateReply(text) {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value || Array.from(value).length > MAX_REPLY_LENGTH || /^[{[]/.test(value)) throw new Error("回信为空、过长或格式异常，请重试这封信");
  return value;
}

export function appendDialogueExchange(game, personId, text, reply, { source = "ai", minutes = 15 } = {}) {
  if (!conversationPerson(personId)) throw new Error("未知收信人");
  const letter = validateLetter(text), response = validateReply(reply);
  const state = conversationState(game), thread = state.threads[personId] || { revision: 0, messages: [] };
  const turn = game.turn + 1, id = `letter:${personId}:${turn}:${thread.revision}`;
  thread.messages.push({ id: `${id}:sent`, role: "user", content: letter, turn, worldTime: game.worldTime, source },
    { id: `${id}:reply`, role: "assistant", content: response, turn, worldTime: advanceWorldTime(game.worldTime, minutes), source });
  thread.revision += 1;
  state.threads[personId] = thread;
  game.conversations = state;
  game.triggerState = normalizeTriggerState(game);
  setTriggerFact(game.triggerState, `person.${personId}.corresponded`, turn, [id]);
  game.occult = { ...game.occult, contact: 1 };
  setTriggerFact(game.triggerState, "occult.contact", turn, [id]);
}

// Invoked on the special-action clone only after a complete AI response is available.
export function executeConversationAction(game, request) {
  const gate = conversationGate(game, request.personId);
  if (gate) throw new Error(gate);
  const view = conversationView(game, request.personId);
  if (request.conversationRevision !== view.revision || request.expectedTurn !== game.turn || request.expectedWorldTime !== game.worldTime) throw new Error("档案或书信已更新，请重新写信");
  const text = validateLetter(request.text), reply = validateReply(request.reply);
  appendDialogueExchange(game, request.personId, text, reply);
  return { action: `写信给${view.person.name}`, minutes: 15,
    narrative: `你用铜哨召来信使，将信寄给${view.person.name}，稍后收到了回信。\n\n【你的信】\n${text}\n\n【${view.person.shortName}的回信】\n${reply}` };
}
