import { useRef, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./SaveManager.module.css";
import { getSaveCabinet } from "../services/saveSlots.js";

export default function SaveManager({ saves, game, loading = false, onSave, onLoad, onDelete, onExport, onImport, onClose }) {
  const inputRef = useRef(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const { slots, autosave, archived } = getSaveCabinet(saves);
  const exportArchive = async (archive) => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true); setError(""); setNotice(""); setExportResult(null);
    try {
      const result = await onExport(archive);
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
  const attempt = (operation) => { try { setError(""); setNotice(""); setExportResult(null); operation(); } catch (err) { setError(err.message); } };
  const store = (number, save) => {
    if (save && !window.confirm(`将当前进度覆盖到存档位 ${number}「${save.label}」？`)) return;
    const trimmed = label.trim() || save?.label || `第 ${game.turn} 轮 · ${game.location.name}`;
    attempt(() => { onSave(save?.slotId || `slot-${crypto.randomUUID()}`, trimmed, number); setLabel(""); setNotice(`已保存到存档位 ${number}。`); });
  };
  const remove = (save) => {
    if (window.confirm(`确定删除“${save.label}”吗？此操作不可撤销。`)) attempt(() => { onDelete(save.slotId); setNotice("档案已删除。"); });
  };
  const details = (save) => <div className={styles.slotDetails}><h3>{save.label}</h3><p>{save.characterName} · 第 {save.turn} 轮</p><p>{save.game?.location?.name || "地点未记录"}</p><p><time dateTime={save.updatedAt}>{new Date(save.updatedAt).toLocaleString("zh-CN")}</time></p></div>;
  const archiveActions = (save) => <>
    <button type="button" disabled={loading} onClick={() => attempt(() => onLoad(save.slotId))}>读取</button>
    <button type="button" disabled={exporting} onClick={() => exportArchive(save.game)}>导出</button>
    <button className={styles.delete} type="button" onClick={() => remove(save)}>删除</button>
  </>;
  return <Modal title="存档柜" eyebrow="Local archive" onClose={onClose} wide>
    <div className={styles.toolbar}>
      <label><span>存档名称（可选）</span><input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={`第 ${game.turn} 轮 · ${game.location.name}`} /></label>
      <button className="button button--ghost" type="button" disabled={exporting} onClick={() => exportArchive(game)}>{exporting ? "正在导出…" : "导出当前"}</button>
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
    <p className={styles.sectionIntro}>手动存档 · {slots.filter((slot) => slot.save).length} / 3<span>选择一个位置保存当前进度，覆盖前会再次确认。</span></p>
    <div className={styles.slots}>
      {slots.map(({ number, save }) => <article key={number} className={`${styles.slot} ${!save ? styles.emptySlot : ""}`} aria-label={`存档位 ${number}`}>
        <div className={styles.slotHeading}><span>存档位 {number}</span><small>{save ? "已保存" : "空位"}</small></div>
        {save ? details(save) : <div className={styles.empty}><h3>等待一段故事</h3><p>将当前进度保存在这里，随时回来继续。</p></div>}
        <div className={styles.slotActions}>
          <button className={styles.saveButton} type="button" disabled={loading} onClick={() => store(number, save)}>{save ? "覆盖存档" : "保存到此处"}</button>
          {save && archiveActions(save)}
        </div>
      </article>)}
    </div>
    <section className={styles.autoSection} aria-label="自动存档">
      <div><h3>自动存档</h3><p>自动记录最新进度，不占用三个手动存档位。</p></div>
      {autosave ? <><div className={styles.slotDetails}><p>{autosave.characterName} · 第 {autosave.turn} 轮 · {autosave.game?.location?.name}</p><p>{new Date(autosave.updatedAt).toLocaleString("zh-CN")}</p></div><div className={styles.slotActions}><button type="button" disabled={loading} onClick={() => attempt(() => onLoad(autosave.slotId))}>读取自动存档</button><button type="button" disabled={exporting} onClick={() => exportArchive(autosave.game)}>导出</button></div></> : <p>尚无自动存档</p>}
    </section>
    {archived.length > 0 && <details className={styles.legacySection}><summary>旧版保留档案 · {archived.length} 份</summary><p>超过三个存档位的旧档案保留在这里。可读取、导出或删除；读取后可将进度保存到上方存档位。</p><div className={styles.list}>{archived.map((save) => <article key={save.slotId} className={styles.legacySlot}>{details(save)}<div className={styles.slotActions}>{archiveActions(save)}</div></article>)}</div></details>}
    <p className={styles.footnote}>存档结构版本 v{game.version} · API Key 始终排除在导入导出数据之外</p>
  </Modal>;
}
