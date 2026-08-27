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
