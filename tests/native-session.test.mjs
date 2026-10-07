import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSession } from "../src/native/session.js";
import { createInitialGame } from "../src/system/game.js";
import { quickWaitPreview } from "../src/engine/quickWait.js";

const completion = (content, toolCalls = []) => ({ choices: [{ message: { content, tool_calls: toolCalls.map((call, index) => ({ id: `call-${index}`, type: "function", function: { name: call.name.replace(".", "__"), arguments: JSON.stringify(call.args) } })) } }] });
const narrative = completion(JSON.stringify({ narrative: "你完成行动，记下了眼前已确认的变化。", choices: [{ label: "继续观察街边的人群", risk: "low" }, { label: "向店主询问工作", risk: "low" }, { label: "沿街道寻找旅店", risk: "medium" }] }));
function session() { const instance = createNativeSession(); instance.create({ character: { name: "原生验证" } }); return instance; }

test("native engine exposes all creation pathways and JSON-compatible saves", () => {
  const s = session();
  assert.equal(s.catalog().pathways.length, 22);
  const payload = s.export();
  const next = createNativeSession();
  assert.equal(next.load({ payload }).id, s.view().id);
  assert.equal(payload.format, "backlund-chronicle-save");
  assert.equal(s.view().map.cells.length > 0, true);
});
test("cancelled native planning does not spend time, advance turns, or consume items", () => {
  const s = session(); const before = s.export().game;
  s.begin({ action: "跳过时间2小时", settings: { apiKey: "must-not-be-saved" } });
  s.plan({ response: completion('{"toolCalls":[]}', []) });
  s.settle();
  assert.deepEqual(s.export().game, before);
  s.cancel();
  assert.deepEqual(s.export().game, before);
  assert.equal(JSON.stringify(s.export()).includes("must-not-be-saved"), false);
});
test("native time skip uses the settled clock in narrative and commits exactly once", () => {
  const s = session(); const clock = s.view().worldTime;
  s.begin({ action: "跳过时间2小时" });
  s.plan({ response: completion('{"toolCalls":[]}', []) });
  const rendering = s.settle();
  assert.equal(s.view().turn, 0);
  assert.equal(JSON.stringify(rendering).includes("worldTime"), true);
  s.finish({ response: narrative });
  assert.equal(s.view().turn, 1);
  assert.notEqual(s.view().worldTime, clock);
  assert.throws(() => s.finish({ response: narrative }), /没有可提交/);
});
test("native failed validation rolls back the entire tool transaction", () => {
  const s = session(); const before = s.export().game;
  s.begin({ action: "买一件不存在的物品" });
  assert.throws(() => s.plan({ response: completion("", [{ name: "money.remove", args: { amount: { pounds: 1000 } } }]) }), /规则核验未完成/);
  s.cancel(); assert.deepEqual(s.export().game, before);
});
test("native load rejects invalid saves before replacing the existing archive", () => {
  const s = session(); const id = s.view().id;
  assert.throws(() => s.load({ payload: { character: { name: "坏档" }, inventory: [], turn: -1 } }));
  assert.equal(s.view().id, id);
});
test("native offline waiting and save roundtrip preserve commission state", () => {
  const s = session();
  const next = s.special({ operation: "wait", hours: 24, revision: s.view().special.revision, expectedTurn: 0, expectedWorldTime: s.view().worldTime });
  assert.equal(next.turn, 1);
  const restored = createNativeSession(); restored.load({ payload: s.export() });
  assert.equal(restored.view().worldTime, next.worldTime);
  assert.deepEqual(restored.view().journal.issued, next.journal.issued);
});

test("native clock projects all durations across midnight without changing or exporting UI state", () => {
  const s = session();
  const payload = s.export();
  payload.game.worldTime = "1349年 10月17日 · 周二 · 19:20";
  s.load({ payload });
  const before = s.export();
  const wait = s.view().quickWait;
  assert.equal(wait.disabledReason, "");
  assert.equal(wait.minHours, 1);
  assert.equal(wait.maxHours, 24);
  assert.equal(wait.previews.length, 24);
  assert.deepEqual(wait.previews[5], quickWaitPreview(before.game, 6));
  assert.equal(wait.previews[5].endClock, "01:20");
  assert.equal(wait.previews[5].dayLabel, "次日");
  assert.equal(wait.previews[23].endClock, "19:20");
  assert.equal(wait.previews[23].dayLabel, "次日");
  assert.deepEqual(s.export().game, before.game);
  assert.equal("quickWait" in s.export().game, false);
});

test("native clock exposes combat restrictions and preserves local confirmation gating", () => {
  const s = session();
  const payload = s.export();
  payload.game.combat = { enemies: [{ id: "clock-foe", name: "时钟测试敌人", maxHealth: 1, status: "active", health: 1, stunnedThroughTurn: 99 }] };
  s.load({ payload });
  const before = s.export();
  assert.match(s.view().quickWait.disabledReason, /战斗中无法快速等待/);
  assert.throws(() => s.special({ operation: "wait", hours: 1, revision: s.view().special.revision, expectedTurn: s.view().turn, expectedWorldTime: s.view().worldTime }), /战斗中无法快速等待/);
  assert.deepEqual(s.export().game, before.game);
});
test("native JSON codec removes credentials from imported web saves", () => {
  const game = createInitialGame({ ...session().catalog().character, name: "已有角色" });
  game.apiKey = "secret-key"; game.apiSettings = { apiKey: "secret-key" };
  const s = createNativeSession(); s.load({ payload: { game } });
  assert.equal(JSON.stringify(s.export()).includes("secret-key"), false);
});

test("native issued commissions preserve string revisions and deliver one or two clues", () => {
  const s = session();
  const raw = createInitialGame({ ...s.catalog().character, name: "委托人", startingDistrict: "乔伍德区" });
  raw.triggerState.facts["person.sherlock-moriarty.met"] = { value: true, firstTurn: 0 };
  raw.money = { pounds: 5, solers: 0, pence: 0 };
  s.load({ payload: raw });
  function run(action, options = {}) {
    const initial = s.begin({ action, options });
    if (initial.complete) return;
    s.plan({ response: completion('{"toolCalls":[]}') }); s.settle(); s.finish({ response: narrative });
  }
  run("委托夏洛克·莫里亚蒂调查舅舅失踪的线索，先商定费用与交付时间", { personConversation: "sherlock-moriarty" });
  let task = s.view().journal.issued[0];
  assert.equal(typeof task.revision, "string");
  run("查看进度", { questTrackingRequest: { id: task.id, revision: task.revision } });
  assert.equal(s.view().turn, 1);
  run("确认委托", { questTrackingRequest: { id: task.id, revision: task.revision, routeId: "commission:accept" } });
  assert.equal(s.view().journal.issued[0].commission.phase, "investigating");
  s.special({ operation: "wait", hours: 24, revision: s.view().special.revision, expectedTurn: s.view().turn, expectedWorldTime: s.view().worldTime });
  task = s.view().journal.issued[0];
  run("领取报告", { questTrackingRequest: { id: task.id, revision: task.revision, routeId: "commission:collect" } });
  const report = s.view().journal.issued[0].commission.report;
  assert.ok(report.clues.length >= 1 && report.clues.length <= 2);
  for (const clue of report.clues) assert.ok(s.view().storyHistory.at(-1).content.includes(clue.title));
  assert.equal(s.view().turn, 4);
  assert.equal(s.export().game.money.pounds, 4);
});

test("native explicit travel corrects a missing planner move", () => {
  const s = session();
  const destination = s.view().map.locations.find(location => ["discovered", "visited"].includes(location.knowledge.status) && location.id !== s.view().location.id);
  assert.ok(destination);
  s.begin({ action: `前往${destination.name}` });
  s.plan({ response: completion('{"toolCalls":[]}') }); s.settle(); s.finish({ response: narrative });
  assert.equal(s.view().location.id, destination.id);
  assert.equal(s.view().turn, 1);
});
