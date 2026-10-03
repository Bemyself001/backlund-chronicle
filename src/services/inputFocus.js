const TEXT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);
let recoverySequence = 0;

export function textField(target) {
  if (!target?.closest) return null;
  const field = target.closest("input, textarea") || target.closest("label")?.control;
  if (field?.tagName === "TEXTAREA" || (field?.tagName === "INPUT" && TEXT_TYPES.has(field.type))) return field;
  return null;
}

export function canEdit(field) {
  return Boolean(field?.isConnected && !field.readOnly && !field.matches(":disabled") && !field.closest("[inert]"));
}

function availableField(field, doc) {
  const modal = Array.from(doc.querySelectorAll("dialog[open]")).pop();
  return canEdit(field) && (!modal || modal.contains(field)) && field.getClientRects().length > 0;
}

// Called only by a user click. Never prevent default, rewrite values, move the caret,
// or refocus on a timer: doing so interrupts selection, scrolling and IME composition.
export function recoverInputFocus(event, doc) {
  const field = textField(event.target);
  if (!event.isTrusted || event.defaultPrevented || !availableField(field, doc)) return false;
  if (doc.activeElement === field && doc.hasFocus()) return false;
  field.focus();
  return doc.activeElement === field && doc.hasFocus();
}

export function watchInput(win, { recover = false, nativeInfo, nativeRecovery, publish } = {}) {
  const doc = win.document;
  const started = Date.now();
  const records = [];
  const ids = new WeakMap();
  let nextId = 0;
  let alive = true;
  let timer;
  let lastNative = 0;
  let nativePending = false;
  let pendingRecovery = null;
  let recoveryInFlight = false;
  let nativeSupported = true;
  let composing = false;
  const recoveryBridge = {
    // Rechecked by Android immediately before changing native focus. No field data crosses the bridge.
    check(id) {
      const field = pendingRecovery?.field;
      return Boolean(alive && pendingRecovery?.id === id && Date.now() < pendingRecovery.expires
        && !composing && doc.visibilityState === "visible" && !doc.hasFocus()
        && doc.activeElement === field && availableField(field, doc));
    },
  };
  if (recover && nativeRecovery) win.__startupInputRecovery = recoveryBridge;
  const invalidateRecovery = () => { pendingRecovery = null; };
  function describe(element) {
    const field = textField(element);
    if (!field) return { tag: ["BODY", "BUTTON", "DIALOG", "HTML"].includes(element?.tagName) ? element.tagName : "other" };
    if (!ids.has(field)) ids.set(field, ++nextId);
    const probe = field.id === "input-probe-plain" ? "plain" : field.id === "input-probe-controlled" ? "react" : undefined;
    return { field: ids.get(field), probe, tag: field.tagName, type: field.type,
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
  function sampleNative(field, force = false) {
    if (!nativeInfo || nativePending || (!force && Date.now() - lastNative < 1000)) return;
    lastNative = Date.now();
    nativePending = true;
    Promise.resolve().then(nativeInfo).then(info => {
      if (!alive || !info?.inputFocus) return;
      const { viewHasFocus, windowHasFocus, imeActiveForWebView, imeAcceptingText, focusResets } = info.inputFocus;
      record("native-snapshot", field, { nativeFocus: { viewHasFocus, windowHasFocus, imeActiveForWebView, imeAcceptingText, focusResets } });
    }).catch(() => {}).finally(() => { nativePending = false; });
  }
  function recoverNative(event, field) {
    if (!recover || !nativeRecovery || !nativeSupported || recoveryInFlight || !event.isTrusted || event.defaultPrevented) return;
    const request = { id: ++recoverySequence, field, expires: Date.now() + 1500 };
    pendingRecovery = request;
    if (!recoveryBridge.check(request.id)) { pendingRecovery = null; return; }
    recoveryInFlight = true;
    record("native-recovery-request", field);
    Promise.resolve().then(() => {
      if (!recoveryBridge.check(request.id)) return { status: "stale", attempted: false };
      return nativeRecovery(request.id);
    }).then(result => {
      if (!alive) return;
      const status = ["reset", "unsupported", "inactive", "stale", "busy", "throttled", "timeout", "failed"].includes(result?.status)
        ? result.status : "failed";
      if (status === "unsupported") nativeSupported = false;
      record("native-recovery-result", field, { status, attempted: result?.attempted === true,
        restarted: result?.restarted === true, verified: doc.activeElement === field && doc.hasFocus() });
      sampleNative(field, true);
    }).catch(() => { if (alive) record("native-recovery-result", field, { status: "failed", verified: false }); })
      .finally(() => { recoveryInFlight = false; if (pendingRecovery === request) pendingRecovery = null; });
  }
  function receive(event) {
    if (!alive || event.target?.id === "startup-report") return;
    const field = textField(event.target);
    if (!field) return;
    if (event.type === "compositionstart") composing = true;
    if (event.type === "compositionend") composing = false;
    record(event.type, event.target, { composing: composing || Boolean(event.isComposing), trusted: event.isTrusted,
      prevented: event.defaultPrevented, recoveryEnabled: recover });
    if (event.type === "click") {
      sampleNative(field);
      if (recover && recoverInputFocus(event, doc)) record("focus-recovered", field);
      recoverNative(event, field);
      win.clearTimeout(timer);
      timer = win.setTimeout(() => { if (alive) record("after-click", field); }, 150);
    } else if (event.type === "input" || event.type === "compositionend") {
      // Observe after React's handlers and controlled-value restoration have run.
      Promise.resolve().then(() => { if (alive) record("after-update", field); });
    }
  }
  const types = ["pointerdown", "focusin", "focusout", "beforeinput", "input", "paste", "compositionstart", "compositionend"];
  const cancelTypes = ["pointerdown", "keydown", "beforeinput", "input", "paste", "compositionstart", "visibilitychange"];
  cancelTypes.forEach(type => doc.addEventListener(type, invalidateRecovery, true));
  win.addEventListener("blur", invalidateRecovery);
  types.forEach(type => doc.addEventListener(type, receive, { capture: true, passive: true }));
  doc.addEventListener("click", receive); // Recovery runs after the application's handlers.
  return {
    clear() { records.length = 0; publish?.([]); },
    stop() {
      alive = false;
      win.clearTimeout(timer);
      invalidateRecovery();
      if (win.__startupInputRecovery === recoveryBridge) delete win.__startupInputRecovery;
      cancelTypes.forEach(type => doc.removeEventListener(type, invalidateRecovery, true));
      win.removeEventListener("blur", invalidateRecovery);
      types.forEach(type => doc.removeEventListener(type, receive, true));
      doc.removeEventListener("click", receive);
    },
  };
}
