import { useEffect, useId, useRef, useState } from "react";
import styles from "./Modal.module.css";
import { watchViewport } from "../services/viewport.js";
import { normalizeReadingPreferences, READING_KEY } from "./gameUi.js";

function currentReadingTheme() {
  const activeTheme = document.querySelector("main[data-theme]")?.dataset.theme;
  if (activeTheme) return normalizeReadingPreferences({ theme: activeTheme }).theme;
  try { return normalizeReadingPreferences(JSON.parse(localStorage.getItem(READING_KEY))).theme; }
  catch { return normalizeReadingPreferences().theme; }
}

export default function Modal({ title, eyebrow, onClose, children, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const [theme] = useState(currentReadingTheme);
  const keepFocusInside = (event) => {
    if (event.key !== "Tab" || event.target.closest("dialog") !== event.currentTarget) return;
    const controls = [...event.currentTarget.querySelectorAll("a[href], button, input, textarea, select, summary, [tabindex]")]
      .filter(element => element.tabIndex >= 0 && !element.disabled && element.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const stopViewport = watchViewport(window, dialog);
    dialog?.showModal();
    return () => { stopViewport(); dialog?.close(); previous?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wide : ""}`} data-theme={theme} onKeyDown={keepFocusInside} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <div>{eyebrow && <p>{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>
        <button className={styles.close} type="button" onClick={onClose} aria-label="关闭对话框">×</button>
      </div>
      <div className={styles.body} data-modal-scroll>{children}</div>
    </dialog>
  );
}
