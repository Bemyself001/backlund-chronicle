import assert from "node:assert/strict";
import test from "node:test";
import { saveExportFileName, writeSaveExport } from "../src/services/saveExport.js";
import { exportSave } from "../src/services/storage.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";

const web = { isNativePlatform: () => false };
const android = { isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: () => true };

test("native export returns the confirmed name and location without invoking browser download", async () => {
  const result = { status: "saved", fileName: "实际文件 (1).json", location: "内部存储/Download/贝克兰德纪事/实际文件 (1).json" };
  let request;
  const exported = await writeSaveExport('{"turn":3}', "建议名称.json", {
    capacitor: android,
    nativeExporter: { save: async input => { request = input; return result; } },
  });
  assert.deepEqual(request, { content: '{"turn":3}', fileName: "建议名称.json" });
  assert.deepEqual(exported, result);
});

test("native cancellation and write errors are not presented as a saved file", async () => {
  const cancelled = await writeSaveExport("{}", "存档.json", { capacitor: android, nativeExporter: { save: async () => ({ status: "cancelled" }) } });
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(writeSaveExport("{}", "存档.json", { capacitor: android, nativeExporter: { save: async () => { throw new Error("存储空间不足"); } } }), /存储空间不足/);
  await assert.rejects(writeSaveExport("{}", "存档.json", { capacitor: { ...android, isPluginAvailable: () => false } }), /新版 APK/);
});

test("browser picker confirms saving only after the writer has closed", async () => {
  const events = [];
  const result = await writeSaveExport("payload", "建议.json", { capacitor: web, browser: {
    showSaveFilePicker: async options => {
      assert.equal(options.suggestedName, "建议.json");
      return { name: "玩家命名.json", createWritable: async () => ({
        write: async data => events.push(data),
        close: async () => events.push("closed"),
      }) };
    },
  } });
  assert.deepEqual(events, ["payload", "closed"]);
  assert.equal(result.status, "saved");
  assert.equal(result.fileName, "玩家命名.json");
  assert.match(result.location, /选择的文件夹/);
  assert.match(result.hint, /不提供完整磁盘路径/);
});

test("cancelling the picker differs from failed writing and does not trigger a fallback download", async () => {
  const cancelled = await writeSaveExport("{}", "存档.json", { capacitor: web, browser: {
    showSaveFilePicker: async () => { throw new DOMException("cancel", "AbortError"); },
  } });
  assert.deepEqual(cancelled, { status: "cancelled" });
  let aborted = false;
  await assert.rejects(writeSaveExport("{}", "存档.json", { capacitor: web, browser: {
    showSaveFilePicker: async () => ({ name: "存档.json", createWritable: async () => ({
      write: async () => { throw new Error("disk full"); },
      abort: async () => { aborted = true; },
    }) }),
  } }), /disk full/);
  assert.equal(aborted, true);
  await assert.rejects(writeSaveExport("{}", "存档.json", { capacitor: web, browser: {
    showSaveFilePicker: async () => ({ createWritable: async () => { throw new DOMException("provider error", "AbortError"); } }),
  } }), /provider error/);
});

test("mobile browser fallback reports download requested and keeps the blob alive long enough", async () => {
  const events = [];
  let cleanup;
  let blob;
  const anchor = { click: () => events.push("click"), remove: () => events.push("remove") };
  const result = await writeSaveExport('{"hello":"你好"}', "手机.json", {
    capacitor: web, browser: {},
    document: { createElement: () => anchor, body: { appendChild: () => events.push("append") } },
    urls: { createObjectURL: value => { blob = value; return "blob:test"; }, revokeObjectURL: value => events.push(value) },
    schedule: (callback, delay) => { cleanup = callback; assert.equal(delay, 60000); },
  });
  assert.equal(await blob.text(), '{"hello":"你好"}');
  assert.equal(anchor.download, "手机.json");
  assert.deepEqual(events, ["append", "click", "remove"]);
  assert.equal(result.status, "download-requested");
  assert.match(result.location, /浏览器设置/);
  assert.match(result.hint, /iPhone/);
  cleanup();
  assert.equal(events.at(-1), "blob:test");
});

test("export filename cannot inject directories or control characters", () => {
  const fileName = saveExportFileName({ character: { name: "艾琳/../../霍尔:\n" }, turn: 8 });
  assert.doesNotMatch(fileName, /[\\/:\n]/);
  assert.match(fileName, /第8轮.json$/);
});

test("actual save serialization preserves game data while excluding API settings", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let content;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    showSaveFilePicker: async () => ({ name: "备份.json", createWritable: async () => ({
      write: async data => { content = data; }, close: async () => {},
    }) }),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else delete globalThis.window; });
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "导出验证" });
  game.apiKey = "must-not-export";
  game.apiSettings = { apiKey: "must-not-export-either" };
  const result = await exportSave(game);
  const parsed = JSON.parse(content);
  assert.equal(result.status, "saved");
  assert.equal(parsed.game.character.name, "导出验证");
  assert.equal(parsed.game.turn, game.turn);
  assert.equal(parsed.format, "backlund-chronicle-save");
  assert.doesNotMatch(content, /must-not-export/);
  assert.equal(game.apiKey, "must-not-export");
});
