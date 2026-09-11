import { useRef, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./Welcome.module.css";
import { APP_VERSION, WEB_BUILD, isNativeAndroid } from "../services/updates.js";
import { recentArchives, archiveLocation } from "../data/titleArchive.js";
import landscapeWebp from "../../assets/study-landscape.webp";
import landscapeJpg from "../../assets/study-landscape.jpg";
import portraitWebp from "../../assets/study-portrait.webp";
import portraitJpg from "../../assets/study-portrait.jpg";
import placeholder from "../../assets/study-placeholder.webp";

function formatSavedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间未记录";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function Welcome({ hasSave, saves = [], apiSettings, onNew, onContinue, onLoadSlot, onImport, onApi, onChangelog }) {
  const inputRef = useRef(null);
  const [importError, setImportError] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [stillScene, setStillScene] = useState(false);
  const archives = recentArchives(saves);
  const latest = archives[0];
  const canContinue = latest ? Boolean(onLoadSlot || (latest.slotId === "autosave" && onContinue)) : Boolean(hasSave && onContinue);
  const continueLatest = () => {
    if (latest && onLoadSlot) onLoadSlot(latest.slotId);
    else if (canContinue) onContinue();
  };
  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setImportError(""); await onImport(file); }
    catch (error) { setImportError(error.message); }
    finally { event.target.value = ""; }
  };

  return (
    <main className={`${styles.page} ${stillScene ? styles.still : ""}`} id="main">
      <picture className={styles.scene} style={{ backgroundImage: `url(${placeholder})` }} aria-hidden="true">
        <source media="(max-width: 600px)" srcSet={portraitWebp} type="image/webp" />
        <source media="(max-width: 600px)" srcSet={portraitJpg} type="image/jpeg" />
        <source srcSet={landscapeWebp} type="image/webp" />
        <img src={landscapeJpg} alt="" fetchPriority="high" decoding="async" />
      </picture>
      <div className={styles.lamplight} aria-hidden="true" />
      <header className={styles.masthead}>
        <div className={styles.brandMark} aria-hidden="true"><span>BC</span></div>
        <div className={styles.brandText}><span>PRIVATE INVESTIGATION</span><p>贝克兰德私人调查档案</p></div>
        <button className={styles.apiStatus} type="button" onClick={onApi} title={apiSettings.mockMode ? "离线演示，无需连接 AI" : apiSettings.model || "未配置模型"}>
          <span className={apiSettings.mockMode ? styles.ready : styles.live} aria-hidden="true" />
          {apiSettings.mockMode ? "离线演示" : "AI 对话设置"}<span aria-hidden="true">↗</span>
        </button>
      </header>

      <div className={styles.desk}>
        <section className={styles.hero} aria-labelledby="welcome-title">
          <p className={styles.folio}><span aria-hidden="true" />鲁恩王国 · 贝克兰德 · 1349</p>
          <h1 id="welcome-title"><span>贝克兰德</span><span className={styles.titleEnd}>纪事<span className={styles.titleSeal} aria-hidden="true">私人<br />卷宗</span></span></h1>
          <p className={styles.englishTitle}>THE BACKLUND CHRONICLE</p>
          <p className={styles.subtitle}>雾已入城。<br />{latest ? "灯还亮着，你的故事尚未写完。" : "你的名字，尚未写入档案。"}</p>

          <nav className={styles.actions} aria-label="开始调查">
            <button className={styles.primaryAction} type="button" onClick={canContinue ? continueLatest : onNew}>
              <span className={styles.actionNo} aria-hidden="true">01</span>
              <span><strong>{canContinue ? "继续调查" : "建立新档案"}</strong><small>{canContinue ? "回到尚未结束的故事" : "以你的名字，开启一段非凡人生"}</small></span>
              <span className={styles.actionArrow} aria-hidden="true">→</span>
            </button>
            {canContinue && <button className={styles.newAction} type="button" onClick={onNew}><span aria-hidden="true">＋</span>建立新档案<span className={styles.newHint}>另一段人生</span></button>}
          </nav>
          <p className={styles.heroNote}>单人叙事 <span aria-hidden="true">/</span> 自由行动 <span aria-hidden="true">/</span> 本地存档</p>
        </section>

        <aside className={styles.shelf} aria-label="最近档案">
          <div className={styles.folderTab}>{latest ? "最近归档" : "致未署名的调查员"}<span aria-hidden="true">◆</span></div>
          <div className={styles.folderBody}>
            <p className={styles.folderEyebrow}>BACKLUND PRIVATE ARCHIVES</p>
            <h2>{latest ? latest.characterName || "未命名档案" : "一份等待署名的卷宗"}</h2>
            {latest ? <>
              <dl className={styles.caseDetails}>
                <div><dt>所在地点</dt><dd>{archiveLocation(latest)}</dd></div>
                <div><dt>调查进度</dt><dd>第 {latest.turn ?? 0} 轮 · {latest.label || "私人档案"}</dd></div>
                <div><dt>归档时间</dt><dd>{formatSavedAt(latest.updatedAt)}</dd></div>
              </dl>
              <p className={styles.folderNote}>书签还停在你离开的那一页。</p>
            </> : <p className={styles.letter}>桌上的信尚未拆封，窗外的钟声穿过薄雾。<br />请坐。故事将从你的第一笔开始。</p>}
            <button className={styles.archiveButton} type="button" onClick={() => setArchiveOpen(true)} aria-haspopup="dialog" aria-expanded={archiveOpen}>
              打开档案柜<span>{archives.length} 份在册<span aria-hidden="true"> ↗</span></span>
            </button>
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <div className={styles.minorActions} aria-label="辅助操作">
          <button type="button" onClick={() => inputRef.current?.click()}>导入存档</button>
          <button type="button" onClick={onApi}>API 设置</button>
          <button type="button" onClick={onChangelog}>更新日志</button>
          <a href="https://bemyself001.github.io/backlund-chronicle/privacy.html" target="_blank" rel="noreferrer">隐私政策<span className="sr-only">（新窗口打开）</span></a>
          <button type="button" aria-pressed={stillScene} onClick={() => setStillScene((current) => !current)}>静态场景{stillScene ? " · 开" : " · 关"}</button>
        </div>
        <span className={styles.version}>{isNativeAndroid() ? `VER ${APP_VERSION}` : `WEB ${WEB_BUILD}`}</span>
        <input ref={inputRef} className="sr-only" tabIndex={-1} aria-label="选择存档文件" type="file" accept="application/json,.json" onChange={chooseFile} />
        {importError && <p className={styles.error} role="alert">{importError}</p>}
      </footer>

      {archiveOpen && <Modal title="私人档案柜" eyebrow={`PRIVATE ARCHIVES / 在册 ${archives.length} 份`} onClose={() => setArchiveOpen(false)}>
        {archives.length ? <ol className={styles.ledger}>
          {archives.map((slot, index) => <li key={slot.slotId}>
            <button type="button" disabled={!onLoadSlot} onClick={() => onLoadSlot?.(slot.slotId)}>
              <span className={styles.ledgerNo}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.ledgerMain}><strong>{slot.characterName || "未命名档案"}</strong><small>{archiveLocation(slot)} · 第 {slot.turn ?? 0} 轮</small><small>{slot.label || "私人档案"}{slot.slotId === "autosave" ? " · 自动" : ""} · {formatSavedAt(slot.updatedAt)}</small></span>
              <span aria-hidden="true">→</span>
            </button>
          </li>)}
        </ol> : <p className={styles.emptyShelf}>档案柜暂时空着。建立新档案，或导入已有存档，让故事从这里开始。</p>}
        <p className={styles.shelfNote}>点击档案继续调查。存档保存在当前设备与浏览器中；删除、导出与手动保存可在游戏内的「存档」页管理。</p>
      </Modal>}
    </main>
  );
}
