import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const eslintRequire = createRequire(require.resolve("eslint"));
const { parse } = createRequire(eslintRequire.resolve("espree"))("acorn");

test("pre-module failure handler parses as ES5 independently of the game bundle", () => {
  parse(readFileSync(new URL("../src/startup/bootstrap.js", import.meta.url), "utf8"), { ecmaVersion: 5 });
});

test("compat polyfills preserve game data semantics with missing native APIs", () => {
  const imports = [...readFileSync(new URL("../src/startup/compat.js", import.meta.url), "utf8")
    .matchAll(/import "(core-js\/[^"]+)"/g)].map(match => `await import(${JSON.stringify(match[1])});`).join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `globalThis.structuredClone = undefined;
    Array.prototype.at = undefined; Array.prototype.findLast = undefined;
    Object.hasOwn = undefined; String.prototype.replaceAll = undefined;
    ${imports}
    const outcome = (() => {
    const data = { empty: undefined, amount: NaN, entries: [1, 2], date: new Date(1234),
      map: new Map([['item', { quantity: 3 }]]), set: new Set(['a']) };
    data.self = data;
    const clone = structuredClone(data);
    clone.entries.push(3); clone.map.get('item').quantity = 9;
    let rejectedFunction = false;
    try { structuredClone({ fn() {} }); } catch (error) { rejectedFunction = error.name === 'DataCloneError'; }
    return [clone !== data, clone.self === clone, Object.hasOwn(clone, 'empty'), Number.isNaN(clone.amount),
      data.entries.length === 2, data.map.get('item').quantity === 3, clone.date.getTime() === 1234,
      clone.set.has('a'), [1, 2, 3].at(-1) === 3, [1, 2, 3].findLast(n => n < 3) === 2,
      'a.a'.replaceAll('.', '-') === 'a-a', rejectedFunction];
  })(); console.log(JSON.stringify(outcome));`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), Array(12).fill(true));
});
