// 贝克兰德内容包：固定地点、路线与城区画布。规则实现位于 system/map.js。
export const MAP_LOCATIONS = [
  // 原著第216章报纸广告给出乔伍德区明斯克街15号；画布坐标、格网与路程为游戏抽象布局。
  { id: "minsk-street-15", name: "乔伍德区·明斯克街15号", district: "乔伍德区", x: 50, y: 52, q: 0, r: 0, code: "J1", kind: "residence", rumor: "报纸上刊有私家侦探夏洛克·莫里亚蒂的广告，联系地址是乔伍德区明斯克街15号。", description: "私家侦探夏洛克·莫里亚蒂对外公开的住处与会客地点，承接寻人、寻物及普通调查。街边门牌写着15号；访客可在门前敲门询问，是否接下委托与费用需当面商议。" },
  // 游戏原创的公开联络驻地，不指定原著中的秘密总部地址。
  { id: "mi9-headquarters", name: "皇后区·军情九处联络署", district: "皇后区", x: 30, y: 38, q: -3, r: -1, code: "Q5", kind: "institution", rumor: "市政档案馆与公共图书馆之间有军方对外联络署，接待希望向军情九处报到的非凡者；公开接待路线可向办事员核实。", description: "军情九处办理身份登记与基础公务的对外联络驻地。接待厅设有登记桌与委托交接室；所有途径的非凡者均可申请，正式加入后可承接情报调查、监视与护送工作。" },
  { id: "divination-association", name: "皇后区·占卜师协会", district: "皇后区", x: 57, y: 31, q: 1, r: -3, code: "Q3", kind: "institution", rumor: "公共图书馆附近的占卜师协会接待寻找失物、咨询运势的普通客人。", description: "一间公开营业的职业协会。占卜家可以在这里接单，偶尔听闻基础非凡知识；大多数客人只为日常困扰而来。" },
  { id: "city-cemetery", name: "北区·静眠墓地", district: "北区", x: 65, y: 10, q: 3, r: -6, code: "N3", kind: "institution", rumor: "圣赛缪尔教堂附近的墓地管理处正在招募可靠的守墓人。", description: "墓册、守灵室与整齐的墓道由管理处照看。收尸人可在此登记为守墓人，承接守墓、遗体看护与安葬工作。" },
  { id: "north-flats", name: "北区·灰墙公寓", district: "北区", x: 49, y: 13, q: 0, r: -5, code: "N1", rumor: "北区似乎有一片不查问来历的廉租公寓。", description: "租金低廉的连排公寓，住户大多不愿过问邻居的来历。" },
  { id: "queen-archive", name: "皇后区·市政档案馆", district: "皇后区", x: 31, y: 27, q: -3, r: -3, code: "Q1", rumor: "有人提到皇后区保存着旧地契与人口登记。", description: "保存旧地契、人口登记与部分封存案卷的石砌建筑。" },
  { id: "queen-library", name: "皇后区·公共图书馆", district: "皇后区", x: 49, y: 35, q: 0, r: -2, code: "Q2", rumor: "报童说皇后区有一座对公众开放的图书馆。", description: "白天对公众开放，可查阅报纸、地图与部分城市档案。" },
  { id: "queen-renard-estate", name: "皇后区·百合街·雷纳德子爵宅邸", district: "皇后区", x: 42, y: 23, q: -1, r: -4, code: "Q4", kind: "residence", rumor: "雷纳德子爵一家住在皇后区百合街，宅邸地址可从公开名录或求医号外上查到。", description: "一座坐落在百合街的深色石砌宅邸。门厅与二楼病室因小姐的重伤而笼罩着压抑气氛。" },
  { id: "east-industry", name: "东区·烟囱街", district: "东区", x: 83, y: 43, q: 5, r: -1, code: "E1", rumor: "东区深处的烟囱直到入夜仍不会熄灭。", description: "工厂、仓库与临时劳工聚集的街区，日落后仍有机器运转。" },
  { id: "hillston-market", name: "希尔斯顿区·商会街", district: "希尔斯顿区", x: 22, y: 54, q: -4, r: 1, code: "H1", rumor: "体面的商行和银行大多集中在希尔斯顿一带。", description: "银行、商会与体面店铺沿宽阔街道排列，巡警也格外警觉。" },
  { id: "east-station", name: "东区·贝克兰德火车站", district: "东区", x: 78, y: 62, q: 4, r: 2, code: "E2", rumor: "铁路把东区火车站与雾都各区连接起来。", description: "通往雾都各区的交通节点，公告栏上总有新的招工与失踪启事。" },
  { id: "iron-gate", name: "东区·铁门街", district: "东区", x: 79, y: 79, q: 4, r: 4, code: "E3", rumor: "铁门街有不少廉价住处和临时工作。", description: "廉价旅店、工棚、诊所与小酒馆密集，适合寻找住处和零工。" },
  { id: "soot-lamp", name: "桥区·雾鸦旅店", district: "桥区", x: 55, y: 72, q: 1, r: 3, code: "B1", rumor: "桥区有家旅店愿意替客人打听消息。", description: "一间价格尚可的旅店，也接受替客人打听消息的委托。" },
  { id: "bridge-docks", name: "桥区·南岸货栈", district: "桥区", x: 54, y: 89, q: 1, r: 6, code: "B2", rumor: "夜班搬运工常提到桥区南岸的一片货栈。", description: "驳船、货栈和夜班搬运工构成了另一套城市时钟。" },
  { id: "st-samuel", name: "北区·圣赛缪尔教堂", district: "北区", x: 62, y: 17, q: 2, r: -5, code: "N2", rumor: "北区居民提到佩斯菲尔街的圣赛缪尔教堂，向当地人询问便能核实路线与礼拜安排。", description: "黑夜女神教会贝克兰德教区总部，坐落于佩斯菲尔街，是当地居民熟知的公开宗教地标。信众在此礼拜，访客可询问公开活动与参访安排。纯黑色的对称教堂两侧各有一座钟楼；祈祷厅顶部的孔洞将天光筛成星点。" },
  { id: "machinery-heart", name: "东区·机械之心教堂", district: "东区", x: 88, y: 54, q: 5, r: 1, code: "E4", rumor: "工厂区的工人提到一座门楣上悬着三角圣徽的教堂。", description: "蒸汽与机械之神教会的东区教堂，三角圣徽里铸着齿轮、杠杆与蒸汽的符号。弥撒钟声常与锅炉房的汽笛同时响起。" },
  { id: "saint-wind", name: "桥区·圣风大教堂", district: "桥区", x: 45, y: 68, q: -1, r: 3, code: "B3", rumor: "桥区的船工说，圣风大教堂穹顶上的风向仪从不停下。", description: "风暴之主教会贝克兰德教区主教座堂。青色穹顶上的风向仪终年急转，弥撒的管风琴声里总混着隐约的雷鸣。" },
  { id: "blazing-sun", name: "希尔斯顿区·永恒烈阳教堂", district: "希尔斯顿区", x: 14, y: 62, q: -5, r: 2, code: "H2", rumor: "希尔斯顿的因蒂斯商人提到当地的永恒烈阳教堂，可以向附近商户打听地址与正午礼拜安排。", description: "永恒烈阳教会在贝克兰德的公开教堂，金色马赛克装饰着穹顶，教众多为因蒂斯裔商人与外交官。附近商户知道它的位置；正午礼拜是这里的重要活动，具体参访时间可向教堂询问。" },
];

export const MAP_ROUTES = [
  // 游戏路线设计；实际旅行时间统一由六边形距离结算。
  { from: "queen-library", to: "minsk-street-15", minutes: 20, transport: "步行" },
  { from: "hillston-market", to: "minsk-street-15", minutes: 34, transport: "公共马车" },
  { from: "queen-library", to: "mi9-headquarters", minutes: 14, transport: "步行" },
  { from: "queen-archive", to: "mi9-headquarters", minutes: 10, transport: "步行" },
  { from: "queen-library", to: "divination-association", minutes: 10, transport: "步行" },
  { from: "st-samuel", to: "city-cemetery", minutes: 10, transport: "步行" },
  { from: "north-flats", to: "queen-library", minutes: 24, transport: "步行与公共马车" },
  { from: "north-flats", to: "queen-archive", minutes: 20, transport: "步行" },
  { from: "queen-archive", to: "queen-library", minutes: 12, transport: "步行" },
  { from: "queen-archive", to: "queen-renard-estate", minutes: 11, transport: "步行" },
  { from: "queen-library", to: "queen-renard-estate", minutes: 14, transport: "步行" },
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

export const INITIAL_DISCOVERED_LOCATION_IDS = ["east-station", "iron-gate", "soot-lamp", "queen-library", "minsk-street-15"];
export const INITIAL_RUMORED_LOCATION_IDS = ["queen-archive", "bridge-docks", "st-samuel", "machinery-heart", "saint-wind", "blazing-sun", "divination-association", "city-cemetery", "mi9-headquarters"];
export const LOCATION_KNOWLEDGE_STATUSES = ["unknown", "rumored", "discovered", "visited"];
export const DYNAMIC_LOCATION_SCOPES = ["landmark", "interior"];
export const DYNAMIC_LOCATION_KINDS = ["street", "residence", "shop", "tavern", "office", "church", "warehouse", "station", "institution", "hideout", "interior", "other"];
export const MAP_DISTRICTS = ["北区", "皇后区", "希尔斯顿区", "东区", "桥区", "乔伍德区"];

export const DISTRICT_LAYOUT = {
  "乔伍德区": { prefix: "J", minX: 41, maxX: 65, minY: 45, maxY: 61 },
  "北区": { prefix: "N", minX: 28, maxX: 68, minY: 6, maxY: 24 },
  "皇后区": { prefix: "Q", minX: 20, maxX: 66, minY: 18, maxY: 44 },
  "希尔斯顿区": { prefix: "H", minX: 7, maxX: 40, minY: 42, maxY: 68 },
  "东区": { prefix: "E", minX: 68, maxX: 94, minY: 32, maxY: 91 },
  "桥区": { prefix: "B", minX: 41, maxX: 67, minY: 64, maxY: 95 },
};
