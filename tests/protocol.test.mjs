import assert from "node:assert/strict";
import test from "node:test";
import { extractJson, normalizeAIResponse, textFromContent } from "../src/services/protocol.js";

test("extractJson reads fenced and embedded balanced objects", () => {
  assert.equal(extractJson('```json\n{"narrative":"门上写着 {勿入}"}\n```').narrative, "门上写着 {勿入}");
  assert.equal(extractJson('说明文字 {"narrative":"雾起"} 后续文字').narrative, "雾起");
});

test("plain text API responses continue as narrative with fallback choices", () => {
  const result = normalizeAIResponse("煤气灯忽然熄灭，楼梯上传来第三个人的脚步声。");
  assert.match(result.narrative, /煤气灯/);
  assert.equal(result.choices.length, 3);
  assert.match(result.protocolWarning, /普通文本/);
  assert.equal(result.choiceMeta.source, "fallback");
});

test("content-part arrays and alternate action fields are normalized", () => {
  assert.equal(textFromContent([{ type: "text", text: "第一段" }, { text: { value: "第二段" } }]), "第一段\n第二段");
  assert.equal(textFromContent({ type: "text", text: "单段正文" }), "单段正文");
  const result = normalizeAIResponse({ content: [{ text: "回声" }], actions: ["检查窗台"] });
  assert.equal(result.narrative, "回声");
  assert.equal(result.choices[0].label, "检查窗台");
  assert.equal(result.choices.length, 3);
});

test("native tool calls remain usable when the assistant content is empty", () => {
  const nativeCall = { id: "call-1", name: "clue.add", args: { name: "灰烬" } };
  const result = normalizeAIResponse("", [nativeCall]);
  assert.equal(result.toolCalls[0], nativeCall);
  assert.match(result.narrative, /本地规则校验/);
  assert.equal(result.requiresToolFollowUp, true);
});

test("native state tools require local follow-up even when preliminary content exists", () => {
  const nativeCall = { id: "call-1", name: "status.add", args: { status: { id: "alert", name: "警觉" } }, native: true };
  const result = normalizeAIResponse("你暂时停下脚步。", [nativeCall]);
  assert.equal(result.hasNarrative, true);
  assert.equal(result.requiresToolFollowUp, true);
});

test("ui choice tools populate choices without entering the state tool channel", () => {
  const result = normalizeAIResponse("雨声沿着窗框落下。", [{
    id: "choice-call",
    name: "ui.present_choices",
    native: true,
    args: { choices: [
      { label: "检查窗框上的新鲜划痕", intent: "investigate", risk: "low" },
      { label: "询问房东昨夜的访客", intent: "social", risk: "medium" },
      { label: "翻窗追赶屋顶上的人影", intent: "dangerous", risk: "high" },
    ] },
  }]);
  assert.equal(result.choiceMeta.source, "model");
  assert.equal(result.choices.length, 3);
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.requiresToolFollowUp, false);
});

test("incomplete JSON tool calls are ignored with an actionable warning", () => {
  const result = normalizeAIResponse({
    narrative: "雨声压过了远处的钟响。",
    toolCalls: [{}, { name: "status.add", args: { status: { id: "alert", name: "警觉" } } }],
  });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, "status.add");
  assert.match(result.protocolWarning, /不完整工具调用/);
  assert.doesNotMatch(result.protocolWarning, /未知工具/);
});

test("choice parser accepts alternate action fields and text labels", () => {
  const result = normalizeAIResponse({ narrative: "街灯下有人停步。", nextActions: [
    { text: "检查街角的脚印", intent: "investigate", risk: "low" },
    { title: "询问巡夜人", intent: "social", risk: "medium" },
    { action: "跟上黑伞客", intent: "dangerous", risk: "high" },
  ] });
  assert.equal(result.choiceMeta.source, "model");
  assert.deepEqual(result.choices.map((choice) => choice.label), ["检查街角的脚印", "询问巡夜人", "跟上黑伞客"]);
});
