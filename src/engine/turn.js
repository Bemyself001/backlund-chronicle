const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const DANGEROUS_ACTION = /(?:强行|闯入|破门|袭击|搏斗|开枪|追逐|追踪|尾随|冒险|仪式|召唤|通灵|窥探|潜入|偷窃|威胁|独自进入|不顾危险)/i;
const OVERNIGHT_ACTION = /(?:过夜|睡到天亮|整夜休息|一觉睡到)/i;
const LONG_REST_ACTION = /(?:睡觉|入睡|休息数小时|长时间休息)/i;
const TRAVEL_ACTION = /(?:乘火车|搭火车|乘船|搭船|跨区|长途|前往郊外|离开贝克兰德)/i;
const INVESTIGATE_ACTION = /(?:调查|搜查|查阅|研究|检查|检视|跟踪|打听|寻找|勘察|监听|观察)/i;
const SOCIAL_ACTION = /(?:交谈|询问|请教|拜访|谈判|购买|购物|吃饭|用餐|喝茶|喝酒|工作|应聘)/i;
const QUICK_ACTION = /(?:看一眼|环顾|倾听|等待片刻|整理|装备|卸下)/i;

function successfulTool(toolCalls, toolResults, predicate) {
  return toolCalls.some((call, index) => toolResults[index]?.ok && predicate(call));
}

export function minutesForTurn(action, toolCalls = [], toolResults = []) {
  const text = String(action || "");
  if (OVERNIGHT_ACTION.test(text)) return 600;
  if (LONG_REST_ACTION.test(text)) return 240;
  if (TRAVEL_ACTION.test(text)) return 75;
  const movementIndex = toolCalls.findIndex((call, index) => call.name === "location.move" && toolResults[index]?.ok);
  if (movementIndex >= 0) return Math.max(1, Number(toolResults[movementIndex]?.data?.travelMinutes) || 35);
  if (INVESTIGATE_ACTION.test(text)) return 25;
  if (SOCIAL_ACTION.test(text)) return 10;
  if (QUICK_ACTION.test(text)) return 5;
  return 12;
}

export function dangerDeltaForTurn({ action, selectedRisk, toolCalls = [], toolResults = [] }) {
  if (selectedRisk === "high" || (!selectedRisk && DANGEROUS_ACTION.test(String(action || "")))) return 1;
  const dangerousStatusAccepted = successfulTool(toolCalls, toolResults, (call) => (
    call.name === "status.add" && call.args?.status?.kind === "danger"
  ));
  return dangerousStatusAccepted ? 1 : 0;
}

export function advanceWorldTime(value, minutes) {
  const match = String(value || "").match(/(\d{3,4})年\s*(\d{1,2})月(\d{1,2})日\s*·\s*周([一二三四五六日天])\s*·\s*(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const [, yearText, monthText, dayText, weekdayText, hourText, minuteText] = match;
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText), Number(minuteText)));
  const beforeDay = date.getUTCDate();
  date.setUTCMinutes(date.getUTCMinutes() + Math.max(0, Number(minutes) || 0));
  const elapsedDays = Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(Number(yearText), Number(monthText) - 1, beforeDay)) / 86400000);
  const weekdayIndex = WEEKDAYS.indexOf(weekdayText === "天" ? "日" : weekdayText);
  const weekday = WEEKDAYS[(weekdayIndex + elapsedDays + 7) % 7];
  return `${date.getUTCFullYear()}年 ${date.getUTCMonth() + 1}月${date.getUTCDate()}日 · 周${weekday} · ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function resolveTurnProgress(game, action, selectedRisk, toolCalls = [], toolResults = []) {
  const elapsedMinutes = minutesForTurn(action, toolCalls, toolResults);
  const dangerDelta = dangerDeltaForTurn({ action, selectedRisk, toolCalls, toolResults });
  return {
    elapsedMinutes,
    worldTime: advanceWorldTime(game.worldTime, elapsedMinutes),
    hiddenDanger: {
      ...game.hiddenDanger,
      stage: Math.min(5, Math.max(0, Number(game.hiddenDanger?.stage || 0) + dangerDelta)),
    },
  };
}
