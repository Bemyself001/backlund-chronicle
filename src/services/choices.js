const RISKS = ["low", "medium", "high"];

// Preserve only actions actually supplied by the model; never invent labels or risk.
export function normalizeChoices(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.flatMap((choice) => {
    const value = typeof choice === "string" ? choice : choice?.label ?? choice?.text ?? choice?.title ?? choice?.action;
    const label = typeof value === "string" ? value.trim() : "";
    if (!label || seen.has(label)) return [];
    seen.add(label);
    return [{ label, intent: typeof choice?.intent === "string" ? choice.intent.trim().slice(0, 32) || "action" : "action",
      risk: RISKS.includes(choice?.risk) ? choice.risk : "unknown" }];
  }).slice(0, 3);
}

export function modelChoices(response) {
  if (response?.choiceMeta?.fallback || response?.choiceMeta?.source === "fallback") return [];
  return normalizeChoices(response?.choices);
}

export function hasUsableChoices(choices = []) {
  if (!Array.isArray(choices) || choices.length !== 3) return false;
  const labels = choices.map((choice) => String(choice?.label || "").trim());
  return labels.every(Boolean) && new Set(labels).size === 3
    && choices.every((choice) => [...RISKS, "unknown"].includes(choice?.risk));
}

export function hasValidModelChoices(response) {
  return hasUsableChoices(modelChoices(response));
}

export function choiceValidationError(response) {
  if (response?.responseMetadata?.finishReason === "length") return "response_truncated";
  if (response?.choiceMeta?.reason) return response.choiceMeta.reason;
  return modelChoices(response).length ? "incomplete_choices" : "missing_choices";
}

export function choiceResult(choices, reason = "", attempts = []) {
  const normalized = normalizeChoices(choices);
  return { choices: normalized, choiceMeta: {
    source: normalized.length === 3 ? "model" : normalized.length ? "partial" : "unavailable",
    fallback: false, reason: normalized.length === 3 ? "" : reason || "incomplete_choices", attempts,
  } };
}

// Merge only within the same completed scene, retaining earlier valid actions first.
export function mergeChoiceResponses(previous, response) {
  return choiceResult([...modelChoices(previous), ...modelChoices(response)], choiceValidationError(response));
}

export function injectOccultEntryChoice(choices = [], entry = null) {
  if (!entry || !hasUsableChoices(choices) || choices.some((choice) => choice.intent === "occult")) return choices;
  const next = choices.map((choice) => ({ ...choice }));
  const dangerousIndex = next.findIndex((choice) => choice.risk === "high");
  next[dangerousIndex >= 0 ? dangerousIndex : next.length - 1] = { ...entry.choice };
  return next;
}
