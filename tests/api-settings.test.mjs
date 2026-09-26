import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_API_SETTINGS } from "../src/data/defaults.js";
import { listApiModels, loadApiSettings, saveApiSettings, testApiConnection } from "../src/services/api.js";

class MemoryStorage {
  #entries = new Map();

  clear() { this.#entries.clear(); }
  getItem(key) { return this.#entries.get(key) ?? null; }
  removeItem(key) { this.#entries.delete(key); }
  setItem(key, value) { this.#entries.set(key, String(value)); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

test.beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("uses the OpenAI preset for a fresh browser", () => {
  const settings = loadApiSettings();
  assert.equal(settings.provider, "openai");
  assert.equal(settings.baseUrl, "https://api.openai.com/v1");
  assert.equal(settings.model, "gpt-4.1-mini");
  assert.equal(settings.reasoningMode, "auto");
  assert.equal(settings.autoRetryReasoning, true);
  assert.equal(Object.hasOwn(settings, "mockMode"), false);
});

test("legacy mock settings are removed while provider and key preferences survive", () => {
  localStorage.setItem("mist-api-settings-v1", JSON.stringify({
    ...DEFAULT_API_SETTINGS, mockMode: true, model: "existing-model",
    persistKey: true, apiKey: "test-persisted-key",
  }));
  const settings = loadApiSettings();
  assert.equal(Object.hasOwn(settings, "mockMode"), false);
  assert.equal(settings.model, "existing-model");
  assert.equal(settings.apiKey, "test-persisted-key");
  const saved = saveApiSettings({ ...settings, mockMode: true });
  assert.equal(Object.hasOwn(saved, "mockMode"), false);
  assert.equal(Object.hasOwn(JSON.parse(localStorage.getItem("mist-api-settings-v1")), "mockMode"), false);
  assert.equal(loadApiSettings().apiKey, "test-persisted-key");
});

test("legacy mock flag cannot fake model discovery or a successful connection", async (t) => {
  const settings = { ...DEFAULT_API_SETTINGS, mockMode: true };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response(JSON.stringify({ data: [{ id: settings.model }] }));
  });
  assert.deepEqual(await listApiModels(settings), [settings.model]);
  assert.match(await testApiConnection(settings), /连接成功/);
  assert.equal(calls, 2);
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
  await assert.rejects(testApiConnection(settings), /HTTP 401/);
});

test("keeps a session-only key out of persistent settings", () => {
  saveApiSettings({
    ...DEFAULT_API_SETTINGS,
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKey: "session-secret",
    persistKey: false,
  });

  assert.equal(localStorage.getItem("mist-api-settings-v1").includes("session-secret"), false);
  assert.equal(loadApiSettings().apiKey, "session-secret");

  sessionStorage.clear();
  assert.equal(loadApiSettings().apiKey, "");
});

test("restores opt-in persistent keys separately for each provider", () => {
  let settings = saveApiSettings({
    ...DEFAULT_API_SETTINGS,
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "openai-secret",
    persistKey: true,
  });

  settings = saveApiSettings({
    ...settings,
    provider: "kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    apiKey: "kimi-secret",
    persistKey: true,
  });

  sessionStorage.clear();
  const kimi = loadApiSettings();
  assert.equal(kimi.provider, "kimi");
  assert.equal(kimi.apiKey, "kimi-secret");
  assert.equal(kimi.profiles.openai.apiKey, "openai-secret");
});

test("removes a formerly persistent key after opt-out", () => {
  let settings = saveApiSettings({
    ...DEFAULT_API_SETTINGS,
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "remove-me",
    persistKey: true,
  });

  settings = saveApiSettings({ ...settings, persistKey: false });
  assert.equal(localStorage.getItem("mist-api-settings-v1").includes("remove-me"), false);
  sessionStorage.clear();
  assert.equal(loadApiSettings().apiKey, "");
});
