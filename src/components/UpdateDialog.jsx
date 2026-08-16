import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./UpdateDialog.module.css";
import { APP_VERSION, checkForUpdate, openUpdateDownload } from "../services/updates.js";

export default function UpdateDialog({ onClose, automatic = false }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("正在联系发布服务器…");

  useEffect(() => {
    let active = true;
    checkForUpdate({ force: true })
      .then((next) => {
        if (!active) return;
        setResult(next);
        setStatus(next.hasUpdate ? `发现新版本 ${next.latestVersion}` : `当前 ${APP_VERSION} 已是最新版。`);
      })
      .catch((error) => active && setStatus(error.message || "暂时无法检查更新。"));
    return () => { active = false; };
  }, []);

  return (
    <Modal title={automatic ? "发现可用更新" : "检查应用更新"} eyebrow="Release telegraph" onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.version}><span>当前版本</span><strong>{APP_VERSION}</strong></div>
        <p className={styles.status} role="status">{status}</p>
        {result?.hasUpdate && <>
          <div className={styles.version}><span>最新版本</span><strong>{result.latestVersion}</strong></div>
          <div className={styles.notes}><strong>更新说明</strong><p>{result.notes}</p></div>
          <p className={styles.hint}>下载完成后，Android 会要求你确认安装。首次从旧调试版迁移时，请先导出存档并卸载旧版。</p>
        </>}
        <div className={styles.actions}>
          <button className="button button--ghost" type="button" onClick={onClose}>稍后</button>
          {result?.hasUpdate && <button className="button button--primary" type="button" onClick={() => openUpdateDownload(result.downloadUrl)}>下载并更新</button>}
        </div>
      </div>
    </Modal>
  );
}
