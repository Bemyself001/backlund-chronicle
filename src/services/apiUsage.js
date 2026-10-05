function tokenCount(value) {
  if (!(["number", "string"].includes(typeof value)) || (typeof value === "string" && !value.trim())) return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.round(count) : null;
}

// Only normalized numerical usage is retained; response bodies and credentials never enter diagnostics.
export function normalizeTokenUsage(usage) {
  const promptTokens = tokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const cacheHitTokens = tokenCount(usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens);
  const reportedMiss = tokenCount(usage?.prompt_cache_miss_tokens);
  const cacheMissTokens = reportedMiss ?? (promptTokens !== null && cacheHitTokens !== null && promptTokens >= cacheHitTokens ? promptTokens - cacheHitTokens : null);
  const completionTokens = tokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  const reasoningTokens = tokenCount(usage?.completion_tokens_details?.reasoning_tokens ?? usage?.output_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens);
  return {
    promptTokens, cacheHitTokens, cacheMissTokens, completionTokens, reasoningTokens,
    usageComplete: promptTokens !== null && completionTokens !== null,
    cacheUsageComplete: cacheHitTokens !== null && cacheMissTokens !== null,
  };
}
