import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { processTriggers } from "../src/engine/triggerEngine.js";
import { migrateSave } from "../src/services/storage.js";
import { moneyToPence } from "../src/system/money.js";

function processTurn(game, turn, action, calls = []) {
  game.turn = turn - 1;
  const execution = executeToolCalls(game, calls, { playerAction: action });
  const progress = processTriggers(execution.game, { action, toolCalls: calls, toolResults: execution.results, turn });
  execution.game.turn = turn;
  return { game: execution.game, progress, results: execution.results };
}

test("initial occult guarantee is save-specific, bounded to turns 8-12, and offered once", () => {
  let left = createInitialGame({ ...EMPTY_CHARACTER, name: "保底甲" });
  const right = createInitialGame({ ...EMPTY_CHARACTER, name: "保底乙" });
  assert.ok(left.triggerState.nextInitialOccultWindow >= 8 && left.triggerState.nextInitialOccultWindow <= 12);
  assert.ok(right.triggerState.nextInitialOccultWindow >= 8 && right.triggerState.nextInitialOccultWindow <= 12);
  const window = left.triggerState.nextInitialOccultWindow;
  for (let turn = 1; turn < window; turn += 1) left = processTurn(left, turn, "等待片刻").game;
  assert.equal(left.triggerState.active.some((entry) => entry.status === "available"), false);
  assert.equal(left.triggerState.active.some((entry) => entry.status === "eligible"), true);
  left = processTurn(left, window, "继续处理日常事务").game;
  const entry = left.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  assert.equal(entry.status, "available");
  assert.equal(entry.expiresTurn, window + 10);
  assert.ok(left.triggerState.facts["occult.initial-entry-offered"]);
});

test("explicit refusal closes an available entry without recording occult contact", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "拒绝入口测试员" });
  ({ game } = processTurn(game, 1, "调查路边的异常暗号"));
  const entry = game.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  const abandon = { id: "abandon-entry", name: "trigger.abandon", args: { instanceId: entry.instanceId }, reason: "明确拒绝并不再追查" };
  const settled = processTurn(game, 2, "明确拒绝这条线索并停止追查", [abandon]);
  assert.equal(settled.results[0].ok, true);
  assert.equal(settled.game.triggerState.history.find((item) => item.instanceId === entry.instanceId)?.status, "abandoned");
  assert.equal(settled.game.occult.contact, 0);
  assert.equal(settled.game.occult.entryAvailable, false);
});

test("trigger instances remain stable across equivalent retries and survive save migration", () => {
  const source = createInitialGame({ ...EMPTY_CHARACTER, name: "稳定ID测试员" });
  const first = processTurn(structuredClone(source), 1, "调查异常物品").game;
  const retry = processTurn(structuredClone(source), 1, "调查异常物品").game;
  const firstEntry = first.triggerState.active.find((item) => item.status === "available");
  const retryEntry = retry.triggerState.active.find((item) => item.status === "available");
  assert.equal(firstEntry.instanceId, retryEntry.instanceId);
  const loaded = migrateSave(structuredClone(first));
  assert.equal(loaded.triggerState.active.find((item) => item.status === "available")?.instanceId, firstEntry.instanceId);
  assert.equal(loaded.triggerState.nextInitialOccultWindow, first.triggerState.nextInitialOccultWindow);
});

test("exploration can reveal an entry early; only available occupies the slot and it expires silently", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "入口测试员" });
  ({ game } = processTurn(game, 1, "调查车站公告上的异常符号"));
  const entry = game.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  assert.equal(entry.status, "available");
  ({ game } = processTurn(game, 2, "继续调查另一则可疑传闻"));
  assert.equal(game.triggerState.active.filter((item) => item.category === "occult-entry" && item.status === "available").length, 1);
  for (let turn = 3; turn <= 11; turn += 1) ({ game } = processTurn(game, turn, "处理自己的日常计划"));
  assert.equal(game.triggerState.active.some((item) => item.instanceId === entry.instanceId), false);
  assert.equal(game.triggerState.history.find((item) => item.instanceId === entry.instanceId)?.status, "expired");
  assert.equal(game.occult.entryAvailable, false);
});

test("explicit pursuit engages an occult entry, records contact, and frees the available slot", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "追查测试员" });
  ({ game } = processTurn(game, 1, "调查异常收据"));
  const entryId = game.occult.currentEntry.id;
  const contact = { id: "contact-entry", name: "occult.contact", args: { entryId }, reason: "主动追查收据来源" };
  const settled = processTurn(game, 2, "深入追查灰手套留下的收据", [contact]);
  game = settled.game;
  assert.equal(settled.results[0].ok, true);
  assert.equal(game.occult.contact, 1);
  assert.equal(game.triggerState.active.find((item) => item.instanceId === entryId)?.status, "engaged");
  assert.equal(game.occult.entryAvailable, false);

  ({ game } = processTurn(game, 3, "调查另一处异常记号"));
  assert.equal(game.triggerState.active.some((item) => item.category === "occult-entry" && item.status === "available"), true);
});

test("sequence 8 creates no new entry but can continue an entry that appeared at sequence 9", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "晋升边界", extraordinary: "low", pathway: "占卜家（序列9）" });
  ({ game } = processTurn(game, 1, "调查陌生的灵性符号"));
  const entry = game.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  assert.ok(entry);
  assert.equal(entry.definitionId, "occult.entry.seer.reversed-reflection");
  game.character.advancement.sequence = 8;
  game.character.advancement.sequenceLabel = "序列8";
  game.character.pathway = "占卜家（序列8）";
  const call = { id: "continue-after-promotion", name: "occult.contact", args: { entryId: entry.instanceId }, reason: "继续追查晋升前发现的入口" };
  ({ game } = processTurn(game, 2, "继续追查晋升前发现的入口", [call]));
  assert.equal(game.triggerState.active.find((item) => item.instanceId === entry.instanceId)?.status, "engaged");
  ({ game } = processTurn(game, 3, "调查新的异常入口"));
  assert.equal(game.triggerState.active.some((item) => item.category === "occult-entry" && item.status === "available"), false);
});

test("heirloom watch inspection advances one local fact at a time and rewards only once", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "怀表阶段测试员", talent: "heirloom-watch" });
  const watch = game.inventory.find((item) => item.itemId === "heirloom-watch");
  for (const [index, fact] of ["watch.exterior-inspected", "watch.inscription-found", "watch.mechanism-opened", "watch.note-recovered"].entries()) {
    const calls = [];
    if (index === 1) {
      const available = game.triggerState.active.find((item) => item.definitionId === "watch.heirloom.hidden-note");
      calls.push({ id: "engage-watch", name: "trigger.engage", args: { instanceId: available.instanceId }, reason: "明确继续拆查怀表" });
    }
    const call = { id: `watch-inspect-${index}`, name: "item.inspect", args: { instanceId: watch.instanceId, reveal: true }, reason: "继续检查家传怀表" };
    calls.push(call);
    const settled = processTurn(game, index + 1, "继续检查家传怀表并追查刻痕", calls);
    game = settled.game;
    assert.equal(settled.results.at(-1).ok, true);
    assert.ok(game.triggerState.facts[fact]);
    if (index === 0) assert.equal(game.triggerState.active.find((item) => item.definitionId === "watch.heirloom.hidden-note")?.status, "available");
  }
  const watchEvent = game.triggerState.active.find((item) => item.definitionId === "watch.heirloom.hidden-note");
  assert.equal(watchEvent.status, "engaged");
  assert.equal(watchEvent.stage, "note-recovered");
  assert.match(game.inventory.find((item) => item.instanceId === watch.instanceId).discoveredInfo, /速记符号/);

  const decodeCall = { id: "decode-watch", name: "trigger.progress", args: { instanceId: watchEvent.instanceId, objectiveId: "decode-watch-note", evidence: "用市政档案馆的旧速记表逐句核对出完整译文" }, reason: "找到可靠资料并完成辨认" };
  ({ game } = processTurn(game, 5, "查阅旧速记表并译出怀表纸条", [decodeCall]));
  assert.equal(game.triggerState.history.find((item) => item.instanceId === watchEvent.instanceId)?.status, "completed");
  assert.ok(game.triggerState.facts["watch.formal-quest-unlocked"]);
  assert.ok(game.clues.some((clue) => clue.id === "clue-watch-note-decoded"));
  assert.equal(game.triggerState.rewardsClaimed.filter((id) => id.startsWith("watch.hidden-note")).length, 2);

  processTriggers(game, { action: "重复提交", turn: 5 });
  assert.equal(game.clues.filter((clue) => clue.id === "clue-watch-note-decoded").length, 1);
  assert.equal(game.triggerState.rewardsClaimed.filter((id) => id.startsWith("watch.hidden-note")).length, 2);
});

test("special task progress is stage-bound and the watch main quest resolves through the non-official escape", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "迟到整点测试员", talent: "heirloom-watch", extraordinary: "low", pathway: "占卜家（序列9）" });
  game.triggerState.facts["watch.formal-quest-unlocked"] = { value: true, firstTurn: 0, evidenceIds: ["test"] };
  ({ game } = processTurn(game, 1, "查看怀表纸条译文"));
  const quest = game.triggerState.active.find((item) => item.definitionId === "watch.heirloom.late-hour");
  assert.equal(quest.status, "available");
  ({ game } = processTurn(game, 2, "开始追查雷金纳德与南岸货栈", [{ id: "main-engage", name: "trigger.engage", args: { instanceId: quest.instanceId }, reason: "主动调查家族旧事" }]));

  const progress = (turn, objectiveId, action, evidence = "本轮行动取得了足以确认阶段目标的可靠结果") => {
    const call = { id: `main-${objectiveId}`, name: "trigger.progress", args: { instanceId: quest.instanceId, objectiveId, evidence }, reason: evidence };
    const settled = processTurn(game, turn, action, [call]);
    game = settled.game;
    assert.equal(settled.results[0].ok, true, settled.results[0].reason);
  };

  progress(3, "trace-reginald", "追查雷金纳德的档案记录");
  game.location = { id: "bridge-docks", name: "桥区·南岸货栈", district: "贝克兰德桥区" };
  progress(4, "enter-south-warehouse", "进入南岸货栈仓库");
  progress(5, "survive-warehouse-bomb", "辨认引线后绕开仓库炸弹");
  progress(6, "find-reginald-alive", "搜查仓库并找到雷金纳德");
  progress(7, "identify-reginald-sequence", "检查痕迹确认雷金纳德是序列8考古学家");
  progress(8, "confirm-reginald-control", "试探并查明雷金纳德已成为受控傀儡");

  const invalid = processTurn(game, 9, "试图直接逃走", [{ id: "skip-mercy", name: "trigger.progress", args: { instanceId: quest.instanceId, objectiveId: "escape-white-iris", evidence: "试图跳过雷金纳德的生死决定" }, reason: "跳过当前阶段" }]);
  assert.equal(invalid.results[0].ok, false);
  assert.match(invalid.results[0].reason, /当前阶段/);

  progress(9, "release-reginald", "我明确开枪结束他的生命，让雷金纳德解脱", "玩家明确作出不可逆的解脱决定并亲手执行");
  assert.equal(game.triggerState.facts["watch.ra-released"].value, true);
  assert.ok(game.inventory.some((item) => item.itemId === "archaeologist-characteristic"));
  assert.ok(game.inventory.some((item) => item.itemId === "azik-copper-whistle"));
  progress(10, "escape-white-iris", "无法战胜白鸢尾，立刻撤退逃生", "没有官方支援，主角从短暂交手中脱身，白鸢尾仍然存活");

  assert.equal(game.triggerState.history.find((item) => item.instanceId === quest.instanceId)?.status, "completed");
  assert.equal(game.triggerState.facts["demoness.white-iris.true-name"].value, "塞西莉亚·沃恩");
  assert.equal(game.triggerState.facts["watch.white-iris-survived"].value, true);
  assert.equal(game.inventory.filter((item) => item.itemId === "azik-copper-whistle").length, 1);
});

test("Renard's daughter supports apothecary, shared-fee, and healing-draught outcomes", () => {
  const scenarios = [
    { name: "药师", pathway: "药师（序列9）", objective: "treat-as-apothecary", action: "以药师能力亲自治疗伤势", expected: 4800 },
    { name: "合作者", pathway: "占卜家（序列9）", objective: "shared", action: "与药师共同完成治疗并平分酬金", expected: 2400 },
    { name: "药剂", pathway: "占卜家（序列9）", objective: "use-healing-medicine", action: "给伤者使用重伤治疗药剂", expected: 4800 },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    let game = createInitialGame({ ...EMPTY_CHARACTER, name: scenario.name, extraordinary: "low", pathway: scenario.pathway });
    ({ game } = processTurn(game, 1, "查看隐秘组织中雷纳德寻找药师的委托消息"));
    const quest = game.triggerState.active.find((item) => item.definitionId === "side.queens.renard-fall");
    ({ game } = processTurn(game, 2, "接受并调查雷纳德女儿坠落事件", [{ id: `renard-engage-${index}`, name: "trigger.engage", args: { instanceId: quest.instanceId }, reason: "明确回应求医消息" }]));
    ({ game } = processTurn(game, 3, "抵达宅邸检查伤势", [{ id: `renard-assess-${index}`, name: "trigger.progress", args: { instanceId: quest.instanceId, objectiveId: "assess-renard-injury", evidence: "确认骨折与内伤仍在可治疗窗口内" }, reason: "完成伤情评估" }]));
    const before = moneyToPence(game.money);

    if (scenario.objective === "shared") {
      ({ game } = processTurn(game, 4, "寻找并说服一名药师合作", [{ id: "renard-recruit", name: "trigger.progress", args: { instanceId: quest.instanceId, objectiveId: "recruit-apothecary", evidence: "找到一名药师并谈妥平分二十镑酬金" }, reason: "药师同意合作" }]));
      ({ game } = processTurn(game, 5, scenario.action, [{ id: "renard-shared", name: "trigger.progress", args: { instanceId: quest.instanceId, objectiveId: "complete-shared-treatment", evidence: "两人合作稳定伤势并完成治疗" }, reason: "治疗完成" }]));
    } else {
      if (scenario.objective === "use-healing-medicine") game.inventory.push({ instanceId: "test-healing", itemId: "renard-healing-draught", name: "重伤治疗药剂", description: "适合内伤与骨折的治疗药剂", category: "药剂", quantity: 1, weight: 0.1, rarity: "少见", condition: "完好", tags: ["消耗品"], importance: "normal" });
      ({ game } = processTurn(game, 4, scenario.action, [{ id: `renard-finish-${index}`, name: "trigger.progress", args: { instanceId: quest.instanceId, objectiveId: scenario.objective, evidence: "治疗已经完成，伤者脱离危险" }, reason: "完成治疗" }]));
    }

    assert.equal(moneyToPence(game.money) - before, scenario.expected);
    assert.ok(game.triggerState.facts["noble.renard-favor"]);
    assert.ok(game.relationships.some((entry) => entry.id === "viscount-renard"));
    if (scenario.objective === "use-healing-medicine") assert.equal(game.inventory.some((item) => item.itemId === "renard-healing-draught"), false);
  }
});

test("official membership unlocks support while Azik's whistle cannot be used as a combat summon", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "官方分支测试员", talent: "heirloom-watch" });
  const joined = executeToolCalls(game, [{ id: "join-official", name: "organization.join", args: { organizationId: "nighthawks", name: "值夜者", kind: "official", evidence: "在圣赛缪尔教堂完成登记与正式宣誓" }, reason: "接受招募" }], { playerAction: "接受招募并宣誓加入值夜者" });
  assert.equal(joined.results[0].ok, true);
  game = joined.game;
  game.triggerState.active.push({ instanceId: "official-final", definitionId: "watch.heirloom.late-hour", category: "personal-story", status: "engaged", stage: "white-iris-confrontation", createdTurn: 1, expiresTurn: null, engagedTurn: 1, completedTurn: null, source: { action: "", evidenceIds: [] }, presentation: { title: "家传怀表：迟到的整点" }, stageHistory: [] });
  const support = processTurn(game, 1, "发出信号并坚持到值夜者支援赶到", [{ id: "official-support", name: "trigger.progress", args: { instanceId: "official-final", objectiveId: "survive-until-official-support", evidence: "所属官方组织的支援抵达，白鸢尾因暴露风险撤退" }, reason: "坚持等待支援" }]);
  assert.equal(support.results[0].ok, true);
  assert.equal(support.game.triggerState.facts["watch.white-iris-outcome"].value, "official-support-forced-retreat");

  const whistleGame = structuredClone(support.game);
  whistleGame.inventory.push({ instanceId: "whistle-test", itemId: "azik-copper-whistle", name: "阿兹克铜哨", description: "古老铜哨", category: "非凡物品", quantity: 1, weight: 0.05, rarity: "唯一", condition: "完好", tags: ["非凡物品", "可使用"], importance: "important" });
  const attack = executeToolCalls(whistleGame, [{ id: "whistle-attack", name: "item.use", args: { instanceId: "whistle-test" }, reason: "召唤信使攻击敌人" }], { playerAction: "吹哨命令信使攻击白鸢尾" });
  assert.equal(attack.results[0].ok, false);
  assert.match(attack.results[0].reason, /只负责送信/);
});

test("the detonator and ebb-tide side quests persist their main-quest preparation rewards", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "南岸准备测试员" });
  game.location = { id: "bridge-docks", name: "桥区·南岸货栈", district: "贝克兰德桥区" };

  ({ game } = processTurn(game, 1, "调查退潮排水道里的铁门和失踪码头男孩"));
  const drain = game.triggerState.active.find((item) => item.definitionId === "side.bridge.ebb-iron-door");
  ({ game } = processTurn(game, 2, "接受调查并进入排水道", [{ id: "drain-engage", name: "trigger.engage", args: { instanceId: drain.instanceId }, reason: "追查铁门" }]));
  for (const [turn, objectiveId, action] of [
    [3, "enter-before-tide", "趁退潮进入排水道铁门"],
    [4, "rescue-dock-boy", "从走私密室救出失踪男孩"],
    [5, "exit-before-flood", "带男孩在涨潮前离开出口"],
  ]) {
    ({ game } = processTurn(game, turn, action, [{ id: `drain-${objectiveId}`, name: "trigger.progress", args: { instanceId: drain.instanceId, objectiveId, evidence: "本轮行动完成了对应的排水道阶段目标" }, reason: "推进营救" }]));
  }
  assert.ok(game.triggerState.facts["route.south-warehouse-drain"]);
  assert.ok(game.relationships.some((entry) => entry.id === "bridge-dockworkers"));

  ({ game } = processTurn(game, 6, "检查拆除工地没有响的雷管和炸药调包痕迹"));
  const detonator = game.triggerState.active.find((item) => item.definitionId === "side.bridge.silent-detonator");
  ({ game } = processTurn(game, 7, "接受并检查哑火雷管", [{ id: "det-engage", name: "trigger.engage", args: { instanceId: detonator.instanceId }, reason: "追查调包" }]));
  for (const [turn, objectiveId, action] of [
    [8, "inspect-dud", "拆解检查哑火雷管"],
    [9, "trace-stolen-detonators", "追查被盗雷管的仓库买家"],
    [10, "disarm-live-detonator", "安全解除双保险雷管"],
  ]) {
    ({ game } = processTurn(game, turn, action, [{ id: `det-${objectiveId}`, name: "trigger.progress", args: { instanceId: detonator.instanceId, objectiveId, evidence: "本轮行动取得了对应爆破阶段的可靠结果" }, reason: "推进雷管调查" }]));
  }
  assert.ok(game.triggerState.facts["knowledge.dual-safety-detonator"]);
  assert.ok(game.inventory.some((item) => item.itemId === "blasting-tool-kit"));
});

test("seer example quest uses the shared format, explicit engagement, stages, and deduplicated rewards", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "占卜任务测试员", extraordinary: "low", pathway: "占卜家（序列9）" });
  ({ game } = processTurn(game, 1, "使用占卜记录反复出现的预兆"));
  const quest = game.triggerState.active.find((item) => item.definitionId === "pathway.seer.first-omen");
  assert.equal(quest.status, "available");
  const engage = { id: "engage-omen", name: "trigger.engage", args: { instanceId: quest.instanceId }, reason: "主动验证这组征兆" };
  ({ game } = processTurn(game, 2, "主动验证这组反复出现的征兆", [engage]));
  assert.equal(game.triggerState.active.find((item) => item.instanceId === quest.instanceId)?.stage, "trace-the-omen");
  const trace = { id: "trace-omen", name: "clue.add", args: { clue: { id: "omen-trace", title: "预兆的重复轨迹", detail: "三次占卜出现相同征兆。" } }, reason: "记录重复轨迹" };
  ({ game } = processTurn(game, 3, "追踪并记录预兆", [trace]));
  assert.equal(game.triggerState.active.find((item) => item.instanceId === quest.instanceId)?.stage, "record-fulfilment");
  const fulfilment = { id: "omen-result", name: "clue.add", args: { clue: { id: "omen-result", title: "征兆应验结果", detail: "现实结果完成印证。" } }, reason: "记录最终结果" };
  ({ game } = processTurn(game, 4, "记录征兆应验的结果", [fulfilment]));
  assert.equal(game.triggerState.history.find((item) => item.instanceId === quest.instanceId)?.status, "completed");
  assert.ok(game.triggerState.facts["pathway.seer.first-omen.completed"]);
  assert.equal(game.clues.filter((clue) => clue.id === "clue-seer-first-omen").length, 1);
});
