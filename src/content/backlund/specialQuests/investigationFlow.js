// Story-specific revisions; the shared engine only executes generic conditions,
// rewards and timers. All currency values below are pence.
const fact = (key, value = true) => ({ type: "fact", key, value });
const missing = key => ({ type: "fact", key, not: true });
const award = (key, value = true) => ({ id: `${key}:${value}`, type: "fact", key, value });
const atDocks = { type: "location", locationId: "bridge-docks" };
function shareRewards(definition) {
  const rewards = [...(definition.rewards || []), ...definition.stages.flatMap(stage => stage.transitions.flatMap(entry => entry.rewards || []))];
  for (const reward of rewards) if (rewards.filter(other => other.id === reward.id).length > 1) reward.shared = true;
}
const step = (objectiveId, description, actionTerms, nextStage, extra = {}) => ({ objectiveId, description, actionTerms, nextStage, ...extra });
const itemReward = (id, name, description, category, properties = {}) => ({ id: `flow.item.${id}`, type: "item", item: {
  instanceId: `flow-${id}`, itemId: id, name, description, discoveredInfo: description, category,
  quantity: 1, weight: 0.1, rarity: "少见", condition: "完好", tags: ["可检查"], importance: "normal", properties, source: "任务现场取得",
} });

export function configureWatchFlow(discovery, main) {
  discovery.version = 6;
  discovery.presentation.text += " 可去皇后区公共图书馆查文字与神秘符号的相关资料，或到希尔斯顿区商会街打听舅舅工作过的钟表行。";
  discovery.stages[0].guidance = "去公共图书馆查文字与符号的对应资料，或到商会街寻找舅舅的旧同事；两条路线任选其一。";
  const decode = discovery.stages[0].transitions[0];
  decode.requirements.push({ type: "any", conditions: ["queen-library", "hillston-market"].map(locationId => ({ type: "location", locationId, includeChildren: true })) });
  decode.description = "在公共图书馆解读纸条上的文字与符号，或在商会街钟表行请教旧同事；两条路线任选其一";
  decode.requirementMessage = "请先实际到达皇后区公共图书馆或商会街（含钟表行）解读纸条";
  main.version = 6;
  main.failWhen = [{ type: "stat", key: "health", max: 0 }];
  const s = Object.fromEntries(main.stages.map(stage => [stage.id, stage]));
  const mercy = s["mercy-decision"].transitions[0];
  const whistle = mercy.rewards.find(reward => reward.item?.itemId === "azik-copper-whistle");
  mercy.rewards = mercy.rewards.filter(reward => reward !== whistle);
  mercy.actionTerms = ["让他解脱", "结束他的生命", "结束舅舅的生命", "杀死舅舅", "杀死雷金纳德", "开枪", "致命"];
  mercy.rejectActionTerms = ["不杀", "不想杀", "不能杀", "不愿", "不肯", "拒绝", "不要", "不开枪", "不能开枪", "不想开枪", "放下枪", "是否", "能否", "如果"];
  mercy.requirements = [...(mercy.requirements || []), { type: "action", terms: ["舅舅", "雷金纳德", "让他解脱", "结束他的生命"] }];
  const ledger = main.rewards.filter(reward => /white-iris-identity|ledger/.test(reward.id));
  main.rewards = main.rewards.filter(reward => !ledger.includes(reward));
  const search = nextStage => step("search-warehouse-evidence", "实际搜查藏品柜和账册桌，取走铜哨与账册；不会自动发放", ["搜查", "搜索", "铜哨", "账册", "藏品"], nextStage, { requirements: [missing("watch.evidence-collected")], rewards: [whistle, ...ledger, award("watch.evidence-collected")] });
  s["trace-uncle"].guidance = "核对舅舅失踪前的档案和工作经历，然后前往南岸货栈。";
  s["enter-south-warehouse"].guidance = "首次抵达货栈听见富家小姐坠落的号外。正门紧锁，可沿外墙寻找排水道；询问工人获取当地消息。";
  s["enter-south-warehouse"].guidanceRules = [{ conditions: [fact("side.renard.completed"), fact("side.silent-detonator.completed")], text: "工人提起货栈昨晚出现异动。可以返回查看排水道入口；你之前找到的地方可能有了变化。" }];
  s["enter-south-warehouse"].transitions = [
    step("inspect-locked-drain", "发现内侧锁住的货栈支路铁栅；工人知道雷管承包商和失踪男孩的消息", ["搜索", "搜查", "排水道", "铁栅", "外墙", "入口"], "enter-south-warehouse", { requirements: [atDocks, missing("watch.drain-found")], rewards: [award("watch.drain-found")] }),
    step("enter-south-warehouse", "两条准备支线完成后再次调查，发现被不明人士撬开的铁栅并进入", ["进入", "潜入", "调查", "排水道"], "warehouse-bomb", { requirements: [atDocks, fact("side.renard.completed"), fact("side.silent-detonator.completed")], requirementMessage: "常规入口仍锁着；调查子爵求医与雷管消息，或使用确实具备的开门能力", rewards: [award("watch.official-entry")] }),
    step("enter-with-door-ability", "门途径使用适用开门能力提前进入；暂时无人，可以侦察或蹲守", ["开门", "穿过", "穿墙", "潜入", "能力"], "empty-warehouse", { requirements: [atDocks, { type: "character", kind: "extraordinary", pathwayId: "apprentice" }], rewards: [award("watch.early-entry")] }),
  ];
  const warning = "门外脚步逼近，舅舅的手探向枪套。最多还剩两次行动；继续拖延可能遭两名非凡者夹攻，官方不保证及时救援。";
  const retreat = step("withdraw-from-uncle", "不杀舅舅，暂时撤到安全位置；保留任务，不算完成", ["撤离", "撤退", "离开", "退开", "逃"], "outside-warehouse", { rewards: [award("watch.withdrawn")] });
  const defend = step("restrain-uncle", "实际夺枪或有效限制舅舅；证据必须是动作成功而非打算", ["夺枪", "缴械", "制住", "限制", "捆住"], "white-iris-confrontation", { rewards: [award("watch.uncle-restrained")] });
  s["confirm-control"].guidance = "先交谈、呼唤亲人、提及往事或展示怀表；他认得机械却认不出你。实际尝试后才判断现有手段似乎无法救回。";
  s["confirm-control"].transitions[0].actionTerms = ["交谈", "说话", "呼唤", "唤醒", "家人", "怀表", "试探"];
  s["mercy-decision"].guidance = "现有手段似乎无法救回他。是否让他解脱必须明确决定，也可以尝试救援或退开。";
  s["mercy-decision"].transitions = [mercy, retreat, step("attempt-uncle-rescue", "拒绝后允许一次实际救援尝试，反馈后发出脚步警告，开始两回合窗口", ["拒绝", "不杀", "救", "唤醒", "带走", "劝", "等待"], "last-chance")];
  s["white-iris-confrontation"].guidance = "白鸢尾现身，官方也在按自身计划行动。目标是脱身；组织身份有助接应但不保命，之后官方是否击退她与你无关。藏品柜与账册桌仍可搜查。";
  const outcomes = { "official-support-forced-retreat": "escaped-with-official-escort", "accelerated-official-support-forced-retreat": "escaped-with-priority-escort", "escaped-without-support": "escaped-during-official-raid" };
  for (const entry of s["white-iris-confrontation"].transitions) {
    entry.description = entry.description.replace("迫使白鸢尾撤退", "趁官方与白鸢尾冲突撤离；之后战斗由官方处理").replace("没有官方支援时", "没有个人接应时");
    entry.rewards = entry.rewards.map(reward => reward.key === "watch.white-iris-outcome" ? { ...reward, value: outcomes[reward.value] || reward.value } : reward);
  }
  s["white-iris-confrontation"].transitions.push(search("white-iris-confrontation"));
  main.stages = [s["trace-uncle"], s["enter-south-warehouse"],
    { id: "empty-warehouse", guidance: "货栈暂时无人但近期使用过。可侦察、查交接记录或蹲守，不强制补做支线。", transitions: [
      step("scout-warehouse", "侦察布局和藏身处，确认下一次交接约一小时后，避免无限等待", ["侦察", "调查", "查看", "记录", "布局"], "empty-warehouse", { requirements: [missing("watch.warehouse-scouted")], rewards: [award("watch.warehouse-scouted")] }),
      step("stakeout-warehouse", "明确蹲守至下一次交接（约一小时），人员抵达后展开潜入", ["蹲守", "等待", "交接", "守候"], "warehouse-bomb", { rewards: [award("watch.handover-arrived")] }),
      step("leave-early-warehouse", "离开空仓库继续准备，保留侦察收获", ["离开", "撤出", "返回"], "enter-south-warehouse"),
    ] }, s["warehouse-bomb"], s["find-uncle"], s["identify-sequence"], s["confirm-control"], s["mercy-decision"],
    { id: "last-chance", guidance: warning, transitions: [mercy, retreat, defend, search("last-chance")] },
    { id: "outside-warehouse", guidance: "你已退到安全位置，不能被强行拉回。若自愿返回，敌人已经到场。", transitions: [step("return-to-uncle", "自愿返回货栈，面对已经到场的两名敌人", ["返回", "进入", "救", "舅舅"], "double-ambush", { requirements: [atDocks] })] },
    { id: "double-ambush", guidance: "序列7白鸢尾与序列8舅舅两面夹攻，极可能撑不到救援。按能力、掩体和伤势结算攻击，不可自动获救；官方会介入但不会复活死者。", transitions: [
      step("escape-double-ambush", "运用预先掌握的路线、布局或开门能力，真实完成战斗撤离；求援本身不是脱身", ["逃", "撤离", "掩体", "排水道", "脱身"], "completed-escape", { complete: true, requirements: [{ type: "any", conditions: [fact("route.south-warehouse-drain"), fact("watch.warehouse-scouted"), { type: "character", kind: "extraordinary", pathwayId: "apprentice" }] }], rewards: [award("watch.white-iris-outcome", "escaped-double-ambush"), award("watch.white-iris-survived")] }),
      step("fall-in-ambush", "实际战斗生命归零，未撑到救援；失败不发奖励", ["战斗", "抵抗", "等待", "求援", "攻击", "逃", "躲", "救", "开枪"], "failed-ambush", { fail: true, requirements: [{ type: "stat", key: "health", max: 0 }] }),
    ] }, s["white-iris-confrontation"]];
  main.timers = [{ id: "approaching-enemy", turns: 2, stages: ["last-chance"], nextStage: "double-ambush", message: warning, rewards: [award("watch.ambush-triggered")] }];
  main.stages.find(stage => stage.id === "empty-warehouse").transitions.find(entry => entry.objectiveId === "stakeout-warehouse").elapsedMinutes = 60;
  for (const stage of main.stages) {
    if (["warehouse-bomb", "find-uncle", "identify-sequence", "confirm-control", "mercy-decision", "last-chance", "outside-warehouse", "double-ambush", "white-iris-confrontation"].includes(stage.id)) stage.finale = true;
    if (["enter-south-warehouse", "empty-warehouse"].includes(stage.id)) stage.dangerous = true;
  }
  shareRewards(main);
}

export function configureSideQuests(quests) {
  const [renard, detonator, drain] = quests;
  for (const quest of quests) { quest.version = 2; quest.expiresAfterTurns = null; }
  renard.eligibility = [];
  renard.appearWhen = [{ type: "any", conditions: [{ type: "action", terms: ["雷纳德", "求医", "药师", "富家小姐", "号外", "拍卖会"] }, { type: "all", conditions: [atDocks, fact("watch.formal-quest-unlocked")] }] }];
  renard.presentation.text = "号外：雷纳德子爵之女高空坠落，伤势暂时稳定，悬赏二十镑求医。买报或询问获得宅邸地址；非药师可由子爵引荐参加今晚拍卖会。回应后才算接受。";
  renard.stages[0].guidance = "前往皇后区宅邸确认伤势。药师可以亲自治疗；非药师请子爵引荐拍卖会，没钱也可找固定药师合作。";
  const secure = renard.stages.find(stage => stage.id === "secure-treatment");
  const recruit = secure.transitions.find(entry => entry.objectiveId === "recruit-apothecary");
  secure.transitions = secure.transitions.filter(entry => entry !== recruit);
  secure.guidance = "药师直接救治；有适用药剂也可治疗，否则由子爵引荐今晚拍卖会。药剂可选购买，合作路线无需先付钱。";
  secure.transitions.push(step("attend-renard-auction", "由子爵引荐并参加当晚拍卖会；药剂起拍3镑，本场成交4镑，固定药师埃德蒙·维尔主动交谈", ["拍卖", "引荐", "非凡者圈子", "晚会"], "auction-conversation", { rewards: [award("side.renard.auction-invited")] }));
  const medicine = itemReward("renard-healing-draught", "重伤治疗药剂", "适合本次骨折和内伤，不是晋升魔药。", "药剂");
  medicine.item.tags = ["消耗品"];
  const purchase = nextStage => step("buy-renard-medicine", "明确以4镑买下重伤治疗药剂；可跳过购买直接合作", ["买", "竞拍", "出价", "购买"], nextStage, { requirements: [{ type: "money", minPence: 960 }, missing("side.renard.medicine-bought")], requirementMessage: "需4镑且未购买；资金不足可直接与药师合作", rewards: [{ id: "side.renard.auction-cost", type: "money", amountPence: -960 }, medicine, award("side.renard.medicine-bought")] });
  const warning = award("knowledge.deep-control-irreversible");
  renard.rewards.push(warning);
  renard.stages.find(stage => stage.id === "shared-treatment").guidance = "与埃德蒙返回宅邸合作治疗，平分二十镑。他解释长期深度控制可能损伤自我，救活身体不等于找回原来的人。";
  renard.stages.push(
    { id: "auction-conversation", guidance: "固定药师埃德蒙·维尔主动询问求医目的，并谈及深度控制难以逆转。可买药，也可直接交谈。", transitions: [purchase("auction-conversation"), step("meet-edmund", "与埃德蒙交谈后，侍者邀请两人进入子爵包厢", ["交谈", "药师", "埃德蒙", "询问", "包厢"], "auction-box", { rewards: [award("side.renard.apothecary-met"), warning] })] },
    { id: "auction-box", guidance: "子爵请两人合作救治，明确平分二十镑。可以接受，也可用已买到的药剂独立救治。", transitions: [purchase("auction-box"), { ...recruit, description: "在包厢与埃德蒙明确约定合作并返回宅邸", actionTerms: ["合作", "同意", "接受", "药师"], rewards: [award("side.renard.cooperation-agreed")] }, { ...secure.transitions.find(entry => entry.objectiveId === "use-healing-medicine") }] },
  );
  secure.transitions.find(entry => entry.objectiveId === "attend-renard-auction").untilHour = 20;
  renard.stages[0].transitions[0].requirements = [{ type: "location", districts: ["皇后区"] }];
  renard.stages[0].transitions[0].requirementMessage = "先抵达皇后区雷纳德宅邸评估伤势";
  detonator.presentation.text += " 货栈旁工人可以指出承包商所在的拆除工地。";
  detonator.appearWhen = [{ type: "any", conditions: [{ type: "all", conditions: detonator.appearWhen }, { type: "all", conditions: [atDocks, fact("watch.drain-found"), { type: "action", terms: ["工人", "打听", "询问", "工具", "入口"] }] }] }];
  drain.presentation.text = "跑腿男孩在河岸排水道失踪。河岸入口与货栈支路铁栅不同，可以独立进入。进入后十回合：救人一至两回合、每次搜查一回合、撤离一回合。";
  const rescue = drain.stages.find(stage => stage.id === "rescue-dock-boy");
  const exit = drain.stages.find(stage => stage.id === "exit-drain");
  rescue.guidance = "先确认男孩位置和水位，可救人或搜查，救援不会因搜查重置。留一回合撤离，不突然追加步骤。";
  rescue.transitions[0].description = "花一回合救出男孩；他会跟随，不额外消耗照看回合";
  rescue.transitions[0].rewards = [award("side.iron-door.boy-rescued")];
  exit.guidance = "男孩已获救。可继续搜查或带他离开，撤离一回合。剩三回合建议收尾，剩一回合立即撤离。";
  const treasure = [
    ["cash", "清点零钱：480便士（2镑）", [{ id: "drain.loot.cash", type: "money", amountPence: 480 }]],
    ["gold", "搜查暗格取得碎金饰，估值3镑，出售才变为现金", [itemReward("drain-gold", "走私碎金饰", "小块黄金与碎金饰，估值3镑，实际售价需交易。", "贵重物品", { estimatedValuePence: 720 })]],
    ["gems", "搜查抽屉取得小宝石，估值2镑10苏勒", [itemReward("drain-gems", "一袋小宝石", "小宝石合计估值2镑10苏勒，不保证成交价。", "贵重物品", { estimatedValuePence: 600 })]],
    ["materials", "检查封装小盒，取得少量待鉴定的低级非凡材料", [itemReward("drain-materials", "待鉴定的低级非凡材料", "少量封装材料，尚不清楚具体用途，不自动获得配方。", "非凡材料", { identified: false })]],
  ];
  for (const stage of [rescue, exit]) {
    for (const [id, description, rewards] of treasure) stage.transitions.push(step(`search-drain-${id}`, description, ["搜", "检查", "清点", "暗格", "柜", "抽屉", "小盒"], stage.id, { requirements: [missing(`drain.searched.${id}`)], rewards: [...rewards, award(`drain.searched.${id}`)] }));
    stage.transitions.push(step("leave-drain-without-boy", "明确放弃救援撤离；保留已搜物品，不发救人奖励", ["放弃", "独自离开", "不救"], "abandoned-rescue", { fail: true }));
  }
  drain.timers = [{ id: "rising-tide", turns: 10, stages: ["rescue-dock-boy", "exit-drain"], nextStage: "flooded", fail: true, message: "进入后十回合。救人一至两回合，搜查每次一回合，撤离一回合；到期出口被淹、任务失败，不再补发奖励。" }];
  shareRewards(renard);
  shareRewards(drain);
  for (const stage of renard.stages) {
    if (["heal-renard-daughter", "shared-treatment", "auction-box", "secure-treatment"].includes(stage.id)) stage.majorDecision = true;
  }
  for (const stage of detonator.stages) {
    if (stage.id === "disarm-live-detonator") stage.dangerous = true;
  }
}
