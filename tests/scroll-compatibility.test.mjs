import test from "node:test";
import assert from "node:assert/strict";
import { viewportHeight, watchViewport } from "../src/services/viewport.js";
import { probeScroll, watchScrollGestures, collectScrollReport } from "../src/services/scrollDiagnostics.js";

function fakeWindow(viewport) {
  const win = new EventTarget();
  win.innerHeight = 800;
  win.visualViewport = viewport;
  const properties = new Map();
  win.document = { documentElement: { clientHeight: 780, style: {
    setProperty: (key, value) => properties.set(key, value),
  } } };
  return { win, properties };
}

test("viewport height falls back for absent/invalid visual viewport and does not shrink during zoom", () => {
  const { win } = fakeWindow();
  assert.equal(viewportHeight(win), 800);
  win.visualViewport = { height: 420, scale: 1 };
  assert.equal(viewportHeight(win), 420);
  win.visualViewport.scale = 2;
  assert.equal(viewportHeight(win), 800);
  win.visualViewport = { height: 0, scale: 1 };
  assert.equal(viewportHeight(win), 800);
  win.innerHeight = NaN;
  assert.equal(viewportHeight(win), 780);
  win.document.documentElement.clientHeight = 0;
  assert.equal(viewportHeight(win), null);
});

test("layout tracks keyboard/window resize and stops listening after cleanup", () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, scale: 1 });
  const { win, properties } = fakeWindow(viewport);
  const stop = watchViewport(win, win.document.documentElement);
  assert.equal(properties.get("--modal-viewport-height"), "800px");
  viewport.height = 360;
  viewport.dispatchEvent(new Event("resize"));
  assert.equal(properties.get("--modal-viewport-height"), "360px");
  viewport.height = 740;
  win.dispatchEvent(new Event("resize"));
  assert.equal(properties.get("--modal-viewport-height"), "740px");
  stop();
  viewport.height = 900;
  viewport.dispatchEvent(new Event("resize"));
  win.dispatchEvent(new Event("resize"));
  assert.equal(properties.get("--modal-viewport-height"), "740px");
});

function scrollElement({ blocked = false, top = 0, range = 600, actualMax = range } = {}) {
  let offset = top;
  const styles = new Map([["scroll-behavior", ["smooth", "important"]]]);
  return {
    clientHeight: 400, scrollHeight: 400 + range,
    get scrollTop() { return offset; },
    set scrollTop(value) { if (!blocked) offset = Math.min(actualMax, Math.max(0, value)); },
    style: {
      getPropertyValue: key => styles.get(key)?.[0] || "",
      getPropertyPriority: key => styles.get(key)?.[1] || "",
      setProperty: (key, value, priority) => styles.set(key, [value, priority]),
      removeProperty: key => styles.delete(key),
    },
  };
}

test("diagnostics distinguish a blocked scroller from no overflow and restore reading position", () => {
  for (const top of [0, 222, 599.66667, 600]) {
    const element = scrollElement({ top });
    assert.deepEqual(probeScroll(element), { range: 600, moved: true });
    assert.equal(element.scrollTop, top);
    assert.equal(element.style.getPropertyValue("scroll-behavior"), "smooth");
    assert.equal(element.style.getPropertyPriority("scroll-behavior"), "important");
  }
  assert.deepEqual(probeScroll(scrollElement({ blocked: true })), { range: 600, moved: false });
  assert.deepEqual(probeScroll(scrollElement({ range: 0 })), { range: 0, moved: false });
  const fractionalBottom = scrollElement({ top: 38.66667, actualMax: 38.66667, range: 39 });
  assert.deepEqual(probeScroll(fractionalBottom), { range: 39, moved: true });
  assert.equal(fractionalBottom.scrollTop, 38.66667);
});

test("diagnostic report contains counters and dimensions without reading page content or storage", () => {
  const doc = new EventTarget();
  const element = scrollElement();
  Object.defineProperty(element, "textContent", { get() { throw new Error("Must not inspect content"); } });
  Object.assign(doc, { scrollingElement: element, getElementById: () => element, querySelector: () => element });
  const win = { document: doc, navigator: { userAgent: "Test WebView" }, innerHeight: 800, innerWidth: 360,
    getComputedStyle: () => ({ overflowY: "auto", touchAction: "auto" }) };
  const stop = watchScrollGestures(doc);
  doc.dispatchEvent(new Event("touchstart"));
  doc.dispatchEvent(new Event("touchmove"));
  const report = collectScrollReport(win, { page: "api-settings" });
  assert.equal(report.gestures.touchstart, 1);
  assert.equal(report.gestures.touchmove, 1);
  assert.equal(report.regions[0].probe.moved, true);
  stop();
  doc.dispatchEvent(new Event("touchmove"));
  assert.equal(collectScrollReport(win, {}).gestures.touchmove, 1);
});
