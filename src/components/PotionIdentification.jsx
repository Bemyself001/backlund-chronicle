import { useState } from "react";
import { identificationGate } from "../engine/potionIdentification.js";
import { playerVisibleItem } from "../system/items.js";
import Modal from "./Modal.jsx";
import styles from "./SpecialActions.module.css";

export default function PotionIdentification({ game, disabled, onAction }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const bottles = game.inventory.filter(item => item.potion && !item.potion.identified && item.quantity > 0).map(playerVisibleItem);
  const reason = selectedId ? identificationGate(game, selectedId) : "请选择一瓶魔药";
  const selected = bottles.find(item => item.instanceId === selectedId);
  const confirm = () => {
    if (reason || !selected) return;
    setOpen(false);
    onAction(`请夏洛克·莫里亚蒂鉴定一瓶${selected.name}，同意支付一镑鉴定费`, { identificationRequest: { instanceId: selected.instanceId, feePence: 240 } });
  };
  return <section className={styles.service} aria-label="魔药鉴定服务">
    <div className={styles.meta}><h4>魔药鉴定</h4><strong>£1 / 瓶</strong></div>
    <p className={styles.hint}>辨明一瓶未知魔药的途径和序列。鉴定不会服用魔药。</p>
    <button type="button" disabled={disabled || !onAction || !bottles.length} onClick={() => { setSelectedId(bottles[0]?.instanceId || ""); setOpen(true); }}>{bottles.length ? `选择魔药 · ${bottles.length} 种待鉴定` : "行囊中没有待鉴定魔药"}</button>
    {open && <Modal title="委托魔药鉴定" onClose={() => setOpen(false)}><div className={styles.panel}>
      <p>夏洛克·莫里亚蒂 · 每次鉴定一瓶</p>
      <label className={styles.field}>选择魔药<select value={selectedId} onChange={event => setSelectedId(event.target.value)}>{bottles.map(item => <option key={item.instanceId} value={item.instanceId}>{item.name} · 持有 {item.quantity} 瓶</option>)}</select></label>
      <p>本次费用 <strong>1 镑</strong>（20 苏勒 / 240 便士），消耗 1 回合。鉴定结果与扣费会在剧情完成后一起保存。</p>
      {reason && <p role="status" className={styles.notice}>{reason}</p>}
      <div className={styles.buttons}><button type="button" onClick={() => setOpen(false)}>暂不鉴定</button><button className={styles.primary} type="button" disabled={disabled || Boolean(reason)} onClick={confirm}>确认鉴定 · 1 镑</button></div>
    </div></Modal>}
  </section>;
}
