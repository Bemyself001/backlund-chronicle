// Only these explicit discoveries may disclose fixed-story character information.
const WATCH = "watch.heirloom.late-hour";
const NOTE = "watch.heirloom.hidden-note";
const RENARD = "side.queens.renard-fall";
const DRAIN = "side.bridge.ebb-iron-door";
const DETONATOR = "side.bridge.silent-detonator";
const fact = key => ({ fact: key });
const clue = id => ({ clue: id });
const quest = id => ({ quest: id });
const stage = (questId, ...stages) => ({ quest: questId, stages });
const any = (...conditions) => ({ any: conditions });
const event = (id, when, source, text, patch = {}) => ({ id, when, source, text, patch });
const decoded = any(fact("watch.formal-quest-unlocked"), clue("clue-watch-note-decoded"), quest(WATCH));
const ledger = clue("clue-demoness-south-bank-ledger");
const irisEncounter = stage(WATCH, "white-iris-confrontation", "double-ambush");
const renardKnown = any(quest(RENARD), fact("side.renard.completed"));
const edmundMet = any(fact("side.renard.apothecary-met"), stage(RENARD, "auction-conversation", "auction-box", "shared-treatment"));

export const STORY_PEOPLE = [
  {
    id: "reginald", name: "雷金纳德{characterSurnameSuffix}", role: "你的舅舅",
    connection: "家传怀表的上一位主人；你的家族旧事与他有关。",
    questIds: [NOTE, WATCH],
    discoveries: [
      event("remembered", any(fact("watch.note-recovered"), quest(NOTE), decoded), "家传怀表", "你想起舅舅数年前失踪，怀表后来被身份不明的人送回家中。", { contact: "known", status: "下落待查" }),
      event("old-records", clue("clue-missing-uncle-history"), "失踪前的旧档", "旧档确认他曾是序列9通识者，失踪前在南岸货栈追查军火与文物交接。", { role: "你的舅舅 · 曾为序列9通识者", lastKnownLocation: "桥区南岸货栈（失踪前的记录）" }),
      event("found", any(fact("watch.uncle-found-alive"), stage(WATCH, "identify-sequence")), "货栈调查", "你在货栈内找到仍然活着的舅舅。", { contact: "met", status: "已找到", lastKnownLocation: "桥区南岸货栈" }),
      event("sequence", any(fact("watch.uncle-sequence-confirmed"), clue("clue-uncle-forced-advancement")), "非凡身份调查", "已确认他被强制晋升为序列8考古学家，失去自主行动能力。", { role: "你的舅舅 · 序列8考古学家", contact: "met" }),
      event("control", fact("watch.control-confirmed"), "与舅舅交谈", "尝试呼唤、交谈后，你确认他受人控制，现有手段似乎无法将他唤回。", { status: "受控制" }),
      event("restrained", fact("watch.uncle-restrained"), "货栈行动", "你成功限制了舅舅的行动；这并不等于解除控制。", { status: "行动受限", contact: "met" }),
      event("released", fact("watch.uncle-released"), "你的决定", "你决定结束舅舅的生命，让他解脱。", { contact: "met", status: "已故" }),
    ],
  },
  {
    id: "white-iris", name: "白鸢尾", role: "纸条中出现的代号",
    aliases: ["塞西莉亚·沃恩"], connection: "她的警告出现在舅舅留下的纸条中。",
    questIds: [WATCH],
    discoveries: [
      event("mentioned", decoded, "怀表纸条译文", "纸条提及白鸢尾的警告，她的身份仍需查证。"),
      event("encountered", irisEncounter, "货栈遭遇", "你在南岸货栈与白鸢尾遭遇，脱身成为眼前的要事。", { contact: "met", role: "货栈事件中的对手", status: "曾与你敌对", lastKnownLocation: "桥区南岸货栈" }),
      event("identity", any(ledger, fact("demoness.white-iris.true-name")), "南岸账册", "账册确认白鸢尾的真名为塞西莉亚·沃恩，是序列7魔女。", { name: "塞西莉亚·沃恩", alias: "白鸢尾", role: "魔女会成员 · 序列7魔女" }),
      event("escaped", fact("watch.white-iris-outcome"), "货栈撤离", "你已经从货栈冲突中脱身，之后她的去向未获确认。", { contact: "met", status: "曾与你敌对" }),
    ],
  },
  {
    id: "red-lady", name: "红夫人", role: "魔女会成员 · 序列6欢愉",
    connection: "南岸账册中记载的白鸢尾上级。", questIds: [WATCH],
    discoveries: [event("ledger", ledger, "南岸账册", "白鸢尾服从代号红夫人的上级；其真名仍被严密遮蔽。")],
  },
  {
    id: "viscount-renard", name: "雷纳德子爵", role: "皇后区贵族",
    connection: "为坠楼受伤的女儿悬赏求医。", questIds: [RENARD],
    discoveries: [
      event("notice", renardKnown, "求医消息", "子爵悬赏二十镑寻找救治女儿的办法，告示留下了百合街宅邸的地址。"),
      event("met", stage(RENARD, "secure-treatment", "auction-conversation", "auction-box", "shared-treatment", "completed-apothecary", "completed-medicine", "completed-shared"), "宅邸交谈", "你与雷纳德子爵见面，了解女儿的伤势和求医委托。", { contact: "met", status: "委托人", lastKnownLocation: "皇后区百合街 · 雷纳德宅邸" }),
      event("favor", any(fact("side.renard.completed"), fact("noble.renard-favor")), "高窗之下", "女儿获救后，子爵记下了你的人情。", { contact: "met", status: "欠你一次人情", lastKnownLocation: "皇后区百合街 · 雷纳德宅邸" }),
    ],
  },
  {
    id: "renard-daughter", name: "雷纳德小姐", role: "雷纳德子爵之女",
    connection: "求医委托中的伤者；尚未获知她的姓名。", questIds: [RENARD],
    discoveries: [
      event("notice", renardKnown, "求医消息", "她从高窗坠落，普通医生只能暂时维持伤势。", { status: "等待救治" }),
      event("treated", fact("side.renard.completed"), "救治结果", "雷纳德小姐已经获救，求医委托完成。", { contact: "met", status: "已获救", lastKnownLocation: "皇后区百合街 · 雷纳德宅邸" }),
    ],
  },
  {
    id: "edmund-vair", name: "埃德蒙·维尔", role: "药师",
    connection: "在求医委托中结识的药师。", questIds: [RENARD],
    discoveries: [
      event("met", edmundMet, "拍卖会交谈", "埃德蒙与你谈起求医目的，也提及长期深度控制可能损伤自我。", { contact: "met" }),
      event("cooperation", any(fact("side.renard.cooperation-agreed"), stage(RENARD, "shared-treatment")), "合作约定", "你们约定共同救治雷纳德小姐，并平分二十镑酬金。", { contact: "met", status: "合作伙伴" }),
      event("treated", any(stage(RENARD, "completed-shared"), { reward: "side.renard.pay-shared" }), "共同救治", "你与埃德蒙完成救治，按约定各得十镑。", { contact: "met", status: "曾共同救治", lastKnownLocation: "皇后区百合街 · 雷纳德宅邸" }),
    ],
  },
  {
    id: "bridge-contractor", name: "桥区拆除承包商", role: "拆除工程承包商",
    connection: "雷管调包事件的委托人；尚未获知其姓名。", questIds: [DETONATOR],
    discoveries: [
      event("reported", quest(DETONATOR), "码头工人的消息", "承包商怀疑整箱雷管被人调换，一枚哑火品留在工地。"),
      event("completed", fact("side.silent-detonator.completed"), "没有响的雷管", "你完成了雷管调查，并获得承包商的酬谢。", { status: "已完成委托" }),
    ],
  },
  {
    id: "dock-boy", name: "码头跑腿男孩", role: "南岸码头的跑腿男孩",
    connection: "退潮后的铁门调查中的失踪者；尚未获知其姓名。", questIds: [DRAIN],
    discoveries: [
      event("missing", quest(DRAIN), "码头失踪消息", "男孩在河岸排水道失踪，工人提到他曾在退潮时发现铁门。", { status: "下落待查" }),
      event("found", stage(DRAIN, "rescue-dock-boy", "exit-drain"), "河岸排水道", "你找到困在密室中的男孩。", { contact: "met", status: "等待脱困", lastKnownLocation: "河岸排水道密室" }),
      event("rescued", fact("side.iron-door.boy-rescued"), "救援行动", "男孩已经脱困，能够跟着你撤离。", { contact: "met", status: "已脱困" }),
      event("safe", fact("side.ebb-iron-door.completed"), "退潮后的铁门", "你带男孩在出口被淹前安全离开。", { contact: "met", status: "已安全撤离", lastKnownLocation: "南岸码头" }),
    ],
  },
  {
    id: "azik-eggers", name: "阿兹克·艾格斯", role: "铜哨所联系的收信人",
    connection: "你得到了一枚可以向他寄信的铜哨。", questIds: [WATCH],
    discoveries: [event("whistle", { item: "azik-copper-whistle" }, "阿兹克铜哨", "铜哨可召来向阿兹克送信的骸骨信使。获得铜哨不代表已经与他见面或建立交情。")],
  },
];
