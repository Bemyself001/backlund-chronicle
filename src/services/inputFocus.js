const TEXT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

export function textField(target) {
  if (!target?.closest) return null;
  const field = target.closest("input, textarea") || target.closest("label")?.control;
  if (field?.tagName === "TEXTAREA" || (field?.tagName === "INPUT" && TEXT_TYPES.has(field.type))) return field;
  return null;
}

export function canEdit(field) {
  return Boolean(field?.isConnected && !field.readOnly && !field.matches(":disabled") && !field.closest("[inert]"));
}

// Called only by a user click. Never prevent default, rewrite values, move the caret,
// or refocus on a timer: doing so interrupts selection, scrolling and IME composition.
export function recoverInputFocus(event, doc) {
  const field = textField(event.target);
  const modal = Array.from(doc.querySelectorAll("dialog[open]")).pop();
  if (!event.isTrusted || event.defaultPrevented || !canEdit(field) || (modal && !modal.contains(field))) return false;
  if (doc.activeElement === field && doc.hasFocus()) return false;
  field.focus();
  return doc.activeElement === field;
}

export function watchInput(win, { recover = false, nativeInfo, publish } = {}) {
  const doc = win.document;
  const started = Date.now();
  const records = [];
  const ids = new WeakMap();
  let nextId = 0;
  let alive = true;
  let timer;
  let lastNative = 0;
  let nativePending = false;
  function describe(element) {
    const field = textField(element);
    if (!field) return { tag: ["BODY", "BUTTON", "DIALOG", "HTML"].includes(element?.tagName) ? element.tagName : "other" };
    if (!ids.has(field)) ids.set(field, ++nextId);
    return { field: ids.get(field), tag: field.tagName, type: field.type,
      length: field.value.length, readOnly: field.readOnly, disabled: field.matches(":disabled"),
      inert: Boolean(field.closest("[inert]")), connected: field.isConnected };
  }
  function record(type, target, detail = {}) {
    // Store only fixed event names, flags and lengths. Never event.data, key, clipboard,
    // field names, placeholders, DOM text, values, selection text or application state.
    records.push({ ms: Date.now() - started, type, target: describe(target),
      active: describe(doc.activeElement), documentFocus: doc.hasFocus(), ...detail });
    if (records.length > 80) records.shift();
    publish?.(records.slice());
  }
  function sampleNative() {
    if (!nativeInfo || nativePending || Date.now() - lastNative < 1000) return;
    lastNative = Date.now();
    nativePending = true;
    Promise.resolve().then(nativeInfo).catch(() => {}).finally(() => { nativePending = false; });
  }
  function receive(event) {
    if (!alive || event.target?.id === "startup-report") return;
    const field = textField(event.target);
    if (!field) return;
    record(event.type, event.target, { composing: Boolean(event.isComposing), trusted: event.isTrusted,
      prevented: event.defaultPrevented, recoveryEnabled: recover });
    if (event.type === "click") {
      sampleNative();
      if (recover && recoverInputFocus(event, doc)) record("focus-recovered", field);
      win.clearTimeout(timer);
      timer = win.setTimeout(() => { if (alive) record("after-click", field); }, 150);
    } else if (event.type === "input" || event.type === "compositionend") {
      // Observe after React's handlers and controlled-value restoration have run.
      Promise.resolve().then(() => { if (alive) record("after-update", field); });
    }
  }
  const types = ["pointerdown", "focusin", "focusout", "beforeinput", "input", "paste", "compositionstart", "compositionend"];
  types.forEach(type => doc.addEventListener(type, receive, { capture: true, passive: true }));
  doc.addEventListener("click", receive); // Recovery runs after the application's handlers.
  return {
    clear() { records.length = 0; publish?.([]); },
    stop() {
      alive = false;
      win.clearTimeout(timer);
      types.forEach(type => doc.removeEventListener(type, receive, true));
      doc.removeEventListener("click", receive);
    },
  };
}
