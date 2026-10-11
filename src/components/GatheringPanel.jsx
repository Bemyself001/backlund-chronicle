import { useEffect, useRef, useState } from "react";
import { GATHERING, PATHWAYS, getSequenceName } from "../content/index.js";
import { gatheringView } from "../engine/gatherings.js";
import { getAdvancement } from "../system/character.js";
import { formatMoney, moneyFromPence, moneyToPence } from "../system/money.js";
import styles from "./GatheringPanel.module.css";

const price = pence => formatMoney(moneyFromPence(pence));
const REQUEST_STATUS = { pending: "待下场答复", matched: "已匹配 · 尚未成交", fulfilled: "已成交", cancelled: "已撤销", unavailable: "无法收购", missed: "场次已结束" };
const FILTERS = [["all", "全部"], ...Object.entries(GATHERING.labels)];
const duration = minutes => `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ""}`;

export default function GatheringPanel({ game, disabled, onExecute, onOpenMap, onAction }) {
  const view = gatheringView(game), rank = getAdvancement(game.character);
  const [filter, setFilter] = useState("all"), [confirm, setConfirm] = useState(null);
  const [kind, setKind] = useState("recipe"), [pathwayId, setPathwayId] = useState(rank.pathwayId || PATHWAYS[0].id);
  const [sequence, setSequence] = useState(rank.type === "extraordinary" ? Math.max(4, rank.sequence - 1) : 9);
  const [sellId, setSellId] = useState("");
  const confirmation = useRef(null);
  useEffect(() => { if (confirm && confirmation.current) { confirmation.current.focus(); confirmation.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }, [confirm]);
  const ready = !disabled && game.character.stats.health > 0 && game.character.stats.sanity > 0;
  const balance = moneyToPence(game.money);
  const request = (operation, extra = {}) => ({ operation, gatheringRevision: view.revision, expectedTurn: game.turn, expectedWorldTime: game.worldTime, sessionId: view.schedule?.id, ...extra });
  const run = (operation, extra) => onExecute(request(operation, extra));
  const review = (operation, title, detail, extra) => setConfirm({ title, detail, request: request(operation, extra) });
  const commit = () => { const result = onExecute(confirm.request); if (result?.ok) setConfirm(null); };
  const sellable = view.sellable.filter(item => !item.equipped);
  const selection = sellable.find(item => item.instanceId === sellId) || sellable[0];
  const brews = game.inventory.filter(item => item.quantity > 0 && item.recipe?.identified && GATHERING.prices[item.recipe.sequence]);

  return <section className={styles.panel} aria-label="非凡聚会">
    <article className={styles.invitation}>
      <div className={styles.meta}><span>隐秘交易 · 本城小型聚会</span><strong>{view.access ? "介绍资格持续有效" : "尚未取得介绍"}</strong></div>
      <h3>{view.contactKnown ? view.name : "旅店里的隐秘联络"}</h3>
      <p>{view.access ? `${view.room}。隐去真名，钱与物当面点清；可以只交谈、听消息。` : "短调查可以找到一条稳定渠道。错过旧入口或已经晋升，也可以到旅店找联络人，完成介绍。"}</p>
      <button type="button" className={styles.link} onClick={() => onOpenMap(view.locationId)}>在地图查看雾鸦旅店</button>
      {!view.onSite && <button type="button" disabled={!ready} onClick={() => run("gathering-travel")}>前往旅店 · 按地图行程耗时</button>}
      {!view.access && view.onSite && <button type="button" className={styles.primary} disabled={!ready} onClick={() => run(view.contactKnown ? "gathering-introduce" : "gathering-contact")}>{view.contactKnown ? "说明来意并登记介绍 · 10分钟" : "向老板打听联络人 · 10分钟"}</button>}
      {!view.access && <p className={styles.hint}>认识联络人 → 核对来意 → 登记介绍。序列高低不会自动获得资格；调查与介绍都不收费。</p>}
    </article>
    {view.access && <>
      <article className={styles.card} aria-label="聚会开放时间">
        <div className={styles.meta}><span>{view.schedule?.open ? "本场正在开放" : "下次开场"}</span><span>{GATHERING.scheduleText}</span></div>
        <p className={styles.date}>{view.schedule?.startsAt || "游戏时间无法识别"}</p>
        <p className={styles.hint}>{view.schedule?.open ? `散场 · ${view.schedule.endsAt}${view.inside ? " · 已入场" : " · 出示介绍卡后入场"}` : `等待约${duration(view.schedule?.waitMinutes || 0)}，也可以先处理其他事情。`}</p>
        {view.onSite && !view.inside && view.schedule?.open && <button type="button" className={styles.primary} disabled={!ready || view.schedule.remainingMinutes < 5} onClick={() => run("gathering-enter")}>出示介绍卡入场 · 5分钟</button>}
        {view.onSite && !view.schedule?.open && <button type="button" disabled={!ready || !view.schedule} onClick={() => review("gathering-wait", "等待至下次开场", `将从${game.worldTime}等待到${view.schedule.startsAt}，耗时${duration(view.schedule.waitMinutes)}。持续状态照常结算。等待不会自动入场。`)}>等待至开场 · 跳过时间</button>}
        {!view.onSite && <p className={styles.hint}>先前往旅店，再选择入场或等待；查看日程不会移动或改变时间。</p>}
      </article>
      {confirm && <article className={styles.confirm} aria-label="聚会行动确认" tabIndex={-1} ref={confirmation}><h4>{confirm.title}</h4><p>{confirm.detail}</p><div className={styles.buttons}><button type="button" className={styles.primary} disabled={!ready} onClick={commit}>确认执行</button><button type="button" onClick={() => setConfirm(null)}>取消</button></div></article>}
      {view.inside && <>
        <article className={styles.card}><h4>烛火旁的交谈</h4><p>主持人与卖方都以代号相称。你可以先听消息或询问，交谈不会替你成交。</p><div className={styles.buttons}>
          <button type="button" disabled={!ready || view.intelligenceRead || view.schedule.remainingMinutes < 5} onClick={() => run("gathering-intelligence")}>{view.intelligenceRead ? "本场消息已记入线索" : "听取免费消息 · 5分钟"}</button>
          <button type="button" disabled={!ready || !onAction} onClick={() => onAction("在雾灯聚会与主持人交谈，询问当前已知清单和交易规矩，只交谈，不确认任何买卖。")}>与主持人交谈</button>
        </div>{view.intelligence && <details><summary>已经听到的消息</summary><p>{view.intelligence}</p></details>}</article>
        <section aria-label="本场交易清单"><div className={styles.heading}><h4>本场交易清单</h4><span>{price(balance)}</span></div><p className={styles.hint}>以下身份已经核对。单件买卖耗时10分钟；购买后放入行囊。</p>
          <nav className={styles.filters} aria-label="聚会商品类型">{FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</nav>
          <div className={styles.offers}>{view.offers.filter(offer => filter === "all" || offer.kind === filter).map(offer => <article className={styles.card} key={offer.id} aria-label={`商品：${offer.item.name}`}>
            <div className={styles.meta}><span>{GATHERING.labels[offer.kind]} · “{offer.seller}”</span><span>余量 {offer.stock}</span></div><h4>{offer.item.name}</h4>
            {offer.pathwayId && <p className={styles.hint}>{PATHWAYS.find(path => path.id === offer.pathwayId)?.name}途径 · 序列{offer.sequence} · 已确认</p>}
            <p>{offer.item.description}</p><strong className={styles.price}>{price(offer.pricePence)}</strong>
            <button type="button" disabled={!ready || !offer.stock || offer.owned || balance < offer.pricePence || view.schedule.remainingMinutes < 10} onClick={() => review("gathering-buy", `购买一份${offer.item.name}`, `向“${offer.seller}”支付${price(offer.pricePence)}，取得一份物品，耗时10分钟。不会自动服用、吸收或装备。`, { offerId: offer.id, pricePence: offer.pricePence })}>{!offer.stock ? "已售罄" : offer.owned ? "配方已持有" : balance < offer.pricePence ? "资金不足" : "查看并确认购买"}</button>
          </article>)}</div>
        </section>
        <article className={styles.card} aria-label="聚会收购"><h4>出售行囊物品</h4><p className={styles.hint}>单份现场收购价为对应登记售价的四成。未确认身份、任务证据不收购；装备需先卸下。</p>
          {view.sellable.length ? view.sellable.map(item => <div className={styles.sale} key={item.instanceId}><div><strong>{item.name} × {item.quantity}</strong><p className={styles.hint}>{price(item.pricePence)}／份</p></div><button type="button" disabled={!ready || item.equipped || view.schedule.remainingMinutes < 10} onClick={() => review("gathering-sell", `出售一份${item.name}`, `从行囊扣除一份物品，取得${price(item.pricePence)}，耗时10分钟。`, { instanceId: item.instanceId, pricePence: item.pricePence })}>{item.equipped ? "先卸下装备" : "确认出售一份"}</button></div>) : <p className={styles.hint}>暂时没有可收购的物品。</p>}
        </article>
        {brews.length > 0 && <article className={styles.card}><h4>按配方调制</h4><p className={styles.hint}>消耗一份同途径、同序列材料包，配方保留；耗时20分钟，不自动晋升。</p>{brews.map(recipe => {
          const hasMaterial = game.inventory.some(item => item.quantity > 0 && item.itemId === `gathering-material-${recipe.recipe.pathwayId}-${recipe.recipe.sequence}`);
          return <button type="button" key={recipe.instanceId} disabled={!ready || !hasMaterial || view.schedule.remainingMinutes < 20} onClick={() => review("gathering-brew", `调制${getSequenceName(recipe.recipe.pathwayId, recipe.recipe.sequence)}魔药`, "消耗一份对应材料包并调制成品，耗时20分钟；晋升须另行确认。", { instanceId: recipe.instanceId })}>{hasMaterial ? `调制${getSequenceName(recipe.recipe.pathwayId, recipe.recipe.sequence)}魔药` : `${recipe.name} · 缺少材料包`}</button>;
        })}</article>}
        <button type="button" disabled={!ready} onClick={() => run("gathering-leave")}>离开包间 · 1分钟</button>
      </>}
      {view.onSite && <details className={styles.card} open={!view.inside}><summary>向{view.contact}留言 · 下场给出报价</summary><p className={styles.hint}>不收订金、不代扣物品。下场入场后给出匹配结果，仍须亲自确认成交。最多同时三条。</p>
        <div className={styles.fields}>
          <label>需求类型<select value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(GATHERING.labels).map(([id, label]) => <option key={id} value={id}>求购{label}</option>)}<option value="sell">求售行囊物品</option></select></label>
          {kind === "sell" ? <label>随身物品<select value={selection?.instanceId || ""} onChange={event => setSellId(event.target.value)}>{sellable.length ? sellable.map(item => <option key={item.instanceId} value={item.instanceId}>{item.name}</option>) : <option value="">暂无已卸下、可出售的物品</option>}</select></label> : kind !== "equipment" && <>
            <label>途径<select value={pathwayId} onChange={event => setPathwayId(event.target.value)}>{PATHWAYS.map(path => <option key={path.id} value={path.id}>{path.name}</option>)}</select></label>
            <label>序列<select value={sequence} onChange={event => setSequence(Number(event.target.value))}>{[9, 8, 7, 6, 5, 4].map(value => <option key={value} value={value}>序列{value} · {getSequenceName(pathwayId, value)}</option>)}</select></label>
          </>}
        </div><p className={styles.hint}>答复场次 · {view.nextSchedule?.startsAt || "待确认"}</p>
        <button type="button" disabled={!ready || !view.nextSchedule || (kind === "sell" && !selection)} onClick={() => run("gathering-request", { kind, pathwayId, sequence, ...(kind === "sell" ? { instanceId: selection.instanceId } : {}), sessionId: view.nextSchedule.id })}>登记留言 · 5分钟</button>
      </details>}
      {view.requests.length > 0 && <article className={styles.card} aria-label="聚会留言记录"><h4>留言与答复</h4>{view.requests.slice(-6).reverse().map(entry => <div className={styles.record} key={entry.id}><strong>{entry.name} · {REQUEST_STATUS[entry.status] || entry.status}</strong><p className={styles.hint}>{entry.dueAt}{entry.status === "matched" ? ` · 报价${price(entry.pricePence)}` : ""}</p>{entry.result && <p>{entry.result}</p>}{["pending", "matched"].includes(entry.status) && <button type="button" disabled={!ready} onClick={() => run("gathering-cancel-request", { requestId: entry.id })}>撤销留言 · 5分钟</button>}</div>)}</article>}
      {view.receipts.length > 0 && <details className={styles.card} aria-label="聚会交易收据"><summary>交易收据 · {view.receipts.length}条近期记录</summary>{view.receipts.slice().reverse().map(entry => <div className={styles.record} key={entry.id}><strong>{{ buy: "购买", sell: "出售", brew: "调制" }[entry.kind]} · {entry.name} × {entry.quantity}</strong><p className={styles.hint}>{entry.amountPence < 0 ? "支付" : entry.amountPence > 0 ? "获得" : "材料已消耗"}{entry.amountPence ? ` ${price(Math.abs(entry.amountPence))}` : ""} · 第{entry.turn}轮 · {entry.worldTime}</p></div>)}</details>}
    </>}
  </section>;
}
