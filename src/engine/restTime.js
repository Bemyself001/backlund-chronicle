import { parseWorldTime } from "./worldTime.js";

const NUMBER = "(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百]+)";
const SKIP_ACTION = /^(?:跳过|快进|跳到|跳转到|时间(?:推进|跳转|快进)|推进时间)/;
const ACTION = /跳过(?:时间)?|快进(?:时间)?|时间(?:推进|跳转|快进)|推进时间|跳转到|跳到|睡眠(?!不足|质量)|睡觉|入睡|小睡|睡(?=到|至|上|一|个|半|\d|[两三四五六七八九十]|\s*$)|过夜|就寝|歇息|休息(?!室)|小憩|打盹|等待|等候|守候|蹲守|等(?=到|至|上|一|半|\d|[两三四五六七八九十])/;
const DAY_NAME = "明天|明早|明日|次日|第二天|翌日|后天|今天|今日|今晚|今夜";

function dayOffset(day = "") {
  return day === "后天" ? 2 : /明天|明早|明日|次日|第二天|翌日/.test(day) ? 1 : 0;
}

function numberValue(text) {
  if (/^\d/.test(text)) return Number(text);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0;
  let digit = 0;
  for (const char of text) {
    if (char === "十" || char === "百") { total += (digit || 1) * (char === "十" ? 10 : 100); digit = 0; }
    else digit = digits[char] ?? 0;
  }
  return total + digit;
}

function endTime(text, current) {
  const until = text.match(new RegExp(`(?:到|至)\\s*(${DAY_NAME})?\\s*(早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里|凌晨|午夜)?\\s*(${NUMBER})\\s*(?:点|时|[:：])\\s*(半|${NUMBER})?\\s*分?`));
  let target = null;
  let offset = 0;
  if (until) {
    let hour = numberValue(until[3]);
    const minute = until[4] === "半" ? 30 : until[4] ? numberValue(until[4]) : 0;
    const period = until[2] || (/今晚|今夜/.test(until[1] || "") ? "晚上" : "");
    offset = dayOffset(until[1]);
    if (/下午|傍晚|晚上|夜里/.test(period) && hour < 12) hour += 12;
    if (period === "中午" && hour < 11) hour += 12;
    if (/凌晨|午夜/.test(period) && hour === 12) hour = 0;
    if (hour < 24 && minute < 60) target = hour * 60 + minute;
  } else {
    const part = text.match(new RegExp(`(?:到|至)\\s*(${DAY_NAME})?\\s*(天亮|黎明|早上|早晨|清晨|上午|中午|下午|傍晚|黄昏|晚上|天黑|夜晚|凌晨|午夜)`));
    const dayOnly = !part && text.match(new RegExp(`(?:到|至)\\s*(${DAY_NAME})\\s*$`));
    offset = dayOffset(part?.[1] || dayOnly?.[1]);
    target = part ? ({ 天亮: 360, 黎明: 360, 早上: 360, 早晨: 360, 清晨: 360, 上午: 540, 中午: 720, 下午: 840, 傍晚: 1080, 黄昏: 1080, 晚上: 1080, 天黑: 1080, 夜晚: 1080, 凌晨: 0, 午夜: 0 })[part[2]]
      : dayOnly ? /今晚|今夜/.test(dayOnly[1]) ? 1080 : 360 : null;
  }
  if (target === null || current === null) return null;
  const difference = target - current + offset * 1440;
  return difference > 0 ? difference : difference + 1440;
}

// Shared by planning, settlement, recovery and fast-mode gating. Never parse AI prose.
export function timedAction(action, worldTime = "") {
  const clauses = String(action || "").split(/[，。；！？,;!?\n]/);
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    const match = clause.match(ACTION);
    if (!match) continue;
    const prefix = clause.slice(0, match.index);
    if (/(?:不|别|不要|不想|不再|暂不|没有|不能|无法)(?:是|会|再|去|继续|打算|准备|现在|立刻|马上|立即|直接){0,3}$/.test(prefix.replace(/\s+/g, ""))
      || /昨天|昨晚|已经|刚才|询问|问他|问她|能否|是否|如果|假如|考虑|计划/.test(prefix)
      || /^(?:休息|睡觉|睡|等待|等候)(?:过|了)/.test(clause.slice(match.index))) continue;
    let instruction = clause.slice(match.index);
    // A comma before an end time does not end the instruction. Stop at a new action.
    for (let next = index + 1; next < clauses.length && /^\s*(?:(?:然后)?睡到|一直|直到|到|至|大约|约|共|持续|时长|\d|[一二两三四五六七八九十半])/.test(clauses[next]); next += 1) {
      instruction += clauses[next];
    }
    const kind = SKIP_ACTION.test(instruction) ? "skip" : /^(?:等|守候|蹲守)/.test(instruction) ? "wait"
      : /睡|入睡|过夜|就寝|休息一晚/.test(instruction) || /整夜$/.test(prefix) ? "sleep" : "rest";
    const clock = parseWorldTime(worldTime);
    const current = clock ? clock.getUTCHours() * 60 + clock.getUTCMinutes() : null;
    const until = endTime(instruction, current);
    if (until !== null) return { kind, elapsedMinutes: until, source: "endTime" };
    const duration = instruction.match(new RegExp(`(${NUMBER})\\s*个?半(?:个)?小时|半(?:个)?小时|(${NUMBER})\\s*个?\\s*(小时|钟头|分钟|分|天)(半)?(?:\\s*(${NUMBER})\\s*分(?:钟)?)?`));
    if (duration) {
      const minutes = duration[1] ? (numberValue(duration[1]) + 0.5) * 60
        : !duration[2] ? 30
          : numberValue(duration[2]) * (duration[3] === "天" ? 1440 : /小时|钟头/.test(duration[3]) ? 60 : 1)
            + (duration[4] ? (/小时|钟头/.test(duration[3]) ? 30 : 0.5) : 0)
            + (duration[5] ? numberValue(duration[5]) : 0);
      if (Number.isFinite(minutes) && minutes > 0) return { kind, elapsedMinutes: Math.max(1, Math.round(minutes)), source: "duration" };
    }
    const unresolvedEnd = /到|至/.test(instruction) && !/睡到自然醒/.test(instruction);
    if (kind === "skip" && !unresolvedEnd) continue;
    return { kind, elapsedMinutes: kind === "sleep" ? 480 : kind === "rest" ? 60 : 5, source: unresolvedEnd ? "unresolvedEnd" : "default" };
  }
  return null;
}

// Only explicit sleep and rest recover stats; skipping time is not rest.
export function restMinutes(action, worldTime = "") {
  const timing = timedAction(action, worldTime);
  return timing && ["sleep", "rest"].includes(timing.kind) ? timing.elapsedMinutes : null;
}
