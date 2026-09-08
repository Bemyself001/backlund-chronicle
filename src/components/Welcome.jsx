import { useRef, useState } from "react";
import styles from "./Welcome.module.css";
import { APP_VERSION, WEB_BUILD, isNativeAndroid } from "../services/updates.js";

function formatSavedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function Welcome({ hasSave, saves = [], apiSettings, onNew, onContinue, onLoadSlot, onImport, onApi, onChangelog }) {
  const inputRef = useRef(null);
  const [importError, setImportError] = useState("");
  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setImportError(""); await onImport(file); }
    catch (error) { setImportError(error.message); }
    finally { event.target.value = ""; }
  };
  return (
    <main className={styles.page} id="main">
      <div className={styles.fog} aria-hidden="true" />
      <header className={styles.masthead}>
        <div className={styles.brandMark} aria-hidden="true"><span>BC</span></div>
        <p>贝克兰德私人调查档案 · 1349</p>
        <div className={styles.mastheadActions}>
          <button className={styles.changelogLink} type="button" onClick={onChangelog}><span aria-hidden="true" />更新日志</button>
          <button className={styles.apiStatus} type="button" onClick={onApi}><span className={apiSettings.mockMode ? styles.ready : styles.live} />{apiSettings.mockMode ? "Mock 模式" : `${apiSettings.model || "未配置模型"}`}</button>
        </div>
      </header>
      <div className={styles.desk}>
        <section className={styles.hero} aria-labelledby="welcome-title">
          <p className={styles.folio}>卷宗 · 01 · 待建立</p>
          <h1 id="welcome-title"><span>贝克兰德</span>纪事</h1>
          <p className={styles.subtitle}>在煤烟、钟声与隐秘仪式之间，<br />写下只属于你的非凡档案。</p>
          <div className={styles.rule} aria-hidden="true"><i /><span>◆</span><i /></div>
          <div className={styles.actions}>
            <button className="button button--primary button--large" type="button" onClick={onNew}>建立新档案</button>
            <button className="button button--secondary button--large" type="button" onClick={onContinue} disabled={!hasSave}>继续最近档案{!hasSave && <small>档案柜空着</small>}</button>
          </div>
          <div className={styles.minorActions}>
            <button type="button" onClick={() => inputRef.current?.click()}>导入存档</button><span />
            <button type="button" onClick={onApi}>API 设置</button><span />
            <a href="https://bemyself001.github.io/backlund-chronicle/privacy.html" target="_blank" rel="noreferrer">隐私政策</a>
            <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={chooseFile} />
          </div>
          {importError && <p className={styles.error} role="alert">{importError}</p>}
        </section>
        <aside className={styles.shelf} aria-label="在册档案">
          <p className={styles.folio}>卷宗 · 02 · 在册 {saves.length} 份</p>
          <h2>档案柜</h2>
          {saves.length === 0
            ? <p className={styles.emptyShelf}>档案柜空着。第一份档案从「建立新档案」开始。</p>
            : <ol className={styles.ledger}>
              {saves.slice(0, 6).map((slot, index) => (
                <li key={slot.slotId}>
                  <button type="button" onClick={() => onLoadSlot?.(slot.slotId)} disabled={!onLoadSlot}>
                    <span className={styles.ledgerNo}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.ledgerMain}>
                      <strong>{slot.characterName || "未命名档案"}</strong>
                      <small>{slot.label}{slot.slotId === "autosave" ? " · 自动" : ""} · 第 {slot.turn} 轮 · {formatSavedAt(slot.updatedAt)}</small>
                    </span>
                    <span className={styles.ledgerArrow} aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ol>}
          <p className={styles.shelfNote}>点击档案即刻继续；更多槽位在游戏内的「存档」页管理。</p>
        </aside>
      </div>
      <div className={styles.stamp} aria-hidden="true">{isNativeAndroid() ? `VER ${APP_VERSION}` : `WEB ${WEB_BUILD}`}</div>
      <footer className={styles.footer}><span>单人叙事 · 本地存档</span><span>原创人物与案件</span><span>OpenAI-compatible</span></footer>
    </main>
  );
}
