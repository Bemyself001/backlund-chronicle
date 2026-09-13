import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CharacterPanel, InventoryPanel, JournalPanel, MenuPanel } from "./GamePanels.jsx";
import GameIcon from "./GameIcon.jsx";
import { getAuditRows, normalizeReadingPreferences, READING_KEY, RISK_LABELS, shouldSubmitAction } from "./gameUi.js";
import { formatMoney, normalizeMoney } from "../system/money.js";
import { APP_VERSION } from "../services/updates.js";
import { RELEASE_NAME } from "../data/release.js";
import styles from "./GameScreen.module.css";

const NAVIGATION = [["story", "剧情"], ["character", "角色"], ["inventory", "行囊"], ["journal", "手记"], ["map", "地图"]];
const PANEL_NAMES = { character: "角色档案", inventory: "行囊", journal: "调查手记", menu: "游戏菜单" };
const PHASE_MESSAGES = {
  generating: "正在生成后续剧情", manualRetry: "正在重试这次行动", thinking: "正在思考，正文稍后抵达",
  streaming: "剧情正在抵达", budgetRecovery: "正在继续生成，请稍候", toolRetry: "正在整理行动结果",
  choiceRetry: "正在生成行动建议", reasoningRetry: "正在重新生成，请稍候", validating: "正在核对行动结果",
  itemConfirmation: "等待你确认重要变更", finalizing: "正在整理本轮结果",
};

function loadReading() {
  try { return normalizeReadingPreferences(JSON.parse(localStorage.getItem(READING_KEY))); }
  catch { return normalizeReadingPreferences(); }
}

function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

const StoryHistory = memo(function StoryHistory({ messages }) {
  return messages.map((message, index) => <div key={message.id} data-reader-entry={message.id} className={styles.historyEntry}>
    {(index === 0 || messages[index - 1].turn !== message.turn) && <div className={styles.turnDivider}><span>{message.turn === 0 ? "序章" : `第 ${message.turn} 轮`}</span><i /></div>}
    {message.role === "assistant" ? <article className={styles.narrative}>
      {message.content.split("\n").filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
      <small className={styles.aiTag}>含 AI 生成内容</small>
    </article> : <blockquote className={styles.playerLine}><span>你的行动</span>{message.content}</blockquote>}
  </div>);
});

function TurnProgress({ phase }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className={styles.turnStatus}>
    <p role="status"><span className={styles.activityDot} aria-hidden="true" />{PHASE_MESSAGES[phase] || PHASE_MESSAGES.generating}</p>
    <small>{elapsed > 4 ? `已等待 ${elapsed} 秒 · ` : ""}本轮尚未保存</small>
  </div>;
}

export default function GameScreen(props) {
  return <GameSession key={props.game.id} {...props} />;
}

function GameSession({ game, loading, turnPhase, streamText, error, mockMode, onAction, onAbort, onRetry, onRegenerateChoices, onLocalTool, onOpenMap, onOpenApi, onOpenPrompt, onOpenSaves, onHome }) {
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState(null);
  const [journalRequest, setJournalRequest] = useState(0);
  const [reading, setReading] = useState(loadReading);
  const [followingLatest, setFollowingLatest] = useState(game.turn > 0);
  const [editing, setEditing] = useState(false);
  const [choicesFolded, setChoicesFolded] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [readingNotice, setReadingNotice] = useState("");
  const wide = useWideScreen();
  const shellRef = useRef(null);
  const storyRef = useRef(null);
  const paneRef = useRef(null);
  const closeRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const busyRef = useRef(false);
  const followRef = useRef(false);
  const initializedRef = useRef(false);
  const anchorRef = useRef({ top: 0, id: null, offset: 0 });
  const previousFirstRef = useRef(null);
  const money = normalizeMoney(game.money);
  const auditRows = getAuditRows(game.lastTurnAudit);
  const activeEffects = game.statusEffects.filter(effect => effect.kind === "danger" || effect.tick);
  const panelOpen = Boolean(panel);

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      if (viewport && viewport.scale === 1) shellRef.current?.style.setProperty("--game-viewport-height", `${viewport.height}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    return () => viewport?.removeEventListener("resize", resize);
  }, []);

  const rememberPosition = () => {
    const scroller = storyRef.current;
    if (!scroller) return;
    const top = scroller.getBoundingClientRect().top;
    const entry = [...scroller.querySelectorAll("[data-reader-entry]")].find(element => element.getBoundingClientRect().bottom > top);
    anchorRef.current = { top: scroller.scrollTop, id: entry?.dataset.readerEntry || null, offset: entry ? entry.getBoundingClientRect().top - top : 0 };
  };

  useLayoutEffect(() => {
    const scroller = storyRef.current;
    if (!scroller) return;
    const first = game.recentDialogues[0]?.id;
    if (!initializedRef.current) {
      const entries = scroller.querySelectorAll("[data-reader-entry]");
      const lastUser = [...game.recentDialogues].reverse().find(message => message.role === "user");
      const target = lastUser && [...entries].find(element => element.dataset.readerEntry === lastUser.id);
      scroller.scrollTop = target ? target.offsetTop - scroller.offsetTop - 24 : 0;
      initializedRef.current = true;
    } else if (loading && followRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
    } else if (!loading || previousFirstRef.current !== first) {
      const anchor = anchorRef.current;
      const entry = [...scroller.querySelectorAll("[data-reader-entry]")].find(element => element.dataset.readerEntry === anchor.id);
      if (entry) scroller.scrollTop += entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset;
      else scroller.scrollTop = Math.min(anchor.top, scroller.scrollHeight - scroller.clientHeight);
    }
    previousFirstRef.current = first;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 72;
    followRef.current = nearBottom;
    setFollowingLatest(nearBottom);
    // Completion preserves reading position instead of jumping past new narrative.
    rememberPosition();
  }, [game.recentDialogues, loading, streamText, panel, wide, reading.fontSize]);

  useEffect(() => {
    if (panelOpen) closeRef.current?.focus({ preventScroll: true });
  }, [panelOpen]);

  const changePanel = (next, event, forceOpen = false) => {
    if (next === "map") { onOpenMap(); return; }
    if (next === "story" || (next === panel && !forceOpen)) {
      setPanel(null);
      requestAnimationFrame(() => triggerRef.current?.isConnected && triggerRef.current.focus({ preventScroll: true }));
      return;
    }
    rememberPosition();
    triggerRef.current = event?.currentTarget || document.activeElement;
    setPanel(next);
    requestAnimationFrame(() => { if (paneRef.current) paneRef.current.scrollTop = 0; });
  };
  const closePanel = () => changePanel("story");
  const jumpToLatest = () => {
    followRef.current = true;
    setFollowingLatest(true);
    storyRef.current?.scrollTo({ top: storyRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const handleScroll = () => {
    const scroller = storyRef.current;
    if (!scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 72;
    followRef.current = nearBottom;
    setFollowingLatest(nearBottom);
    rememberPosition();
  };
  const updateReading = next => {
    const normalized = normalizeReadingPreferences(next);
    setReading(normalized);
    try { localStorage.setItem(READING_KEY, JSON.stringify(normalized)); setReadingNotice(""); }
    catch { setReadingNotice("阅读设置已生效，但当前浏览器无法保存偏好。"); }
  };
  const performAction = async (action, options, clearDraft = false) => {
    if (loading || busyRef.current || !action.trim()) return false;
    busyRef.current = true;
    followRef.current = true;
    setFollowingLatest(true);
    setPendingAction(action);
    setPanel(null);
    setEditing(false);
    inputRef.current?.blur();
    try {
      const completed = await onAction(action, options);
      if (completed && clearDraft) setInput("");
      return completed;
    } finally { busyRef.current = false; }
  };
  const submit = () => performAction(input.trim(), undefined, true);
  const retry = async () => {
    if (loading || busyRef.current) return;
    busyRef.current = true;
    followRef.current = true;
    try { const completed = await onRetry(); if (completed && input.trim() === pendingAction.trim()) setInput(""); }
    finally { busyRef.current = false; }
  };

  return <main ref={shellRef} className={styles.shell} id="main" data-theme={reading.theme} data-editing={editing || undefined} style={{ "--reading-size": `${reading.fontSize}px` }} onKeyDown={event => {
    if (event.key === "Escape" && panel && !document.querySelector("dialog[open]")) { event.preventDefault(); closePanel(); }
  }}>
    <header className={styles.topbar}>
      <div className={styles.wordmark}><span className={styles.brandSeal} aria-hidden="true">纪</span><h1>贝克兰德纪事 <small>{RELEASE_NAME}</small></h1></div>
      <div className={styles.chapter}>第 {String(game.chapter.number).padStart(2, "0")} 章 <span>·</span> {game.chapter.title}</div>
      <div className={styles.topActions}><button type="button" className={styles.modeButton} onClick={onOpenApi}>{mockMode ? "离线演示" : "AI 模式"}</button><button type="button" onClick={onOpenSaves} className={styles.quickSave}>存档</button><button type="button" className={styles.menuButton} onClick={event => changePanel("menu", event)} aria-expanded={panel === "menu"} aria-controls="game-dossier"><GameIcon name="menu" /><span>菜单</span></button></div>
    </header>
    <div className={styles.statusbar}>
      <div className={styles.whereabouts}><button type="button" onClick={onOpenMap}>{game.location.name}<span aria-hidden="true">↗</span></button><span className={styles.worldTime}>{game.worldTime}</span></div>
      <div className={styles.vitals}>
        {[["health", "生命"], ["sanity", "理智"], ["spirituality", "灵性"]].map(([key, label]) => {
          const max = game.character.stats[`max${key[0].toUpperCase()}${key.slice(1)}`];
          const value = game.character.stats[key];
          return <button type="button" key={key} className={styles.vital} data-stat={key} data-low={value <= max * .25 || undefined} onClick={event => changePanel("character", event)} aria-label={`${label} ${value}/${max}${value <= max * .25 ? "，偏低" : ""}，查看角色`}><span><span className={styles.vitalLabel}>{label}</span><strong>{value}<small>/{max}</small></strong></span><i aria-hidden="true"><b style={{ width: `${max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0}%` }} /></i></button>;
        })}
        <button type="button" className={styles.money} onClick={event => changePanel("inventory", event)} aria-label={`资金 ${formatMoney(money)}，查看行囊`}><span>资金</span><strong>£{money.pounds}<small> · {money.solers}苏 · {money.pence}便</small></strong></button>
      </div>
    </div>
    {activeEffects.length > 0 && <button className={styles.effectStrip} type="button" onClick={event => changePanel("character", event)}>{activeEffects.map(effect => effect.name).join(" · ")}<span>查看影响 →</span></button>}
    <div className={`${styles.workspace} ${panelOpen ? styles.hasPanel : ""}`}>
      <nav className={styles.navigation} aria-label="游戏功能">{NAVIGATION.map(([id, label]) => <button type="button" key={id} aria-current={id === (panel || "story") ? "page" : undefined} onClick={event => changePanel(id, event)}><GameIcon name={id} /><span>{label}</span></button>)}</nav>
      <section className={styles.story} aria-label="剧情与行动" inert={panelOpen && !wide ? true : undefined}>
        <div className={styles.storyViewport}>
          <div className={styles.storyScroll} ref={storyRef} onScroll={handleScroll}>
            <div className={styles.manuscript}>
              <div className={styles.sceneHeading}><span>BACKLUND CHRONICLE</span><span>{game.turn === 0 ? "故事从这里开始" : `已完成 ${game.turn} 轮`}</span></div>
              {mockMode && game.turn === 0 && <p className={styles.mockTip}>离线演示 · 剧情由本地生成 <button type="button" onClick={onOpenApi}>配置 AI ↗</button></p>}
              <StoryHistory messages={game.recentDialogues} />
              {loading && <div data-reader-entry="stream" className={styles.pending}><div className={styles.turnDivider}><span>{turnPhase === "choiceRetry" ? "行动建议" : `第 ${game.turn + 1} 轮`}</span><i /></div>{pendingAction && busyRef.current && turnPhase !== "choiceRetry" && <blockquote className={styles.playerLine}><span>你的行动</span>{pendingAction}</blockquote>}<TurnProgress phase={turnPhase} />{streamText && <article className={styles.narrative} aria-busy="true">{streamText.split("\n").filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}<small className={styles.aiTag}>含 AI 生成内容 · 结果待确认</small></article>}</div>}
              {error && <div className={styles.error} role="alert"><strong>本轮未能完成</strong><p>{error}</p><button type="button" disabled={loading} onClick={retry}>重试本轮</button></div>}
              {!loading && game.lastTurnAudit && <button className={styles.turnResult} type="button" onClick={event => { setJournalRequest(value => value + 1); changePanel("journal", event, true); }}><span><small>{game.lastTurnAudit.importantItemConfirmation?.status === "player-action" ? "最近物品操作" : `第 ${game.lastTurnAudit.turn} 轮 · 已确认`}</small>{auditRows.length ? auditRows.slice(0, 2).map(row => row.text).join("；") : "物品、资金与属性没有变化"}{auditRows.length > 2 ? `，另有 ${auditRows.length - 2} 项` : ""}</span><span aria-hidden="true">↗</span></button>}
              {!loading && <section className={styles.interaction} aria-label="下一步行动"><div className={styles.choiceHeading}><h2>接下来，你打算……</h2><button type="button" aria-expanded={!choicesFolded} aria-controls="action-choices" onClick={() => setChoicesFolded(value => !value)}>{choicesFolded ? "展开建议" : "收起建议"}</button></div>
                {game.choiceMeta?.source === "unavailable" && <p className={styles.choiceNote}>建议暂不可用，你仍可以自由输入行动。</p>}
                <div id="action-choices" className={styles.choices} hidden={choicesFolded}>{game.choices?.length ? game.choices.map((choice, i) => <button type="button" key={`${choice.intent}-${i}`} disabled={loading} onClick={() => performAction(choice.label)}><span>{String(i + 1).padStart(2, "0")}</span><strong>{choice.label}</strong><small data-risk={choice.risk}>{RISK_LABELS[choice.risk] || "行动"}</small></button>) : <button type="button" onClick={onRegenerateChoices} disabled={loading || mockMode}><span>↻</span><strong>{mockMode ? "请在下方自由输入行动" : "重新生成行动建议"}</strong></button>}</div>
              </section>}
            </div>
          </div>
          {!followingLatest && <button className={styles.jumpLatest} type="button" onClick={jumpToLatest}>{loading ? "跟随新剧情 ↓" : "回到最新 ↓"}</button>}
        </div>
        <form className={styles.composer} onSubmit={event => { event.preventDefault(); submit(); }}>
          <div className={styles.composerInner}><label className={styles.inputLabel}><span>自由行动</span><textarea aria-label="自由行动" ref={inputRef} rows="1" value={input} onChange={event => setInput(event.target.value)} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onKeyDown={event => { if (shouldSubmitAction(event) && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); submit(); } }} placeholder="描述你的行动、问题或对话…" disabled={loading} /></label>{loading ? <button type="button" className={styles.abort} onClick={onAbort}>中止生成</button> : <button type="submit" className={styles.submit} disabled={!input.trim()}>提交行动 <span aria-hidden="true">↗</span></button>}</div>
          <div className={styles.composerMeta}><span>Enter 发送 · Shift + Enter 换行</span><span>{loading ? "本轮尚未保存" : "进度自动保存"}</span></div>
        </form>
      </section>
      {panelOpen && <><button className={styles.panelScrim} type="button" onClick={closePanel} aria-label="关闭资料面板" tabIndex={-1} /><aside id="game-dossier" className={styles.dossier} aria-label={PANEL_NAMES[panel]}><div className={styles.dossierHeading}><div><small>PRIVATE DOSSIER</small><h2>{PANEL_NAMES[panel]}</h2></div><button ref={closeRef} type="button" onClick={closePanel} aria-label="关闭资料，返回剧情">返回剧情 <span aria-hidden="true">×</span></button></div><div className={styles.dossierScroll} ref={paneRef}>
        <div hidden={panel !== "character"}><CharacterPanel game={game} /></div>
        <div hidden={panel !== "inventory"}><InventoryPanel game={game} onLocalTool={onLocalTool} onAction={performAction} disabled={loading} /></div>
        <div hidden={panel !== "journal"}><JournalPanel key={journalRequest} game={game} /></div>
        <div hidden={panel !== "menu"}><MenuPanel reading={reading} onReadingChange={updateReading} onOpenApi={onOpenApi} onOpenPrompt={onOpenPrompt} onOpenSaves={onOpenSaves} onHome={onHome} version={`${RELEASE_NAME} · ${APP_VERSION}`} />{readingNotice && <p className={styles.readingNotice} role="status">{readingNotice}</p>}</div>
      </div></aside></>}
    </div>
  </main>;
}
