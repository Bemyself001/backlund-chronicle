import { CITY_GEOGRAPHY } from "./geography.js";

// 地点 ID 保持兼容旧档；城区归属校正，坐标为统一的游戏示意格网。
export const MAP_LOCATIONS = [
  {"id":"minsk-street-15","name":"乔伍德区·明斯克街15号","district":"乔伍德区","x":45,"y":42.5,"q":-1,"r":-1,"code":"J1","kind":"residence","rumor":"报纸上刊有私家侦探夏洛克·莫里亚蒂的广告，联系地址是乔伍德区明斯克街15号。","description":"私家侦探夏洛克·莫里亚蒂对外公开的住处与会客地点，承接寻人、寻物及普通调查。街边门牌写着15号；访客可在门前敲门询问，是否接下委托与费用需当面商议。","provenance":"canon"},
  {"id":"mi9-headquarters","name":"皇后区·军情九处联络署","district":"皇后区","x":30,"y":25,"q":-4,"r":-3,"code":"Q5","kind":"institution","rumor":"市政档案馆附近有军方对外联络署，接待希望向军情九处报到的非凡者；公开接待路线可向办事员核实。","description":"军情九处办理身份登记与基础公务的对外联络驻地。接待厅设有登记桌与委托交接室；所有途径的非凡者均可申请，正式加入后可承接情报调查、监视与护送工作。","provenance":"original"},
  {"id":"divination-association","name":"皇后区·占卜师协会","district":"皇后区","x":25,"y":17.5,"q":-5,"r":-4,"code":"Q3","kind":"institution","rumor":"皇后区的占卜师协会接待寻找失物、咨询运势的普通客人。","description":"一间公开营业的职业协会。占卜家可以在这里接单，偶尔听闻基础非凡知识；大多数客人只为日常困扰而来。","provenance":"original"},
  {"id":"city-cemetery","name":"北区·静眠墓地","district":"北区","x":55,"y":12.5,"q":1,"r":-8,"code":"N3","kind":"institution","rumor":"圣赛缪尔教堂附近的墓地管理处正在招募可靠的守墓人。","description":"墓册、守灵室与整齐的墓道由管理处照看。收尸人可在此登记为守墓人，承接守墓、遗体看护与安葬工作。","provenance":"original"},
  {"id":"north-flats","name":"北区·灰墙公寓","district":"北区","x":55,"y":22.5,"q":1,"r":-6,"code":"N1","rumor":"北区似乎有一片不查问来历的廉租公寓。","description":"租金低廉的连排公寓，住户大多不愿过问邻居的来历。","provenance":"original"},
  {"id":"queen-archive","name":"皇后区·市政档案馆","district":"皇后区","x":20,"y":20,"q":-6,"r":-3,"code":"Q1","rumor":"有人提到皇后区保存着旧地契与人口登记。","description":"保存旧地契、人口登记与部分封存案卷的石砌建筑。","provenance":"original"},
  {"id":"queen-library","name":"乔伍德区·公共图书馆","district":"乔伍德区","x":55,"y":47.5,"q":1,"r":-1,"code":"J2","rumor":"报童提到乔伍德区的公共图书馆，那里有可供查阅的旧报合订本。","description":"乔伍德区对公众开放的图书馆，可查阅报纸、地图及文字资料，也可向馆员咨询检索办法。","provenance":"canon","kind":"institution","shortName":"公共图书馆"},
  {"id":"queen-renard-estate","name":"皇后区·百合街·雷纳德子爵宅邸","district":"皇后区","x":15,"y":17.5,"q":-7,"r":-3,"code":"Q4","kind":"residence","rumor":"雷纳德子爵一家住在皇后区百合街，宅邸地址可从公开名录或求医号外上查到。","description":"一座坐落在百合街的深色石砌宅邸。门厅与二楼病室因小姐的重伤而笼罩着压抑气氛。","provenance":"original"},
  {"id":"east-industry","name":"工厂区·烟囱街","district":"工厂区","x":90,"y":45,"q":8,"r":-5,"code":"F1","rumor":"工厂区烟囱街的机器直到入夜仍在运转。","description":"工厂、仓库与临时劳工聚集的街区，日落后仍有机器运转。","provenance":"original"},
  {"id":"hillston-market","name":"希尔斯顿区·商会街","district":"希尔斯顿区","x":45,"y":32.5,"q":-1,"r":-3,"code":"H1","rumor":"体面的商行和银行大多集中在希尔斯顿一带。","description":"银行、商会与体面店铺沿宽阔街道排列，巡警也格外警觉。","provenance":"original"},
  {"id":"east-station","name":"东区·贝克兰德火车站","district":"东区","x":75,"y":42.5,"q":5,"r":-4,"code":"E1","rumor":"铁路把东区火车站与雾都各区连接起来。","description":"设于东区的铁路站点，公告栏上总有新的招工与失踪启事。本站是游戏设置的城市入口，不代表城内唯一或中央车站。","provenance":"original","kind":"station","shortName":"东区火车站"},
  {"id":"iron-gate","name":"桥区·铁门街","district":"桥区","x":55,"y":57.5,"q":1,"r":1,"code":"B2","rumor":"贝克兰德桥区域的铁门街上有酒馆，也有打听消息的去处。","description":"贝克兰德桥区域的一条街道，酒馆与临街铺面间人来人往，适合打听消息与寻找落脚处。","provenance":"canon","kind":"street"},
  {"id":"soot-lamp","name":"桥区·雾鸦旅店","district":"桥区","x":45,"y":57.5,"q":-1,"r":2,"code":"B1","rumor":"桥区有家旅店愿意替客人打听消息。","description":"一间价格尚可的旅店，也接受替客人打听消息的委托。","provenance":"original"},
  {"id":"bridge-docks","name":"大桥南区·南岸货栈","district":"大桥南区","x":35,"y":77.5,"q":-3,"r":7,"code":"S1","rumor":"夜班搬运工常提到西南侧大桥南区沿河的一片货栈。","description":"位于城市西南侧的大桥南区，通往北岸的道路经贝克兰德大桥。驳船、货栈和夜班搬运工构成了另一套城市时钟。","provenance":"original","kind":"warehouse"},
  {"id":"st-samuel","name":"北区·圣赛缪尔教堂","district":"北区","x":65,"y":22.5,"q":3,"r":-7,"code":"N2","rumor":"北区居民提到佩斯菲尔街的圣赛缪尔教堂，向当地人询问便能核实路线与礼拜安排。","description":"黑夜女神教会贝克兰德教区总部，坐落于佩斯菲尔街，是当地居民熟知的公开宗教地标。信众在此礼拜，访客可询问公开活动与参访安排。纯黑色的对称教堂两侧各有一座钟楼；祈祷厅顶部的孔洞将天光筛成星点。","provenance":"canon","kind":"church","shortName":"圣赛缪尔"},
  {"id":"machinery-heart","name":"圣乔治区·圣希尔兰大教堂","district":"圣乔治区","x":65,"y":82.5,"q":3,"r":5,"code":"G1","rumor":"东南侧圣乔治区的居民说，圣希尔兰大教堂正午会鸣钟，广场附近聚着等候有轨马车的人。","description":"蒸汽与机械之神教会在贝克兰德的中心，所在的圣乔治区位于城市东南侧，与北岸码头区隔塔索克河相望。圣希尔兰广场位于教堂前，餐馆和马车站点周围人来人往；机械之心在此办理本游戏的公开接待事务。","provenance":"canon","kind":"church","shortName":"圣希尔兰"},
  {"id":"saint-wind","name":"乔伍德区·圣风大教堂","district":"乔伍德区","x":40,"y":50,"q":-2,"r":1,"code":"J3","rumor":"乔伍德区居民提到风暴之主教会的圣风大教堂，可以向附近街坊核实礼拜安排。","description":"风暴之主教会贝克兰德教区主教座堂。青色穹顶上的风向仪终年急转，弥撒的管风琴声里总混着隐约的雷鸣。","provenance":"canon","kind":"church","shortName":"圣风大教堂"},
  {"id":"blazing-sun","name":"希尔斯顿区·永恒烈阳教堂","district":"希尔斯顿区","x":55,"y":32.5,"q":1,"r":-4,"code":"H2","rumor":"希尔斯顿的因蒂斯商人提到当地的永恒烈阳教堂，可以向附近商户打听地址与正午礼拜安排。","description":"永恒烈阳教会在贝克兰德的公开教堂，金色马赛克装饰着穹顶，教众多为因蒂斯裔商人与外交官。附近商户知道它的位置；正午礼拜是这里的重要活动，具体参访时间可向教堂询问。","provenance":"original","kind":"church","shortName":"烈阳教堂"},
  {"id":"west-museum","name":"西区·王国博物馆","shortName":"王国博物馆","district":"西区","q":-5,"r":1,"x":25,"y":42.5,"code":"W1","kind":"institution","provenance":"canon","rumor":"国王大道2号的王国博物馆正在刊登展览告示。","description":"位于西区国王大道2号的王国博物馆，靠近乔伍德区方向。访客可在入口查看公开展讯、开放安排与参观须知。"},
  {"id":"dock-workers-square","name":"码头区·装卸工广场","shortName":"装卸工广场","district":"码头区","q":6,"r":0,"x":80,"y":65,"code":"D1","kind":"street","provenance":"original","rumor":"码头区的装卸工广场贴着每日短工与货运公告。","description":"沿河北岸、位于货运码头外的小广场。工头在这里招募临时人手，货主、车夫与等班的装卸工挤在告示板前。"},
];

// 路线关联保留作内容索引；实际耗时按可通行格网及大桥绕行结算。
export const MAP_ROUTES = [
  {
    "from": "queen-library",
    "to": "minsk-street-15",
    "minutes": 20,
    "transport": "步行"
  },
  {
    "from": "hillston-market",
    "to": "minsk-street-15",
    "minutes": 34,
    "transport": "公共马车"
  },
  {
    "from": "queen-library",
    "to": "mi9-headquarters",
    "minutes": 14,
    "transport": "步行"
  },
  {
    "from": "queen-archive",
    "to": "mi9-headquarters",
    "minutes": 10,
    "transport": "步行"
  },
  {
    "from": "queen-library",
    "to": "divination-association",
    "minutes": 10,
    "transport": "步行"
  },
  {
    "from": "st-samuel",
    "to": "city-cemetery",
    "minutes": 10,
    "transport": "步行"
  },
  {
    "from": "north-flats",
    "to": "queen-library",
    "minutes": 24,
    "transport": "步行与公共马车"
  },
  {
    "from": "north-flats",
    "to": "queen-archive",
    "minutes": 20,
    "transport": "步行"
  },
  {
    "from": "queen-archive",
    "to": "queen-library",
    "minutes": 12,
    "transport": "步行"
  },
  {
    "from": "queen-archive",
    "to": "queen-renard-estate",
    "minutes": 11,
    "transport": "步行"
  },
  {
    "from": "queen-library",
    "to": "queen-renard-estate",
    "minutes": 14,
    "transport": "步行"
  },
  {
    "from": "queen-archive",
    "to": "hillston-market",
    "minutes": 18,
    "transport": "公共马车"
  },
  {
    "from": "queen-library",
    "to": "hillston-market",
    "minutes": 22,
    "transport": "公共马车"
  },
  {
    "from": "queen-library",
    "to": "east-station",
    "minutes": 32,
    "transport": "轨道马车"
  },
  {
    "from": "hillston-market",
    "to": "soot-lamp",
    "minutes": 28,
    "transport": "出租马车"
  },
  {
    "from": "east-industry",
    "to": "east-station",
    "minutes": 16,
    "transport": "步行"
  },
  {
    "from": "east-industry",
    "to": "iron-gate",
    "minutes": 21,
    "transport": "步行"
  },
  {
    "from": "east-station",
    "to": "iron-gate",
    "minutes": 18,
    "transport": "步行"
  },
  {
    "from": "east-station",
    "to": "soot-lamp",
    "minutes": 28,
    "transport": "公共马车"
  },
  {
    "from": "iron-gate",
    "to": "soot-lamp",
    "minutes": 22,
    "transport": "步行"
  },
  {
    "from": "iron-gate",
    "to": "bridge-docks",
    "minutes": 25,
    "transport": "步行"
  },
  {
    "from": "soot-lamp",
    "to": "bridge-docks",
    "minutes": 17,
    "transport": "步行"
  },
  {
    "from": "north-flats",
    "to": "st-samuel",
    "minutes": 14,
    "transport": "步行"
  },
  {
    "from": "east-industry",
    "to": "machinery-heart",
    "minutes": 12,
    "transport": "步行"
  },
  {
    "from": "soot-lamp",
    "to": "saint-wind",
    "minutes": 13,
    "transport": "步行"
  },
  {
    "from": "hillston-market",
    "to": "blazing-sun",
    "minutes": 11,
    "transport": "步行"
  },
  {
    "from": "west-museum",
    "to": "queen-library",
    "minutes": 34,
    "transport": "公共马车"
  },
  {
    "from": "dock-workers-square",
    "to": "east-station",
    "minutes": 27,
    "transport": "公共马车"
  },
  {
    "from": "machinery-heart",
    "to": "bridge-docks",
    "minutes": 34,
    "transport": "公共马车"
  }
];
export const INITIAL_DISCOVERED_LOCATION_IDS = ["east-station","iron-gate","soot-lamp","queen-library","minsk-street-15"];
export const INITIAL_RUMORED_LOCATION_IDS = ["queen-archive","bridge-docks","st-samuel","machinery-heart","saint-wind","blazing-sun","divination-association","city-cemetery","mi9-headquarters","west-museum","dock-workers-square"];
export const LOCATION_KNOWLEDGE_STATUSES = ["unknown","rumored","discovered","visited"];
export const DYNAMIC_LOCATION_SCOPES = ["landmark","interior"];
export const DYNAMIC_LOCATION_KINDS = ["street","residence","shop","tavern","office","church","warehouse","station","institution","hideout","interior","other"];
export const MAP_DISTRICTS = CITY_GEOGRAPHY.districts.map(district => district.name);
export const DISTRICT_LAYOUT = Object.fromEntries(CITY_GEOGRAPHY.districts.map(district => [district.name, district]));
