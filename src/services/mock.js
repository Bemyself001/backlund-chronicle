import { makeId } from "../utils/id.js";

function includesAny(text, words) { return words.some((word) => text.includes(word)); }

export async function mockResponse(game, action, signal, onChunk) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 650);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("请求已中止", "AbortError")); }, { once: true });
  });
  const lower = action.toLowerCase();
  let narrative;
  let toolCalls = [];
  if (includesAny(lower, ["封蜡", "检查信", "调查房间", "观察"])) {
    narrative = "你没有立刻破坏封口，而是把信移到煤油灯下。倒置钟形纹章的凹槽里，嵌着一层几乎看不见的蓝灰粉末。用笔记本边缘轻轻一刮，粉末散出类似雨后石灰墙的气味。玛拉看见它时，手指无意识地收紧了。\n\n“埃利奥特那晚也一直擦手，”她说，“像是碰过什么脏东西。”\n\n信封夹层随之滑出半张被火燎过的车票：目的地栏并非车站，而写着“十一点零七分”。窗外，旧钟塔又传来一次短促的金属摩擦声。";
    toolCalls = [
      { id: makeId("mock"), name: "clue.add", reason: "封蜡检查揭示了骨粉成分", args: { clue: { id: "black-wax", title: "黑色封蜡", detail: "倒置钟形封蜡里掺有带石灰气味的蓝灰色骨粉。" } } },
      { id: makeId("mock"), name: "inventory.add", reason: "从信封夹层取出", args: { item: { itemId: "scorched-ticket", name: "烧焦的时刻票", category: "线索", description: "半张受潮车票，目的地栏写着“十一点零七分”。", quantity: 1, weight: 0.02, rarity: "少见", tags: ["线索", "可检查"], source: "黑函夹层" } } },
    ];
  } else if (includesAny(lower, ["玛拉", "询问", "打听", "交涉"])) {
    narrative = "你没有追问信的来历，而是先请玛拉回忆埃利奥特点过什么。这个寻常问题让她稍稍放松：杜松子酒，一口未动；热水，两壶；还借走了修壁炉用的细铁钩。\n\n她从柜台暗格取出一张被酒渍浸过的便笺。“这是他留下的。我原本不想惹麻烦。”便笺上只有一行地址，指向市档案馆后门对面的废弃洗衣房。玛拉把它交给你，却仍按住一角：“如果钟响第三次，就别在街上抬头。”";
    toolCalls = [{ id: makeId("mock"), name: "relationship.update", reason: "耐心询问降低了玛拉的戒备", args: { npcId: "mara", delta: 4, note: "你尊重她的节奏，她愿意提供埃利奥特留下的便笺。" } }];
  } else if (includesAny(lower, ["钟塔", "追踪", "闯", "冒险"])) {
    narrative = "你推门走进雨幕。旧钟区的煤气灯一盏接一盏熄灭，像有什么东西沿街追赶你的影子。抵达废车场时，钟塔仍停在十一点零七分；但每一扇蒙尘表盘后，都浮着一层刚刚凝结的水汽。\n\n你翻过生锈围栏，鞋底踩碎一枚空玻璃安瓿。辛辣气味直冲鼻腔，视野边缘的砖墙仿佛向内倾斜。高处传来拖动铁链的声音——不是风。你及时握住罗盘，指针正死死指向塔门下方的排水沟。";
    toolCalls = [
      { id: makeId("mock"), name: "location.move", reason: "玩家主动前往旧钟塔区域", args: { locationId: "clock-yard", district: "灰檐港旧钟区" } },
      { id: makeId("mock"), name: "status.add", reason: "吸入不明安瓿的残留气体", args: { status: { id: `vertigo-${game.turn + 1}`, name: "轻微眩晕", kind: "danger", description: "感知偶尔出现倾斜；下一次高风险行动需谨慎。" } } },
    ];
  } else {
    narrative = `你选择了“${action}”。这个行动没有立刻招来回答，却让一个原本不起眼的细节浮出水面：旅店墙上所有钟表的秒针都比你的怀表慢了七秒。\n\n玛拉看了一眼门外，又看向楼梯尽头那间上锁的客房。“埃利奥特最后一次来时，也注意到了这个。”她把一枚备用钥匙放在柜台上，却没有推过来，“想进去可以。但你得先告诉我，如果里面有人叫你的名字，你会不会回答？”`;
    toolCalls = [{ id: makeId("mock"), name: "dice.check", reason: "判断玩家是否察觉钟表同步异常", args: { difficulty: 10, modifier: 2 } }];
  }
  onChunk?.(narrative);
  return {
    narrative,
    toolCalls,
    memoryNotes: [`第${game.turn + 1}轮：玩家选择“${action.slice(0, 40)}”。`],
    worldEvents: game.turn === 1 ? ["港务局宣布旧钟区部分街道因地基渗水临时封闭。"] : [],
    choices: [
      { label: "比对钟声、罗盘与现有记录", intent: "investigate", risk: "low" },
      { label: "寻找目击者并交换有限信息", intent: "social", risk: "medium" },
      { label: "趁异常尚未消退直入源头", intent: "dangerous", risk: "high" },
    ],
  };
}

