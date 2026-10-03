// Standard production/development and the compat test build load this before App.
// Diagnostic intentionally bypasses it so missing native capabilities remain visible.
import "core-js/actual/array/at.js";
import "core-js/actual/array/find-last.js";
import "core-js/actual/object/has-own.js";
import "core-js/actual/string/replace-all.js";
import "core-js/actual/structured-clone.js";
import "../styles/compat.css";

// Chrome 80 has secure random bytes but lacks randomUUID (also used by SaveManager).
// Never fall back to Math.random for a Web Crypto API.
if (globalThis.crypto?.getRandomValues && !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, writable: true, value() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  } });
}

if (typeof document !== "undefined") {
  // CSS.supports('gap') also succeeds for grid in browsers without flex gap.
  const probe = document.createElement("div");
  probe.setAttribute("data-flex-gap-probe", "");
  probe.style.cssText = "position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;padding:0;border:0;";
  for (let index = 0; index < 2; index += 1) {
    const child = document.createElement("div");
    child.style.cssText = "height:1px;flex:none;padding:0;border:0;";
    probe.appendChild(child);
  }
  document.documentElement.appendChild(probe);
  document.documentElement.classList.toggle("no-flex-gap", probe.offsetHeight !== 3);
  probe.remove();
  document.documentElement.classList.toggle("legacy-focus", !globalThis.CSS?.supports?.("selector(:focus-visible)"));
}
