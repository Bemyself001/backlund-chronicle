import { activeEnemies } from "../system/combat.js";
import { mainActionGate } from "../system/combatActions.js";
import { advanceWorldTime, parseWorldTime } from "./worldTime.js";

export const MIN_WAIT_HOURS = 1;
export const MAX_WAIT_HOURS = 24;

const validHours = hours => Number.isInteger(hours) && hours >= MIN_WAIT_HOURS && hours <= MAX_WAIT_HOURS;
const clock = date => `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
const calendar = date => `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;

export function quickWaitGate(game, hours) {
  if (!validHours(hours)) return "等待时长须为1至24小时的整数";
  if (!parseWorldTime(game.worldTime)) return "当前时间无法识别，暂时不能快速等待";
  if (activeEnemies(game).length) return "战斗中无法快速等待，请先结束当前遭遇";
  return mainActionGate(game);
}

export function quickWaitPreview(game, hours) {
  const start = parseWorldTime(game.worldTime);
  if (!start || !validHours(hours)) return null;
  const elapsedMinutes = hours * 60;
  const worldTime = advanceWorldTime(game.worldTime, elapsedMinutes);
  const end = parseWorldTime(worldTime);
  return {
    hours, elapsedMinutes, worldTime,
    startHours: start.getUTCHours() + start.getUTCMinutes() / 60,
    startClock: clock(start), endClock: clock(end),
    startDate: calendar(start), endDate: calendar(end),
    dayLabel: calendar(start) === calendar(end) ? "今日" : "次日",
    phase: end.getUTCHours() >= 6 && end.getUTCHours() < 18 ? "白昼" : "夜晚",
  };
}
