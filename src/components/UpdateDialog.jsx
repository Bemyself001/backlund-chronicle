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
  const downloadOptions = getDownloadOptions(result);
  const primaryDownload = downloadOptions.find((option) => option.primary);

  const startHotUpdate = async () => {
    setOtaState("downloading");
    setStatus("正在下载并校验热更新包…");
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

  const activateUpdate = async () => {
    try {
      await activateOtaNow(otaBundle);
    } catch (error) {
      setStatus(`更新未能启用：${error.message || "请重试"}`);
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
          setStatus(next.nativeUpgradeRequired ? "存档导出需要新版 APK 的文件保存功能，请下载完整安装包覆盖安装。" : next.hasUpdate ? `发现新版本 ${next.latestVersion}${channel}` : `当前 ${next.currentVersion} 已是最新版。${channel}`);
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
          <strong>{result?.autoUpdated ? `网页版 · ${WEB_BUILD}` : result?.currentVersion || APP_VERSION}</strong>
        </div>
        {result?.nativeVersion && <div className={styles.version}><span>APK 版本</span><strong>{result.nativeVersion}</strong></div>}
        <p className={styles.status} role="status">{status}</p>
        {result?.hasUpdate && <>
          <div className={styles.version}><span>最新版本</span><strong>{result.latestVersion}</strong></div>
          <div className={styles.notes}><strong>更新说明</strong><p>{result.notes}</p></div>
          {hotUpdate
            ? <p className={styles.hint}>下载完成后可重新载入；如果新版无法正常启动，将自动恢复可用版本，存档保持不变。</p>
            : <p className={styles.hint}>此版本需要下载完整 APK 覆盖安装，才能启用所需的原生功能。请保留原应用和存档，不要先卸载。</p>}
        </>}
        <div className={styles.actions}>
          <button className="button button--ghost" type="button" onClick={onClose}>稍后</button>
          {result?.hasUpdate && <>
            {downloadOptions.filter((option) => hotUpdate || !option.primary).map((option) => (
              <button key={option.key} className="button button--ghost" type="button" onClick={() => openUpdateDownload(option.url)}>
                {option.label}
              </button>
            ))}
            {otaState === "ready"
              ? <button className="button button--primary" type="button" onClick={activateUpdate}>立即重新载入</button>
              : hotUpdate
                ? <button className="button button--primary" type="button" disabled={otaState === "downloading"} onClick={startHotUpdate}>{otaState === "downloading" ? "热更新下载中…" : "热更新（免重装）"}</button>
                : <button className="button button--primary" type="button" onClick={() => openUpdateDownload(primaryDownload?.url || result.downloadUrl)}>{primaryDownload?.label || "下载并更新"}</button>}
          </>}
        </div>
        {result?.hasUpdate && <p className={styles.mirrorHint}>已优先使用国内下载镜像；WiFi 下若该通道不可用，可依次尝试备用镜像或 GitHub 直连，无需切换移动数据。</p>}
      </div>
    </Modal>
  );
}
