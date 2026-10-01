import { useEffect, useRef, useState } from "react";
import { APP_VERSION, WEB_BUILD, isNativeAndroid } from "../services/updates.js";
import { collectScrollReport, watchScrollGestures } from "../services/scrollDiagnostics.js";
import styles from "./ScrollHelp.module.css";

export default function ScrollHelp() {
  const [report, setReport] = useState("");
  const [status, setStatus] = useState("");
  const textRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    const dialog = containerRef.current?.closest("dialog");
    if (dialog) return watchScrollGestures(dialog);
  }, []);
  if (!isNativeAndroid()) return null;
  const copy = async () => {
    // Capture before expanding the fallback field, so it cannot affect measurements.
    const nextReport = JSON.stringify(collectScrollReport(window, { appVersion: APP_VERSION, build: WEB_BUILD, page: "api-settings" }), null, 2);
    setReport(nextReport);
    try {
      await navigator.clipboard.writeText(nextReport);
      setStatus("已复制，可粘贴给开发者。");
    } catch {
      requestAnimationFrame(() => { textRef.current?.focus(); textRef.current?.select(); });
      setStatus("自动复制不可用，已选中诊断信息，请长按复制。");
    }
  };
  return <div className={styles.content} ref={containerRef}>
    <button className="button button--ghost" type="button" onClick={copy}>复制滚动诊断</button>
    <p>若此页仍滑不动，请尝试上下滑动后复制诊断。不含密钥或存档，不自动上传。</p>
    {status && <p role="status">{status}</p>}
    {report && <label>诊断信息<textarea ref={textRef} readOnly rows={4} value={report} /></label>}
  </div>;
}
