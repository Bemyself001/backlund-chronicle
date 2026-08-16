import { memo, useEffect, useRef, useState } from "react";
import styles from "./GameScreen.module.css";
import { getAdvancement } from "../data/character.js";
import { formatMoney } from "../data/money.js";

const RISK_LABEL = { low: "谨慎", medium: "交涉", high: "高风险" };
const TURN_PHASES = [
  ["generating", "生成剧情"],
  ["validating", "校验状态"],
  ["finalizing", "确认结果"],
];
const PHASE_MESSAGE = {
  generating: "叙事引擎正在编织当前场景",
  manualRetry: "正在重新提交上一轮行动",
  streaming: "剧情正文正在抵达",
  budgetRecovery: "正文暂未出现，正在保留推理强度并增加输出预算",
  reasoningRetry: "推理预算已耗尽，正在降低推理强度后重试",
  validating: "本地规则正在校验状态提议",
  finalizing: "叙事引擎正在确认校验结果",
};

function StatBar({ label, value, max }) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={styles.stat}><div><span>{label}</span><strong>{value}<small>/{max}</small></strong></div><i><b style={{ width: `${percent}%` }} /></i></div>;
}

const CharacterPanel = memo(function CharacterPanel({ game }) {
  const { character } = game;
  const advancement = getAdvancement(character);
  return <div className={styles.panelContent}>
    <div className={styles.profile}><div className={styles.avatar} aria-hidden="true"><i /><b /></div><div><p>{character.extraordinary === "low" ? character.pathway : "普通人"}</p><h2>{character.name}</h2><span>{character.occupation} · {character.age}岁</span></div></div>
    <div className={styles.metaGrid}><div><span>世界时间</span><strong>{game.worldTime.split("·")[0]}</strong><small>{game.worldTime.split("·").slice(1).join("·")}</small></div><div><span>当前位置</span><strong>{game.location.name}</strong><small>{game.location.district}</small></div></div>
    <section><h3>角色状态 <small>STATUS</small></h3><div className={styles.stats}><StatBar label="生命" value={character.stats.health} max={character.stats.maxHealth} /><StatBar label="理智" value={character.stats.sanity} max={character.stats.maxSanity} /><StatBar label="灵性" value={character.stats.spirituality} max={character.stats.maxSpirituality} /></div></section>
    <section><h3>当前影响 <small>EFFECTS</small></h3><div className={styles.tags}>{game.statusEffects.length ? game.statusEffects.map((status) => <span key={status.id} className={status.kind === "danger" ? styles.dangerTag : ""} title={status.description}>{status.name}</span>) : <em>状态稳定</em>}</div></section>
    <section><h3>非凡档案 <small>PATHWAY</small></h3><div className={styles.advancementCard}><strong>{advancement.pathwayName || "普通人"}</strong><span>{advancement.sequenceLabel}</span><small>状态：{advancement.status === "stable" ? "稳定" : advancement.status === "none" ? "未接触" : advancement.status}</small></div></section>
    <section><h3>人物关系 <small>CONTACTS</small></h3>{game.relationships.map((npc) => <div className={styles.relationship} key={npc.id}><div><strong>{npc.name}</strong><span>{npc.role}</span></div><b>{npc.value >= 0 ? "+" : ""}{npc.value}</b><p>{npc.note}</p></div>)}</section>
    <section><h3>已知地点 <small>{game.discoveredLocations.length}</small></h3><ul className={styles.locationList}>{game.discoveredLocations.map((place) => <li key={place.id} className={place.id === game.location.id ? styles.current : ""}><span>{place.name}</span><small>{place.note}</small></li>)}</ul></section>
  </div>;
});

const InventoryPanel = memo(function InventoryPanel({ game, onLocalTool, onAudit, disabled }) {
  const [tab, setTab] = useState("inventory");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState(null);
  const categories = ["全部", ...new Set(game.inventory.map((item) => item.category))];
  const items = game.inventory.filter((item) => (category === "全部" || item.category === category) && item.name.includes(search));
  const selected = game.inventory.find((item) => item.instanceId === selectedId);
  const weight = game.inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  return <div className={styles.rightPanel}>
    <div className={styles.tabs} role="tablist" aria-label="档案类别">{[["inventory", "物品"], ["money", "资金"], ["clues", "线索"], ["quests", "任务"], ["log", "变更"], ["audit", "审计"]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "inventory" && <div className={styles.panelContent}>
      <div className={styles.capacity}><span>负重</span><strong>{weight.toFixed(1)} / {game.capacity.maxWeight} kg</strong><i><b style={{ width: `${Math.min(100, weight / game.capacity.maxWeight * 100)}%` }} /></i></div>
      <div className={styles.filters}><input aria-label="搜索物品" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索物品…" /><select aria-label="物品分类" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></div>
      <div className={styles.itemList}>{items.length === 0 ? <div className={styles.empty}>没有符合条件的物品。</div> : items.map((item) => <button key={item.instanceId} className={`${styles.item} ${item.isNew ? styles.newItem : ""}`} type="button" onClick={() => setSelectedId(item.instanceId)}><span className={styles.itemGlyph}>{item.name.slice(0, 1)}</span><span><strong>{item.name}{item.equipped && <small>已装备</small>}</strong><em>{item.category} · {item.condition}</em></span><b>×{item.quantity}</b></button>)}</div>
      {selected && <div className={styles.itemDetail}><button type="button" aria-label="关闭物品详情" onClick={() => setSelectedId(null)}>×</button><p>{selected.rarity} · {selected.category}</p><h3>{selected.name}</h3><span>{selected.description}</span><dl><div><dt>重量</dt><dd>{selected.weight} kg</dd></div><div><dt>状态</dt><dd>{selected.condition}</dd></div><div><dt>来源</dt><dd>{selected.source}</dd></div></dl><div className={styles.itemActions}><button type="button" disabled={disabled} onClick={() => onLocalTool("item.inspect", { instanceId: selected.instanceId }, `检查${selected.name}`)}>检查</button>{selected.tags.includes("消耗品") && <button type="button" disabled={disabled} onClick={() => onLocalTool("item.use", { instanceId: selected.instanceId }, `主动使用${selected.name}`)}>使用</button>}{selected.tags.includes("装备") && <button type="button" disabled={disabled} onClick={() => onLocalTool(selected.equipped ? "item.unequip" : "item.equip", { instanceId: selected.instanceId }, `玩家${selected.equipped ? "卸下" : "装备"}${selected.name}`)}>{selected.equipped ? "卸下" : "装备"}</button>}<button className={styles.discard} type="button" disabled={disabled} onClick={() => { if (window.confirm(`丢弃一件“${selected.name}”？`)) { onLocalTool("inventory.remove", { instanceId: selected.instanceId, quantity: 1 }, `玩家主动丢弃${selected.name}`); setSelectedId(null); } }}>丢弃</button></div></div>}
    </div>}
    {tab === "money" && <MoneyPanel game={game} />}
    {tab === "clues" && <div className={styles.panelContent}><h3 className={styles.archiveTitle}>已发现线索 <span>{game.clues.length}/3</span></h3>{game.clues.length ? game.clues.map((clue) => <article className={styles.record} key={clue.id}><span>CLUE</span><h4>{clue.title}</h4><p>{clue.detail}</p><small>{clue.discoveredAt}</small></article>) : <div className={styles.empty}>尚未确认任何线索。谨慎调查通常能得到最可靠的记录。</div>}</div>}
    {tab === "quests" && <div className={styles.panelContent}><h3 className={styles.archiveTitle}>案件任务 <span>{game.quests.length}</span></h3>{game.quests.map((quest) => <article className={styles.record} key={quest.id}><span>{quest.status}</span><h4>{quest.title}</h4><p>{quest.summary}</p></article>)}</div>}
    {tab === "log" && <div className={styles.panelContent}><h3 className={styles.archiveTitle}>变更记录 <span>{game.changeLog.length}</span></h3><ol className={styles.log}>{game.changeLog.slice().reverse().map((entry) => <li key={entry.id} className={entry.tone === "danger" ? styles.dangerLog : ""}><span>{String(entry.turn).padStart(2, "0")}</span><p>{entry.text}</p></li>)}</ol></div>}
    {tab === "audit" && <AuditPanel game={game} disabled={disabled} onAudit={onAudit} />}
  </div>;
}, (previous, next) => previous.game === next.game && previous.disabled === next.disabled && previous.onAudit === next.onAudit);

function MoneyPanel({ game }) {
  const money = game.money || { pounds: 0, solers: 0, pence: 0 };
  return <div className={`${styles.panelContent} ${styles.moneyPanel}`}>
    <h3 className={styles.archiveTitle}>持有资金 <span>MONEY</span></h3>
    <div className={styles.moneyBalance}><strong>{formatMoney(money)}</strong><small>1 镑 = 20 苏勒 = 240 便士</small></div>
    <dl className={styles.moneyBreakdown}><div><dt>镑</dt><dd>{money.pounds}</dd></div><div><dt>苏勒</dt><dd>{money.solers}</dd></div><div><dt>便士</dt><dd>{money.pence}</dd></div></dl>
    <p className={styles.moneyNote}>资金独立于物品栏保存。收款、消费与找零必须由资金工具验证后才会生效。</p>
  </div>;
}

function AuditPanel({ game, disabled, onAudit }) {
  const audit = game.lastTurnAudit;
  const canAudit = Boolean(game.lastTurnBaseline);
  const inventory = audit?.inventory;
  const character = audit?.character;
  const changeRows = [
    ...(inventory?.gained || []).map((item) => ({ tone: "gain", text: `获得「${item.name}」×${item.quantity}` })),
    ...(inventory?.lost || []).map((item) => ({ tone: "loss", text: `失去「${item.name}」×${item.quantity}` })),
    ...(inventory?.equipped || []).map((item) => ({ tone: "gain", text: `装备「${item.name}」` })),
    ...(inventory?.unequipped || []).map((item) => ({ tone: "loss", text: `卸下「${item.name}」` })),
    ...(inventory?.updated || []).map((item) => ({ tone: "update", text: `更新「${item.name}」：${item.fields.join("、")}` })),
  ];
  return <div className={`${styles.panelContent} ${styles.auditPanel}`}>
    <div className={styles.auditHeading}><div><h3 className={styles.archiveTitle}>本轮状态审计 <span>{game.lastTurnBaseline ? `第 ${game.lastTurnBaseline.turn} 轮` : "等待行动"}</span></h3><p>只统计本地规则验证通过的状态变化。</p></div><button type="button" onClick={onAudit} disabled={disabled || !canAudit}>{audit ? "重新审计" : "开始审计"}</button></div>
    {!canAudit && <div className={styles.empty}>完成一轮行动后，这里会保留一份可复核的前后状态快照。</div>}
    {canAudit && !audit && <div className={styles.empty}>点击“开始审计”，核对本轮实际获得、失去或改变的物品。</div>}
    {audit && <>
      <div className={`${styles.auditResult} ${audit.hasChanges ? styles.auditHasChanges : ""}`}><strong>{audit.hasChanges ? "发现已确认的状态变化" : "本轮没有已确认的物品或角色变化"}</strong><small>审计只比较本地执行前后的结构化数据，不把剧情正文当作事实。</small></div>
      {changeRows.length > 0 && <ul className={styles.auditList}>{changeRows.map((row, index) => <li key={`${row.text}-${index}`} data-tone={row.tone}><span>{row.tone === "gain" ? "+" : row.tone === "loss" ? "−" : "·"}</span><p>{row.text}</p></li>)}</ul>}
      {audit.money?.hasChanges && <div className={styles.moneyAudit}><strong>资金变化</strong><span>{formatMoney(audit.money.before)} → {formatMoney(audit.money.after)}</span><small>{audit.money.deltaPence > 0 ? "收入已确认" : "支出已确认"}</small></div>}
      {character?.advancementChanged && <div className={styles.auditNote}>非凡档案：{character.beforeAdvancement.sequenceLabel} → {character.afterAdvancement.sequenceLabel}</div>}
    </>}
  </div>;
}

const StoryHistory = memo(function StoryHistory({ messages }) {
  return messages.map((message) => message.role === "assistant" ? <article className={styles.narrative} key={message.id}><span className={styles.dropcap}>叙</span>{message.content.split("\n").filter(Boolean).map((paragraph, index) => <p key={`${message.id}-${index}`}>{paragraph}</p>)}</article> : <blockquote className={styles.playerLine} key={message.id}><span>你的行动</span>{message.content}</blockquote>);
});

function TurnProgress({ phase }) {
  const matchedIndex = TURN_PHASES.findIndex(([id]) => id === phase);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;
  return <div className={styles.turnStatus}>
    <ol aria-label="本轮处理进度">{TURN_PHASES.map(([id, label], index) => <li key={id} data-state={index < currentIndex ? "done" : index === currentIndex ? "current" : "pending"}><span>{index + 1}</span>{label}</li>)}</ol>
    <p role="status" aria-live="polite">{PHASE_MESSAGE[phase] || PHASE_MESSAGE.generating}<span>···</span></p>
  </div>;
}

export default function GameScreen({ game, loading, turnPhase, streamText, error, onAction, onAbort, onRetry, onLocalTool, onAudit, onOpenMap, onOpenApi, onOpenPrompt, onOpenSaves, onHome }) {
  const [input, setInput] = useState("");
  const [mobilePanel, setMobilePanel] = useState(null);
  const [followingLatest, setFollowingLatest] = useState(true);
  const storyRef = useRef(null);
  const followRef = useRef(true);
  useEffect(() => {
    const scroller = storyRef.current;
    if (scroller && followRef.current) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
  }, [game.turn, loading, streamText]);
  const handleStoryScroll = () => {
    const scroller = storyRef.current;
    if (!scroller) return;
    const isNearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
    followRef.current = isNearBottom;
    setFollowingLatest(isNearBottom);
  };
  const jumpToLatest = () => {
    const scroller = storyRef.current;
    if (!scroller) return;
    followRef.current = true;
    setFollowingLatest(true);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  };
  const submit = async () => {
    const value = input.trim();
    if (!value || loading) return;
    const completed = await onAction(value);
    if (completed) setInput("");
  };
  const retry = async () => {
    const completed = await onRetry();
    if (completed) setInput("");
  };
  return <main className={styles.shell} id="main">
    <header className={styles.topbar}>
      <button className={styles.wordmark} type="button" onClick={onHome} aria-label="返回欢迎页"><i>BC</i><span>贝克兰德纪事<small>BACKLUND CHRONICLE</small></span></button>
      <div className={styles.chapter}><span>CHAPTER {String(game.chapter.number).padStart(2, "0")}</span><strong>{game.chapter.title}</strong></div>
      <div className={styles.topActions}><button type="button" onClick={onOpenMap}>地图</button><button type="button" onClick={onOpenPrompt}>提示词</button><button type="button" onClick={onOpenApi}>API</button><button type="button" onClick={onOpenSaves}>存档</button></div>
      <div className={styles.mobileActions}><button type="button" onClick={() => setMobilePanel("character")}>角色</button><button type="button" onClick={onOpenMap}>地图</button><button type="button" onClick={() => setMobilePanel("inventory")}>物品</button><button type="button" onClick={() => setMobilePanel("menu")}>设置</button></div>
    </header>
    <div className={styles.workspace}>
      <aside className={`${styles.left} ${mobilePanel === "character" ? styles.drawerOpen : ""}`} aria-label="角色状态"><div className={styles.drawerHeader}><span>角色状态</span><button type="button" onClick={() => setMobilePanel(null)}>关闭</button></div><CharacterPanel game={game} /></aside>
      <section className={styles.story} aria-label="剧情与行动">
        <div className={styles.storyViewport}>
        <div className={styles.storyScroll} ref={storyRef} onScroll={handleStoryScroll}>
          <div className={styles.sceneMeta}><span>第 {game.turn + 1} 幕</span><i /><strong>{game.location.name}</strong></div>
          <StoryHistory messages={game.recentDialogues} />
          {loading && <article className={`${styles.narrative} ${styles.streaming}`} aria-busy="true"><span className={styles.dropcap}>雾</span><TurnProgress phase={turnPhase} />{streamText && <div className={styles.streamCopy}>{streamText.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}</article>}
          {error && <div className={styles.error} role="alert"><strong>本轮未能完成</strong><span>{error}</span><button type="button" onClick={retry}>重试本轮</button></div>}
        </div>
        {!followingLatest && <button className={styles.jumpLatest} type="button" onClick={jumpToLatest}>回到最新</button>}
        </div>
        <div className={styles.interaction}>
          <p className={styles.choiceLabel}>下一步行动 <span>CHOOSE OR WRITE YOUR OWN</span>{game.choiceMeta?.source === "local" && <em className={styles.choiceSource}>本地场景建议 · 模型选项未完整返回</em>}{game.choiceMeta?.source === "reused" && <em className={styles.choiceSource}>沿用上一组有效选项 · 确认响应未重复返回</em>}</p>
          <div className={styles.choices}>{game.choices.map((choice, index) => <button key={`${choice.intent}-${index}`} type="button" disabled={loading} onClick={() => onAction(choice.label)}><span>0{index + 1}</span><strong>{choice.label}</strong><small data-risk={choice.risk}>{RISK_LABEL[choice.risk]}</small></button>)}</div>
          <div className={styles.composer}><textarea aria-label="自由输入行动" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="描述你的行动、问题或对话…" disabled={loading} /><div><span>Enter 发送 · Shift+Enter 换行</span>{loading ? <button className={styles.abort} type="button" onClick={onAbort}>中止生成</button> : <button className="button button--primary" type="button" onClick={submit} disabled={!input.trim()}>提交行动</button>}</div></div>
        </div>
      </section>
      <aside className={`${styles.right} ${mobilePanel === "inventory" ? styles.drawerOpen : ""}`} aria-label="物品与档案"><div className={styles.drawerHeader}><span>物品与档案</span><button type="button" onClick={() => setMobilePanel(null)}>关闭</button></div><InventoryPanel game={game} onLocalTool={onLocalTool} onAudit={onAudit} disabled={loading} /></aside>
      {mobilePanel === "menu" && <div className={styles.settingsMenu} role="dialog" aria-label="游戏设置菜单"><div><span>游戏设置</span><button type="button" onClick={() => setMobilePanel(null)}>关闭</button></div><button type="button" onClick={() => { setMobilePanel(null); onOpenPrompt(); }}>查看与编辑提示词</button><button type="button" onClick={() => { setMobilePanel(null); onOpenApi(); }}>自定义 API</button><button type="button" onClick={() => { setMobilePanel(null); onOpenSaves(); }}>存档柜</button></div>}
      {mobilePanel && <button className={styles.scrim} type="button" aria-label="关闭抽屉" onClick={() => setMobilePanel(null)} />}
    </div>
  </main>;
}
