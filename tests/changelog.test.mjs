import test from "node:test";
import assert from "node:assert/strict";
import { LATEST_UPDATE } from "../src/data/changelog.js";

test("latest update contains displayable release notes", () => {
  assert.match(LATEST_UPDATE.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(LATEST_UPDATE.title.trim());
  assert.ok(LATEST_UPDATE.summary.trim());
  assert.ok(LATEST_UPDATE.changes.length >= 3);
  assert.ok(LATEST_UPDATE.changes.every((change) => change.trim()));
});
