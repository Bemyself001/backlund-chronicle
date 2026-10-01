const gestures = { touchstart: 0, touchmove: 0, touchend: 0, touchcancel: 0, scroll: 0 };

// Only counters are retained: never record coordinates, input, story text or credentials.
export function watchScrollGestures(target) {
  Object.keys(gestures).forEach(type => { gestures[type] = 0; });
  const listeners = Object.keys(gestures).map(type => {
    const listener = () => { gestures[type] += 1; };
    target.addEventListener(type, listener, { capture: true, passive: true });
    return [type, listener];
  });
  return () => listeners.forEach(([type, listener]) => target.removeEventListener(type, listener, { capture: true }));
}

export function probeScroll(element) {
  const range = Math.max(0, element.scrollHeight - element.clientHeight);
  if (!range) return { range, moved: false };
  const top = element.scrollTop;
  const behavior = element.style.getPropertyValue("scroll-behavior");
  const priority = element.style.getPropertyPriority("scroll-behavior");
  try {
    element.style.setProperty("scroll-behavior", "auto", "important");
    // scrollHeight is rounded, while scrollTop can be fractional at the bottom.
    element.scrollTop = top > range / 2 ? Math.max(0, top - 2) : Math.min(range, top + 2);
    return { range, moved: element.scrollTop !== top };
  } finally {
    element.scrollTop = top;
    if (behavior) element.style.setProperty("scroll-behavior", behavior, priority);
    else element.style.removeProperty("scroll-behavior");
  }
}

export function collectScrollReport(win, metadata) {
  const doc = win.document;
  const targets = [
    ["dialog", doc.querySelector("dialog[open]")],
    ["dialog-content", doc.querySelector("dialog[open] [data-modal-scroll]")],
  ];
  const counts = { ...gestures };
  return {
    ...metadata,
    diagnosticVersion: 1,
    userAgent: win.navigator.userAgent,
    viewport: { width: win.innerWidth, height: win.innerHeight, visualHeight: win.visualViewport?.height, scale: win.visualViewport?.scale },
    supportsSvh: Boolean(win.CSS?.supports("height", "100svh")),
    gestures: counts,
    regions: targets.filter(([, element]) => element).map(([name, element]) => {
      const style = win.getComputedStyle(element);
      return {
        name, height: element.clientHeight, contentHeight: element.scrollHeight,
        scrollTop: element.scrollTop, overflowY: style.overflowY, touchAction: style.touchAction,
        probe: probeScroll(element),
      };
    }),
  };
}
