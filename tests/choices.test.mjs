import assert from "node:assert/strict";
import test from "node:test";
import { hasUsableChoices, injectOccultEntryChoice } from "../src/services/choices.js";

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
