import { getMapLocation, getMapLocations, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "../system/map.js";

const MOVEMENT_ACTION = /前往|前去|去往|赶往|赶去|走到|走向|来到|抵达|到达|返回|回到|回去|进入|踏入|去/g;

function compactName(value) {
  return String(value || "").replace(/[\s·・“”‘’"'《》「」『』]/g, "");
}

function destinationAliases(location) {
  const parts = location.name.split(/[·・]/);
  const shortName = parts.at(-1);
  const commonName = shortName.replace(/^(?:贝克兰德|公共)/, "");
  return [...new Set([location.name, parts.slice(1).join(""), shortName,
    commonName, `${location.district}${shortName}`, `${location.district}的${shortName}`].map(compactName))]
    .filter(name => name.length >= 2);
}

// Only immediate, unambiguous travel to a known place can be settled locally.
// A choice label and a typed action go through the same path; AI prose never does.
export function inferMapDestination(game, action, supplied) {
  if (supplied?.id) return supplied;
  const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location?.id, game);
  const locations = getMapLocations(game).filter(location => isDiscoveredLocationStatus(knowledge[location.id]?.status));
  const destinations = new Map();
  if (/[?？]/.test(String(action || ""))) return null;
  for (const raw of String(action || "").split(/[，。；！？,;!?\n]/)) {
    const clause = compactName(raw);
    for (const match of clause.matchAll(MOVEMENT_ACTION)) {
      const prefix = clause.slice(0, match.index);
      if (/(?:不|别|不要|暂不|先不|不想|不再|并未|没有|不能|无法)(?:会|再|去|继续|打算|准备|现在|立刻|马上|立即|直接){0,3}$/.test(prefix)
        || /昨天|昨晚|已经|刚才|回忆|听说|提到|询问|打听|问路|能否|是否|如何|怎么|如果|假如|要是|考虑|计划|打算|准备|查看|查询|查阅|规划|记录|记下|跳过|略过|取消|拒绝|放弃|明天|明早|改天|下次|以后|稍后/.test(prefix)) continue;
      const target = clause.slice(match.index + match[0].length).replace(/^(?:那家|这家|那座|这座|附近的)/, "");
      const candidates = locations.flatMap(location => destinationAliases(location)
        .filter(alias => target.startsWith(alias) && !/^(?:之前|前先|前要)/.test(target.slice(alias.length)))
        .map(alias => ({ location, length: alias.length })));
      if (!candidates.length) continue;
      const longest = Math.max(...candidates.map(candidate => candidate.length));
      const matches = new Map(candidates.filter(candidate => candidate.length === longest).map(candidate => [candidate.location.id, candidate.location]));
      if (matches.size !== 1 || /或|还是/.test(target)) return null;
      for (const [id, location] of matches) destinations.set(id, location);
    }
  }
  return destinations.size === 1 ? [...destinations.values()][0] : null;
}

export function ensureMapMoveToolCall(toolCalls = [], destination, turn, game = {}) {
  if (!destination?.id) return Array.isArray(toolCalls) ? toolCalls : [];

  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const otherCalls = calls.filter(call => call?.name !== "location.move");
  if (destination.id === game.location?.id) return otherCalls;
  const normalized = {
    id: `map-move-${turn}-${destination.id}`,
    name: "location.move",
    args: { locationId: destination.id },
    reason: `玩家明确选择前往${destination.name}`,
  };

  // Travel happens before on-site tools and cannot be redirected by another proposal.
  return [normalized, ...otherCalls];
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
