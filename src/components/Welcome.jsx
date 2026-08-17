import { useRef, useState } from "react";
import styles from "./Welcome.module.css";

export default function Welcome({ hasSave, apiSettings, onNew, onContinue, onImport, onApi, onChangelog }) {
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
      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.registry}><span>案卷编号</span><strong>BK—1107</strong></div>
        <p className={styles.kicker}>AI NARRATIVE SANDBOX</p>
        <h1 id="welcome-title"><span>贝克兰德</span>纪事</h1>
        <p className={styles.subtitle}>在煤烟、钟声与隐秘仪式之间，<br />写下只属于你的非凡档案。</p>
        <div className={styles.rule} aria-hidden="true"><i /><span>◆</span><i /></div>
        <div className={styles.actions}>
          <button className="button button--primary button--large" type="button" onClick={onNew}>开始新游戏</button>
          <button className="button button--secondary button--large" type="button" onClick={onContinue} disabled={!hasSave}>继续游戏{!hasSave && <small>暂无存档</small>}</button>
        </div>
        <div className={styles.minorActions}>
          <button type="button" onClick={() => inputRef.current?.click()}>导入存档</button><span />
          <button type="button" onClick={onApi}>API 设置</button>
          <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={chooseFile} />
        </div>
        {importError && <p className={styles.error} role="alert">{importError}</p>}
      </section>
      <aside className={styles.caseNote} aria-label="开局介绍"><span>01</span><p>列车驶入贝克兰德东区。<br />没有既定路线，整座雾都由你选择。</p></aside>
      <footer className={styles.footer}><span>单人叙事 · 本地存档</span><span>原创人物与案件</span><span>OpenAI-compatible</span></footer>
    </main>
  );
}
