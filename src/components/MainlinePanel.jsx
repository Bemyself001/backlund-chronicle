import { useState } from "react";
import { mainlineView } from "../engine/mainline.js";
import styles from "./MainlinePanel.module.css";

export default function MainlinePanel({ game, disabled, onExecute, onOpenMap, onConversation }) {
  const view = mainlineView(game), current = view.current;
  const [codename, setCodename] = useState("");
  const [consent, setConsent] = useState(false);
  const request = operation => ({ operation, mainlineRevision: view.revision, expectedTurn: game.turn, expectedWorldTime: game.worldTime,
    stepId: current?.id, codename, confirmed: consent });
  const ready = !disabled && game.character.stats.health > 0 && game.character.stats.sanity > 0;
  return <section className={styles.panel} aria-label="主线档案">
    <header className={styles.cover}><p className={styles.eyebrow}>一段属于你的雾都故事</p><h3>{view.title}</h3><p>{view.description}</p>
      <label className={styles.progress}>主线进度 · {view.done}/{view.total}<progress max={view.total} value={view.done} /></label>
    </header>
    <details className={styles.roadmap}><summary>{view.chapters.find(chapter => chapter.current)?.title || "三章旅程已完成"} · 查看章节</summary><ol className={styles.chapters} aria-label="主线章节">{view.chapters.map(chapter => <li key={chapter.id} aria-current={chapter.current ? "step" : undefined}>
      <strong>{chapter.title}</strong><span>{chapter.done}/{chapter.total}</span><p>{chapter.summary}</p>
    </li>)}</ol></details>
    {view.lastResult && <article className={`${styles.card} ${styles.result}`} aria-label="上一步主线结果"><h4>刚刚发生的事</h4><p>{view.lastResult}</p></article>}
    {view.status === "unstarted" ? <article className={styles.card}><h4>从一份旧报开始</h4><p>{current.scene}</p><p className={styles.hint}>开始后会记入任务手记。你可以随时处理别的事情，章节进度会保留。</p>
      <button className={styles.primary} type="button" disabled={!ready} onClick={() => onExecute(request("mainline-start"))}>开始调查 · 5分钟</button>
    </article> : current && <article className={styles.card} aria-label="当前主线目标"><p className={styles.eyebrow}>{view.chapters.find(chapter => chapter.id === current.chapter)?.title}</p>
      <h4>{current.title}</h4><p>{current.scene}</p><p className={styles.objective}>{current.objective}</p>
      <p className={styles.hint}>{view.aboveGrayFog ? "意识所在 · 灰雾之上；身体与行囊留在雾鸦旅店" : `地点 · ${current.locationName}`}</p>
      {!view.aboveGrayFog && <div className={styles.buttons}><button type="button" disabled={!onOpenMap} onClick={() => onOpenMap(current.locationId)}>在地图查看</button>
        {!current.onSite && <button type="button" className={styles.primary} disabled={!ready} onClick={() => onExecute(request("mainline-travel"))}>前往目标地点 · 按行程耗时</button>}
      </div>}
      {view.aboveGrayFog ? <fieldset className={styles.oath}><legend>决定你的塔罗身份</legend><p>选择一个空缺代号，确认后将正式记录为塔罗会成员。</p>
        <label>塔罗代号<select aria-label="塔罗代号" value={codename} disabled={disabled} onChange={event => { setCodename(event.target.value); setConsent(false); }}><option value="">请选择你的代号</option>{view.codenames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className={styles.consent}><input type="checkbox" checked={consent} disabled={disabled || !codename} onChange={event => setConsent(event.target.checked)} /><span>我愿以「{codename || "所选代号"}」加入塔罗会，遵守聚会约定并保护成员隐私。</span></label>
        <button className={styles.primary} type="button" disabled={!ready || !consent || !codename} onClick={() => onExecute(request("mainline-step"))}>确认代号并正式入会 · 10分钟</button>
        <button type="button" disabled={!ready} onClick={() => { const result = onExecute(request("mainline-defer")); if (result?.ok) { setConsent(false); setCodename(""); } }}>暂缓加入，告辞离开 · 5分钟</button>
      </fieldset> : <button className={styles.primary} type="button" disabled={!ready || !current.onSite} onClick={() => onExecute(request("mainline-step"))}>{current.onSite ? `${current.label} · ${current.minutes}分钟` : "到达后可继续调查"}</button>}
    </article>}
    {view.membership && <article className={styles.membership} aria-label="塔罗会成员身份"><p className={styles.eyebrow}>你的席位已被记住</p><h4>「{view.membership.codename}」</h4><p>塔罗会正式成员 · 第{view.membership.joinedTurn}轮加入</p><p>三章主线已完成。你的代号与第一次会面保存在档案中，可以继续探索贝克兰德，也可以向阿兹克写信。</p></article>}
    {view.hasWhistle && <article className={styles.card}><h4>一枚铜哨，一位收信人</h4><p className={styles.hint}>阿兹克的骸骨信使可以替你递送信件。已有的往来会随存档保存。</p><button type="button" disabled={disabled || view.aboveGrayFog} onClick={onConversation}>打开阿兹克的书信对话</button></article>}
  </section>;
}
