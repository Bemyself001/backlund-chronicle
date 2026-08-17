export function hasUsableChoices(choices = []) {
  if (!Array.isArray(choices) || choices.length !== 3) return false;
  const labels = choices.map((choice) => String(choice?.label || "").trim());
  return labels.every((label) => label.length >= 4) && new Set(labels).size === 3;
}

export function injectOccultEntryChoice(choices = [], entry = null) {
  if (!entry || !hasUsableChoices(choices) || choices.some((choice) => choice.intent === "occult")) return choices;
  const next = choices.map((choice) => ({ ...choice }));
  const dangerousIndex = next.findIndex((choice) => choice.risk === "high");
  next[dangerousIndex >= 0 ? dangerousIndex : next.length - 1] = { ...entry.choice };
  return next;
}
