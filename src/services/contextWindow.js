// Prompt history is derived from the save. Full story text is never truncated here.
export const HISTORY_WINDOW_CHARS = 8000;
const SEGMENT_TURNS = 10;

function excerpt(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  const head = Math.floor(limit * .65);
  return `${text.slice(0, head)}\n[历史片段省略，细节可按需检索]\n${text.slice(-(limit - head - 28))}`;
}

export function historyWindow(game) {
  const history = game.storyHistory?.length ? game.storyHistory : game.recentDialogues || [];
  const turn = Math.max(0, Number(game.turn) || 0);
  const anchor = Math.max(0, Math.floor(Math.max(0, turn - 1) / SEGMENT_TURNS) * SEGMENT_TURNS - 1);
  const groups = [];
  // Walk backwards only to the segment boundary, even in very long saves.
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    const sourceTurn = Number.isFinite(Number(entry.turn)) ? Number(entry.turn) : turn;
    if (sourceTurn < anchor) break;
    if (!["user", "assistant"].includes(entry.role) || !entry.content) continue;
    let group = groups[0];
    if (!group || group.turn !== sourceTurn) {
      group = { turn: sourceTurn, messages: [] };
      groups.unshift(group);
    }
    group.messages.unshift({ role: entry.role, content: excerpt(entry.content, entry.role === "user" ? 700 : 1600) });
    // Malformed legacy histories without turn metadata still have a strict bound.
    if (groups.reduce((sum, item) => sum + item.messages.length, 0) >= 28) break;
  }
  let selected = [];
  const size = items => JSON.stringify(items.flatMap(item => item.messages)).length;
  for (const group of groups) {
    if (size([...selected, group]) > HISTORY_WINDOW_CHARS) selected = selected.slice(-2);
    while (selected.length && size([...selected, group]) > HISTORY_WINDOW_CHARS) selected.shift();
    if (size([group]) > HISTORY_WINDOW_CHARS) {
      group.messages = group.messages.slice(-3);
      while (group.messages.length > 1 && size([group]) > HISTORY_WINDOW_CHARS) group.messages.shift();
      while (size([group]) > HISTORY_WINDOW_CHARS) group.messages[0].content = excerpt(group.messages[0].content, Math.floor(group.messages[0].content.length / 2));
    }
    selected.push(group);
  }
  return {
    firstTurn: selected[0]?.turn ?? turn + 1,
    messages: selected.flatMap(group => group.messages),
  };
}
