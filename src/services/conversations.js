import { requestAIWithReasoningFallback } from "./api.js";
import { conversationGate, conversationView, validateLetter, validateReply, CONVERSATION_RULE } from "../engine/conversations.js";
import { mainlineView } from "../engine/mainline.js";
import { specialState } from "../engine/specialActions.js";

export function prepareConversationRequest(game, personId, text) {
  const gate = conversationGate(game, personId);
  if (gate) throw new Error(gate);
  return { operation: "conversation-send", personId, text: validateLetter(text), revision: specialState(game).revision,
    conversationRevision: conversationView(game, personId).revision, expectedTurn: game.turn, expectedWorldTime: game.worldTime };
}

export function buildConversationContext(game, personId, text) {
  const request = prepareConversationRequest(game, personId, text);
  const { person, messages } = conversationView(game, personId), mainline = mainlineView(game);
  const context = {
    playerName: game.character.name,
    channel: person.channel,
    metInPerson: game.triggerState?.facts?.[`person.${personId}.met`]?.value === true,
    story: { status: mainline.status, currentObjective: mainline.current?.objective || "本次主线已完成", copperWhistle: mainline.hasWhistle },
    knownEvidence: (game.clues || []).filter(clue => clue.kind === "mainline" || String(clue.id || "").startsWith("clue-watch")).slice(-12)
      .map(({ title, detail }) => ({ title, detail })),
  };
  return [
    { role: "system", content: `${person.persona}\n${CONVERSATION_RULE}\n写一封直接回应玩家的中文短信，约100至350字，最多2000字。只输出回信正文，不要JSON、工具指令或替玩家说话。书信由信使递送，不写成面对面即时交谈。可以谈论日常、给出建议或分析已分享证据，但不能赠予物品、发放报酬、提升能力、治疗或决定任务结果，不能宣布玩家获得塔罗会资格或替其入会。下文的玩家档案只用于保持一致：未在来信中分享的信息，不要假装早已获知；未知身份与后续真相不得依据原作知识补全。首次通信礼貌回应，不凭铜哨就假定深厚交情。` },
    { role: "user", content: `【已披露档案，仅作一致性参考】\n${JSON.stringify(context)}` },
    ...messages.slice(-16).map(({ role, content }) => ({ role, content })),
    { role: "user", content: request.text },
  ];
}

export async function generateConversationReply(game, request, settings, signal, onRequestMetrics) {
  if (signal?.aborted) throw new DOMException("写信已取消", "AbortError");
  const response = await requestAIWithReasoningFallback(settings, buildConversationContext(game, request.personId, request.text), signal, undefined,
    { phase: "conversation", rawContent: true, disableTools: true, disableJsonMode: true, streamOverride: false,
      forceDisableReasoning: true, maxTokensModeOverride: "manual", maxTokensOverride: 1400, onRequestMetrics });
  if (signal?.aborted) throw new DOMException("写信已取消", "AbortError");
  return validateReply(response.content);
}
