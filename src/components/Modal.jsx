import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

export default function Modal({ title, eyebrow, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wide : ""}`} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="dialog-title">
      <div className={styles.heading}>
        <div>{eyebrow && <p>{eyebrow}</p>}<h2 id="dialog-title">{title}</h2></div>
        <button className={styles.close} type="button" onClick={onClose} aria-label="关闭对话框">×</button>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}

