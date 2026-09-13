import assert from "node:assert/strict";
import test from "node:test";
import { choiceResult, hasUsableChoices, hasValidModelChoices, injectOccultEntryChoice, modelChoices, normalizeChoices } from "../src/services/choices.js";

const choices = [
  { label: "检查窗边残留的泥水", intent: "investigate", risk: "low" },
  { label: "向值夜人询问访客记录", intent: "social", risk: "medium" },
  { label: "冒险跟上刚离开的黑伞客", intent: "dangerous", risk: "high" },
];

test("choice validation requires exactly three distinct concrete labels", () => {
  assert.equal(hasUsableChoices(choices), true);
  assert.equal(hasUsableChoices(choices.slice(0, 2)), false);
  assert.equal(hasUsableChoices([choices[0], choices[0], choices[2]]), false);
});

test("choice validation allows repeated risks but rejects unknown risk values", () => {
  const situationalChoices = [
    { label: "留在柜台前核对这张收据", intent: "verify", risk: "low" },
    { label: "去后门等那名迟到的送货员", intent: "wait", risk: "low" },
    { label: "先回住处整理今天得到的线索", intent: "leave", risk: "medium" },
  ];
  assert.equal(hasUsableChoices(situationalChoices), true);
  assert.equal(hasUsableChoices(situationalChoices.map((choice, index) => index === 2 ? { ...choice, risk: "extreme" } : choice)), false);
});

test("a locally authorized occult entry replaces one valid high-risk option", () => {
  const entry = { choice: { label: "追查这条非凡入口（可选）", intent: "occult", risk: "medium" } };
  const injected = injectOccultEntryChoice(choices, entry);
  assert.equal(injected.length, 3);
  assert.equal(injected.some((choice) => choice.intent === "occult"), true);
  assert.equal(injected.some((choice) => choice.intent === "investigate"), true);
});

test("occult injection does not manufacture choices when AI choices are unavailable", () => {
  const entry = { choice: { label: "追查这条非凡入口（可选）", intent: "occult", risk: "medium" } };
  assert.deepEqual(injectOccultEntryChoice([], entry), []);
});

test("shared model validation accepts short labels and all-low risks", () => {
  const result = choiceResult(["等待", "敲门", "离开"].map(label => ({ label, risk: "low" })));
  assert.equal(hasValidModelChoices(result), true);
  assert.deepEqual(result.choices.map(choice => choice.risk), ["low", "low", "low"]);
});

test("normalization retains partial actions, deduplicates and limits without inventing risk", () => {
  const partial = choiceResult([null, { label: " " }, " 等待 ", "等待", { text: "敲门", risk: "extreme" }]);
  assert.equal(partial.choiceMeta.source, "partial");
  assert.deepEqual(partial.choices.map(choice => choice.label), ["等待", "敲门"]);
  assert.deepEqual(partial.choices.map(choice => choice.risk), ["unknown", "unknown"]);
  assert.equal(hasValidModelChoices(partial), false);
  assert.equal(normalizeChoices(["甲", "乙", "丙", "丁"]).length, 3);
});

test("legacy fabricated fallback choices are never reused for recovery", () => {
  assert.deepEqual(modelChoices({ choices, choiceMeta: { source: "fallback" } }), []);
});
