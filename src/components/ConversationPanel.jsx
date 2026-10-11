import { useEffect, useRef, useState } from "react";
import { DIALOGUE_PEOPLE } from "../content/index.js";
import { conversationView, MAX_LETTER_LENGTH } from "../engine/conversations.js";
import { shouldSubmitAction } from "./gameUi.js";
import styles from "./ConversationPanel.module.css";

export default function ConversationPanel({ game, disabled, drafts, onSend, onAbort, onOpenApi, onMainline }) {
  const [personId, setPersonId] = useState(DIALOGUE_PEOPLE[0].id);
  const draftKey = `${game.id}:${personId}`;
  const draft = drafts?.entries?.[draftKey]?.text || "";
  const error = drafts?.entries?.[draftKey]?.error || "";
  const sending = drafts?.entries?.[draftKey]?.pending || false;
  const [visibleCount, setVisibleCount] = useState(12);
  const end = useRef(null), input = useRef(null), inFlight = useRef(false);
  const view = conversationView(game, personId), count = Array.from(draft).length;
  const busy = disabled || sending;
  // 草稿只保存在当前应用会话中，切换面板或查看模型设置不会丢失。
  const setDraft = text => drafts?.update(draftKey, { text });
  const setError = value => drafts?.update(draftKey, { error: value });
  const setSending = value => drafts?.update(draftKey, { pending: value });
  useEffect(() => { if (view.messages.length) end.current?.scrollIntoView({ block: "nearest" }); }, [view.messages.length, personId]);
  const submit = async () => {
    if (busy || inFlight.current || view.gate || !draft.trim() || count > MAX_LETTER_LENGTH || !onSend) return;
    inFlight.current = true; setSending(true); setError("");
    try {
      const result = await onSend(personId, draft);
      if (result?.ok) { setDraft(""); requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); }
      else setError(result?.error || "这封信尚未完成，请重试。");
    } catch (err) { setError(err.message || "这封信尚未完成，请重试。"); }
    finally { inFlight.current = false; setSending(false); }
  };
  return <section className={styles.panel} aria-label="人物书信对话">
    <header className={styles.header}><p className={styles.eyebrow}>人物对话 · 来往书信</p><h3>总有一位收信人</h3><p>在这座城市里，留下的不必只有调查记录。</p></header>
    <nav className={styles.people} aria-label="书信联系人">{DIALOGUE_PEOPLE.map(person => <button type="button" key={person.id} aria-pressed={personId === person.id} disabled={busy} onClick={() => { setPersonId(person.id); setVisibleCount(12); }}>{person.shortName}</button>)}</nav>
    <article className={styles.contact}><div className={styles.monogram} aria-hidden="true">信</div><div><h4>{view.person.name}</h4><p>{view.person.channel} · {view.messages.length / 2}封往来</p></div><p className={styles.description}>{view.person.description}</p></article>
    {view.gate && <aside className={styles.locked}><p>{view.gate}</p>{!view.messages.length && <p>三章主线的第二章会建立这段联系；旧任务中已经获得的铜哨同样可用。</p>}<button type="button" onClick={onMainline}>查看主线档案</button></aside>}
    <section className={styles.history} aria-label="往来信件">
      {view.messages.length > visibleCount && <button type="button" onClick={() => setVisibleCount(value => value + 20)}>查看更早的信件（{view.messages.length - visibleCount}条）</button>}
      {!view.messages.length && <p className={styles.empty}>{view.gate ? "铜哨交到手中后，你的第一封信将在这里启程。" : "还没有往来信件。写下你的问题，或者和他聊聊今天的经历。"}</p>}
      {view.messages.slice(-visibleCount).map(message => <article key={message.id} className={styles.letter} data-role={message.role}><div className={styles.meta}><strong>{message.role === "user" ? "你寄出的信" : `${view.person.shortName}的回信`}</strong><small>第{message.turn}轮</small></div><p>{message.content}</p><small className={styles.date}>{message.worldTime}</small></article>)}
      {sending && <p role="status" className={styles.pending}>正在等候信使带回回信…</p>}<span ref={end} />
    </section>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className={styles.topics} aria-label="快捷话题">{view.person.topics.map(topic => <button type="button" key={topic} disabled={busy || Boolean(view.gate)} onClick={() => { setDraft(topic); input.current?.focus(); }}>{topic}</button>)}</div>
      <label>写给{view.person.shortName}<textarea ref={input} aria-label={`写给${view.person.shortName}`} value={draft} disabled={busy || Boolean(view.gate)} rows={5} placeholder="写下你想问的问题，或告诉他一件最近发生的事…" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (shouldSubmitAction(event) && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); submit(); } }} /></label>
      <p className={styles.hint}>{count}/{MAX_LETTER_LENGTH}字 · 完成一次往来耗时15分钟、1回合</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.buttons}>{sending ? <button key="abort" type="button" onClick={event => { event.preventDefault(); onAbort?.(); }}>中止等待，保留草稿</button> : <button key="send" type="submit" className={styles.primary} disabled={busy || Boolean(view.gate) || !draft.trim() || count > MAX_LETTER_LENGTH || !onSend}>交给信使，等候回信</button>}
        <button type="button" onClick={onOpenApi} disabled={busy || !onOpenApi}>对话模型设置</button></div>
      <p className={styles.hint}>使用你已配置的模型生成回信。失败或中止时，草稿保留，游戏内时间与往来记录不变。</p>
    </form>
  </section>;
}
