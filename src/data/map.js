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

export const INITIAL_DISCOVERED_LOCATION_IDS = ["east-station", "iron-gate", "soot-lamp", "queen-library"];
export const INITIAL_RUMORED_LOCATION_IDS = ["queen-archive", "bridge-docks"];
export const LOCATION_KNOWLEDGE_STATUSES = ["unknown", "rumored", "discovered"];

export function initialDiscoveredLocations() {
  return INITIAL_DISCOVERED_LOCATION_IDS.map((id) => {
    const location = getMapLocation(id);
    return { id: location.id, name: location.name, note: location.description };
  });
}

export function normalizeLocationKnowledge(knowledge = {}, discoveredLocations = [], currentId = "") {
  const discoveredById = new Map((Array.isArray(discoveredLocations) ? discoveredLocations : []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  return Object.fromEntries(MAP_LOCATIONS.map((location) => {
    const existing = knowledge?.[location.id];
    const existingStatus = typeof existing === "string" ? existing : existing?.status;
    const defaultStatus = INITIAL_RUMORED_LOCATION_IDS.includes(location.id) ? "rumored" : "unknown";
    const discovered = discoveredById.get(location.id);
    const status = discovered || location.id === currentId
      ? "discovered"
      : LOCATION_KNOWLEDGE_STATUSES.includes(existingStatus) ? existingStatus : defaultStatus;
    const note = discovered?.note || existing?.note || (status === "rumored" ? location.rumor : "");
    return [location.id, { ...(typeof existing === "object" ? existing : {}), status, note }];
  }));
}

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

export function getMapLocation(id) {
  return MAP_LOCATIONS.find((location) => location.id === id);
}

export function findTravelRoute(fromId, toId, allowedIds = MAP_LOCATIONS.map((location) => location.id)) {
  if (!fromId || !toId) return null;
  if (fromId === toId) return { minutes: 0, path: [fromId], transports: [] };
  const allowed = new Set([...allowedIds, fromId]);
  if (!allowed.has(toId)) return null;
  const distances = new Map([[fromId, 0]]);
  const previous = new Map();
  const transportByNode = new Map();
  const pending = new Set(allowed);
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
    for (const route of MAP_ROUTES) {
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

// 地点关联内容：按地点名称片段匹配任务、线索与 NPC，供地图详情面板展示
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
