const DAY = 86400000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
// Keep the game's Tuesday epoch, rather than the real-world calendar.
const EPOCH = Date.UTC(1349, 9, 17);

export function parseWorldTime(value) {
  const match = String(value || "").match(/^(\d{3,4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*·\s*(?:周|星期|礼拜)[一二三四五六日天]\s*·\s*(\d{1,2})[:：](\d{2})\s*$/);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return date;
}

export function formatWorldTime(date) {
  const days = Math.floor((date.getTime() - EPOCH) / DAY);
  const weekday = WEEKDAYS[((2 + days) % 7 + 7) % 7];
  return `${date.getUTCFullYear()}年 ${date.getUTCMonth() + 1}月${date.getUTCDate()}日 · 周${weekday} · ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function normalizeWorldTime(value) {
  const date = parseWorldTime(value);
  return date ? formatWorldTime(date) : value;
}

export function advanceWorldTime(value, minutes) {
  const date = parseWorldTime(value);
  const delta = Number(minutes);
  if (!date || !Number.isFinite(delta)) return value;
  date.setUTCMinutes(date.getUTCMinutes() + Math.max(0, Math.round(delta)));
  return Number.isFinite(date.getTime()) ? formatWorldTime(date) : value;
}
