import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSession } from "../src/native/session.js";
import { createInitialGame } from "../src/system/game.js";

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
test("native JSON codec removes credentials from imported web saves", () => {
  const game = createInitialGame({ ...session().catalog().character, name: "已有角色" });
  game.apiKey = "secret-key"; game.apiSettings = { apiKey: "secret-key" };
  const s = createNativeSession(); s.load({ payload: { game } });
  assert.equal(JSON.stringify(s.export()).includes("secret-key"), false);
});
