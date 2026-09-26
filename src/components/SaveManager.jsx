import { useRef, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./SaveManager.module.css";
import { MAX_MANUAL_SAVES } from "../services/storage.js";

export default function SaveManager({ saves, game, loading = false, onSave, onLoad, onDelete, onExport, onImport, onClose }) {
  const inputRef = useRef(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const exportCurrent = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true); setError(""); setNotice(""); setExportResult(null);
    try {
      const result = await onExport(game);
      if (result?.status === "cancelled") setNotice("已取消导出，没有保存新文件。");
      else if (["saved", "download-requested"].includes(result?.status)) setExportResult(result);
      else throw new Error("未能确认导出结果，请重试。");
    } catch (err) {
      setError(err.message || "存档导出失败，请重试。");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };
  const attempt = (operation) => { try { setError(""); operation(); } catch (err) { setError(err.message); } };
  const create = () => {
    const trimmed = label.trim() || `手动存档 · 第 ${game.turn} 轮`;
    attempt(() => { onSave(`slot-${Date.now()}`, trimmed); setLabel(""); });
  };
  return <Modal title="存档柜" eyebrow="Local archive" onClose={onClose} wide>
    <div className={styles.toolbar}>
      <label><span>新存档名称</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`第 ${game.turn} 轮 · ${game.location.name}`} /></label>
      <button className="button button--primary" type="button" onClick={create}>新建存档</button>
      <button className="button button--ghost" type="button" disabled={exporting} onClick={exportCurrent}>{exporting ? "正在导出…" : "导出当前"}</button>
      <button className="button button--ghost" type="button" disabled={loading} onClick={() => inputRef.current?.click()}>导入 JSON</button>
      <input ref={inputRef} className="sr-only" type="file" disabled={loading} accept=".json,application/json" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; try { await onImport(file); onClose(); } catch (err) { setError(err.message); } input.value = ""; }} />
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {exportResult && <div className={styles.exportNotice} role="status">
      <strong>{exportResult.status === "saved" ? "存档已保存" : "已发起存档下载"}</strong>
      <dl><div><dt>文件名</dt><dd>{exportResult.fileName}</dd></div><div><dt>保存位置</dt><dd>{exportResult.location}</dd></div></dl>
      <p>{exportResult.hint}</p><small>导出文件不包含 API Key。</small>
    </div>}
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
