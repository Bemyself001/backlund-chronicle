import { useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./Forms.module.css";
import { testApiConnection } from "../services/api.js";

export default function ApiSettings({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const test = async () => {
    setTesting(true); setStatus("");
    try { setStatus(await testApiConnection(draft)); }
    catch (error) { setStatus(error.message); }
    finally { setTesting(false); }
  };
  return (
    <Modal title="自定义 API" eyebrow="Connection dossier" onClose={onClose} wide>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onSave(draft); onClose(); }}>
        <div className={styles.notice}><strong>密钥安全：</strong>默认仅保存在当前浏览器会话，绝不会写入剧情、错误日志或导出的游戏存档。</div>
        <div className={styles.twoCol}>
          <label className={styles.field}><span>Base URL</span><input value={draft.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.openai.com/v1" disabled={draft.mockMode} /></label>
          <label className={styles.field}><span>Model</span><input value={draft.model} onChange={(e) => update("model", e.target.value)} placeholder="gpt-4.1-mini" disabled={draft.mockMode} /></label>
        </div>
        <label className={styles.field}><span>API Key</span><input type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => update("apiKey", e.target.value)} placeholder="sk-…" disabled={draft.mockMode} /></label>
        <div className={styles.threeCol}>
          <label className={styles.field}><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={draft.temperature} onChange={(e) => update("temperature", e.target.value)} /></label>
          <label className={styles.field}><span>Max Tokens</span><input type="number" min="128" max="32000" value={draft.maxTokens} onChange={(e) => update("maxTokens", e.target.value)} /></label>
          <label className={styles.field}><span>上下文长度</span><input type="number" min="2000" max="200000" value={draft.contextLength} onChange={(e) => update("contextLength", e.target.value)} /></label>
        </div>
        <label className={styles.field}><span>自定义请求头 · JSON</span><textarea rows="3" value={draft.customHeaders} onChange={(e) => update("customHeaders", e.target.value)} spellCheck="false" /></label>
        <fieldset className={styles.switches}><legend>协议能力</legend>
          {[
            ["mockMode", "Mock 模式", "无需 API 也能完整体验"], ["stream", "流式输出", "逐步呈现模型回复"],
            ["nativeTools", "原生 Tool Calling", "优先接收函数调用提议"], ["jsonMode", "JSON 兼容模式", "使用结构化回退协议"],
          ].map(([key, label, hint]) => <label key={key} className={styles.switch}><input type="checkbox" checked={draft[key]} onChange={(e) => update(key, e.target.checked)} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}
        </fieldset>
        <label className={`${styles.switch} ${styles.dangerSwitch}`}><input type="checkbox" checked={draft.persistKey} onChange={(e) => update("persistKey", e.target.checked)} /><span><strong>跨会话保存 API Key</strong><small>这会把密钥保存在浏览器 LocalStorage；共享设备上不建议启用。</small></span></label>
        {status && <p className={styles.status} role="status">{status}</p>}
        <div className={styles.actions}><button className="button button--ghost" type="button" onClick={test} disabled={testing}>{testing ? "正在测试…" : "测试连接"}</button><button className="button button--primary" type="submit">保存设置</button></div>
      </form>
    </Modal>
  );
}

