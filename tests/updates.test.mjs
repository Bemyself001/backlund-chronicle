import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { checkForUpdate, compareVersions } = await import("../src/services/updates.js");

test("semantic Android release versions compare correctly", () => {
  assert.equal(compareVersions("1.1.10", "1.1.9"), 1);
  assert.equal(compareVersions("v1.2.0", "1.1.99"), 1);
  assert.equal(compareVersions("1.1.0", "1.1.0"), 0);
  assert.equal(compareVersions("apk-9", "1.1.0"), 0);
});

test("web builds report automatic deployment instead of offering an APK update", async () => {
  const result = await checkForUpdate({ force: true });
  assert.equal(result.platform, "web");
  assert.equal(result.autoUpdated, true);
  assert.equal(result.hasUpdate, false);
});
