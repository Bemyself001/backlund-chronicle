import { triggerGuidance } from "../engine/triggerGuidance.js";

export function pendingWatchNarration(game) {
  if (!game.triggerState?.facts?.['watch.note-recovered']?.value || game.triggerState?.facts?.['watch.formal-quest-unlocked']?.value || game.narrativeEventsDelivered?.['watch.investigation-routes']) return [];
  // Recover saves whose inventory inspection settled without ever rendering the event.
  return narrativeEventsForTurn([{ kind: 'fact.discovered', factId: 'watch.note-recovered' }]);
}

export function pendingQuestNarration(game, terminalEvents = []) {
  if (!game) return [];
  const events = pendingWatchNarration(game);
  const instances = [
    ...(game.triggerState?.active || []).filter(entry => ['available', 'engaged'].includes(entry.status)),
    ...terminalEvents,
  ];
  for (const instance of instances) {
    // The initial watch directions have one stable legacy delivery ID.
    if (instance.definitionId === 'watch.heirloom.hidden-note' && ['available', 'engaged'].includes(instance.status)) continue;
    const guidance = triggerGuidance(game, instance);
    if (!guidance.enabled || !guidance.text) continue;
    const timerKey = guidance.timers.map(timer => `${timer.id}:${timer.remaining <= 3 ? timer.remaining : 'running'}`).join(',');
    const id = `quest-guidance:${instance.instanceId}:${instance.status}:${guidance.key}:${timerKey}`;
    if (game.narrativeEventsDelivered?.[id]) continue;
    events.push({ id, triggerDefinitionId: instance.definitionId, title: instance.presentation?.title,
      reason: instance.status === 'completed' ? '调查告一段落，承接已确认的结果' : '当前线索方向发生变化或此前未呈现',
      direction: guidance.text, narrativeCue: guidance.narrativeCue, timers: guidance.timers,
      constraints: '只以当前可感知线索给出方向；不要列操作清单，不泄露后续阶段、不替玩家移动、接受任务或发放奖励。未亲临地点时以已有记录与回忆表达，不让远处人物突然对话。',
    });
  }
  return events;
}

export function markNarrativeEventsDelivered(game, events) {
  const choices = events.find(event => event.choices?.length === 3)?.choices;
  return { ...game,
    ...(choices ? { choices: structuredClone(choices), choiceMeta: { source: "story-event", fallback: false, reason: "", attempts: [] } } : {}),
    narrativeEventsDelivered: { ...game.narrativeEventsDelivered, ...Object.fromEntries(events.map(event => [event.id, true])) },
  };
}

export function eventDirections(events) {
  return events.map(event => [event.direction || event.routes?.map(route => `${route.name}：${route.purpose}`).join('；'),
    ...(event.timers || []).map(timer => `剩余 ${timer.remaining} 次行动。${timer.remaining <= 1 ? '出口或退路已迫在眉睫。' : '请留意撤离所需的时间。'}`),
  ].filter(Boolean).join('\n')).join('\n\n');
}

// Only successful local discoveries can request an authoritative story beat.
export function narrativeEventsForTurn(signals = []) {
  if (!signals.some(signal => signal.kind === "fact.discovered" && signal.factId === "watch.note-recovered")) return [];
  return [{
    id: "watch.investigation-routes",
    triggerDefinitionId: "watch.heirloom.hidden-note",
    reason: "第四次怀表检查完成，首次取出陌生速记纸条并想起失踪的舅舅",
    routes: [
      { locationId: "queen-library", name: "皇后区公共图书馆", purpose: "查阅速记资料或请教馆员，寻找解读纸条的方法" },
      { locationId: "hillston-market", name: "希尔斯顿区商会街", purpose: "向钟表行业从业者打听舅舅曾工作的钟表行，寻找旧同事帮助辨认纸条" },
    ],
    choices: [
      { label: "前往皇后区公共图书馆，查找速记资料", intent: "investigate", risk: "low" },
      { label: "前往希尔斯顿区商会街，打听舅舅工作过的钟表行", intent: "investigate", risk: "low" },
      { label: "暂时收起纸条，处理其他事情", intent: "redirect", risk: "low" },
    ],
    constraints: "两条路线任选其一，也可以暂时搁置；当前仅提出调查方向，尚未译出纸条、找到旧同事或抵达目的地。不要提前透露货栈、白鸢尾或任务后续。钟表行名称可由AI在实际调查时生成并沿用。",
  }];
}

export const NARRATIVE_EVENT_RULE = "【本轮剧情触发】若 turnResolution.derivedEffects.narrativeEvents 非空，必须在本轮剧情正文中自然生成对应引导段落。采用含蓄风格：把方向融入已接触人物的话、报纸、记录、现场痕迹或角色回忆；不列任务步骤、不说必须先完成某支线、不揭示未发生的真相。每条给定路线都须留下可辨认的地点或人物线索，具体措辞由你创作，不能只放在手记或选项里。危险计时例外：明确说明剩余行动次数和撤离压力。多条相关事件合并成一段自然衔接，不复述整条任务线、不替玩家选择。只处理本轮事件；没有新事件时不重复播报旧引导。";
