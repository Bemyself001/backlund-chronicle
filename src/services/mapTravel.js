export function ensureMapMoveToolCall(toolCalls = [], destination, turn) {
  if (!destination?.id) return Array.isArray(toolCalls) ? toolCalls : [];

  const calls = Array.isArray(toolCalls) ? [...toolCalls] : [];
  const existingIndex = calls.findIndex((call) => call?.name === "location.move");
  const existing = existingIndex >= 0 ? calls[existingIndex] : null;
  const existingArgs = { ...(existing?.args || {}) };
  delete existingArgs.district;
  const normalized = {
    ...existing,
    id: `map-move-${turn}-${destination.id}`,
    name: "location.move",
    args: {
      ...existingArgs,
      locationId: destination.id,
    },
    reason: `玩家从地图明确选择前往${destination.name}`,
  };

  if (existingIndex >= 0) calls[existingIndex] = normalized;
  else calls.push(normalized);
  return calls;
}
