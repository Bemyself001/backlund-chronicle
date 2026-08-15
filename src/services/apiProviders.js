export const API_PROVIDER_PRESETS = [
  {
    id: "openai",
    name: "ChatGPT / OpenAI",
    shortName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    description: "OpenAI 官方 API；ChatGPT 订阅不包含 API 额度。",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    description: "DeepSeek 官方 OpenAI-compatible 接口。",
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    shortName: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k3",
    description: "Kimi 开放平台官方兼容接口。",
  },
  {
    id: "custom",
    name: "自定义兼容接口",
    shortName: "Custom",
    baseUrl: "",
    defaultModel: "",
    description: "适用于代理、聚合网关或其他 OpenAI-compatible 服务。",
  },
];

export function getApiProvider(providerId) {
  return API_PROVIDER_PRESETS.find((provider) => provider.id === providerId) || API_PROVIDER_PRESETS.at(-1);
}

export function inferApiProvider(baseUrl = "") {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("api.openai.com")) return "openai";
  if (normalized.includes("api.deepseek.com")) return "deepseek";
  if (normalized.includes("api.moonshot.cn") || normalized.includes("platform.kimi.com")) return "kimi";
  return "custom";
}

export function createProviderProfile(providerId) {
  const provider = getApiProvider(providerId);
  return {
    baseUrl: provider.baseUrl,
    model: provider.defaultModel,
    apiKey: "",
    persistKey: false,
  };
}
