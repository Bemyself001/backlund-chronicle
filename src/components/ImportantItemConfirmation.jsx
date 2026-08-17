import { useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./ImportantItemConfirmation.module.css";

export default function ImportantItemConfirmation({ changes, onConfirm, onCancel }) {
  const [approvedKeys, setApprovedKeys] = useState(() => new Set(changes.map((change) => change.key)));
  const toggle = (key) => {
    setApprovedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const approvedCount = approvedKeys.size;

  return <Modal title="确认重要物品变更" eyebrow="LOCAL AUDIT · 本地审计" onClose={onCancel}>
    <div className={styles.intro}>
      <strong>回合尚未写入存档</strong>
      <p>本地审计发现重要非货币物品发生增减。只勾选与实际剧情相符的变更；未勾选项目会被本地引擎拒绝。</p>
    </div>
    <fieldset className={styles.list}>
      <legend>待确认变更</legend>
      {changes.map((change) => <label key={change.key} className={styles.change} data-direction={change.direction}>
        <input type="checkbox" checked={approvedKeys.has(change.key)} onChange={() => toggle(change.key)} />
        <span className={styles.mark} aria-hidden="true">{change.direction === "gain" ? "+" : "−"}</span>
        <span className={styles.copy}>
          <strong>{change.direction === "gain" ? "获得" : "失去"}「{change.name}」×{change.quantity}</strong>
          <small>{change.reason}</small>
        </span>
        <em>重要物品</em>
      </label>)}
    </fieldset>
    <p className={styles.note}>普通物品、装备变化与资金不会触发此确认，也不会显示在这里。</p>
    <div className={styles.actions}>
      <button type="button" className={styles.cancel} onClick={onCancel}>取消整个回合</button>
      <button type="button" className={styles.confirm} onClick={() => onConfirm([...approvedKeys])}>{approvedCount ? `确认所选变更（${approvedCount}）` : "拒绝全部并继续"}</button>
    </div>
  </Modal>;
}
