import { useEffect, useRef, useState } from "react";
import { tradeView } from "../engine/trading.js";
import { moneyFromPence, moneyToPence } from "../system/money.js";
import styles from "./TradePanel.module.css";

const price = pence => {
  const money = moneyFromPence(pence);
  return [money.pounds && `£${money.pounds}`, money.solers && `${money.solers}苏勒`, money.pence && `${money.pence}便士`].filter(Boolean).join(" · ") || "0便士";
};
const signedPrice = pence => `${pence >= 0 ? "+" : "−"}${price(Math.abs(pence))}`;

export default function TradePanel({ game, disabled, onExecute, onOpenMap }) {
  const view = tradeView(game);
  const [channelId, setChannelId] = useState(() => view.channels.find(channel => channel.onSite)?.id || view.channels[0].id);
  const [quantity, setQuantity] = useState(1), [confirm, setConfirm] = useState(null);
  const confirmation = useRef(null);
  const reviewTrigger = useRef(null);
  useEffect(() => { if (confirm && confirmation.current) { confirmation.current.focus(); confirmation.current.scrollIntoView({ block: "nearest" }); } }, [confirm]);
  const channel = view.channels.find(entry => entry.id === channelId) || view.channels[0];
  const other = view.channels.find(entry => entry.id !== channel.id);
  const ready = !disabled && view.day && game.character.stats.health > 0 && game.character.stats.sanity > 0;
  const validQuantity = Number.isInteger(quantity) && quantity > 0 && quantity <= view.maxQuantity;
  const balance = moneyToPence(game.money);
  const request = (operation, extra = {}) => ({ operation, channelId: channel.id, marketDay: view.day, tradeRevision: view.revision,
    expectedTurn: game.turn, expectedWorldTime: game.worldTime, quantity, ...extra });
  const review = (operation, title, detail, extra, trigger) => { reviewTrigger.current = trigger; setConfirm({ title, detail, request: request(operation, extra) }); };
  const cancel = () => { setConfirm(null); reviewTrigger.current?.focus({ preventScroll: true }); };
  const commit = () => { const result = onExecute(confirm.request); if (result?.ok) setConfirm(null); };

  return <section className={styles.panel} aria-label="交易市场">
    <header className={styles.intro}><p className={styles.eyebrow}>货物与行程 · 本城买卖</p><h3>把价差，变成下一笔盘缠</h3>
      <p>比较两个渠道的买卖报价，采购后把货物带到收购方。每笔成交10分钟，查看与取消不会改变资金、物品或时间。</p>
      <div className={styles.meta}><span>游戏日期 · {view.day || "无法识别"}</span><strong>资金 {price(balance)}</strong></div>
    </header>
    <nav className={styles.buttons} aria-label="交易渠道">{view.channels.map(entry => <button key={entry.id} type="button" aria-pressed={channel.id === entry.id} onClick={() => { setChannelId(entry.id); setConfirm(null); }}>{entry.name}{entry.onSite ? " · 已到达" : ""}</button>)}</nav>
    <article className={styles.card}><div className={styles.meta}><h4>{channel.name}</h4><span>{channel.onSite ? "可以当面成交" : "需先到达"}</span></div><p>{channel.description}</p>
      <div className={styles.buttons}><button type="button" disabled={!onOpenMap} onClick={() => onOpenMap(channel.locationId)}>在地图查看渠道</button>
        {!channel.onSite && <button type="button" className={styles.primary} disabled={!ready} onClick={() => onExecute(request("trade-travel"))}>前往{channel.name} · 按地图行程耗时</button>}
      </div>
      <label className={styles.quantity}>每笔数量<input type="number" inputMode="numeric" min="1" max={view.maxQuantity} step="1" value={quantity} onChange={event => setQuantity(event.target.value === "" ? "" : Number(event.target.value))} /></label>
      <p className={styles.hint}>报价有每日小幅变动，库存和收购量于游戏内次日重置，读档保持已用数量。另一渠道的价格是当前参考，隔日需重新核对。</p>
      {!validQuantity && <p role="status" className={styles.hint}>请输入1至{view.maxQuantity}之间的整数数量。</p>}
    </article>
    {confirm && <article className={styles.confirm} tabIndex={-1} ref={confirmation} aria-label="市场交易确认"><h4>{confirm.title}</h4><p>{confirm.detail}</p><div className={styles.buttons}><button type="button" className={styles.primary} disabled={!ready} onClick={commit}>确认成交</button><button type="button" onClick={cancel}>取消</button></div></article>}
    <section aria-label="今日货物报价"><h4>今日货物报价</h4><div className={styles.offers}>{channel.quotes.map(quote => {
      const elsewhere = other.quotes.find(entry => entry.id === quote.id);
      const total = quote.buyPence * (validQuantity ? quantity : 0);
      const reason = !channel.onSite ? "到达后可购买" : !quote.stock ? "今日售罄" : !validQuantity || quantity > quote.stock ? "请调整数量" : balance < total ? "资金不足" : "查看并确认购买";
      return <article className={styles.card} key={quote.id} aria-label={`货物：${quote.name}`}><h4>{quote.name}</h4><p className={styles.hint}>{quote.description} 单份重{quote.weight}公斤。</p>
        <dl className={styles.quote}><div><dt>买入／份</dt><dd>{price(quote.buyPence)}</dd></div><div><dt>收购／份</dt><dd>{price(quote.sellPence)}</dd></div></dl>
        <p className={styles.hint}>今日余货 {quote.stock}份 · 还能收购 {quote.demand}份</p>
        {elsewhere && <p className={styles.compare}>{other.name}收购 {price(elsewhere.sellPence)}／份<br />当前跨渠道参考价差 {signedPrice(elsewhere.sellPence - quote.buyPence)}／份</p>}
        <button type="button" disabled={!ready || !channel.onSite || !validQuantity || quantity > quote.stock || balance < total} onClick={event => review("trade-buy", `购买${quote.name}×${quantity}`, `向${channel.name}支付${price(total)}，取得${quantity}份货物，耗时10分钟。单份买入价${price(quote.buyPence)}；运输需另行前往收购方。`, { goodId: quote.id, unitPricePence: quote.buyPence }, event.currentTarget)}>{reason}</button>
      </article>;
    })}</div></section>
    <article className={styles.card} aria-label="出售采购货物"><h4>出售采购货物</h4><p className={styles.hint}>按原采购批次结算，显示实际成本与盈亏；同渠道回售通常亏损。</p>
      {view.lots.length ? view.lots.map(lot => {
        const quote = channel.quotes.find(entry => entry.id === lot.goodId);
        const reason = lot.equipped ? "请先卸下装备" : lot.protected ? "任务证据不可售" : !channel.onSite ? "到达后可出售" : !quote?.demand ? "今日收购已满" : !validQuantity || quantity > lot.quantity || quantity > quote.demand ? "请调整数量" : "查看并确认出售";
        return <div key={lot.instanceId} className={styles.lot}><strong>{lot.name} × {lot.quantity}</strong><p className={styles.hint}>原买入价 {price(lot.unitCostPence)}／份 · 当前收购 {price(quote?.sellPence || 0)}／份</p>
          {quote && validQuantity && <p className={styles.profit}>卖出{quantity}份可得 {price(quote.sellPence * quantity)} · 盈亏 {signedPrice((quote.sellPence - lot.unitCostPence) * quantity)}</p>}
          <button type="button" disabled={!ready || !channel.onSite || lot.equipped || lot.protected || !validQuantity || quantity > lot.quantity || quantity > (quote?.demand || 0)} onClick={event => review("trade-sell", `出售${lot.name}×${quantity}`, `${channel.name}收购${quantity}份货物，入账${price(quote.sellPence * quantity)}。采购成本${price(lot.unitCostPence * quantity)}，本次盈亏${signedPrice((quote.sellPence - lot.unitCostPence) * quantity)}，耗时10分钟。`, { instanceId: lot.instanceId, unitPricePence: quote.sellPence }, event.currentTarget)}>{reason}</button>
        </div>;
      }) : <p className={styles.hint}>先采购一批货物，再比较另一渠道的收购报价。</p>}
    </article>
    {view.receipts.length > 0 && <details className={styles.card}><summary>最近交易收据</summary>{[...view.receipts].reverse().map(entry => <div key={entry.id} className={styles.lot}><strong>{entry.kind === "buy" ? "购入" : "售出"} · {entry.name} × {entry.quantity}</strong><p>{entry.channelName} · {signedPrice(entry.amountPence)}</p>{entry.profitPence != null && <p className={styles.profit}>实际盈亏 {signedPrice(entry.profitPence)}</p>}<p className={styles.hint}>{entry.worldTime}</p></div>)}</details>}
  </section>;
}
