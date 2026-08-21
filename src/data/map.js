export const MAP_LOCATIONS = [
  { id: "north-flats", name: "北区·灰墙公寓", district: "北区", x: 49, y: 13, code: "N1", rumor: "北区似乎有一片不查问来历的廉租公寓。", description: "租金低廉的连排公寓，住户大多不愿过问邻居的来历。" },
  { id: "queen-archive", name: "皇后区·市政档案馆", district: "皇后区", x: 31, y: 27, code: "Q1", rumor: "有人提到皇后区保存着旧地契与人口登记。", description: "保存旧地契、人口登记与部分封存案卷的石砌建筑。" },
  { id: "queen-library", name: "皇后区·公共图书馆", district: "皇后区", x: 49, y: 35, code: "Q2", rumor: "报童说皇后区有一座对公众开放的图书馆。", description: "白天对公众开放，可查阅报纸、地图与部分城市档案。" },
  { id: "east-industry", name: "东区·烟囱街", district: "东区", x: 83, y: 43, code: "E1", rumor: "东区深处的烟囱直到入夜仍不会熄灭。", description: "工厂、仓库与临时劳工聚集的街区，日落后仍有机器运转。" },
  { id: "hillston-market", name: "希尔斯顿区·商会街", district: "希尔斯顿区", x: 22, y: 54, code: "H1", rumor: "体面的商行和银行大多集中在希尔斯顿一带。", description: "银行、商会与体面店铺沿宽阔街道排列，巡警也格外警觉。" },
  { id: "east-station", name: "东区·贝克兰德火车站", district: "东区", x: 78, y: 62, code: "E2", rumor: "铁路把东区火车站与雾都各区连接起来。", description: "通往雾都各区的交通节点，公告栏上总有新的招工与失踪启事。" },
  { id: "iron-gate", name: "东区·铁门街", district: "东区", x: 79, y: 79, code: "E3", rumor: "铁门街有不少廉价住处和临时工作。", description: "廉价旅店、工棚、诊所与小酒馆密集，适合寻找住处和零工。" },
  { id: "soot-lamp", name: "桥区·雾鸦旅店", district: "桥区", x: 55, y: 72, code: "B1", rumor: "桥区有家旅店愿意替客人打听消息。", description: "一间价格尚可的旅店，也接受替客人打听消息的委托。" },
  { id: "bridge-docks", name: "桥区·南岸货栈", district: "桥区", x: 54, y: 89, code: "B2", rumor: "夜班搬运工常提到桥区南岸的一片货栈。", description: "驳船、货栈和夜班搬运工构成了另一套城市时钟。" },
];

export const MAP_ROUTES = [
  { from: "north-flats", to: "queen-library", minutes: 24, transport: "步行与公共马车" },
  { from: "north-flats", to: "queen-archive", minutes: 20, transport: "步行" },
  { from: "queen-archive", to: "queen-library", minutes: 12, transport: "步行" },
  { from: "queen-archive", to: "hillston-market", minutes: 18, transport: "公共马车" },
  { from: "queen-library", to: "hillston-market", minutes: 22, transport: "公共马车" },
  { from: "queen-library", to: "east-station", minutes: 32, transport: "轨道马车" },
  { from: "hillston-market", to: "soot-lamp", minutes: 28, transport: "出租马车" },
  { from: "east-industry", to: "east-station", minutes: 16, transport: "步行" },
  { from: "east-industry", to: "iron-gate", minutes: 21, transport: "步行" },
  { from: "east-station", to: "iron-gate", minutes: 18, transport: "步行" },
  { from: "east-station", to: "soot-lamp", minutes: 28, transport: "公共马车" },
  { from: "iron-gate", to: "soot-lamp", minutes: 22, transport: "步行" },
  { from: "iron-gate", to: "bridge-docks", minutes: 25, transport: "步行" },
  { from: "soot-lamp", to: "bridge-docks", minutes: 17, transport: "步行" },
];

export const INITIAL_DISCOVERED_LOCATION_IDS = ["east-station", "iron-gate", "soot-lamp", "queen-library"];
export const INITIAL_RUMORED_LOCATION_IDS = ["queen-archive", "bridge-docks"];
export const LOCATION_KNOWLEDGE_STATUSES = ["unknown", "rumored", "discovered", "visited"];
export const DYNAMIC_LOCATION_SCOPES = ["landmark", "interior"];
export const DYNAMIC_LOCATION_KINDS = ["street", "residence", "shop", "tavern", "office", "church", "warehouse", "station", "institution", "hideout", "interior", "other"];
export const MAP_DISTRICTS = ["北区", "皇后区", "希尔斯顿区", "东区", "桥区"];
export const MAX_DYNAMIC_LOCATIONS = 24;
export const MAX_STORED_DYNAMIC_LOCATIONS = 64;
export const MAX_ACTIVE_RUMORS_PER_DISTRICT = 3;

const DISTRICT_LAYOUT = {
  "北区": { prefix: "N", minX: 28, maxX: 68, minY: 6, maxY: 24 },
  "皇后区": { prefix: "Q", minX: 20, maxX: 66, minY: 18, maxY: 44 },
  "希尔斯顿区": { prefix: "H", minX: 7, maxX: 40, minY: 42, maxY: 68 },
  "东区": { prefix: "E", minX: 68, maxX: 94, minY: 32, maxY: 91 },
  "桥区": { prefix: "B", minX: 41, maxX: 67, minY: 64, maxY: 95 },
};

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

export function findTravelRoute(fromId, toId, allowedIds = getMapLocations().map((location) => location.id), gameOrExtensions = {}) {
  if (!fromId || !toId) return null;
  if (fromId === toId) return { minutes: 0, path: [fromId], transports: [] };
  const allowed = new Set([...allowedIds, fromId]);
  if (!allowed.has(toId)) return null;
  const distances = new Map([[fromId, 0]]);
  const previous = new Map();
  const transportByNode = new Map();
  const pending = new Set(allowed);
  const routes = getMapRoutes(gameOrExtensions);
  while (pending.size) {
    let current = null;
    let best = Infinity;
    for (const id of pending) {
      const distance = distances.get(id) ?? Infinity;
      if (distance < best) { best = distance; current = id; }
    }
    if (!current || best === Infinity) break;
    pending.delete(current);
    if (current === toId) break;
    for (const route of routes) {
      const neighbor = route.from === current ? route.to : route.to === current ? route.from : null;
      if (!neighbor || !pending.has(neighbor) || !allowed.has(neighbor)) continue;
      const candidate = best + route.minutes;
      if (candidate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
        transportByNode.set(neighbor, route.transport);
      }
    }
  }
  if (!distances.has(toId)) return null;
  const path = [];
  const transports = [];
  let cursor = toId;
  while (cursor) {
    path.unshift(cursor);
    const previousNode = previous.get(cursor);
    if (!previousNode) break;
    transports.unshift(transportByNode.get(cursor));
    cursor = previousNode;
  }
  return { minutes: distances.get(toId), path, transports };
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
