import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./UpdateDialog.module.css";
import { APP_VERSION, WEB_BUILD, activateOtaNow, canHotUpdate, checkForUpdate, downloadAndApplyOta, getDownloadOptions, openUpdateDownload } from "../services/updates.js";

export default function UpdateDialog({ onClose, automatic = false }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("正在联系发布服务器…");
  const [otaState, setOtaState] = useState("idle"); // idle | downloading | ready | failed
  const [otaBundle, setOtaBundle] = useState(null);
  const hotUpdate = canHotUpdate(result);

  const startHotUpdate = async () => {
    setOtaState("downloading");
    setStatus("正在下载热更新包（包含页面资源与标题字体，约 3.3 MB）…");
    try {
      const bundle = await downloadAndApplyOta(result, { reload: false });
      setOtaBundle(bundle);
      setOtaState("ready");
      setStatus(`热更新已就绪：${result.latestVersion} 将在下次启动时自动生效，也可以立即重新载入。`);
    } catch (error) {
      setOtaState("failed");
      setStatus(`热更新失败（${error.message || "网络错误"}），可改用完整安装包更新。`);
    }
  };

  useEffect(() => {
    let active = true;
    checkForUpdate({ force: true })
      .then((next) => {
        if (!active) return;
        setResult(next);
        if (next.autoUpdated) {
          setStatus("网页版会随每次发布自动更新；当前页面已是最新部署版本。若页面一直开着，刷新即可载入新版本。");
        } else {
          const channel = next.source === "pages" ? "（经备用通道获取）" : "";
          setStatus(next.hasUpdate ? `发现新版本 ${next.latestVersion}${channel}` : `当前 ${APP_VERSION} 已是最新版。${channel}`);
        }
      })
      .catch((error) => active && setStatus(error.message || "暂时无法检查更新。"));
    return () => { active = false; };
  }, []);

  return (
    <Modal title={automatic ? "发现可用更新" : "检查版本状态"} eyebrow="Release telegraph" onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.version}>
          <span>{result?.autoUpdated ? "当前部署" : "当前版本"}</span>
          <strong>{result?.autoUpdated ? `网页版 · ${WEB_BUILD}` : APP_VERSION}</strong>
        </div>
        <p className={styles.status} role="status">{status}</p>
        {result?.hasUpdate && <>
          <div className={styles.version}><span>最新版本</span><strong>{result.latestVersion}</strong></div>
          <div className={styles.notes}><strong>更新说明</strong><p>{result.notes}</p></div>
          {hotUpdate
            ? <p className={styles.hint}>热更新会下载页面资源与标题字体（约 3.3 MB），无需重新安装 APK，存档不受影响。</p>
            : <p className={styles.hint}>下载完成后，Android 会要求你确认安装。首次从旧调试版迁移时，请先导出存档并卸载旧版。</p>}
        </>}
        <div className={styles.actions}>
          <button className="button button--ghost" type="button" onClick={onClose}>稍后</button>
          {result?.hasUpdate && <>
            {getDownloadOptions(result).filter((option) => !option.primary).map((option) => (
              <button key={option.key} className="button button--ghost" type="button" onClick={() => openUpdateDownload(option.url)}>
                {option.label}
              </button>
            ))}
            {otaState === "ready"
              ? <button className="button button--primary" type="button" onClick={() => activateOtaNow(otaBundle)}>立即重新载入</button>
              : hotUpdate
                ? <button className="button button--primary" type="button" disabled={otaState === "downloading"} onClick={startHotUpdate}>{otaState === "downloading" ? "热更新下载中…" : "热更新（免重装）"}</button>
                : <button className="button button--primary" type="button" onClick={() => openUpdateDownload(result.downloadUrl)}>下载并更新</button>}
          </>}
        </div>
        {result?.hasUpdate && <p className={styles.mirrorHint}>若直接下载失败或速度过慢，可改用镜像加速下载，或到发布页手动获取安装包。</p>}
      </div>
    </Modal>
  );
}
