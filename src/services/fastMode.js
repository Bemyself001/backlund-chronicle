import { choiceResult } from "./choices.js";

// Even an empty tool plan advances the clock. Never commit its uncorrected draft.
export async function finalizeFastPresentation(draft, resolution, render) {
  const result = await render(draft.narrative, resolution);
  if (!result?.hasNarrative || !result.narrative?.trim()) return null;
  return {
    ...draft,
    narrative: result.narrative.trim(),
    hasNarrative: true,
    ...choiceResult([], "scene_changed"),
  };
}

function settleTask(task) {
  return Promise.resolve()
    .then(task)
    .then(
      (value) => ({ status: "fulfilled", value, error: null }),
      (error) => ({ status: "rejected", value: null, error }),
    );
}

export function launchFastModeTasks(tasks = {}) {
  return Object.fromEntries(
    Object.entries(tasks)
      .filter(([, task]) => typeof task === "function")
      .map(([name, task]) => [name, settleTask(task)]),
  );
}

export function throwIfFastTaskAborted(...outcomes) {
  const aborted = outcomes.flat().find((outcome) => outcome?.error?.name === "AbortError");
  if (aborted) throw aborted.error;
}
