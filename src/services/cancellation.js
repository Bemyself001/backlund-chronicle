export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException("请求已中止", "AbortError");
}

// Some transports keep fetch/body reads pending after abort. Release the caller
// immediately, and consume late results without letting them resume the turn.
export function abortable(operation, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException("请求已中止", "AbortError"));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException("请求已中止", "AbortError"));
    signal?.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      throwIfAborted(signal);
      return operation();
    }).then(value => {
      throwIfAborted(signal);
      resolve(value);
    }).catch(reject).finally(() => signal?.removeEventListener("abort", cancel));
  });
}
