import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const eslintRequire = createRequire(require.resolve("eslint"));
const { parse } = createRequire(eslintRequire.resolve("espree"))("acorn");

function diagnosticsFixture(variant = "standard") {
  const elements = new Map();
  const document = { readyState: "complete", activeElement: null, execCommand: () => false,
    querySelector: selector => ({ content: selector.includes("startup-variant") ? variant : "test-version" }),
    getElementById: id => elements.get(id),
    documentElement: { contains: node => node.connected !== false },
  };
  document.createElement = tagName => ({ tagName, hidden: false, disabled: false, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { document.activeElement = this; },
    select() {}, setSelectionRange() {}, getClientRects() { return this.hidden ? [] : [{}]; },
    appendChild(child) { elements.set(child.id, child); },
    querySelectorAll() { return ["startup-summary", "startup-report", "startup-copy", "startup-retry", "startup-close"].map(id => elements.get(id)); },
  });
  for (const id of ["startup-panel", "startup-title", "startup-message", "startup-details", "startup-summary", "startup-report", "startup-copy", "startup-retry", "startup-open"]) {
    const node = document.createElement("div"); node.id = id; elements.set(id, node);
  }
  const window = { setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, innerWidth: 390, innerHeight: 844, location: { reload() {} } };
  Object.defineProperty(window, "localStorage", { get() { throw new Error("diagnostics must not access saves or keys"); } });
  runInNewContext(readFileSync(new URL("../src/startup/bootstrap.js", import.meta.url), "utf8"), { window, document, navigator: { userAgent: "isolated-test" } });
  return { api: window.__startupDiagnostics, document, element: id => elements.get(id) };
}

test("diagnostics opened from a homepage button use correct build wording and restore keyboard focus", () => {
  for (const variant of ["standard", "diagnostic", "compat"]) {
    const { api, document, element } = diagnosticsFixture(variant);
    api.ready();
    const trigger = document.createElement("button");
    trigger.focus();
    assert.equal(api.open(trigger), true);
    assert.equal(element("startup-panel").hidden, false);
    assert.equal(element("startup-panel").attributes.role, "dialog");
    assert.equal(document.activeElement, element("startup-close"));
    if (variant === "standard") {
      assert.match(element("startup-message").textContent, /正式版本.*正常规则/);
      assert.doesNotMatch(element("startup-message").textContent, /测试版本|已暂停/);
    } else assert.match(element("startup-message").textContent, /测试版本.*自动热更新已暂停/);
    let prevented = false;
    element("startup-panel").onkeydown({ key: "Tab", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(document.activeElement, element("startup-summary"));
    element("startup-panel").onkeydown({ key: "Tab", shiftKey: true, preventDefault() {} });
    assert.equal(document.activeElement, element("startup-close"));
    api.open(); // Re-opening the active report must not replace its original trigger.
    element("startup-copy").onclick();
    assert.equal(document.activeElement, element("startup-report"));
    element("startup-panel").onkeydown({ key: "Escape", preventDefault() {} });
    assert.equal(element("startup-panel").hidden, true);
    assert.equal(document.activeElement, trigger);
    assert.equal(element("startup-panel").attributes["aria-modal"], undefined);
    api.open(trigger);
    element("startup-close").onclick();
    assert.equal(document.activeElement, trigger);
  }
});

test("diagnostic reports only accept native environment fields and never read key or save payloads", () => {
  const { api, document } = diagnosticsFixture();
  const info = { model: "V2115A", android: "11", sdk: 30, variant: "standard", nativeVersion: "test", nativeStages: "Activity 启动", webViewPackage: "com.google.android.webview", webViewVersion: "110" };
  Object.defineProperty(info, "apiKey", { enumerable: true, get() { throw new Error("secret getter must not run"); } });
  Object.defineProperty(info, "save", { enumerable: true, get() { throw new Error("save getter must not run"); } });
  api.native(info);
  const native = JSON.parse(api.report()).native;
  assert.deepEqual(Object.keys(native).sort(), ["android", "model", "nativeStages", "nativeVersion", "sdk", "variant", "webViewPackage", "webViewVersion"].sort());
  assert.equal(native.webViewVersion, "110");
  api.fail("脚本执行失败", { name: "TypeError", message: "sk-secret-save-content" }, "https://example.invalid/assets/app.js?key=sk-secret", 2, 3);
  assert.doesNotMatch(api.report(), /sk-secret|save-content|example.invalid|apiKey/);
  api.ready();
  const detached = document.createElement("button"); detached.connected = false;
  api.open(detached);
  assert.doesNotThrow(() => api.close());
});

test("React diagnostics service delegates opening without changing update identity", async () => {
  const { openStartupDiagnostics, IS_STARTUP_TEST } = await import("../src/services/startup.js");
  const previous = globalThis.__startupDiagnostics;
  try {
    delete globalThis.__startupDiagnostics;
    assert.equal(openStartupDiagnostics(), false);
    const trigger = {};
    let received;
    globalThis.__startupDiagnostics = { open(element) { received = element; return true; } };
    assert.equal(openStartupDiagnostics(trigger), true);
    assert.equal(received, trigger);
    assert.equal(IS_STARTUP_TEST, false);
  } finally {
    if (previous === undefined) delete globalThis.__startupDiagnostics;
    else globalThis.__startupDiagnostics = previous;
  }
});

test("standard production and development share compatibility without becoming startup tests", async () => {
  const { default: configuration } = await import("../vite.config.js");
  for (const mode of ["production", "development", "compat"]) {
    const config = configuration({ mode });
    assert.match(config.resolve.alias["startup-compat"], /[/\\]startup[/\\]compat\.js$/);
    assert.equal(config.build.target, "chrome80");
    assert.equal(config.build.cssTarget, "chrome80");
    assert.equal(config.esbuild.target, "chrome80");
    assert.equal(config.optimizeDeps.esbuildOptions.target, "chrome80");
    assert.equal(JSON.parse(config.define["import.meta.env.VITE_STARTUP_VARIANT"]), mode === "compat" ? "compat" : "standard");
  }
  const diagnostic = configuration({ mode: "diagnostic" });
  assert.match(diagnostic.resolve.alias["startup-compat"], /[/\\]no-compat\.js$/);
  assert.equal(diagnostic.build.target, undefined);
  assert.equal(diagnostic.esbuild, undefined);
});

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

test("compat adds secure UUID v4 generation for manual save slots and preserves native implementations", () => {
  const compatibility = readFileSync(new URL("../src/startup/compat.js", import.meta.url), "utf8").replace(/^import .+;\r?\n/gm, "");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    const nativeUUID = crypto.randomUUID;
    { ${compatibility} }
    assert.equal(crypto.randomUUID, nativeUUID);
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, writable: true, configurable: true });
    { ${compatibility} }
    const ids = Array.from({ length: 128 }, () => crypto.randomUUID());
    assert.equal(new Set(ids).size, 128);
    for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  `], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
