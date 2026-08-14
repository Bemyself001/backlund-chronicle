import { useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./Forms.module.css";
import { DEFAULT_SYSTEM_PROMPT } from "../data/defaults.js";

export default function PromptEditor({ value, onSave, onClose }) {
  const [draft, setDraft] = useState(value);
  return <Modal title="叙事提示词" eyebrow="Narrator protocol" onClose={onClose} wide>
    <div className={styles.form}>
      <p className={styles.helper}>这段提示词位于每轮上下文的最前方。修改不会覆盖角色、世界状态或存档。</p>
      <label className={styles.field}><span>系统提示词</span><textarea className={styles.prompt} value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      <div className={styles.actions}><button className="button button--ghost" type="button" onClick={() => setDraft(DEFAULT_SYSTEM_PROMPT)}>恢复默认</button><button className="button button--primary" type="button" onClick={() => { onSave(draft); onClose(); }}>保存提示词</button></div>
    </div>
  </Modal>;
}

