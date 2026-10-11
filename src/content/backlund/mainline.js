// 原创游戏主线。铜哨的信使用途与塔罗代号参照第一部设定，案件和玩家入会均为游戏改编。
// https://lordofthemysteries.fandom.com/wiki/Klein_Moretti/Equipment
// https://lordofthemysteries.fandom.com/wiki/Tarot_Club/List_of_Members
import { AZIK_WHISTLE_REWARD } from "./specialQuests/watch.js";

const fact = key => ({ id: `${key}.reward`, type: "fact", key, value: true });
const clue = (id, title, detail, locationId) => ({ id: `${id}.reward`, type: "clue", clue: { id, title, detail, kind: "mainline", ...(locationId ? { locationId } : {}) } });

export const MAINLINE = {
  id: "mainline.fogbound-name", title: "雾中无名者", version: 1,
  description: "一份被改写的善款名册，把你带向失落的记忆，以及灰雾之上的一张空椅。",
  chapters: [
    { id: "ledger", title: "第一章 · 被抹去的名字", summary: "核实一笔旧善款，找回被删去的捐助记录。" },
    { id: "memory", title: "第二章 · 记忆的收信人", summary: "追索档案中的旧影，与阿兹克建立联系。" },
    { id: "tarot", title: "第三章 · 灰雾上的空椅", summary: "回应新的邀请，决定是否以自己的代号加入塔罗会。" },
  ],
  // 使用本游戏第一部时间线中未被既有成员占用的席位。
  codenames: ["女祭司", "皇帝", "教皇", "力量", "高塔"],
  steps: [
    {
      id: "newspaper", chapter: "ledger", title: "旧报上的更正", locationId: "queen-library", minutes: 20,
      label: "查阅旧报与募捐启事", objective: "在公共图书馆核对救济基金的旧报启事。",
      scene: "公共图书馆的馆员正在为一份旧报补写索引。募捐启事下方有一行手写更正：最后一位捐助人的名字，与市政名册上的墨迹并不相同。",
      narrative: "你把启事的日期与收款编号抄在纸上。馆员找出同周的更正栏：受助者确实收到了款项，但捐助人的署名在重新装订时被涂去了。\n\n这不是凭空消失的钱，而是一个被从记录里抹去的人。馆员把可公开查阅的市政卷宗编号写给你，下一步已有了着落。",
      rewards: [clue("mainline.donation-number", "被涂去的捐助人", "救济基金旧报启事与更正栏使用同一收款编号，署名却被涂去；市政档案馆保存着对应名册。", "queen-archive")],
    },
    {
      id: "donation-ledger", chapter: "ledger", title: "留下来的账目", locationId: "queen-archive", minutes: 30,
      label: "核对原始收款名册", objective: "带着编号到市政档案馆查阅原始收款名册。",
      scene: "办事员按编号取出一册装订牢固的账簿。更改过的署名旁，还留着另一位经手人的签名和码头交接单号。",
      narrative: "账目的金额、日期和收据能够一一对应。你确认善款没有被侵吞：有人只是借重新誊写名册的机会，将一位长期捐助人的身份藏了起来。\n\n附页记着一只装有旧照片与私人信件的箱子，后来由码头保管处接收。你取得公开登记的交接编号，足以向保管人核对它的去向。",
      rewards: [clue("mainline.cargo-number", "私人旧箱的交接号", "善款真实到账；被删去姓名的捐助人还留下一只旧箱，码头保管处有可核对的交接编号。", "dock-workers-square")],
    },
    {
      id: "cargo-record", chapter: "ledger", title: "箱子里的合影", locationId: "dock-workers-square", minutes: 25,
      label: "核验保管箱交接记录", objective: "在装卸工广场找保管人核验旧箱的登记。",
      scene: "保管人对照你的编号，在柜台上展开交接簿。他允许你查看已公开归档的照片副本，原物仍由保管处留存。",
      narrative: "合影边缘站着一位肤色偏古铜的男子。他没有签全名，只在背面写下受助家庭的住址。照片后的交接页提到一位退休记录员：当年的更名手续正是他经手的。\n\n保管人替你核实了记录员现在收信的地点——雾鸦旅店。你带走登记副本，终于有了能对这次改名作证的人。",
      rewards: [clue("mainline.photo-copy", "旧合影副本", "捐助人的照片留有受助家庭地址；退休记录员可在雾鸦旅店接受事先约好的核对。", "soot-lamp")],
    },
    {
      id: "witness", chapter: "ledger", title: "替人保守的秘密", locationId: "soot-lamp", minutes: 25,
      label: "与记录员核对更名经过", objective: "在雾鸦旅店核对证词，完成善款名册调查。",
      scene: "退休记录员认出了合影。他先确认受助者没有遭到追索，才讲起当年那位不愿留下姓名的捐助人。",
      narrative: "“钱是他自己捐的。后来他回来，连自己为什么认识这一家人都记不清了。”记录员把更名申请推到你面前，“我按他的请求删了名字，却保留了原件。”\n\n你把证词与账目放在一起，确认了名册被改写的原因，也洗清了经手人的嫌疑。案子到这里已经能够结清；唯独照片背面的笔迹，竟和另一份早了数十年的寄居登记十分相像。记录员给出了那份登记的索引。",
      rewards: [fact("mainline.ledger.completed"), clue("mainline.old-register-index", "相隔数十年的笔迹", "名册改写是捐助人主动要求，并无贪污；另一份年代更早的寄居登记出现相似笔迹，原件在市政档案馆。", "queen-archive")],
    },
    {
      id: "old-register", chapter: "memory", title: "相隔数十年的签名", locationId: "queen-archive", minutes: 30,
      label: "比对两份寄居登记", objective: "在市政档案馆比对寄居登记与旧照片上的签名。",
      scene: "两份登记来自不同年代，纸张、印章和经手人的记录都能互相印证。相似的笔迹因此更显得异常。",
      narrative: "你逐项排除了誊抄和装订错误。两位登记人留下过不同姓名，却都在备注里提到过同一个家庭。你没有据此断言他们就是同一个人，而是记下了可以进一步核验的墓册编号。\n\n这一页的空白不再只是某个人的笔误。它像一段反复断开的经历，等待有人把两端放回一起。",
      rewards: [clue("mainline.repeated-handwriting", "两份可靠的旧登记", "不同年代的两份原始登记出现相似笔迹，并提及同一家人；仅凭这些尚不能确认登记人的真实身份。", "city-cemetery")],
    },
    {
      id: "cemetery-register", chapter: "memory", title: "仍有人记得", locationId: "city-cemetery", minutes: 25,
      label: "请管理人核对墓册", objective: "在静眠墓地管理处核对这家人的墓册与访客记录。",
      scene: "墓地管理人允许你核对公开墓册。夹在登记页里的近年便条上，同样有人询问过这家人的往事。",
      narrative: "管理人确认了墓册年代，也找出了近期留下的一份查询便条。署名是阿兹克·艾格斯，一位正在查访旧事的历史研究者。\n\n你说明只想把资料交给同样在寻找答案的人。管理人通过便条上的公开联络方式约好在公共图书馆见面，没有把墓册外借，也没有替你编造那段空白里的故事。",
      rewards: [clue("mainline.azik-appointment", "阿兹克的查询便条", "阿兹克·艾格斯曾查询同一家人的旧事，已经通过管理人约定在公共图书馆核对资料。", "queen-library")],
    },
    {
      id: "azik-meeting", chapter: "memory", title: "温和的陌生人", locationId: "queen-library", minutes: 25,
      label: "与阿兹克当面核对档案", objective: "赴公共图书馆之约，将可靠记录与推测分开交给阿兹克。",
      scene: "阅览室靠窗的位置坐着一位肤色古铜的先生。他的目光在合影上停留了一会儿，随后请你讲清资料的来处。",
      narrative: "“阿兹克·艾格斯。”他温和地介绍自己。你依次说明账目、证词与墓册，明确指出哪些只是推测。\n\n他没有否认照片带来的熟悉感，也没有急着给出答案。“我的记忆有一些空缺。这些记录对我很有帮助，但我不能用猜测来填满它们。”他请你保留原始出处，把一份副本留给他慢慢辨认。你们的第一次见面，就从这份坦诚开始。",
      rewards: [fact("person.azik-eggers.met"), clue("mainline.azik-memory-gaps", "阿兹克承认的记忆空缺", "阿兹克当面承认自己存在记忆空缺，愿意继续核对资料；他尚未确认照片涉及的完整往事或更深身份。")],
    },
    {
      id: "copper-whistle", chapter: "memory", title: "一位收信人", locationId: "queen-library", minutes: 15,
      label: "交付档案副本并接过铜哨", objective: "在图书馆交付副本，取得以后联系阿兹克的方式。",
      scene: "阿兹克把抄有来源的副本收好。他要继续旅行查访，临别前却留下了一种不依赖邮局的联络办法。",
      narrative: "阿兹克将一枚古老的铜哨放到你掌心，讲解如何召来他的骸骨信使。信使会替你送信，而不是代替你战斗。\n\n“有新的发现，或者有想不通的事情，可以写信给我。”他停了停，又补上一句，“记得先照顾好自己。”\n\n你收好铜哨。此后可以在「人物对话」里自由写信，往来信件会和这份档案一同保存。",
      legacyNarrative: "阿兹克认出了你已经持有的铜哨，确认它仍能联系自己的信使。他接过档案副本，重新示范了寄信的方法，没有再交给你第二枚铜哨。\n\n“有新的发现，或者有想不通的事情，可以写信给我。记得先照顾好自己。”\n\n「人物对话」会保存此后的往来信件。",
      rewards: [fact("mainline.memory.completed"), { id: "mainline.azik.whistle", type: "item", item: { ...AZIK_WHISTLE_REWARD.item, instanceId: "reward-mainline-azik-whistle", source: "阿兹克亲手交付", properties: { recipient: "阿兹克·艾格斯", messengerCombatCapable: false, attractsUndead: true } } }],
    },
    {
      id: "first-letter", chapter: "tarot", title: "第一封回信", locationId: "soot-lamp", minutes: 30,
      label: "寄出考证结果并等候回信", objective: "在雾鸦旅店整理案件结果，用铜哨向阿兹克寄信。",
      scene: "你已经为旧档案找回了可靠的出处。把查证过程写成一封清楚的信，或许比继续猜测照片上的秘密更有用。",
      letter: "阿兹克先生：善款与更名经过已经核实。我保留了登记副本和墓册出处，仍无法解释相隔数十年的相似笔迹。我愿意继续查证，但不会把猜测当作事实。",
      reply: "我收到了你的信，也感谢你保留了疑问。那家人的名字令我感到熟悉，却还不足以拼起一段完整的经历。继续相信可以核对的证据，别为了一个答案贸然接近危险。图书馆的馆员另有一份寄给调查人的留言，请你亲自核实；那封留言并不是我写的。——阿兹克",
      narrative: "你在安静处吹响铜哨，把信交给无声出现的骸骨信使。稍后，信使送回一封措辞温和的回信。阿兹克感谢你区分证据与猜测，并提醒你核实图书馆的一份新留言。\n\n这封往来已经收入「人物对话」。留言的寄件人仍待确认，阿兹克也没有替对方作出保证。",
      rewards: [clue("mainline.library-message", "另一位寄件人的留言", "阿兹克回信提到公共图书馆收到一份给调查人的留言，明确说明并非自己所写，应亲自核实。", "queen-library")],
    },
    {
      id: "invitation", chapter: "tarot", title: "寄给调查人的邀请", locationId: "queen-library", minutes: 20,
      label: "核验留言并阅读邀请", objective: "回到公共图书馆，核验写给调查人的密封留言。",
      scene: "馆员交出的信封上只有你案件里的公开登记号。内页准确区分了已经结案的善款调查与仍未证实的记忆疑点。",
      narrative: "留言赞许的是你的求证方式，而不是你尚未拥有的力量。末尾附着一片带有灰色纹路的封蜡，写明：愿意继续了解，便在安全私密之处触碰它，并明确表示接受会面的邀请。\n\n你核对过登记号与交接记录，将邀请收好。它只是一份可回应的邀请；是否赴约，仍需要你亲自决定。",
      rewards: [fact("mainline.tarot.invited"), clue("mainline.gray-fog-invitation", "灰雾会面的邀请", "邀请已核实交接出处；可在雾鸦旅店的私密处回应封蜡，接受一次会面。赴约和正式入会是两个独立决定。", "soot-lamp")],
    },
    {
      id: "gray-fog", chapter: "tarot", title: "长桌前的空椅", locationId: "soot-lamp", minutes: 10,
      label: "回应邀请，前往灰雾会面", objective: "在雾鸦旅店安顿好身体与行囊，再亲自回应邀请。",
      scene: "封蜡的灰色纹路沉静如水。你已备好安全的落脚处，可以接受会面，也可以留待以后。",
      narrative: "你在旅店房间里回应邀请。意识越过层层灰雾，一张古老长桌逐渐清晰，尽头的身影示意你坐下。\n\n“你可以称呼我为愚者。”\n\n你被告知这里以塔罗牌作为代号，交换信息与委托须尊重约定，也要守住成员的隐私。空椅已经留好，但入会尚未替你决定。你可以挑选一个空缺代号，明确接受，也可以暂时告退。你的身体和随身行囊仍留在旅店。",
      rewards: [fact("mainline.tarot.audience")],
    },
    {
      id: "tarot-oath", chapter: "tarot", title: "属于你的塔罗牌", locationId: "soot-lamp", minutes: 10,
      label: "确认代号，正式加入塔罗会", objective: "选择未被占用的塔罗代号，亲自确认入会；也可暂缓加入。",
      scene: "长桌上的几张牌面向你展开。愚者等待你的答复，灰雾遮住了其他人的真实面孔。",
      narrative: "你报出自己的塔罗代号，明确接受聚会的约定。愚者轻轻颔首，属于你的牌留在席前。\n\n“欢迎加入塔罗会。”\n\n这一次，你坐在自己的席位上。交换信息、接受委托与建立信任，将成为往后的生活；关于记忆的谜团仍在，但你已经有了能够亲自发声的地方。会面结束后，意识回到旅店。",
      rewards: [fact("mainline.tarot.joined")],
    },
  ],
};

export const MAINLINE_TRIGGER = {
  id: MAINLINE.id, version: 1, category: "mainline", localOnly: true, oncePerSave: true,
  eligibility: [], appearWhen: [{ type: "always", not: true }], initialStage: MAINLINE.steps[0].id, engagedStage: MAINLINE.steps[0].id,
  presentation: { title: MAINLINE.title, text: MAINLINE.description }, storyGuidance: true,
  completionGuidance: { guidance: "你已亲自加入塔罗会，正式代号保存在主线档案与角色身份中。", narrativeCue: "三章原创主线已完成。只有本地登记的塔罗身份有效，不改变玩家既有官方组织身份。" },
  stages: MAINLINE.steps.map((step, index) => ({
    id: step.id, locationId: step.locationId, guidance: `${step.objective} 在特殊行动的主线档案中继续。`, narrativeCue: step.scene,
    majorDecision: true, finale: index === MAINLINE.steps.length - 1,
    transitions: [{ objectiveId: step.id, description: step.label, actionTerms: [step.label], elapsedMinutes: step.minutes,
      requirements: [{ type: "location", locationId: step.locationId }], requirementMessage: "请到达当前目标地点，通过主线档案确认行动。",
      nextStage: MAINLINE.steps[index + 1]?.id || "completed", complete: index === MAINLINE.steps.length - 1, rewards: step.rewards }],
  })),
};

export const DIALOGUE_PEOPLE = [{
  id: "azik-eggers", name: "阿兹克·艾格斯", shortName: "阿兹克先生", channel: "信使书信", requiredItemId: "azik-copper-whistle",
  description: "吹响铜哨，由骸骨信使递送信件。写下问题，或只是告诉他你最近的经历。",
  persona: "你是阿兹克·艾格斯。以温和、耐心、有阅历的历史研究者口吻回信，关心写信者的安危，承认自己记忆有空白。先回应对方实际说的话，可以适度追问，避免说教或重复套话。只使用已披露经历；不要泄露隐藏身份、途径序列、神明关系、原作未来事件或他人真名。不要主动揭示塔罗会成员身份，也不自称塔罗会成员或替愚者招募。",
  topics: ["我想请您帮忙分析已经确认的线索。", "您最近有没有想起一些熟悉的人或地方？", "我想和您聊聊我在贝克兰德的近况。"],
}];
