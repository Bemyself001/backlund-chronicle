import { useState } from "react";
import { SPECIAL_RECIPES, SPECIAL_CONTACTS } from "../content/index.js";
import { availableSpecialActions, actionGate, commissionOffer, registrationGate, specialState } from "../engine/specialActions.js";
import { getAdvancement } from "../system/character.js";
import { getMapLocation } from "../system/map.js";
import { moneyToPence } from "../system/money.js";
import styles from "./SpecialActions.module.css";

export default function SpecialActions({ game, loading, onExecute, onOpenMap }) {
  const [notice, setNotice] = useState("");
  const [confirmJoin, setConfirmJoin] = useState(false);
  const state = specialState(game);
  const advancement = getAdvancement(game.character);
  const definitions = availableSpecialActions(game);
  const recipes = SPECIAL_RECIPES.filter((entry) => entry.pathwayId === advancement.pathwayId);
  const remaining = Math.max(0, state.availableTurn - game.turn);
  const money = moneyToPence(game.money);
  const execute = (operation, id, optionId) => {
    const result = onExecute({ operation, id, optionId, revision: state.revision });
    setNotice(result?.ok ? result.message : result?.error || "行动未完成，请重试。");
    if (result?.ok) setConfirmJoin(false);
  };
  const go = (id) => onOpenMap(id);
  const locationLink = (id) => id && <button className={styles.link} type="button" onClick={() => go(id)}>在地图查看{getMapLocation(id, game)?.name || "地点"}</button>;
  const activeDefinition = definitions.find((entry) => entry.id === state.active?.definitionId);
  const activeReason = state.active ? actionGate(game, activeDefinition) : "";

  return <div className={styles.panel}>
    <header><p className={styles.eyebrow}>途径生计</p><h3>{advancement.pathwayName || "尚未踏入非凡"}</h3><p>以本领谋生，在工作中扮演。剧情从固定委托池抽取，报酬以本轮结算为准。</p>
      <div className={styles.meta}><span>工作声誉 {state.reputation}</span><span>持有 {money} 便士</span></div>
    </header>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {state.active && <section className={styles.active} aria-label="当前委托">
      <p className={styles.eyebrow}>正在进行 · 接单内容已保存</p><h3>{state.active.offer.title}</h3><p>{state.active.offer.scene}</p>
      {activeReason && <p>{activeReason}</p>}
      {locationLink(activeDefinition?.locationId)}
      <div className={styles.options}>{state.active.offer.options.map((option) => <button key={option.id} type="button" disabled={loading || Boolean(activeReason)} onClick={() => execute("resolve", state.active.id, option.id)}>
        <strong>{option.label}</strong><small>{state.active.stake ? option.id === "limited" ? "退回预留赌注" : "只赌一局 · 可能亏损全部6便士赌注，净收益最多6便士" : `基础报酬 ${option.reward} 便士${option.health ? ` · 生命 ${option.health}` : ""}${option.reputation < 0 ? " · 工作声誉 −1" : ""}`} · 消耗1回合</small>
      </button>)}</div>
      <button className={styles.link} type="button" disabled={loading} onClick={() => execute("abandon", state.active.id)}>放弃委托 · 不领取报酬，消耗1回合</button>
    </section>}

    <section aria-labelledby="work-list"><h3 id="work-list">可接工作</h3><p className={styles.hint}>同时接取一份；接单1回合，完成1回合约30分钟。结算后间隔3回合再接新单。每3回合换一条未连续重复的候选。</p>
      {definitions.map((definition) => {
        const reason = actionGate(game, definition);
        const offer = commissionOffer(game, definition);
        const disabledReason = reason || (state.active ? "已有进行中的委托" : remaining ? `还需 ${remaining} 回合接新单` : money < (definition.stake || 0) ? "赌注不足" : "");
        return <article key={definition.id} className={styles.card}><div className={styles.meta}><span>{definition.name}</span><span>{definition.pool.length}则固定剧情</span></div><h4>{offer.title}</h4><p>{offer.scene}</p>
          <p className={styles.hint}>{definition.stake ? "预留6便士，仅一局小赌；45%赢6便士、20%打平、35%输6便士。" : `基础报酬 ${Math.min(...offer.options.map((option) => option.reward))}—${Math.max(...offer.options.map((option) => option.reward))} 便士；每晋升一级额外1苏勒，最多6苏勒（1苏勒=12便士）。`}</p>
          {locationLink(definition.locationId || (definition.organizationId ? SPECIAL_CONTACTS.organizationLocation : null))}
          <button type="button" className="button button--primary" disabled={loading || Boolean(disabledReason)} onClick={() => execute("accept", definition.id)}>{disabledReason || "接取委托"}</button>
        </article>;
      })}
      {advancement.type === "ordinary" && <p>成为非凡者后，这里会显示对应途径的工作与能力。</p>}
    </section>

    {recipes.length > 0 && <section aria-labelledby="recipe-list"><h3 id="recipe-list">配方与制作</h3><p className={styles.hint}>购买材料1回合，制作1回合。出售与使用也各消耗1回合。可用配方随序列解锁，材料保存在制作储备中。</p>
      {recipes.map((recipe) => {
        const reason = actionGate(game, recipe);
        return <article key={recipe.id} className={styles.card}><h4>{recipe.name}</h4><p>{recipe.description}</p><p className={styles.hint}>序列{recipe.maxSequence}解锁 · {recipe.material} {recipe.cost}便士 · 成品售价 {recipe.sale}便士 · 储备 {state.materials[recipe.id] || 0}份</p>
          <div className={styles.buttons}><button type="button" disabled={loading || Boolean(reason) || money < recipe.cost} onClick={() => execute("buy", recipe.id)}>{reason || "购买一份材料"}</button>
            <button type="button" disabled={loading || Boolean(reason) || Boolean(state.active) || !(state.materials[recipe.id] > 0)} onClick={() => execute("craft", recipe.id)}>制作成品</button></div>
        </article>;
      })}
    </section>}
    {Object.keys(state.products).length > 0 && <section aria-label="制作成品"><h3>行囊中的制作成品</h3>{Object.entries(state.products).map(([id, recipeId]) => {
      const recipe = SPECIAL_RECIPES.find((entry) => entry.id === recipeId);
      const item = game.inventory.find((entry) => entry.instanceId === id && entry.quantity > 0);
      return recipe && item ? <article className={styles.card} key={id}><h4>{item.name} ×{item.quantity}</h4><div className={styles.buttons}>
        {recipe.stat && <button type="button" disabled={loading} onClick={() => execute("use", id)}>使用一份</button>}
        <button type="button" disabled={loading || item.equipped} onClick={() => execute("sell", id)}>{item.equipped ? "先卸下装备" : `出售一份 · ${recipe.sale}便士`}</button>
      </div></article> : null;
    })}</section>}

    <section aria-label="身份登记"><h3>身份与组织</h3>
      {advancement.pathwayId === "corpse_collector" && <article className={styles.card}><h4>墓地管理处</h4>{locationLink(SPECIAL_CONTACTS.registrationLocation)}<button type="button" disabled={loading || Boolean(state.active) || Boolean(registrationGate(game, "gravekeeper"))} onClick={() => execute("register", "gravekeeper")}>{registrationGate(game, "gravekeeper") || "登记为守墓人 · 1回合"}</button></article>}
      <article className={styles.card}><h4>值夜者招募</h4><p>所有途径均可申请。到圣赛缪尔教堂正式登记后，开放官方基础委托。</p>
        {game.organizationState?.membership?.status === "active" && <p>当前组织：{game.organizationState.membership.name}</p>}
        {locationLink(SPECIAL_CONTACTS.organizationLocation)}
        {confirmJoin ? <div><p>确认正式加入值夜者，接受组织纪律与任务安排？登记将消耗1回合。</p><div className={styles.buttons}><button type="button" disabled={loading} onClick={() => execute("register", "organization")}>确认加入</button><button type="button" onClick={() => setConfirmJoin(false)}>暂不加入</button></div></div>
          : <button type="button" disabled={loading || Boolean(state.active) || Boolean(registrationGate(game, "organization"))} onClick={() => setConfirmJoin(true)}>{registrationGate(game, "organization") || "申请正式加入"}</button>}
      </article>
    </section>
    {state.completed.length > 0 && <section aria-label="近期工作记录"><h3>近期结算</h3><ul className={styles.history}>{state.completed.slice(-5).reverse().map((entry) => <li key={entry.id}><span>{entry.title}</span><small>第{entry.turn}轮 · {entry.status === "abandon" ? "已放弃" : `入账${entry.reward}便士`}</small></li>)}</ul></section>}
  </div>;
}
