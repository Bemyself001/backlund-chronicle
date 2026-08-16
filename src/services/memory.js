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
    money: game.money,
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
    { role: "system", content: `【当前剧本】这是从贝克兰德东区火车站开始的开放世界沙盒。玩家可自由选择居所、职业、人脉、旅行方向与调查目标；“没有寄件人的黑函”、失踪文员和站台异响只是可选世界线，不是必须完成的主线。玩家未明确接受前，不得自动添加任务、安排 NPC 催促或用突发事件强迫回轨。原作主线仅为遥远背景；隐藏危险不得无铺垫直接揭露。` },
    { role: "system", content: `【角色状态】${JSON.stringify(characterState)}` },
    { role: "system", content: `【上一轮本地审计】${JSON.stringify(game.lastTurnAudit || { status: "尚未由玩家执行审计" })}` },
    { role: "system", content: `【当前场景】${JSON.stringify(scene)}` },
    { role: "system", content: "【NPC认知边界】车站职员只知道铁路与东区见闻；各区普通市民依据职业和生活圈提供有限信息；普通人不知道非凡途径真相，失踪文员等秘密必须由玩家主动接触并通过线索逐步揭示。" },
    { role: "system", content: `【长期摘要】${game.longTermSummary}` },
    ...recent,
    { role: "system", content: `【本轮输出协议】只返回一个合法 JSON 对象，不要使用 Markdown 代码块，也不要在对象前后添加说明。结构必须为：{"narrative":"剧情正文","choices":[{"label":"行动","intent":"investigate","risk":"low"},{"label":"行动","intent":"social","risk":"medium"},{"label":"行动","intent":"dangerous","risk":"high"}],"toolCalls":[],"memoryNotes":[],"worldEvents":[]}。choices 必须恰好三项；所有状态变化只能放入 toolCalls。即使拒绝、无法完成或使用原生 Tool Calling，也必须同时在 assistant.content 中返回上述 JSON 正文与选项，工具调用仅是待本地验证的提议；正文不得提前确认工具结果。` },
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
