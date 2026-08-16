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

export function occultEntryForTurn(game, nextTurn) {
  const occult = game.occult || {};
  if (Number(occult.contact) === 1 || nextTurn < 5 || (nextTurn - 5) % 5 !== 0) return null;
  const variants = [
    "一名戴灰手套的陌生人把写有陌生符号的收据压在车站公告栏下方。他没有拦你，也没有解释符号的含义；你可以记下位置、询问知情人，或把它留在原处。",
    "一则不起眼的夜间招工启事使用了不合常规的暗语，落款只写着一个不存在的商号。它看起来像普通骗局，也可能通往某个不愿公开露面的圈子。",
    "你在公共档案的借阅登记中发现一串重复出现的缩写，旁边留有一个只在午夜后开放的地址。没有人要求你前往，选择权仍在你手里。",
  ];
  return {
    id: `occult-entry-${nextTurn}`,
    turn: nextTurn,
    title: "非凡入口",
    text: variants[Math.floor((nextTurn - 5) / 5) % variants.length],
    choice: { label: "追查这条非凡入口（可选）", intent: "occult", risk: "medium" },
  };
}

export function resolveTurnProgress(game, action, selectedRisk, toolCalls = [], toolResults = []) {
  const elapsedMinutes = minutesForTurn(action, toolCalls, toolResults);
  const dangerDelta = dangerDeltaForTurn({ action, selectedRisk, toolCalls, toolResults });
  const nextTurn = Number(game.turn || 0) + 1;
  const occultEntry = occultEntryForTurn(game, nextTurn);
  const occult = {
    contact: Number(game.occult?.contact) === 1 || game.character?.extraordinary === "low" ? 1 : 0,
    revealLevel: Math.max(0, Number(game.occult?.revealLevel || 0)),
    entryAvailable: Boolean(game.occult?.entryAvailable),
    currentEntry: game.occult?.currentEntry || null,
    lastEntryTurn: game.occult?.lastEntryTurn ?? null,
    entryHistory: Array.isArray(game.occult?.entryHistory) ? game.occult.entryHistory : [],
  };
  if (occultEntry) {
    occult.entryAvailable = true;
    occult.currentEntry = occultEntry;
    occult.lastEntryTurn = nextTurn;
    occult.entryHistory = [...occult.entryHistory, occultEntry].slice(-8);
  }
  return {
    elapsedMinutes,
    worldTime: advanceWorldTime(game.worldTime, elapsedMinutes),
    occult,
    occultEntry,
    hiddenDanger: {
      ...game.hiddenDanger,
      stage: Math.min(5, Math.max(0, Number(game.hiddenDanger?.stage || 0) + dangerDelta)),
    },
  };
}
