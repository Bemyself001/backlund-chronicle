import { HOME_TOUR_STEPS } from "../data/onboarding.js";
import { API_PROVIDER_PRESETS } from "./apiProviders.js";

export const ONBOARDING_KEY = "mist-onboarding-v1";
const validSteps = ["setup", ...HOME_TOUR_STEPS.map(step => step.id), "complete"];

// Tutorial progress belongs to this installation, never to a character or API profile.
export function loadOnboarding(hasExistingSave = false, storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(ONBOARDING_KEY) || "null");
    if (validSteps.includes(saved?.step)) return saved.step;
  } catch { /* A missing or damaged tutorial record must not prevent startup. */ }
  return hasExistingSave ? "complete" : "setup";
}

export function saveOnboarding(step, storage = globalThis.localStorage) {
  if (!validSteps.includes(step)) return;
  try { storage.setItem(ONBOARDING_KEY, JSON.stringify({ step })); }
  catch { /* Keep the current in-memory progress if browser storage is unavailable. */ }
}

export function onboardingConfigError(settings) {
  if (!API_PROVIDER_PRESETS.some(provider => provider.id === settings.provider)) return "请先选择对应的服务商。";
  if (!settings.apiKey?.trim()) return "请将服务商提供的密钥填入 API Key 栏。";
  if (/^(?:https?:\/\/|www\.)/i.test(settings.apiKey.trim()) || /\s/.test(settings.apiKey.trim())) return "API Key 应填写完整密钥，请检查是否误填了网址或多余空格。";
  if (!settings.model?.trim()) return "请填写当前模型名称。";
  try {
    const endpoint = new URL(settings.baseUrl);
    if (!["http:", "https:"].includes(endpoint.protocol) || !endpoint.hostname) throw new Error();
  } catch { return "请检查 Base URL，或重新选择服务商以使用预设地址。"; }
  return "";
}
