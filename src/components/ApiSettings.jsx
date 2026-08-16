import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./Forms.module.css";
import { listApiModels, testApiConnection } from "../services/api.js";
import { API_PROVIDER_PRESETS, createProviderProfile, getApiProvider } from "../services/apiProviders.js";
import { isNativeAndroid } from "../services/updates.js";

function captureProfile(settings) {
  return {
    baseUrl: settings.baseUrl || "",
    model: settings.model || "",
    apiKey: settings.apiKey || "",
    persistKey: Boolean(settings.persistKey),
  };
}

function withSavedModel(settings) {
  const model = (settings.model || "").trim();
  if (!model) return settings;
  const current = settings.savedModels?.[settings.provider] || [];
  return {
    ...settings,
    model,
    savedModels: {
      ...(settings.savedModels || {}),
      [settings.provider]: [model, ...current.filter((item) => item !== model)].slice(0, 8),
    },
  };
}

export default function ApiSettings({ settings, onSave, onClose, onCheckUpdate }) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const nativeAndroid = isNativeAndroid();
  const provider = getApiProvider(draft.provider);
  const models = useMemo(
    () => draft.modelCatalogs?.[draft.provider] || [],
    [draft.modelCatalogs, draft.provider],
  );
  const savedModels = draft.savedModels?.[draft.provider] || [];
  const reasoningHint = draft.provider === "deepseek"
    ? "DeepSeek 的“关闭”会发送 thinking.type=disabled；低、中档会按服务商兼容规则使用思考模式。"
    : draft.provider === "openai"
      ? "仅推理模型会收到该参数；“关闭 / 最低”会使用兼容性更好的最低推理强度。"
      : "兼容接口是否支持推理强度取决于服务商；不确定时保持“自动”。";
  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    return models.filter((model) => !query || model.toLowerCase().includes(query)).slice(0, 80);
  }, [modelQuery, models]);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const chooseProvider = (providerId) => {
    if (providerId === draft.provider) return;
    setDraft((current) => {
      const profiles = { ...(current.profiles || {}), [current.provider]: captureProfile(current) };
      const nextProfile = { ...createProviderProfile(providerId), ...(profiles[providerId] || {}) };
      return { ...current, ...nextProfile, provider: providerId, profiles, mockMode: false };
    });
    setModelQuery("");
    setStatus("");
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setStatus("");
    try {
      const nextModels = await listApiModels(draft);
      setDraft((current) => ({
        ...current,
        modelCatalogs: { ...(current.modelCatalogs || {}), [current.provider]: nextModels },
      }));
      setStatus(`已读取 ${nextModels.length} 个模型。输入关键词即可筛选。`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoadingModels(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setStatus("");
    try { setStatus(await testApiConnection(draft)); }
    catch (error) { setStatus(error.message); }
    finally { setTesting(false); }
  };

  const rememberModel = () => {
    const next = withSavedModel(draft);
    setDraft(next);
    setStatus(next.model ? `已把 ${next.model} 加入快捷模型。` : "请先填写模型名称。");
  };

  const submit = (event) => {
    event.preventDefault();
    onSave(withSavedModel(draft));
    onClose();
  };

  return (
    <Modal title="AI 接口设置" eyebrow="Connection dossier" onClose={onClose} wide>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.notice}>
          <strong>密钥安全：</strong>默认只保存在当前会话。启用“在此设备保存密钥”后，密钥会以明文存入本浏览器；不会进入剧情、错误日志或导出的游戏存档。
        </div>

        <fieldset className={styles.providerFieldset}>
          <legend>服务商预设</legend>
          <div className={styles.providerGrid}>
            {API_PROVIDER_PRESETS.map((item) => (
              <button
                key={item.id}
                className={`${styles.providerButton} ${draft.provider === item.id ? styles.providerButtonActive : ""}`}
                type="button"
                aria-pressed={draft.provider === item.id}
                onClick={() => chooseProvider(item.id)}
              >
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.providerMeta}>
          <span>当前接口</span>
          <strong>{provider.shortName}</strong>
          <small>可修改预设地址，以兼容代理或企业网关。</small>
        </div>

        <label className={styles.field}>
          <span>Base URL</span>
          <input value={draft.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" disabled={draft.mockMode} inputMode="url" />
        </label>

        <div className={styles.twoCol}>
          <label className={styles.field}>
            <span>API Key</span>
            <input
              className={nativeAndroid ? styles.secretInput : undefined}
              type={nativeAndroid ? "text" : "password"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              data-1p-ignore="true"
              data-lpignore="true"
              value={draft.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              placeholder="输入服务商密钥"
              disabled={draft.mockMode}
              spellCheck="false"
              aria-describedby="api-key-autofill-hint"
            />
            <small className={styles.helper} id="api-key-autofill-hint">密钥使用本地遮罩显示，并阻止系统把它识别为登录密码。</small>
          </label>
          <label className={styles.field}>
            <span>当前模型</span>
            <input value={draft.model} onChange={(event) => update("model", event.target.value)} placeholder={provider.defaultModel || "输入模型 ID"} disabled={draft.mockMode} spellCheck="false" />
          </label>
        </div>

        <label className={`${styles.switch} ${styles.dangerSwitch}`}>
          <input type="checkbox" checked={draft.persistKey} onChange={(event) => update("persistKey", event.target.checked)} disabled={draft.mockMode} />
          <span>
            <strong>在此设备保存密钥</strong>
            <small>关闭浏览器后仍可使用；仅建议在个人设备上启用，清理站点数据会删除密钥。</small>
          </span>
        </label>
        {draft.persistKey && draft.apiKey && <p className={styles.savedState}>保存设置后，{provider.shortName} 密钥会留在这台设备上。</p>}

        <section className={styles.modelPanel} aria-labelledby="model-panel-title">
          <div className={styles.modelPanelHeading}>
            <div><span>MODEL CATALOG</span><h3 id="model-panel-title">模型搜索与快捷保存</h3></div>
            <div className={styles.inlineActions}>
              <button className="button button--ghost" type="button" onClick={loadModels} disabled={draft.mockMode || loadingModels}>
                {loadingModels ? "正在读取…" : "读取模型"}
              </button>
              <button className="button button--ghost" type="button" onClick={rememberModel} disabled={draft.mockMode || !draft.model.trim()}>保存当前模型</button>
            </div>
          </div>
          <label className={styles.field}>
            <span>筛选模型</span>
            <input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder={models.length ? `在 ${models.length} 个模型中搜索` : "先点击“读取模型”"} disabled={!models.length || draft.mockMode} type="search" />
          </label>
          {savedModels.length > 0 && (
            <div className={styles.savedModels} aria-label="已保存模型">
              <span>快捷模型</span>
              <div>{savedModels.map((model) => <button key={model} type="button" onClick={() => update("model", model)} aria-pressed={draft.model === model}>{model}</button>)}</div>
            </div>
          )}
          {models.length > 0 && (
            <div className={styles.modelResults} role="listbox" aria-label="接口模型列表">
              {filteredModels.length ? filteredModels.map((model) => (
                <button key={model} type="button" role="option" aria-selected={draft.model === model} onClick={() => update("model", model)}>{model}</button>
              )) : <p>没有匹配的模型。</p>}
            </div>
          )}
          <p className={styles.helper}>若浏览器跨域策略阻止模型列表请求，仍可手动填写模型 ID 并保存。</p>
        </section>

        <div className={styles.threeCol}>
          <label className={styles.field}><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={draft.temperature} onChange={(event) => update("temperature", event.target.value)} /></label>
          <label className={styles.field}><span>Max Tokens</span><input type="number" min="128" max="384000" value={draft.maxTokens} onChange={(event) => update("maxTokens", event.target.value)} /></label>
          <label className={styles.field}><span>上下文长度</span><input type="number" min="2000" max="1000000" value={draft.contextLength} onChange={(event) => update("contextLength", event.target.value)} /></label>
        </div>
        <label className={styles.field}>
          <span>推理模式</span>
          <select value={draft.reasoningMode || "auto"} onChange={(event) => update("reasoningMode", event.target.value)} disabled={draft.mockMode}>
            <option value="auto">自动 · 使用服务商默认值</option>
            <option value="off">关闭 / 最低 · 优先保留正文预算</option>
            <option value="low">低 · 更快、更省输出</option>
            <option value="medium">中 · 平衡</option>
            <option value="high">高 · 更多推理</option>
          </select>
          <small className={styles.helper}>{reasoningHint}</small>
        </label>
        <label className={styles.field}><span>自定义请求头 · JSON</span><textarea rows="3" value={draft.customHeaders} onChange={(event) => update("customHeaders", event.target.value)} spellCheck="false" /></label>
        <fieldset className={styles.switches}><legend>协议能力</legend>
          {[
            ["mockMode", "Mock 模式", "无需 API 也能完整体验"], ["stream", "流式输出", "逐步呈现模型回复"],
            ["nativeTools", "原生 Tool Calling", "优先接收函数调用提议"], ["jsonMode", "JSON 兼容模式", "使用结构化回退协议"],
            ["autoRetryReasoning", "推理耗尽自动恢复", "先保留推理并增加输出预算；仍失败时才降低推理并使用兼容模式"],
          ].map(([key, label, hint]) => <label key={key} className={styles.switch}><input type="checkbox" checked={draft[key]} onChange={(event) => update(key, event.target.checked)} /><span><strong>{label}</strong><small>{hint}</small></span></label>)}
        </fieldset>
        {status && <p className={styles.status} role="status">{status}</p>}
        <div className={styles.actions}>
          <button className="button button--ghost" type="button" onClick={onCheckUpdate}>检查版本状态</button>
          <button className="button button--ghost" type="button" onClick={test} disabled={testing || loadingModels}>{testing ? "正在测试…" : "测试连接"}</button>
          <button className="button button--primary" type="submit">保存全部设置</button>
        </div>
      </form>
    </Modal>
  );
}
