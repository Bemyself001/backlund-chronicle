import { useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./Forms.module.css";
import { DEFAULT_SYSTEM_PROMPT } from "../system/game.js";

export default function PromptEditor({ value, onSave, onClose }) {
  const [draft, setDraft] = useState(value);
  return <Modal title="叙事提示词" eyebrow="Narrator protocol" onClose={onClose} wide>
    <div className={styles.form}>
      <p className={styles.helper}>这里用于补充叙事偏好。固定叙事契约、本地状态权威与披露规则始终生效，不能被自定义内容覆盖。</p>
      <label className={styles.field}><span>自定义叙事提示</span><textarea className={styles.prompt} value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      <div className={styles.actions}><button className="button button--ghost" type="button" onClick={() => setDraft(DEFAULT_SYSTEM_PROMPT)}>恢复默认</button><button className="button button--primary" type="button" onClick={() => { onSave(draft); onClose(); }}>保存提示词</button></div>
    </div>
  </Modal>;
}
