// 为游玩节奏制定的本城价格与收入，不等同于原著市场行情。金额统一用便士。
const job = (id, name, locationId, minutes, tasks) => ({
  id, name, locationId, minutes, ordinary: true, kind: "commission", cost: 0,
  pool: tasks.map(([title, scene, outcome], index) => ({
    id: `${id}-${index}`, title, scene,
    options: [
      { id: "careful", label: "完成约定的全部工作", ending: `${outcome}工头核对交接后，付清了约定报酬。`, reward: 144 + index * 24, reputation: 1 },
      { id: "limited", label: "完成分配的一部分工作", ending: "你交接了已经完成的部分，领取相应工钱。", reward: 72 + index * 12 },
    ],
  })),
});

export const ECONOMY = {
  version: 1,
  income: { commissionMultiplier: 2, sequenceBonusPence: 24, maxSequenceBonusPence: 144 },
  jobs: [
    job("ordinary-station", "车站文书短工", "east-station", 120, [
      ["整理到站货票", "车站办事员雇你把到站货票按日期和车厢号整理，约需两小时。", "你整理完货票，并标出了缺失的签名。"],
      ["核对寄存编号", "寄存处需要有人核对行李编号与领取登记，约需两小时。", "你核实编号，交回一份可查阅的登记册。"],
      ["誊写班次告示", "车站委托你誊写更新后的班次告示，约需两小时。", "你校对了时刻与站名，把告示交给值班员。"],
    ]),
    job("ordinary-docks", "码头货运短工", "dock-workers-square", 180, [
      ["清点封装货包", "工头招人清点码头的封装货包，约需三小时。", "你按装货单逐件清点并完成交接。"],
      ["整理货栈堆位", "货主请你把货包依编号整理到堆位，约需三小时。", "你完成堆位整理，把位置清单交给货主。"],
      ["核对装卸清单", "工头需要人逐项核对装卸记录，约需三小时。", "你核实了装卸记录，并把差异交给工头复查。"],
    ]),
    job("ordinary-shop", "商行送货短工", "hillston-market", 120, [
      ["交接街内订货", "商行雇你在商会街交接几笔普通订货，约需两小时。", "你完成交接，带回了签收单。"],
      ["核对陈列样品", "店主委托你核对样品与货号，约需两小时。", "你补齐货号标签，交回核对清单。"],
      ["整理客户回执", "商行有一叠回执需要按客户整理，约需两小时。", "你整理好回执，让店主逐笔确认。"],
    ]),
  ],
  trade: {
    maxQuantity: 10,
    goods: [
      { id: "tea", name: "封装茶叶", weight: 0.5, description: "一包可供商行转售的普通茶叶，按包交易。" },
      { id: "cloth", name: "棉布货包", weight: 1, description: "一包规格统一的普通棉布，按包交易。" },
      { id: "herbs", name: "干草药货包", weight: 0.3, description: "一包普通干草药，不含非凡材料或晋升成分。" },
      { id: "parts", name: "机械零件货包", weight: 0.8, description: "一包通用机械零件，适合供货与维修采购。" },
    ],
    channels: [
      { id: "dock", name: "码头供货摊", locationId: "dock-workers-square", description: "茶叶、棉布与草药供货较便宜；码头维修商愿意收购零件。", prices: {
        tea: { buy: 240, sell: 192, stock: 4, demand: 4 }, cloth: { buy: 180, sell: 144, stock: 4, demand: 4 },
        herbs: { buy: 72, sell: 60, stock: 6, demand: 6 }, parts: { buy: 180, sell: 156, stock: 6, demand: 6 },
      } },
      { id: "merchant", name: "商会街商行", locationId: "hillston-market", description: "商行收购茶叶、棉布与草药；机械零件有较低的批发报价。", prices: {
        tea: { buy: 384, sell: 330, stock: 4, demand: 4 }, cloth: { buy: 288, sell: 252, stock: 4, demand: 4 },
        herbs: { buy: 132, sell: 108, stock: 6, demand: 6 }, parts: { buy: 96, sell: 72, stock: 6, demand: 6 },
      } },
    ],
  },
};
