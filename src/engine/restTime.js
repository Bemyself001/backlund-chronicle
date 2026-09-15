// Parse the player's current rest instruction, never elapsed time invented in prose.
const NUMBER = "(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百]+)";

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

export function restMinutes(action, worldTime = "") {
  const clauses = String(action || "").split(/[，。；！？,;!?\n]/);
  const text = clauses.find((clause) => /休息|睡觉|入睡|睡到|睡上|睡一|睡\d|睡[两三四五六七八九十半]|过夜/.test(clause)
    && !/(?:不|别|不要|不想|不再|暂不|没有|不能|无法)(?:再|去)?(?:休息|睡|入睡|过夜)/.test(clause)
    && !/昨天|昨晚|已经|刚才|休息过|睡过|询问|问他|问她/.test(clause));
  if (!text) return null;
  const instruction = text.slice(text.search(/休息|睡|入睡|过夜/));
  const clock = String(worldTime).match(/(\d{1,2}):(\d{2})$/);
  const current = clock ? Number(clock[1]) * 60 + Number(clock[2]) : null;
  const until = instruction.match(new RegExp(`(?:到|至)\\s*(明天|明早|明日|次日|今天|今晚)?\\s*(早上|早晨|清晨|上午|中午|下午|晚上|凌晨)?\\s*(${NUMBER})\\s*(?:点|时|[:：])\\s*(半|${NUMBER})?\\s*分?`));
  let target = null;
  let tomorrow = /明天|明早|明日|次日/.test(instruction);
  if (until) {
    let hour = numberValue(until[3]);
    const minute = until[4] === "半" ? 30 : until[4] ? numberValue(until[4]) : 0;
    if (/下午|晚上|中午/.test(until[2] || "") && hour < 12) hour += 12;
    if (/凌晨/.test(until[2] || "") && hour === 12) hour = 0;
    if (hour < 24 && minute < 60) target = hour * 60 + minute;
    tomorrow = Boolean(until[1] && /明|次/.test(until[1]));
  } else if (/(?:到|至)(?:明天|明早|次日)?天亮/.test(instruction)) target = 360;
  if (target !== null && current !== null) {
    const difference = target - current + (tomorrow ? 1440 : 0);
    return difference > 0 ? difference : difference + 1440;
  }
  const halfHours = instruction.match(new RegExp(`(?:休息|睡觉|睡)(?:上|了)?\\s*(${NUMBER})个?半(?:个)?小时`));
  if (halfHours) return Math.round((numberValue(halfHours[1]) + 0.5) * 60);
  const duration = instruction.match(new RegExp(`(?:休息|睡觉|入睡|睡)(?:上|个|了|大约|约|大概|一下)?\\s*(${NUMBER})\\s*(?:个)?\\s*(小时|钟头|分钟|分)(半)?(?:\\s*(${NUMBER})\\s*分(?:钟)?)?`));
  if (duration) {
    const hours = /小时|钟头/.test(duration[2]);
    const minutes = numberValue(duration[1]) * (hours ? 60 : 1) + (duration[3] ? (hours ? 30 : 0.5) : 0) + (duration[4] ? numberValue(duration[4]) : 0);
    if (minutes > 0) return Math.max(1, Math.round(minutes));
  }
  if (/(?:休息|睡觉|睡)(?:个)?半(?:个)?小时/.test(instruction)) return 30;
  if (/睡|入睡|过夜|整夜休息/.test(instruction)) return 480;
  return 60;
}
