// Keep deterministic map/potion intent with the text across failed attempts.
export function actionRequest(action, options = {}) {
  return { action, options: structuredClone(options) };
}

export function retryRequest(request) {
  return request ? { action: request.action, options: { ...structuredClone(request.options), manualRetry: true } } : null;
}
