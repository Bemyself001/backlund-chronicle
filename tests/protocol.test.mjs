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
});
