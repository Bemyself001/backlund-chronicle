// Keep layout height stable during pinch zoom, but follow the on-screen keyboard.
export function viewportHeight(win) {
  const viewport = win.visualViewport;
  const candidates = [
    viewport?.scale === 1 ? viewport.height : null,
    win.innerHeight,
    win.document.documentElement.clientHeight,
  ];
  return candidates.find(value => Number.isFinite(value) && value > 0) || null;
}

export function watchViewport(win, element) {
  const resize = () => {
    const height = viewportHeight(win);
    if (height) element.style.setProperty("--modal-viewport-height", `${height}px`);
  };
  resize();
  win.addEventListener("resize", resize);
  win.addEventListener("pageshow", resize);
  win.visualViewport?.addEventListener("resize", resize);
  return () => {
    win.removeEventListener("resize", resize);
    win.removeEventListener("pageshow", resize);
    win.visualViewport?.removeEventListener("resize", resize);
  };
}
