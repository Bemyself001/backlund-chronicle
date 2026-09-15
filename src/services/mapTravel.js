import { getMapLocation, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "../system/map.js";

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

export function ensureMapDiscoveryToolCall(toolCalls = [], target, turn, game = {}) {
  if (!target?.locationId) return Array.isArray(toolCalls) ? toolCalls : [];
  let calls = Array.isArray(toolCalls) ? [...toolCalls] : [];
  const location = getMapLocation(target.locationId, game);
  if (!location) return calls;
  // Only replace this target's discovery proposals; unrelated discoveries remain intact.
  calls = calls.filter((call) => !(call?.name === "location.discover" && call.args?.locationId === location.id));
  const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location?.id, game);
  if (isDiscoveredLocationStatus(knowledge[location.id]?.status)) return calls;
  calls.unshift({
    id: `map-discover-${turn}-${location.id}`,
    name: "location.discover",
    args: { locationId: location.id, status: "discovered", note: location.description },
    reason: `玩家完成地图调查，确认了${location.name}的位置；不代表到访或获知内部秘密`,
  });
  return calls;
}
