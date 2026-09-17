import { useRef, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./SaveManager.module.css";
import { MAX_MANUAL_SAVES } from "../services/storage.js";

export default function SaveManager({ saves, game, loading = false, onSave, onLoad, onDelete, onExport, onImport, onClose }) {
  const inputRef = useRef(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = (operation) => { try { setError(""); operation(); } catch (err) { setError(err.message); } };
  const create = () => {
    const trimmed = label.trim() || `手动存档 · 第 ${game.turn} 轮`;
    attempt(() => { onSave(`slot-${Date.now()}`, trimmed); setLabel(""); });
  };
  return <Modal title="存档柜" eyebrow="Local archive" onClose={onClose} wide>
    <div className={styles.toolbar}>
      <label><span>新存档名称</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`第 ${game.turn} 轮 · ${game.location.name}`} /></label>
      <button className="button button--primary" type="button" onClick={create}>新建存档</button>
      <button className="button button--ghost" type="button" onClick={() => { onExport(game); setNotice("导出文件已生成，且不包含 API Key。"); }}>导出当前</button>
      <button className="button button--ghost" type="button" disabled={loading} onClick={() => inputRef.current?.click()}>导入 JSON</button>
      <input ref={inputRef} className="sr-only" type="file" disabled={loading} accept=".json,application/json" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; try { await onImport(file); onClose(); } catch (err) { setError(err.message); } input.value = ""; }} />
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading && <p className={styles.notice} role="status">正在处理，请等待完成；生成期间可关闭此窗口并中止生成，再读取或导入档案。</p>}
    <p className={styles.footnote}>手动存档 {saves.filter((slot) => slot.slotId !== "autosave").length} / {MAX_MANUAL_SAVES} · 自动存档使用独立槽位；满额后请选择覆盖已有档案。</p>
    <div className={styles.list}>
      {saves.length === 0 && <p className={styles.empty}>档案抽屉是空的。新建存档后会在这里留下带时间戳的副本。</p>}
      {saves.map((slot) => <article key={slot.slotId} className={styles.slot}>
        <div><span>{slot.slotId === "autosave" ? "AUTO" : "SLOT"}</span><h3>{slot.label}</h3><p>{slot.characterName} · 第 {slot.turn} 轮 · {new Date(slot.updatedAt).toLocaleString("zh-CN")}</p></div>
        <div className={styles.slotActions}><button type="button" disabled={loading} onClick={() => attempt(() => onLoad(slot.slotId))}>读取</button><button type="button" onClick={() => attempt(() => onSave(slot.slotId, slot.label))}>覆盖</button><button className={styles.delete} type="button" onClick={() => { if (window.confirm(`确定删除“${slot.label}”吗？此操作不可撤销。`)) attempt(() => onDelete(slot.slotId)); }}>删除</button></div>
      </article>)}
    </div>
    <p className={styles.footnote}>存档结构版本 v{game.version} · API Key 始终排除在导入导出数据之外</p>
  </Modal>;
}
