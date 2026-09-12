import {
  MAP_LOCATIONS, MAP_ROUTES, INITIAL_DISCOVERED_LOCATION_IDS, INITIAL_RUMORED_LOCATION_IDS,
  LOCATION_KNOWLEDGE_STATUSES, DYNAMIC_LOCATION_SCOPES, DYNAMIC_LOCATION_KINDS, MAP_DISTRICTS,
  DISTRICT_LAYOUT,
} from "../content/index.js";

export {
  MAP_LOCATIONS, MAP_ROUTES, INITIAL_DISCOVERED_LOCATION_IDS, INITIAL_RUMORED_LOCATION_IDS,
  LOCATION_KNOWLEDGE_STATUSES, DYNAMIC_LOCATION_SCOPES, DYNAMIC_LOCATION_KINDS, MAP_DISTRICTS,
};

export const MAX_DYNAMIC_LOCATIONS = 24;
export const MAX_STORED_DYNAMIC_LOCATIONS = 64;
export const MAX_ACTIVE_RUMORS_PER_DISTRICT = 3;

function extensionsFrom(value = {}) {
  return value?.mapExtensions || value || {};
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function cleanText(value, maximum = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizedName(value) {
  return cleanText(value, 80).replace(/^.+?区[·・]/, "").replace(/[\s·・—_.,，。'"“”‘’()（）-]/g, "").toLowerCase();
}

function normalizeDynamicLocation(location = {}) {
  const district = MAP_DISTRICTS.includes(location.district) ? location.district : "";
  const scope = DYNAMIC_LOCATION_SCOPES.includes(location.scope) ? location.scope : "landmark";
  const kind = DYNAMIC_LOCATION_KINDS.includes(location.kind) ? location.kind : scope === "interior" ? "interior" : "other";
  const id = cleanText(location.id, 80);
  const name = cleanText(location.name, 60);
  const anchorId = cleanText(location.anchorId || location.parentId, 80);
  if (!id || !name || !district || !anchorId) return null;
  return {
    id,
    name,
    district,
    x: clamp(Number(location.x) || 50, 4, 96),
    y: clamp(Number(location.y) || 50, 4, 96),
    code: cleanText(location.code, 8) || "+",
    rumor: cleanText(location.rumor, 180),
    description: cleanText(location.description, 300),
    source: "dynamic",
    scope,
    kind,
    anchorId,
    parentId: scope === "interior" ? anchorId : null,
    temporary: Boolean(location.temporary),
    lifecycle: location.lifecycle === "archived" ? "archived" : "active",
    createdTurn: Math.max(0, Number(location.createdTurn) || 0),
    archivedTurn: location.archivedTurn == null ? null : Math.max(0, Number(location.archivedTurn) || 0),
  };
}

export function normalizeMapExtensions(value = {}) {
  const source = extensionsFrom(value);
  const staticIds = new Set(MAP_LOCATIONS.map((location) => location.id));
  const candidates = [];
  const ids = new Set(staticIds);
  const names = new Set(MAP_LOCATIONS.map((location) => `${location.district}:${normalizedName(location.name)}`));
  for (const raw of Array.isArray(source.locations) ? source.locations : []) {
    const location = normalizeDynamicLocation(raw);
    const nameKey = location ? `${location.district}:${normalizedName(location.name)}` : "";
    if (!location || ids.has(location.id) || names.has(nameKey) || candidates.length >= MAX_STORED_DYNAMIC_LOCATIONS) continue;
    ids.add(location.id);
    names.add(nameKey);
    candidates.push(location);
  }
  const byId = new Map(candidates.map((location) => [location.id, location]));
  const hasValidAnchorPath = (location, trail = new Set()) => {
    if (staticIds.has(location.anchorId)) return true;
    if (trail.has(location.id)) return false;
    const anchor = byId.get(location.anchorId);
    if (!anchor || anchor.scope === "interior") return false;
    return hasValidAnchorPath(anchor, new Set([...trail, location.id]));
  };
  const locations = candidates.filter((location) => location.anchorId !== location.id && hasValidAnchorPath(location));
  const validIds = new Set([...staticIds, ...locations.map((location) => location.id)]);
  const routeKeys = new Set();
  const routes = (Array.isArray(source.routes) ? source.routes : []).flatMap((raw) => {
    const from = cleanText(raw?.from, 80);
    const to = cleanText(raw?.to, 80);
    const key = [from, to].sort().join(":");
    if (!from || !to || from === to || !validIds.has(from) || !validIds.has(to) || routeKeys.has(key)) return [];
    routeKeys.add(key);
    return [{ from, to, minutes: clamp(Math.round(Number(raw.minutes) || 15), 2, 90), transport: cleanText(raw.transport, 40) || "步行", source: "dynamic" }];
  });
  return { locations, routes };
}

export function getMapLocations(gameOrExtensions = {}, options = {}) {
  const extensions = normalizeMapExtensions(gameOrExtensions);
  const staticLocations = MAP_LOCATIONS.map((location) => ({ ...location, source: "static", scope: "landmark", kind: "landmark", lifecycle: "active", parentId: null }));
  const dynamic = extensions.locations.filter((location) => (options.includeArchived || location.lifecycle !== "archived") && (options.includeInteriors !== false || location.scope !== "interior"));
  return [...staticLocations, ...dynamic];
}

export function getMapRoutes(gameOrExtensions = {}) {
  const extensions = normalizeMapExtensions(gameOrExtensions);
  const activeIds = new Set(getMapLocations(gameOrExtensions).map((location) => location.id));
  return [...MAP_ROUTES.map((route) => ({ ...route, source: "static" })), ...extensions.routes.filter((route) => activeIds.has(route.from) && activeIds.has(route.to))];
}

export function getMapLocation(id, gameOrExtensions = {}, options = {}) {
  return getMapLocations(gameOrExtensions, options).find((location) => location.id === id) || null;
}

export function isDiscoveredLocationStatus(status) {
  return status === "discovered" || status === "visited";
}

export function initialDiscoveredLocations() {
  return INITIAL_DISCOVERED_LOCATION_IDS.map((id) => {
    const location = getMapLocation(id);
    return { id: location.id, name: location.name, note: location.description };
  });
}

export function normalizeLocationKnowledge(knowledge = {}, discoveredLocations = [], currentId = "", gameOrExtensions = {}) {
  const discoveredById = new Map((Array.isArray(discoveredLocations) ? discoveredLocations : []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  return Object.fromEntries(getMapLocations(gameOrExtensions, { includeArchived: true }).map((location) => {
    const existing = knowledge?.[location.id];
    const existingStatus = typeof existing === "string" ? existing : existing?.status;
    const defaultStatus = location.source === "static" && INITIAL_RUMORED_LOCATION_IDS.includes(location.id) ? "rumored" : "unknown";
    const discovered = discoveredById.get(location.id);
    const status = location.id === currentId
      ? "visited"
      : discovered
        ? (existingStatus === "visited" ? "visited" : "discovered")
        : LOCATION_KNOWLEDGE_STATUSES.includes(existingStatus) ? existingStatus : defaultStatus;
    const note = discovered?.note || existing?.note || (status === "rumored" ? location.rumor : "");
    return [location.id, { ...(typeof existing === "object" ? existing : {}), status, note }];
  }));
}

function nextLocationCode(district, locations) {
  const prefix = DISTRICT_LAYOUT[district].prefix;
  const highest = locations.reduce((maximum, location) => {
    const match = String(location.code || "").match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `${prefix}${highest + 1}`;
}

function placeCoordinates(anchor, district, id, locations) {
  const bounds = DISTRICT_LAYOUT[district];
  const hash = stableHash(id);
  let fallback = { x: anchor.x, y: anchor.y };
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const angle = ((hash % 360) + attempt * 137.5) * Math.PI / 180;
    const radius = 6 + ((hash >>> 8) % 5) + Math.floor(attempt / 4) * 2;
    const candidate = {
      x: Number(clamp(anchor.x + Math.cos(angle) * radius, bounds.minX, bounds.maxX).toFixed(1)),
      y: Number(clamp(anchor.y + Math.sin(angle) * radius, bounds.minY, bounds.maxY).toFixed(1)),
    };
    fallback = candidate;
    const collides = locations.filter((location) => location.scope !== "interior").some((location) => Math.hypot(location.x - candidate.x, location.y - candidate.y) < 5.5);
    if (!collides) return candidate;
  }
  return fallback;
}

function routeForLocation(anchor, location) {
  const hash = stableHash(`${anchor.id}:${location.id}`);
  if (location.scope === "interior") return { from: anchor.id, to: location.id, minutes: 3 + (hash % 6), transport: "步行" };
  const sameDistrict = anchor.district === location.district;
  return { from: anchor.id, to: location.id, minutes: sameDistrict ? 8 + (hash % 20) : 25 + (hash % 31), transport: sameDistrict ? "步行" : "公共马车" };
}

export function planDynamicLocation(game, proposal = {}, turn = game?.turn + 1) {
  const extensions = normalizeMapExtensions(game);
  const locations = getMapLocations({ mapExtensions: extensions }, { includeArchived: true });
  const name = cleanText(proposal.name, 60);
  const district = cleanText(proposal.district, 30);
  const scope = DYNAMIC_LOCATION_SCOPES.includes(proposal.scope) ? proposal.scope : "landmark";
  const kind = DYNAMIC_LOCATION_KINDS.includes(proposal.kind) ? proposal.kind : scope === "interior" ? "interior" : "other";
  const anchorId = cleanText(proposal.anchorId, 80);
  const rumor = cleanText(proposal.rumor, 180);
  const description = cleanText(proposal.description, 300);
  const status = proposal.status === "discovered" ? "discovered" : "rumored";
  if (name.length < 2 || description.length < 8 || rumor.length < 4) return { ok: false, error: "动态地点必须包含名称、传闻和可核验的完整描述" };
  if (!MAP_DISTRICTS.includes(district)) return { ok: false, error: `城区必须是：${MAP_DISTRICTS.join("、")}` };
  const anchor = getMapLocation(anchorId, { mapExtensions: extensions });
  if (!anchor) return { ok: false, error: "动态地点必须连接地图注册表中的有效锚点" };
  if (anchor.scope === "interior") return { ok: false, error: "动态地点必须连接城市地图上的地标，不能连接另一个内部地点" };
  const knowledge = normalizeLocationKnowledge(game?.locationKnowledge, game?.discoveredLocations, game?.location?.id, { mapExtensions: extensions });
  if (!isDiscoveredLocationStatus(knowledge[anchor.id]?.status)) return { ok: false, error: "动态地点只能生长在已经发现或到访的锚点附近" };
  if (scope === "interior" && district !== anchor.district) return { ok: false, error: "子地点必须与所属地点位于同一城区" };
  const duplicate = locations.find((location) => location.district === district && normalizedName(location.name) === normalizedName(name));
  if (duplicate) return { ok: true, reused: true, location: duplicate, route: null, status };
  const activeLocationCount = extensions.locations.filter((location) => location.lifecycle !== "archived").length;
  if (activeLocationCount >= MAX_DYNAMIC_LOCATIONS) return { ok: false, error: `活跃动态地点已达到 ${MAX_DYNAMIC_LOCATIONS} 个上限，请先归档不再使用的临时地点` };
  if (extensions.locations.length >= MAX_STORED_DYNAMIC_LOCATIONS) return { ok: false, error: "动态地点历史档案已达到存储上限" };
  if (status === "rumored") {
    const activeRumors = extensions.locations.filter((location) => location.lifecycle !== "archived" && location.district === district && knowledge[location.id]?.status === "rumored").length;
    if (activeRumors >= MAX_ACTIVE_RUMORS_PER_DISTRICT) return { ok: false, error: `该城区已有 ${MAX_ACTIVE_RUMORS_PER_DISTRICT} 条活跃地点传闻，请先调查现有传闻` };
  }
  const id = `dyn-${stableHash(`${district}:${name}:${anchor.id}:${scope}`).toString(36)}`;
  const coordinates = scope === "interior" ? { x: anchor.x, y: anchor.y } : placeCoordinates(anchor, district, id, locations);
  const location = normalizeDynamicLocation({ id, name: name.includes("·") ? name : `${district}·${name}`, district, ...coordinates, code: nextLocationCode(district, locations), rumor, description, scope, kind, anchorId: anchor.id, temporary: proposal.temporary, createdTurn: turn });
  return { ok: true, reused: false, location, route: routeForLocation(anchor, location), status };
}

/** 地点的六边形格坐标：静态地标查表，动态地点由 x/y 换算（与注册时的确定性排布一致） */
export function hexForLocation(location) {
  if (!location) return null;
  if (Number.isInteger(location.q) && Number.isInteger(location.r)) return { q: location.q, r: location.r };
  const x = Number(location.x);
  const y = Number(location.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { q: Math.round((x - 50) / 7), r: Math.round((y - 50) / 7) };
}

/** 六边形格数距离 */
export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** 按格网距离估算旅行耗时与交通方式 */
export function estimateTravelByHex(fromLocation, toLocation) {
  const fromHex = hexForLocation(fromLocation);
  const toHex = hexForLocation(toLocation);
  if (!fromHex || !toHex) return null;
  const grids = hexDistance(fromHex, toHex);
  if (grids === 0) return { minutes: 0, grids, path: [fromLocation.id], transports: [] };
  const minutes = 6 + grids * 7;
  const transport = grids <= 3 ? "步行" : grids <= 6 ? "公共马车" : "轨道马车";
  return { minutes, grids, path: [fromLocation.id, toLocation.id], transports: [transport] };
}

export function findTravelRoute(fromId, toId, allowedIds = getMapLocations().map((location) => location.id), gameOrExtensions = {}) {
  if (!fromId || !toId) return null;
  if (fromId === toId) return { minutes: 0, grids: 0, path: [fromId], transports: [] };
  const allowed = new Set([...allowedIds, fromId]);
  if (!allowed.has(toId)) return null;
  const currentPlayerHex = gameOrExtensions?.location?.id === fromId ? gameOrExtensions?.world?.player : null;
  const fromLocation = getMapLocation(fromId, gameOrExtensions) || (
    Number.isInteger(currentPlayerHex?.q) && Number.isInteger(currentPlayerHex?.r)
      ? { ...gameOrExtensions.location, q: currentPlayerHex.q, r: currentPlayerHex.r }
      : null
  );
  const toLocation = getMapLocation(toId, gameOrExtensions);
  if (!fromLocation || !toLocation) return null;
  return estimateTravelByHex(fromLocation, toLocation);
}

export function locationNameFragments(location) {
  if (!location) return [];
  return [...new Set([location.name, ...location.name.split("·")].filter((fragment) => fragment && fragment.length >= 2))];
}

export function findLocationRelations(game, location) {
  const fragments = locationNameFragments(location);
  if (!fragments.length) return { quests: [], clues: [], npcs: [] };
  const mentions = (text) => fragments.some((fragment) => String(text || "").includes(fragment));
  return {
    quests: (game.quests || []).filter((quest) => mentions(`${quest.title} ${quest.summary}`)),
    clues: (game.clues || []).filter((clue) => mentions(`${clue.title} ${clue.detail}`)),
    npcs: (game.relationships || []).filter((npc) => mentions(`${npc.name} ${npc.role} ${npc.note}`)),
  };
}

export function getChildLocations(game, parentId) {
  return getMapLocations(game).filter((location) => location.scope === "interior" && location.parentId === parentId);
}
