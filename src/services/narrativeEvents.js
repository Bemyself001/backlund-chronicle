export function pendingWatchNarration(game) {
  if (!game.triggerState?.facts?.['watch.note-recovered']?.value || game.narrativeEventsDelivered?.['watch.investigation-routes']) return [];
  // Recover saves whose inventory inspection settled without ever rendering the event.
  return narrativeEventsForTurn([{ kind: 'fact.discovered', factId: 'watch.note-recovered' }]);
}

export function markNarrativeEventsDelivered(game, events) {
  return { ...game, narrativeEventsDelivered: { ...game.narrativeEventsDelivered, ...Object.fromEntries(events.map(event => [event.id, true])) } };
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
    constraints: "两条路线任选其一，也可以暂时搁置；当前仅提出调查方向，尚未译出纸条、找到旧同事或抵达目的地。不要提前透露货栈、白鸢尾或任务后续。钟表行名称可由AI在实际调查时生成并沿用。",
  }];
}

export const NARRATIVE_EVENT_RULE = "【本轮剧情触发】若 turnResolution.derivedEffects.narrativeEvents 非空，必须在本轮剧情正文中自然生成对应引导段落，明确介绍事件给出的每一条路线、前往地点及可以如何调查；具体措辞、人物回忆与衔接由你创作，不能只放在任务手记、行动选项或工具日志中。遵守事件的信息边界，不替玩家选择路线。只处理本轮事件，不因历史记录再次重复引导。";
