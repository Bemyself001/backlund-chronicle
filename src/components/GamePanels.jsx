import { memo, useRef, useState } from "react";
import { getAdvancement } from "../system/character.js";
import { getTalent } from "../content/index.js";
import { STAT_LABELS } from "../engine/statChanges.js";
import { formatMoney } from "../system/money.js";
import { getPotionAdvancementEligibility } from "../services/advancement.js";
import { getAuditRows } from "./gameUi.js";
import styles from "./GamePanels.module.css";

export const CharacterPanel = memo(function CharacterPanel({ game }) {
  const { character } = game;
  const advancement = getAdvancement(character);
  const talent = getTalent(character.talent);
  return <div className={styles.content}>
    <div className={styles.profile}>
      <div className={styles.avatar}>{character.avatar ? <img src={character.avatar} alt={`${character.name}的头像`} /> : <span aria-hidden="true">{character.name.slice(0, 1)}</span>}</div>
      <div><p>{advancement.type === "extraordinary" ? `${advancement.pathwayName} · ${advancement.sequenceLabel}` : "普通人"}</p><h3>{character.name}</h3><span>{character.occupation} · {character.age} 岁</span></div>
    </div>
    <section><h3>角色状态</h3><dl className={styles.dataList}>{Object.entries(STAT_LABELS).map(([key, label]) => <div key={key} data-stat={key}><dt>{label}</dt><dd>{character.stats[key]} / {character.stats[`max${key[0].toUpperCase()}${key.slice(1)}`]}</dd></div>)}</dl></section>
    <section><h3>当前影响</h3>{game.statusEffects.length ? game.statusEffects.map(status => <article className={styles.record} key={status.id} data-tone={status.kind === "danger" ? "loss" : "neutral"}><h4>{status.name}</h4><p>{status.description}</p>{status.tick && <small>每轮：{Object.entries(status.tick).map(([key, delta]) => `${STAT_LABELS[key] || key}${delta > 0 ? "+" : ""}${delta}`).join("，")}</small>}</article>) : <p className={styles.muted}>状态稳定。</p>}</section>
    <section><h3>非凡档案</h3><p className={styles.highlight}>{advancement.pathwayName || "普通人"}{advancement.pathwayName && ` · ${advancement.sequenceLabel}`}</p><p className={styles.muted}>状态：{({ stable: "稳定", none: "未接触", newly_promoted: "刚完成晋升" })[advancement.status] || advancement.status}</p><p className={styles.muted}>{game.occult?.contact === 1 ? "已接触非凡世界" : "尚未接触非凡世界"}{game.occult?.entryAvailable ? " · 有入口可选" : ""}</p>{advancement.unlockedAbilities?.map(ability => <article className={styles.record} key={ability.id}><h4>{ability.name}</h4><p>{ability.description}</p></article>)}</section>
    {talent.id !== "none" && <section><h3>天赋 · {talent.name}</h3><p>{talent.description}</p></section>}
    <details><summary>个人背景与动机</summary>{[["出身", "origin"], ["外貌", "appearance"], ["性格", "personality"], ["欲望", "desire"], ["恐惧", "fear"], ["私人秘密", "secret"], ["背景", "background"]].filter(([, key]) => character[key]).map(([label, key]) => <div className={styles.biography} key={key}><h4>{label}</h4><p>{character[key]}</p></div>)}</details>
  </div>;
});

export const InventoryPanel = memo(function InventoryPanel({ game, onLocalTool, onAction, disabled }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState(null);
  const itemRefs = useRef(new Map());
  const lastSelectedRef = useRef(null);
  const searchRef = useRef(null);
  const backRef = useRef(null);
  const categories = ["全部", ...new Set(game.inventory.map(item => item.category))];
  const effectiveCategory = categories.includes(category) ? category : "全部";
  const items = game.inventory.filter(item => (effectiveCategory === "全部" || item.category === effectiveCategory) && item.name.includes(search.trim()));
  const selected = game.inventory.find(item => item.instanceId === selectedId);
  const eligible = selected && getPotionAdvancementEligibility(game, selected.instanceId);
  const weight = game.inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  const returnToList = () => {
    setSelectedId(null);
    requestAnimationFrame(() => (itemRefs.current.get(lastSelectedRef.current) || searchRef.current)?.focus());
  };
  return <div className={styles.content}>
    <details className={styles.wallet}><summary><span>持有资金</span><strong>{formatMoney(game.money)}</strong></summary><p>1 镑 = 20 苏勒 = 240 便士</p></details>
    <div className={styles.capacity}><span>负重</span><strong>{weight.toFixed(1)} / {game.capacity.maxWeight} kg</strong><progress max={game.capacity.maxWeight} value={weight} aria-label="随身负重" /></div>
    {selected ? <section className={styles.itemDetail}>
      <button ref={backRef} type="button" className={styles.back} onClick={returnToList}>← 返回物品列表</button>
      <p className={styles.muted}>{selected.rarity} · {selected.category}</p><h3>{selected.name}</h3><p>{selected.description}</p>
      {selected.potion && <div className={styles.record}><h4>{selected.potion.identified ? `${selected.potion.pathwayName}途径 · 序列${selected.potion.sequence}魔药` : "性质未明的魔药"}</h4><p>{selected.potion.identified ? eligible ? "配方与当前序列匹配，可以申请晋升。" : "服用前仍需匹配配方、途径与目标序列。" : "需要对应配方或同途径经验才能鉴定；不能直接服用。"}</p></div>}
      <dl className={styles.dataList}><div><dt>重量</dt><dd>{selected.weight} kg</dd></div><div><dt>状态</dt><dd>{selected.condition}</dd></div><div><dt>数量</dt><dd>{selected.quantity}</dd></div><div><dt>来源</dt><dd>{selected.source}</dd></div></dl>
      <div className={styles.itemActions}>
        {eligible && <button className={styles.primary} type="button" disabled={disabled} onClick={() => onAction(`服用${selected.name}并正式晋升至${selected.potion.pathwayName}序列${selected.potion.sequence}`, { advancementRequest: { potionInstanceId: selected.instanceId } })}>服用并晋升</button>}
        <button type="button" disabled={disabled} onClick={() => onLocalTool("item.inspect", { instanceId: selected.instanceId }, `检查${selected.name}`)}>检查</button>
        {selected.tags.includes("消耗品") && !selected.potion && <button type="button" disabled={disabled} onClick={() => onLocalTool("item.use", { instanceId: selected.instanceId }, `主动使用${selected.name}`)}>使用</button>}
        {selected.tags.includes("装备") && <button type="button" disabled={disabled} onClick={() => onLocalTool(selected.equipped ? "item.unequip" : "item.equip", { instanceId: selected.instanceId }, `玩家${selected.equipped ? "卸下" : "装备"}${selected.name}`)}>{selected.equipped ? "卸下" : "装备"}</button>}
        <button type="button" className={styles.danger} disabled={disabled} onClick={() => { if (window.confirm(`丢弃一件“${selected.name}”？`)) { onLocalTool("inventory.remove", { instanceId: selected.instanceId, quantity: 1 }, `玩家主动丢弃${selected.name}`); returnToList(); } }}>丢弃</button>
      </div>
    </section> : <>
      <div className={styles.filters}><label><span>搜索物品</span><input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="名称…" /></label><label><span>分类</span><select value={effectiveCategory} onChange={e => setCategory(e.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {items.length === 0 ? <p className={styles.empty}>没有符合条件的物品。</p> : [["已穿戴", true], ["随身物品", false]].map(([label, equipped]) => <section key={label}><h3>{label}<small>{items.filter(item => Boolean(item.equipped) === equipped).length}</small></h3><div className={styles.itemList}>{items.filter(item => Boolean(item.equipped) === equipped).map(item => <button key={item.instanceId} ref={element => { if (element) itemRefs.current.set(item.instanceId, element); else itemRefs.current.delete(item.instanceId); }} type="button" className={styles.item} data-new={item.isNew || undefined} onClick={() => { lastSelectedRef.current = item.instanceId; setSelectedId(item.instanceId); requestAnimationFrame(() => backRef.current?.focus()); }}><span className={styles.glyph} aria-hidden="true">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.category} · {item.condition}{item.potion ? item.potion.identified ? ` · 序列${item.potion.sequence}` : " · 未鉴定" : ""}</small></span><span>×{item.quantity}</span></button>)}</div></section>)}
    </>}
  </div>;
});

export function AuditPanel({ game }) {
  const audit = game.lastTurnAudit;
  const rows = getAuditRows(audit);
  const confirmation = audit?.importantItemConfirmation;
  const metrics = game.lastTurnMetrics;
  return <section>
    <h3>最近一次状态变化 <small>{audit ? `第 ${audit.turn} 轮` : "等待行动"}</small></h3>
    {!audit ? <p className={styles.empty}>完成行动后，这里会记录已确认的变化。</p> : <>
      <p className={styles.muted}>{confirmation?.status === "player-action" ? "来自主动进行的物品操作。" : "来自最近一次已完成回合。"}</p>
      {rows.length ? <ul className={styles.auditList}>{rows.map((row, i) => <li key={i} data-tone={row.tone}><span aria-hidden="true">{row.tone === "gain" ? "+" : row.tone === "loss" ? "−" : "·"}</span>{row.text}</li>)}</ul> : <p>没有已确认的物品、资金或属性变化。</p>}
      {confirmation?.required && <p>{confirmation.advancement ? confirmation.advancement.status === "confirmed" ? `晋升已确认：${confirmation.advancement.target.pathwayName}${confirmation.advancement.target.sequenceLabel}` : "已选择暂不服用，魔药保留。" : `重要物品：已确认 ${confirmation.confirmed} 项${confirmation.rejected ? `，拒绝 ${confirmation.rejected} 项` : ""}。`}</p>}
    </>}
    <details><summary>技术详情与性能</summary><p className={styles.muted}>状态记录以本地确认结果为准，正文描述不会直接修改数值。</p>{metrics ? <dl className={styles.dataList}>{[["状态规划", `${metrics.planningMs} ms`], ["首段正文", metrics.firstNarrativeMs == null ? "—" : `${metrics.firstNarrativeMs} ms`], ["整轮完成", `${metrics.totalMs} ms`], ["模型请求", metrics.modelRequests], ["缓存命中", metrics.cacheHitRate == null ? "—" : `${metrics.cacheHitRate}%`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className={styles.muted}>暂无回合计时。</p>}{metrics?.confirmationWaitMs > 0 && <p className={styles.muted}>其中等待确认 {metrics.confirmationWaitMs} ms</p>}</details>
  </section>;
}

export const JournalPanel = memo(function JournalPanel({ game }) {
  const [tab, setTab] = useState("changes");
  return <div className={styles.content}>
    <nav className={styles.filtersNav} aria-label="手记类别">{[["changes", "记录"], ["quests", "任务"], ["clues", "线索"], ["people", "人物"]].map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "changes" && <><AuditPanel game={game} /><details><summary>近期变更记录</summary><ol className={styles.logs}>{game.changeLog.slice().reverse().map((entry, i) => <li key={entry.id || `entry-${i}`} data-tone={entry.tone}><small>{typeof entry === "string" ? "探索" : `第 ${entry.turn} 轮`}</small><p>{typeof entry === "string" ? entry : entry.text}</p></li>)}</ol></details><p className={styles.muted}>此处展示近期记录；完整历史正文尚未归档。</p></>}
    {tab === "quests" && <section><h3>案件任务 <small>{game.quests.length}</small></h3>{game.quests.length ? game.quests.map(quest => <article className={styles.record} key={quest.id}><small>{quest.status}</small><h4>{quest.title}</h4><p>{quest.summary}</p></article>) : <p className={styles.empty}>尚未接受委托。你可以按自己的意愿探索。</p>}</section>}
    {tab === "clues" && <section><h3>已确认线索 <small>{game.clues.length}</small></h3>{game.clues.length ? game.clues.map(clue => <article className={styles.record} key={clue.id}><h4>{clue.title}</h4><p>{clue.detail}</p><small>{clue.discoveredAt}</small></article>) : <p className={styles.empty}>尚未确认任何线索。</p>}</section>}
    {tab === "people" && <section><h3>人物关系 <small>{game.relationships.length}</small></h3>{game.relationships.length ? game.relationships.map(npc => <article className={styles.record} key={npc.id}><h4>{npc.name}<span>{npc.value >= 0 ? "+" : ""}{npc.value}</span></h4><small>{npc.role}</small><p>{npc.note}</p></article>) : <p className={styles.empty}>尚未建立人物关系。</p>}</section>}
  </div>;
});

export function MenuPanel({ reading, onReadingChange, onOpenApi, onOpenPrompt, onOpenSaves, onHome, version }) {
  return <div className={styles.content}>
    <section><h3>阅读外观</h3><div className={styles.filtersNav}>{[["paper", "纸色"], ["night", "夜读"]].map(([id, label]) => <button type="button" key={id} aria-pressed={reading.theme === id} onClick={() => onReadingChange({ ...reading, theme: id })}>{label}</button>)}</div><label className={styles.fontControl}><span>正文字号 <strong>{reading.fontSize}px</strong></span><input type="range" min="16" max="22" step="1" value={reading.fontSize} onChange={e => onReadingChange({ ...reading, fontSize: Number(e.target.value) })} /></label></section>
    <div className={styles.menuActions}><button type="button" onClick={onOpenSaves}>存档柜 <span>保存、读取与导出 ↗</span></button><button type="button" onClick={onOpenApi}>API 设置 <span>模型连接 ↗</span></button><button type="button" onClick={onOpenPrompt}>提示词 <span>查看与编辑 ↗</span></button><button type="button" onClick={onHome}>返回档案首页 <span>你的进度已自动保存 ↗</span></button></div>
    <p className={styles.muted}>贝克兰德纪事 · {version}</p>
  </div>;
}
