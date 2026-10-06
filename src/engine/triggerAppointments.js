import { getInstanceTriggerDefinition } from "./triggerDefinitions.js";
import { formatWorldTime, parseWorldTime } from "./worldTime.js";

// Calendar appointments are fixed when the notice is issued, never on each read.
export function triggerAppointment(game, instance) {
  if (instance?.status !== "engaged") return null;
  const stage = getInstanceTriggerDefinition(instance, game)?.stages?.find(entry => entry.id === instance.stage);
  const rule = stage?.appointment;
  if (!rule) return null;
  const now = parseWorldTime(game.worldTime);
  if (!now) return null;
  const saved = instance.appointments?.[rule.id];
  const starts = parseWorldTime(saved?.startsAt);
  const nextDay = new Date(now);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  nextDay.setUTCHours(rule.nextDayHour, 0, 0, 0);
  const startsAt = formatWorldTime(starts || nextDay);
  const remainingMinutes = Math.max(0, Math.ceil(((starts || nextDay) - now) / 60000));
  const text = `${rule.title}定于收到通知的次日举行，约定开场时间为${startsAt}。${remainingMinutes ? "目前尚未开场，可以等到约定时间再参加，也可以先处理其他事情。" : "现已到约定开场时间，可以凭通知参加。"}`;
  return { id: rule.id, title: rule.title, notifiedAt: saved?.notifiedAt || formatWorldTime(now), startsAt, remainingMinutes, text };
}

export function ensureTriggerAppointments(game) {
  for (const instance of game.triggerState?.active || []) {
    const appointment = triggerAppointment(game, instance);
    if (!appointment) continue;
    instance.appointments ||= {};
    if (!parseWorldTime(instance.appointments[appointment.id]?.startsAt)) {
      instance.appointments[appointment.id] = { notifiedAt: appointment.notifiedAt, startsAt: appointment.startsAt };
    }
  }
}

export function appointmentAttendanceAction(appointment, title) {
  return appointment.remainingMinutes
    ? `等待至${appointment.startsAt}开场，再凭引荐通知参加「${title}」的${appointment.title}`
    : `凭引荐通知参加已到开场时间的「${title}」${appointment.title}`;
}

export function appointmentTransitionTiming(game, instance, transition, action) {
  if (!transition.appointmentId) return null;
  const appointment = triggerAppointment(game, instance);
  if (!appointment || appointment.id !== transition.appointmentId) return { ok: false, reason: "尚未确认拍卖会的约定开场时间" };
  // Asking about the notice or waiting briefly cannot consent to skipping a day.
  const waitUntilOpening = /(?:等待|等到|等至|等候|等)[^。！？!?\n]{0,100}(?:开场|开拍|开始|约定时间|约定开场|明晚|明天|次日)/.test(action)
    && /参加|入场|赴会|赴约/.test(action)
    && !/不要|不想|不愿|不等|不参加|不入场|暂不|拒绝|是否|能否|如果|假如|询问|问问|打听/.test(action);
  if (appointment.remainingMinutes && !waitUntilOpening) return { ok: false, reason: `${appointment.text}提前参加需明确选择等到开场后入场，不能把询问或短暂等待当作赴会。` };
  return { ok: true, elapsedMinutes: appointment.remainingMinutes + Number(transition.elapsedMinutes || 0) };
}
