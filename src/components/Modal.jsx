import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";
import { watchViewport } from "../services/viewport.js";

export default function Modal({ title, eyebrow, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const stopViewport = watchViewport(window, dialog);
    dialog?.showModal();
    return () => { stopViewport(); dialog?.close(); previous?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wide : ""}`} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="dialog-title">
      <div className={styles.heading}>
        <div>{eyebrow && <p>{eyebrow}</p>}<h2 id="dialog-title">{title}</h2></div>
        <button className={styles.close} type="button" onClick={onClose} aria-label="关闭对话框">×</button>
      </div>
      <div className={styles.body} data-modal-scroll>{children}</div>
    </dialog>
  );
}
