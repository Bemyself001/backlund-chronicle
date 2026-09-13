import { requestAI } from "./api.js";
import { buildChoiceRegenerationContext } from "./memory.js";
import { choiceResult, choiceValidationError, hasValidModelChoices, mergeChoiceResponses, modelChoices } from "./choices.js";

// A bounded, choice-only recovery. Errors must not undo an already settled turn.
export async function recoverChoices({ game, action, narrative, prompt, settings, signal, initialResponse,
  request = requestAI, onResponse, timeoutMs = 25000 }) {
  let result = choiceResult(modelChoices(initialResponse), choiceValidationError(initialResponse));
  const attempts = [];
  if (hasValidModelChoices(result)) return result;
  const modes = settings.nativeTools ? ["tool", "json"] : ["json"];
  for (const mode of modes) {
    if (signal?.aborted) break;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const nativeTools = mode === "tool";
      const messages = buildChoiceRegenerationContext(game, action, narrative, result.choiceMeta.reason, prompt,
        { nativeTools, existingChoices: result.choices });
      const response = await request({ ...settings, nativeTools, jsonMode: !nativeTools }, messages, controller.signal, undefined, {
        toolSet: "choices", requireChoiceTool: nativeTools, disableTools: !nativeTools,
        disableJsonMode: nativeTools, forceDisableReasoning: true, skipReasoningRetry: true,
        streamOverride: false, maxTokensModeOverride: "manual", maxTokensOverride: 1200,
      });
      onResponse?.(response);
      result = mergeChoiceResponses(result, response);
      attempts.push({ mode, reason: hasValidModelChoices(result) ? "" : choiceValidationError(response) });
      if (hasValidModelChoices(result)) break;
    } catch {
      const reason = signal?.aborted ? "cancelled" : timedOut ? "timeout" : "request_failed";
      attempts.push({ mode, reason });
      result = choiceResult(result.choices, reason);
      if (signal?.aborted) break;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  return choiceResult(result.choices, signal?.aborted ? "cancelled" : result.choiceMeta.reason, attempts);
}

// Apply a delayed response only to the turn it belongs to, preserving later metadata changes.
export function applyChoiceRecovery(current, target, response) {
  if (!current || current.id !== target.id || current.turn !== target.turn) return current;
  return { ...current, choices: response.choices, choiceMeta: response.choiceMeta };
}
