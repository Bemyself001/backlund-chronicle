import { WATCH_NOTE_TEXT } from "../watchNote.js";

const fact = key => ({ type: "fact", key, value: true });
const missing = key => ({ type: "fact", key, not: true });
const here = { type: "location", locationId: "bridge-docks", includeChildren: true };
const pair = (text, cue = text) => ({ guidance: text, narrativeCue: cue });

// Player-facing directions only. No future objectives or concealed identities.
const stages = {
  "watch.heirloom.hidden-note": {
    "note-recovered": pair("一些鲁恩文字错落地夹在神秘符号之间，共同组成一句话，或许与舅舅雷金纳德{characterSurnameSuffix}的经历有关。皇后区公共图书馆、希尔斯顿区商会街，都可能有人认得。", "借纸条的字迹与舅舅的职业回忆，自然带出图书馆的旧资料和商会街钟表从业者两条线索，不替玩家作决定。"),
  },
  "watch.heirloom.late-hour": {
    "trace-uncle": pair(`译文写着“${WATCH_NOTE_TEXT}”舅舅雷金纳德{characterSurnameSuffix}的工作记录或熟悉他的从业者，或许能补上这段空白。`, "由纸条中白鸢尾的警告与账本已交还南岸货栈的原文承接调查，不添加暗号或交接时间，留下旧工作记录和知情人的方向；未抵达就不描写现场。"),
    "enter-south-warehouse": pair("桥区南岸货栈是目前最明确的去向。码头的消息，往往先传到工人和报童那里。"),
    "empty-warehouse": pair("货栈眼下无人，使用痕迹却很新。交接记录、内部布局和进出动静仍值得留意。"),
    "warehouse-bomb": pair("货栈入口附近的引线与装置挡住了去路。要继续往里，得先确认能否安全通过。", "让玩家看见引线或异常装置的可察觉痕迹，交代阻挡的位置；只给游戏层面的危险反馈，不写现实爆炸物制作或拆解教程。"),
    "find-uncle": pair("入口附近的危险已经处理，货栈深处的工作痕迹仍未查清。舅舅是否在这里，尚无答案。"),
    "identify-sequence": pair("雷金纳德还活着，却有了陌生的变化。他身边的记录、器具和自身表现，可能说明发生过什么。", "写出已经找到舅舅的现场，但先留下可观察的异常，不能凭空让玩家知道他的序列、遭遇或控制程度。"),
    "confirm-control": pair("身体与能力的变化已得到确认。熟悉的名字、往事与怀表，是否还能让他认出亲人？"),
    "mercy-decision": pair("他没有认出你，现有手段似乎救不回原来的他。靠近救援、保持距离或作出最后的决定，都只能由你选择。", "先回应实际交谈失败，表现他认得机械却不认得亲人；救援无望只是当前手段的判断，不代替玩家杀人。"),
    "last-chance": pair("脚步正从门外逼近，他的手也伸向枪套。留在原地的时间已不多。", "直接描写门外脚步和探向枪套的动作，同时明确剩余行动次数；允许救援、制止或撤离，不把拖延写成安全等待。"),
    "outside-warehouse": pair("你已经退到货栈外。里面的危险并未消失；是否再踏进去，仍由你决定。"),
    "double-ambush": pair("前后都已出现威胁。眼下值得寻找的是掩体与脱身的空隙，呼救不能保证有人及时赶到。", "反馈已经发生的夹攻，提示现有掩体、来路或已知出口；不能凭空赠送逃生路线、保证救援或直接判死。"),
    "white-iris-confrontation": pair("新的来人挡住去路，外面的动静也在逼近。保持距离、寻找出口，比停在原地更紧迫。", "用脚步、呼喊和冲突呈现官方介入造成的混乱；围绕玩家能察觉的脱身机会续写，不宣布官方已经击败对手。"),
  },
  "side.queens.renard-fall": {
    "assess-injury": pair("求医号外印着皇后区百合街的地址。抵达雷纳德子爵宅邸后，应先在门厅与子爵本人交谈。"),
    "secure-treatment": pair("子爵已说明普通医术救不了女儿。药师本人可在宅邸治疗；拿到任务专用的重伤治疗药剂后，在宅邸交给子爵即可视为开始并完成救治，独立路线当回合结算二十镑。普通外伤药膏不适用。", "说明药剂交付即可开始并成功完成救治，无需再让玩家声明治疗成功。"),
    "auction-conversation": pair("会场本轮唯一的治疗药剂拍品是适合骨折与内伤的重伤治疗药剂，成交价四镑；药师埃德蒙·维尔也在场。药剂取得后即可准备回宅邸救治。", "拍卖会只有这一种可用于高窗之下的药剂，不生成另一类灵性药剂或替代拍品。"),
    "auction-box": pair("侍者引来的包厢里，子爵希望你与埃德蒙共同救治女儿。报酬与分工还有待你们说定。"),
    "shared-treatment": pair("合作已谈妥。与埃德蒙回雷纳德宅邸完成治疗；若已拿到任务专用的重伤治疗药剂，在宅邸交给他即可开始并完成救治，玩家按约定领取十镑。"),
  },
  "side.bridge.silent-detonator": {
    "inspect-dud": pair("码头工人能指认桥区的拆除工地。承包商留下的哑火品和原包装，是调包事件的起点。"),
    "trace-theft": pair("调换痕迹已得到确认。承包商的交接记录、经手工人和失窃后的运货去向，可能连得起来。", "把本轮真实发现的调换痕迹衔接到交接记录或经手人的线索上；具体可查的现场细节由AI生成，但不能直接宣布找到最终买家。"),
    "disarm-live-detonator": pair("追查已经碰到了被启用的危险装置。附近人员的安全与退路，比继续盘问更要紧。", "表现危险装置已启用和现场人员的反应，提示隔离危险及寻求专业处置；不提供现实技术操作步骤。"),
  },
  "side.bridge.ebb-iron-door": {
    "find-iron-door": pair("南岸工人说，男孩最后出现在河岸退潮露出的铁门附近。这与货栈墙下锁住的支路不是同一个入口。"),
    "rescue-dock-boy": pair("男孩困在密室里，旁边还有走私者遗留的柜子和暗格。潮水在上涨，来时的出口仍要留意。", "交代男孩位置、可见财物容器与来时出口；救人只需一至两回合，可前后穿插搜查，不能隐藏撤离所需一回合。"),
    "exit-drain": pair("男孩已经脱困，能跟着你走。未查看的藏物还在，回水却正逼近出口。"),
  },
};

export function configureInvestigationGuidance(definitions) {
  for (const definition of definitions) {
    if (!stages[definition.id]) continue;
    definition.version += 1;
    definition.storyGuidance = true;
    for (const stage of definition.stages) {
      Object.assign(stage, stages[definition.id][stage.id]);
      delete stage.guidanceRules;
    }
  }
  const byId = Object.fromEntries(definitions.map(definition => [definition.id, definition]));
  const main = byId['watch.heirloom.late-hour'];
  const stage = (definition, id) => definition.stages.find(entry => entry.id === id);
  const branch = (id, conditions, text) => ({ id, conditions, text, narrativeCue: text });
  stage(main, 'enter-south-warehouse').guidanceRules = [
    branch('return-ready', [fact('side.renard.completed'), fact('side.silent-detonator.completed')], '南岸货栈那道锁住的入口还没有查清。此前的调查告一段落，那里值得再看一眼。'),
    branch('door-pathway', [here, { type: 'character', kind: 'extraordinary', pathwayId: 'apprentice' }], '锁住的铁栅后传来水声。对熟悉开门能力的人而言，普通锁具未必意味着道路到此为止。'),
    branch('renard-left', [fact('watch.drain-found'), fact('side.silent-detonator.completed'), missing('side.renard.completed')], '货栈支路仍锁着。先前报童提起的雷纳德宅邸求医消息，还没有下文。'),
    branch('detonator-left', [fact('watch.drain-found'), fact('side.renard.completed'), missing('side.silent-detonator.completed')], '货栈支路仍锁着。码头工人提起的拆除工地与雷管纠纷，还值得打听。'),
    branch('locked-drain', [fact('watch.drain-found')], '铁栅从内侧锁住，河岸另有通道的传闻。码头工人还谈起了拆除工地的麻烦，报童的求医号外也尚未查清。'),
    branch('at-docks', [here], '正门紧闭，墙脚能听见水声。货栈外，报童的号外与工人的交谈打破了寂静。'),
  ];
  stage(main, 'empty-warehouse').guidanceRules = [branch('scouted', [fact('watch.warehouse-scouted')], '交接记录留下约一小时后的时间，内部布局也已记住。等下去或先离开，都有依据了。')];
  stage(main, 'warehouse-bomb').guidanceRules = [branch('prepared', [fact('knowledge.dual-safety-detonator')], '入口的装置让你想起拆除工地遇到过的双保险雷管。那段经历或许能帮你判断眼前的危险。')];
  stage(main, 'mercy-decision').guidanceRules = [branch('remember-treatment', [fact('knowledge.deep-control-irreversible')], '他仍认不出你。高窗之下那次求医中，关于长期控制的认识，此刻有了令人不安的回响。是否靠近、退开或作最后的决定，仍由你选择。')];
  stage(main, 'white-iris-confrontation').guidanceRules = [
    branch('official', [{ type: 'organization', tag: 'official', status: 'active' }], '外面出现了熟悉的组织联络信号，但对手仍在近前。接应是一线机会，并不意味着此刻安全。'),
    branch('known-drain', [fact('route.south-warehouse-drain')], '你记得河岸那段排水道的去向。外面的冲突或许能为接近出口留下一点空隙。'),
  ];
  const renard = byId['side.queens.renard-fall'];
  stage(renard, 'secure-treatment').guidanceRules = [
    branch('apothecary', [{ type: 'character', kind: 'extraordinary', pathwayId: 'apothecary' }], '这些伤势需要药师的本领，而你自己就具备这方面的知识。子爵正等着你的判断。'),
    branch('medicine', [{ type: 'item', itemId: 'renard-healing-draught' }], '手中的重伤治疗药剂与小姐的伤势相符。雷纳德宅邸仍在等候消息。'),
  ];
  stage(renard, 'assess-injury').guidanceRules = [
    branch('at-estate', [{ type: 'location', locationId: 'queen-renard-estate', includeChildren: true }], '你在百合街宅邸门厅遇见正在询问病情的雷纳德子爵。他与仆人的短暂交谈透露：普通医生只能维持女儿的生命，真正的救治需要某种不能公开谈论的力量。子爵随后注意到你，等待你说明来意。'),
  ];
  stage(renard, 'auction-conversation').guidanceRules = [branch('bought', [fact('side.renard.medicine-bought')], '治疗药剂已经到手。会场里的埃德蒙仍愿意交谈，雷纳德宅邸的伤者也还在等候。')];
  stage(renard, 'auction-box').guidanceRules = [branch('has-medicine', [{ type: 'item', itemId: 'renard-healing-draught' }], '子爵提出合作，而你手中已有适用的药剂。如何安排救治，仍可在包厢里谈清楚。')];
  // A purchased medicine must not leave the player stranded in the auction stage.
  stage(renard, 'auction-conversation').transitions.push({ ...stage(renard, 'secure-treatment').transitions.find(entry => entry.objectiveId === 'use-healing-medicine') });
  stage(renard, 'auction-conversation').transitions.push({ ...stage(renard, 'secure-treatment').transitions.find(entry => entry.objectiveId === 'submit-healing-medicine') });
  byId['watch.heirloom.hidden-note'].completionGuidance = pair(`纸条完整译文：“${WATCH_NOTE_TEXT}”桥区南岸货栈与舅舅的旧工作记录是可继续调查的方向。`);
  main.completionGuidance = pair('你已离开货栈。手里真正带出的物品与记录，才是这场旧事留下的东西；其余疑点仍没有答案。');
  main.failureGuidance = pair('货栈中的追查在危险里中断。已经发生的损失不会因等待救援而消失。');
  renard.completionGuidance = pair('雷纳德宅邸的求医有了结果，子爵记下了这份人情。未了的调查仍留在你的手记里。', '回应已确认的治疗和酬金；玩家是药师时由其自身认识承接深度控制伏笔，否则由埃德蒙谈起，不让尚未见过的NPC凭空出现。');
  byId['side.bridge.silent-detonator'].completionGuidance = pair('承包商的酬谢已经交付。这次辨认危险装置的经历，也许会在别处派上用场。');
  byId['side.bridge.ebb-iron-door'].completionGuidance = pair('男孩已回到河岸。工人的信任与走过的排水道，成了新的联系；货栈支路的锁仍是另一回事。');
  byId['side.bridge.ebb-iron-door'].failureGuidance = pair('河岸救援已经结束，未取得的东西仍留在里面。未完成的货栈调查不以救回男孩为前提。');
  for (const definition of definitions.filter(entry => entry.storyGuidance)) {
    definition.presentation.text = {
      'watch.heirloom.hidden-note': stages['watch.heirloom.hidden-note']['note-recovered'].guidance,
      'watch.heirloom.late-hour': stages['watch.heirloom.late-hour']['trace-uncle'].guidance,
      'side.queens.renard-fall': '号外提起雷纳德子爵的女儿从高窗坠落，子爵正以二十镑求医。报童手中的告示印着皇后区宅邸的联络方式。',
      'side.bridge.silent-detonator': '码头工人提起桥区一处拆除工地：承包商怀疑雷管遭人调换，留下的哑火品仍在那里。',
      'side.bridge.ebb-iron-door': '跑腿男孩在南岸河边失踪，工人最后见他走向退潮露出的铁门。它和货栈墙下的锁栅并非同一个入口。',
    }[definition.id];
  }
}
