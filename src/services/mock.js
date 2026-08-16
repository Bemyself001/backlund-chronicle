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
  if (includesAny(lower, ["地图", "公告", "招工", "租房", "观察", "查看车站"])) {
    narrative = "你先把行李放在脚边，逐栏读完站内公告。城市地图把贝克兰德切成彼此相连又截然不同的区域：东区有最便宜的床位和最多的临时工作；桥区的旅店与小商行需要识字的帮工；皇后区的公共图书馆在白天允许访客查阅旧报。你可以先解决生计，也可以只选一条看顺眼的街道走下去。\n\n公告栏右下角压着几则互不相干的消息：钟表铺招聘学徒、教会施粥点征求登记员、货运公司寻找丢失账箱。最底下是一张三日前的失踪启事，照片中的夜班文员与第七码头黑色皮箱上的行李牌同姓。那也可能只是巧合。没有人注意你读到了这里，更没有人要求你负责。";
  } else if (includesAny(lower, ["搬运工", "询问", "打听", "交涉", "住宿", "工作", "茶摊"])) {
    narrative = "你拦住一位正靠着空行李车歇气的搬运工。他先打量你的鞋和箱子，确认你不像来查票的主管，才肯分享实用消息：铁门街的床位按周计价，桥区的店主更看重介绍信，若想找体面的文书工作，最好明早去皇后区的报馆街。\n\n他没有追问你的来历，只用下巴朝几个出口分别点了点。“想安稳，就在天黑前找房；想挣钱，东边仓库今晚还缺人；想听故事，去茶摊坐到末班车。”说完，他重新推起车，把选择完整地留给你。";
  } else if (includesAny(lower, ["第七码头", "皮箱", "异常声", "封闭", "行李车"])) {
    narrative = "你主动绕过写着“暂停使用”的黄铜隔离牌，沿第七码头外缘接近那辆行李车。金属碰撞声并不来自皮箱内部，而来自箱底：一枚黄铜行李牌被细线系在车架上，每隔七秒便在蒸汽余震中敲击一次。\n\n牌面编号本应对应北上的早班列车，却又被刻上一行很新的小字——“11:07，旧钟街”。远处有巡站员提灯经过，但尚未看见你。你现在可以记下编号后离开、设法询问失物处，也可以冒险打开皮箱；这条线索不会妨碍你转身去做别的事。";
    toolCalls = [{ id: makeId("mock"), name: "clue.add", reason: "玩家主动检查第七码头的异常行李车", args: { clue: { id: "crossed-platform", title: "被划去的站台", detail: "行李车底的黄铜牌标着北上列车编号，背面新刻有“11:07，旧钟街”。" } } }];
  } else if (includesAny(lower, ["铁门街", "找住处", "廉价旅店"])) {
    narrative = "你决定先把落脚处安顿下来。离开车站后，东区的雨变得更细，铁门街两侧依次亮起煤气灯。洗衣房的蒸汽越过低矮屋顶，廉价旅店的招牌在风里相互碰撞；你可以比较房价、去酒馆打听零工，或继续沿街探索。车站里的异响被留在身后，没有追上来。";
    toolCalls = [{ id: makeId("mock"), name: "location.move", reason: "玩家选择先在东区寻找落脚处", args: { locationId: "iron-gate", district: "贝克兰德东区" } }];
  } else if (includesAny(lower, ["桥区", "雾鸦旅店"])) {
    narrative = "你搭上一辆驶往桥区的公共马车。车轮穿过积水，沿途的厂房逐渐被商铺、仓库与狭窄公寓取代。雾鸦旅店的黄铜招牌在雨里泛着暗光，门边的小黑板写着空房价格，也写着“代收信件、介绍短工”。你可以租房、用餐、结识老板，或只是把这里当作继续前往别处的中转站。";
    toolCalls = [{ id: makeId("mock"), name: "location.move", reason: "玩家自由选择前往桥区", args: { locationId: "soot-lamp", district: "贝克兰德桥区" } }];
  } else if (includesAny(lower, ["皇后区", "图书馆", "查报纸"])) {
    narrative = "你确认了前往皇后区的路线。此刻公共图书馆已经闭馆，但门廊下仍贴着开放时间与阅览规则，附近的报摊出售过去一周的晚报合订本。你可以先从报纸入手、在周边寻找住处，或等到明早再正式查阅档案。城市并不因你的到来停止运转，新的消息仍不断被印上纸面。";
    toolCalls = [{ id: makeId("mock"), name: "location.move", reason: "玩家自由选择前往皇后区查找公开资料", args: { locationId: "queen-library", district: "贝克兰德皇后区" } }];
  } else {
    narrative = `你选择了“${action}”。贝克兰德没有替你规定这个决定必须通向何处：眼前的人群、街道与公共交通都照常运转，你的行动只会引起与之相称的回应。\n\n在${game.location.name}，你仍能改变计划。可以先处理食宿与工作，也可以结识当地人、跨区旅行，或主动追查某个让你在意的异常。那些没有被选择的事件不会凭空消失，却也不会突然把你拖入一条既定路线。`;
  }
  onChunk?.(narrative);
  return {
    narrative,
    toolCalls,
    memoryNotes: [`第${game.turn + 1}轮：玩家选择“${action.slice(0, 40)}”。`],
    worldEvents: game.turn === 1 ? ["东区铁路公告称浓雾导致两班夜车取消，滞留旅客开始寻找临时住处。"] : [],
    choices: [
      { label: "整理地图与公告，规划自己的下一站", intent: "investigate", risk: "low" },
      { label: "找当地人打听住处、工作和街区消息", intent: "social", risk: "medium" },
      { label: "主动接近一处尚未解释的异常", intent: "dangerous", risk: "high" },
    ],
  };
}
