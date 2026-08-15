export function buildContext(game, action, systemPrompt) {
  const recent = game.recentDialogues.slice(-10).map(({ role, content }) => ({ role, content }));
  const scene = {
    chapter: game.chapter,
    time: game.worldTime,
    location: game.location,
    discoveredLocations: game.discoveredLocations,
    knownClues: game.clues,
    activeQuests: game.quests,
  };
  const characterState = {
    profile: game.character,
    statusEffects: game.statusEffects,
    relationships: game.relationships,
    inventory: game.inventory.map((item) => {
      const visible = { ...item };
      delete visible.hiddenInfo;
      return visible;
    }),
  };
  return [
    { role: "system", content: systemPrompt },
    { role: "system", content: `【当前剧本】故事发生在贝克兰德，围绕桥区与东区交界处的原创案件“没有寄件人的黑函”展开。原作主线只作为遥远背景；隐藏危险不得无铺垫直接揭露。` },
    { role: "system", content: `【角色状态】${JSON.stringify(characterState)}` },
    { role: "system", content: `【当前场景】${JSON.stringify(scene)}` },
    { role: "system", content: "【NPC认知边界】玛拉只知道旅店见闻；普通市民不知道非凡途径真相；埃利奥特的秘密必须经线索逐步揭示。" },
    { role: "system", content: `【长期摘要】${game.longTermSummary}` },
    ...recent,
    { role: "system", content: `【本轮输出协议】只返回一个合法 JSON 对象，不要使用 Markdown 代码块，也不要在对象前后添加说明。结构必须为：{"narrative":"剧情正文","choices":[{"label":"行动","intent":"investigate","risk":"low"},{"label":"行动","intent":"social","risk":"medium"},{"label":"行动","intent":"dangerous","risk":"high"}],"toolCalls":[],"memoryNotes":[],"worldEvents":[]}。choices 必须恰好三项；所有状态变化只能放入 toolCalls。即使拒绝或无法完成，也要把说明写进 narrative 并返回合法对象。` },
    { role: "user", content: `【本轮玩家行动】${action}` },
  ];
}

export function updateMemory(game, action, narrative, notes = []) {
  const dialogues = [...game.recentDialogues,
    { id: `msg-user-${Date.now()}`, role: "user", turn: game.turn + 1, content: action },
    { id: `msg-ai-${Date.now()}`, role: "assistant", turn: game.turn + 1, content: narrative },
  ];
  const archived = dialogues.length > 12 ? dialogues.slice(0, dialogues.length - 10) : [];
  const recentDialogues = dialogues.slice(-10);
  const compact = archived.length
    ? `${game.longTermSummary}\n截至第${game.turn + 1}轮：${archived.slice(-4).map((m) => m.content.replace(/\s+/g, " ").slice(0, 70)).join("；")}`.slice(-1800)
    : game.longTermSummary;
  return { recentDialogues, longTermSummary: compact, memoryNotes: [...game.memoryNotes, ...notes].slice(-20) };
}
