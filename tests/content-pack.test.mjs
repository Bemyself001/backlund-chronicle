import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_CONTENT, CONTENT_SCHEMA_VERSION, CONTENT_VERSION, OPENINGS, MAP_LOCATIONS,
  getOpening, getTalent, getPathway, validateContentPack,
} from "../src/content/index.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("Backlund content pack is serializable, versioned, and internally valid", () => {
  assert.equal(ACTIVE_CONTENT.id, "backlund-core");
  assert.equal(CONTENT_SCHEMA_VERSION, 1);
  assert.match(CONTENT_VERSION, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.deepEqual(validateContentPack(), []);
  assert.doesNotThrow(() => JSON.stringify(ACTIVE_CONTENT));
  assert(Object.isFrozen(ACTIVE_CONTENT));
  assert(Object.isFrozen(ACTIVE_CONTENT.map.locations));
});

test("content registry resolves definitions without applying game rules", () => {
  assert.equal(getOpening("桥区").locationId, "soot-lamp");
  assert.equal(getTalent("heirloom-watch").effects.item.itemId, "heirloom-watch");
  assert.equal(getPathway("seer").name, "占卜家");
  assert.equal(OPENINGS.length, 5);
  assert.equal(MAP_LOCATIONS.length, 9);
});

test("content validation catches cross-reference and executable-data errors", () => {
  const missingLocation = structuredClone(ACTIVE_CONTENT);
  missingLocation.openings[0].locationId = "missing-place";
  assert(validateContentPack(missingLocation).some((error) => error.includes("起点不存在")));

  const executable = { ...ACTIVE_CONTENT, unsafe: () => true };
  assert(validateContentPack(executable).some((error) => error.includes("不能包含函数")));
});

test("core content files do not depend on runtime layers", () => {
  const directory = fileURLToPath(new URL("../src/content/backlund/", import.meta.url));
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".js"))) {
    const source = readFileSync(`${directory}/${name}`, "utf8");
    assert.doesNotMatch(source, /from\s+["'](?:\.\.\/)+(?:system|engine|services|components|data)\//, name);
  }
});

test("malformed and non-serializable content produces validation errors", () => {
  assert(validateContentPack({ ...ACTIVE_CONTENT, openings: {} }).some((error) => error.includes("开局数据为空")));
  const cyclic = {};
  cyclic.self = cyclic;
  for (const unsafe of [cyclic, new Date(), Infinity, undefined, 1n]) {
    assert(validateContentPack({ ...ACTIVE_CONTENT, unsafe }).some((error) => error.includes("可序列化")));
  }
});
