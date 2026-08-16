import { FALLBACK_CHOICES } from "./protocol.js";

const FALLBACK_LABELS = new Set(FALLBACK_CHOICES.map((choice) => choice.label));

function hasUsableChoices(choices = []) {
  if (!Array.isArray(choices) || choices.length !== 3) return false;
  const labels = choices.map((choice) => String(choice?.label || "").trim());
  return labels.every((label) => label.length >= 4) && new Set(labels).size === 3;
}

function isStaticFallback(choices = []) {
  return hasUsableChoices(choices) && choices.every((choice) => FALLBACK_LABELS.has(choice.label));
}

function uniqueChoices(choices) {
  const seen = new Set();
  return choices.map((choice, index) => {
    let label = choice.label;
    if (seen.has(label)) label = `${label}（第${index + 1}种方式）`;
    seen.add(label);
    return { ...choice, label };
  });
}

export function createContextualChoices(game, action = "") {
  const place = game.location?.name || "当前地点";
  const recent = game.recentDialogues?.slice().reverse().find((message) => message.role === "assistant")?.content || "";
  const clue = game.clues?.at(-1)?.title || game.availableClues?.[0]?.title || "现场细节";
  const quest = game.quests?.find((entry) => entry.status !== "已完成")?.title;
  const isStation = place.includes("火车站");
  const isBridge = place.includes("桥区");
  const cycle = (Number(game.turn) + String(action).length) % 3;
  const investigation = quest
    ? [`整理「${quest}」相关线索并确认下一步`, `回看「${quest}」中最矛盾的一处记录`, `寻找能验证「${quest}」的新证据`][cycle]
    : isStation
      ? [`调查车站公告与「${clue}」的关联`, "对照车站时刻表和失踪启事", "观察站台人流与行李交接" ][cycle]
      : [`检查${place}中与「${clue}」有关的细节`, `记录${place}的出入口与守夜规律`, `寻找${place}附近可公开查证的资料`][cycle];
  const social = isStation
    ? ["向车站职员或搬运工询问当前可用的工作与住处", "向报童打听今晚各区的异常消息", "向售票员确认晚班车和临时落脚处"][cycle]
    : isBridge
      ? ["向旅店老板打听最近投宿者和桥区的消息", "向酒馆侍者询问夜间短工", "向寄信人打听桥区近期的陌生面孔"][cycle]
      : [`向${place}附近的人询问一条可靠的去处`, `向${place}的工作人员了解规矩和禁区`, `寻找能为你介绍本地消息的人`][cycle];
  const dangerous = recent.includes("异常") || action.includes("异常")
    ? [`冒险追查${place}里尚未解释的异常迹象`, `冒险跟随${place}里刚刚出现的可疑动静`, `冒险触碰${place}中最不合常理的线索`][cycle]
    : [`沿着${place}最不寻常的线索继续深入`, `冒险进入${place}中较少有人经过的区域`, `在${place}追踪一个可能改变局面的细节`][cycle];
  return uniqueChoices([
    { label: investigation, intent: "investigate", risk: "low" },
    { label: social, intent: "social", risk: "medium" },
    { label: dangerous, intent: "dangerous", risk: "high" },
  ]);
}

function isReusablePrevious(previous) {
  return previous && hasUsableChoices(previous.choices) && ["model", "reused", "initial"].includes(previous.meta?.source) && !isStaticFallback(previous.choices);
}

export function resolveChoices(response, game, action, previous = null) {
  const meta = response.choiceMeta || { source: hasUsableChoices(response.choices) ? "model" : "fallback", fallback: false, reason: "missing_metadata" };
  if (meta.source === "model" && hasUsableChoices(response.choices) && !isStaticFallback(response.choices)) return { ...response, choiceMeta: meta };
  if (isReusablePrevious(previous)) {
    return { ...response, choices: previous.choices, choiceMeta: { source: "reused", fallback: false, reason: "follow_up_missing_choices" } };
  }
  return {
    ...response,
    choices: createContextualChoices(game, action),
    choiceMeta: { source: "local", fallback: true, reason: meta.reason || "invalid_choices" },
  };
}

export { hasUsableChoices };
