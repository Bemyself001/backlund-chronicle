// 原著可核对的是城区归属和相邻关系；边界、格距及河湾是游戏示意布局。
// 统一采用北上南下、西左东右。几何算法放在 system/mapGeometry.js。
export const CITY_GEOGRAPHY = {
  version: 2,
  bounds: { minQ: -9, maxQ: 9, minY: 5, maxY: 95 },
  origin: 50,
  step: 5,
  river: {
    name: "塔索克河",
    flow: "自西向东蜿蜒穿城，下游偏向东南",
    cells: [
      [-10, 6], [-9, 6], [-8, 5], [-7, 5], [-6, 5], [-5, 5], [-4, 4],
      [-3, 3], [-2, 3], [-1, 3], [0, 3], [1, 2], [2, 1], [3, 1],
      [4, 1], [5, 1], [6, 1], [7, 0], [8, 0], [9, 0], [10, 0],
    ],
  },
  crossings: [{ id: "backlund-bridge", name: "贝克兰德大桥", q: 0, r: 3 }],
  districts: [
    { name: "皇后区", prefix: "Q", bank: "north", minX: 0, maxX: 38, minY: 0, maxY: 28, label: [23, 9], description: "贵族宅邸与体面的街道" },
    { name: "北区", prefix: "N", bank: "north", minX: 38, maxX: 82, minY: 0, maxY: 28, label: [60, 7], description: "政府机关、住宅与圣赛缪尔教堂" },
    { name: "西区", prefix: "W", bank: "north", minX: 0, maxX: 35, minY: 28, maxY: 100, label: [16, 33], description: "富商宅邸与王国博物馆" },
    { name: "希尔斯顿区", prefix: "H", bank: "north", minX: 35, maxX: 64, minY: 28, maxY: 40, label: [49, 28], description: "金融、商业与银行汇聚之地" },
    { name: "乔伍德区", prefix: "J", bank: "north", minX: 35, maxX: 64, minY: 40, maxY: 56, label: [54, 40], description: "住宅、小公司、公共图书馆与圣风大教堂" },
    { name: "东区", prefix: "E", bank: "north", minX: 64, maxX: 82, minY: 28, maxY: 53, label: [74, 32], description: "人口稠密的劳工街巷" },
    { name: "工厂区", prefix: "F", bank: "north", minX: 82, maxX: 101, minY: 0, maxY: 53, label: [91, 28], description: "城市东部的工厂群，合并为一片游戏区域" },
    { name: "码头区", prefix: "D", bank: "north", minX: 64, maxX: 101, minY: 53, maxY: 100, label: [80, 56], description: "沿河北岸的货运与装卸街区" },
    { name: "桥区", prefix: "B", bank: "north", minX: 35, maxX: 64, minY: 56, maxY: 100, label: [54, 54], description: "大桥北侧，铁门街与旅店相连" },
    { name: "圣乔治区", prefix: "G", bank: "south", minX: 0, maxX: 50, minY: 0, maxY: 100, label: [24, 70], description: "南岸的工业、住宅与圣希尔兰大教堂" },
    { name: "大桥南区", prefix: "S", bank: "south", minX: 50, maxX: 101, minY: 0, maxY: 100, label: [75, 82], description: "大桥以南的居民街区与沿岸货栈" },
  ],
  note: "城区归属依据原著整理；边界、河湾与距离为游戏示意。",
};
