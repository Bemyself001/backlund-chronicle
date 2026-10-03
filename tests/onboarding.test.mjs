import test from "node:test";
import assert from "node:assert/strict";
import { ONBOARDING_KEY, loadOnboarding, saveOnboarding, onboardingConfigError } from "../src/services/onboarding.js";
import { API_SETUP_STEPS, HOME_TOUR_STEPS } from "../src/data/onboarding.js";

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), entries };
}

test("new players start the tutorial; existing saves bypass it without resetting an active tour", () => {
  const storage = memoryStorage();
  assert.equal(loadOnboarding(false, storage), "setup");
  assert.equal(loadOnboarding(true, storage), "complete");
  saveOnboarding("diagnostics", storage);
  assert.equal(loadOnboarding(false, storage), "diagnostics");
  assert.equal(loadOnboarding(true, storage), "diagnostics");
  saveOnboarding("complete", storage);
  assert.equal(loadOnboarding(false, storage), "complete", "removing or importing character saves does not reset completion");
});

test("tutorial storage keeps only a whitelisted progress step, not character data or credentials", () => {
  const storage = memoryStorage();
  saveOnboarding("api", storage);
  assert.equal(storage.entries.size, 1);
  assert.deepEqual(JSON.parse(storage.getItem(ONBOARDING_KEY)), { step: "api" });
  saveOnboarding({ step: "complete", apiKey: "secret" }, storage);
  assert.equal(storage.getItem(ONBOARDING_KEY), '{"step":"api"}');
  for (const raw of ["broken", "null", "[]", '{"step":"unknown"}', '{"step":{"apiKey":"secret"}}']) {
    storage.setItem(ONBOARDING_KEY, raw);
    assert.equal(loadOnboarding(false, storage), "setup");
    assert.equal(loadOnboarding(true, storage), "complete");
  }
  const unavailable = { getItem() { throw Error("blocked"); }, setItem() { throw Error("quota"); } };
  assert.equal(loadOnboarding(false, unavailable), "setup");
  assert.doesNotThrow(() => saveOnboarding("complete", unavailable));
});

test("API setup only advances with complete fields and does not mistake a URL for a key", () => {
  const valid = { provider: "deepseek", apiKey: "sk-example", baseUrl: "https://api.deepseek.com", model: "example-model" };
  assert.equal(onboardingConfigError(valid), "");
  assert.equal(onboardingConfigError({ ...valid, apiKey: "  sk-example  " }), "");
  for (const patch of [{ apiKey: "" }, { apiKey: "  " }, { apiKey: "https://example.com" }, { apiKey: "www.example.com" }, { apiKey: "sk example" }, { model: " " }, { baseUrl: "not an endpoint" }, { baseUrl: "file:///secret" }, { provider: "unknown" }]) {
    assert.ok(onboardingConfigError({ ...valid, ...patch }));
  }
});

test("tutorial copy has three API steps and all five footer features without web addresses", () => {
  assert.equal(API_SETUP_STEPS.length, 3);
  assert.deepEqual(HOME_TOUR_STEPS.map(step => step.id), ["import", "api", "changelog", "diagnostics", "privacy"]);
  assert.doesNotMatch(JSON.stringify([API_SETUP_STEPS, HOME_TOUR_STEPS]), /https?:|www\./i);
  assert.match(API_SETUP_STEPS[1].text, /充值.*API Keys/);
});
