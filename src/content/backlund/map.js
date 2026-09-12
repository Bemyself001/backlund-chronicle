// 贝克兰德内容包：固定地点、路线与城区画布。规则实现位于 system/map.js。
export const MAP_LOCATIONS = [
  { id: "north-flats", name: "北区·灰墙公寓", district: "北区", x: 49, y: 13, q: 0, r: -5, code: "N1", rumor: "北区似乎有一片不查问来历的廉租公寓。", description: "租金低廉的连排公寓，住户大多不愿过问邻居的来历。" },
  { id: "queen-archive", name: "皇后区·市政档案馆", district: "皇后区", x: 31, y: 27, q: -3, r: -3, code: "Q1", rumor: "有人提到皇后区保存着旧地契与人口登记。", description: "保存旧地契、人口登记与部分封存案卷的石砌建筑。" },
  { id: "queen-library", name: "皇后区·公共图书馆", district: "皇后区", x: 49, y: 35, q: 0, r: -2, code: "Q2", rumor: "报童说皇后区有一座对公众开放的图书馆。", description: "白天对公众开放，可查阅报纸、地图与部分城市档案。" },
  { id: "east-industry", name: "东区·烟囱街", district: "东区", x: 83, y: 43, q: 5, r: -1, code: "E1", rumor: "东区深处的烟囱直到入夜仍不会熄灭。", description: "工厂、仓库与临时劳工聚集的街区，日落后仍有机器运转。" },
  { id: "hillston-market", name: "希尔斯顿区·商会街", district: "希尔斯顿区", x: 22, y: 54, q: -4, r: 1, code: "H1", rumor: "体面的商行和银行大多集中在希尔斯顿一带。", description: "银行、商会与体面店铺沿宽阔街道排列，巡警也格外警觉。" },
  { id: "east-station", name: "东区·贝克兰德火车站", district: "东区", x: 78, y: 62, q: 4, r: 2, code: "E2", rumor: "铁路把东区火车站与雾都各区连接起来。", description: "通往雾都各区的交通节点，公告栏上总有新的招工与失踪启事。" },
  { id: "iron-gate", name: "东区·铁门街", district: "东区", x: 79, y: 79, q: 4, r: 4, code: "E3", rumor: "铁门街有不少廉价住处和临时工作。", description: "廉价旅店、工棚、诊所与小酒馆密集，适合寻找住处和零工。" },
  { id: "soot-lamp", name: "桥区·雾鸦旅店", district: "桥区", x: 55, y: 72, q: 1, r: 3, code: "B1", rumor: "桥区有家旅店愿意替客人打听消息。", description: "一间价格尚可的旅店，也接受替客人打听消息的委托。" },
  { id: "bridge-docks", name: "桥区·南岸货栈", district: "桥区", x: 54, y: 89, q: 1, r: 6, code: "B2", rumor: "夜班搬运工常提到桥区南岸的一片货栈。", description: "驳船、货栈和夜班搬运工构成了另一套城市时钟。" },
  { id: "st-samuel", name: "北区·圣赛缪尔教堂", district: "北区", x: 62, y: 17, q: 2, r: -5, code: "N2", rumor: "北区的居民说，佩斯菲尔街那座纯黑教堂入夜后也不点灯。", description: "黑夜女神教会贝克兰德教区总部，坐落于佩斯菲尔街。纯黑色的对称教堂，两侧各有一座钟楼；祈祷厅顶部的孔洞将天光筛成星点。" },
  { id: "machinery-heart", name: "东区·机械之心教堂", district: "东区", x: 88, y: 54, q: 5, r: 1, code: "E4", rumor: "工厂区的工人提到一座门楣上悬着三角圣徽的教堂。", description: "蒸汽与机械之神教会的东区教堂，三角圣徽里铸着齿轮、杠杆与蒸汽的符号。弥撒钟声常与锅炉房的汽笛同时响起。" },
  { id: "saint-wind", name: "桥区·圣风大教堂", district: "桥区", x: 45, y: 68, q: -1, r: 3, code: "B3", rumor: "桥区的船工说，圣风大教堂穹顶上的风向仪从不停下。", description: "风暴之主教会贝克兰德教区主教座堂。青色穹顶上的风向仪终年急转，弥撒的管风琴声里总混着隐约的雷鸣。" },
  { id: "blazing-sun", name: "希尔斯顿区·永恒烈阳教堂", district: "希尔斯顿区", x: 14, y: 62, q: -5, r: 2, code: "H2", rumor: "希尔斯顿的因蒂斯商人只在正午走进一座金色小教堂。", description: "因蒂斯国教在贝克兰德的小教堂，金色马赛克穹顶在雾都的灰调里格格不入。只在正午短暂开放，教众多为因蒂斯裔商人与外交官。" },
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
  { from: "north-flats", to: "st-samuel", minutes: 14, transport: "步行" },
  { from: "east-industry", to: "machinery-heart", minutes: 12, transport: "步行" },
  { from: "soot-lamp", to: "saint-wind", minutes: 13, transport: "步行" },
  { from: "hillston-market", to: "blazing-sun", minutes: 11, transport: "步行" },
];

export const INITIAL_DISCOVERED_LOCATION_IDS = ["east-station", "iron-gate", "soot-lamp", "queen-library"];
export const INITIAL_RUMORED_LOCATION_IDS = ["queen-archive", "bridge-docks", "st-samuel", "machinery-heart", "saint-wind", "blazing-sun"];
export const LOCATION_KNOWLEDGE_STATUSES = ["unknown", "rumored", "discovered", "visited"];
export const DYNAMIC_LOCATION_SCOPES = ["landmark", "interior"];
export const DYNAMIC_LOCATION_KINDS = ["street", "residence", "shop", "tavern", "office", "church", "warehouse", "station", "institution", "hideout", "interior", "other"];
export const MAP_DISTRICTS = ["北区", "皇后区", "希尔斯顿区", "东区", "桥区"];

export const DISTRICT_LAYOUT = {
  "北区": { prefix: "N", minX: 28, maxX: 68, minY: 6, maxY: 24 },
  "皇后区": { prefix: "Q", minX: 20, maxX: 66, minY: 18, maxY: 44 },
  "希尔斯顿区": { prefix: "H", minX: 7, maxX: 40, minY: 42, maxY: 68 },
  "东区": { prefix: "E", minX: 68, maxX: 94, minY: 32, maxY: 91 },
  "桥区": { prefix: "B", minX: 41, maxX: 67, minY: 64, maxY: 95 },
};
