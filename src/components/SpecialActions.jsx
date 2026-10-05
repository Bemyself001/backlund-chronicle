import { useState } from "react";
import { SPECIAL_RECIPES, SPECIAL_CONTACTS, ORGANIZATIONS, VISITABLE_PEOPLE, getOrganization } from "../content/index.js";
import { availableSpecialActions, actionGate, commissionOffer, registrationGate, specialState } from "../engine/specialActions.js";
import { getAdvancement } from "../system/character.js";
import { getMapLocation } from "../system/map.js";
import { formatMoney, moneyToPence } from "../system/money.js";
import PotionIdentification from "./PotionIdentification.jsx";
import styles from "./SpecialActions.module.css";
import { medicinePurchaseGate } from "../engine/medicineAccess.js";
import { hasMetPerson, visitPersonGate } from "../engine/visitablePeople.js";

export default function SpecialActions({ game, loading, onExecute, onOpenMap, onAction }) {
  const [tab, setTab] = useState("work");
  const [showLockedWork, setShowLockedWork] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmJoin, setConfirmJoin] = useState(null);
  const state = specialState(game);
  const advancement = getAdvancement(game.character);
  const definitions = availableSpecialActions(game);
  const lockedWork = definition => definition.organizationId && definition.organizationId !== game.organizationState?.membership?.organizationId;
  const visibleWork = showLockedWork ? definitions : definitions.filter(definition => !lockedWork(definition));
  const recipes = SPECIAL_RECIPES.filter((entry) => entry.pathwayId === advancement.pathwayId);
  const remaining = Math.max(0, state.availableTurn - game.turn);
  const money = moneyToPence(game.money);
  const medicineReason = medicinePurchaseGate(game);
  const execute = (operation, id, optionId) => {
    const result = onExecute({ operation, id, optionId, revision: state.revision });
    setNotice(result?.ok ? result.message : result?.error || "行动未完成，请重试。");
    if (result?.ok) setConfirmJoin(null);
  };
  const go = (id) => onOpenMap(id);
  const locationLink = (id) => id && <button className={styles.link} type="button" onClick={() => go(id)}>在地图查看{getMapLocation(id, game)?.name || "地点"}</button>;
  const activeDefinition = definitions.find((entry) => entry.id === state.active?.definitionId);
  const activeReason = state.active ? actionGate(game, activeDefinition) : "";

  return <div className={styles.panel}>
    <header><p className={styles.eyebrow}>贝克兰德 · 日常与非凡</p><h3>今天，如何度过？</h3><p className={styles.hint}>{advancement.pathwayName || "普通人的城市生活"} · 从一件具体的小事开始。</p>
      <div className={styles.meta}><span>工作声誉 {state.reputation}</span><span>{formatMoney(game.money)}</span></div>
    </header>
    <nav className={styles.tabs} aria-label="特殊行动分类">{[["work", "委托"], ["people", "人物"], ["supplies", "补给"], ["craft", "制作"], ["organization", "组织"]].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setNotice(""); }}>{label}</button>)}</nav>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {tab === "people" && <section aria-label="人物拜访"><h3>可以拜访的人</h3>
      {VISITABLE_PEOPLE.map(person => {
        const reason = visitPersonGate(game, person.id);
        const conversationReason = visitPersonGate(game, person.id, { conversation: true });
        const met = hasMetPerson(game, person);
        return <article key={person.id} className={styles.card} aria-label={`${person.name}的拜访与交谈`}>
          <div className={styles.meta}><span>{person.role}</span><span>{met ? "已见面" : "听闻于侦探广告"}</span></div>
          <h4>{person.name}</h4><p>{person.description}</p>
          {locationLink(person.locationId)}
          <button type="button" disabled={loading || Boolean(reason)} onClick={() => execute("visit-person", person.id)}>{reason || `${met ? "再次拜访" : "敲门拜访"}${person.name} · 1回合`}</button>
          <div className={styles.options}>{person.topics.map(topic => <button type="button" key={topic.id} disabled={loading || Boolean(conversationReason) || !onAction}
            onClick={() => onAction(topic.action, { personConversation: person.id })}>{topic.label}</button>)}</div>
          <p className={styles.hint}>{conversationReason || "也可在剧情中自由输入交谈内容；正式委托与费用另行商定。"}</p>
          {person.locationId === "minsk-street-15" && <PotionIdentification game={game} disabled={loading} onAction={onAction} />}
        </article>;
      })}
    </section>}
    {tab === "supplies" && <section aria-label="休息与药剂"><h3>照顾好自己，再上路</h3>
      <article className={styles.card}><h4>雾鸦旅店 · 睡眠恢复</h4><p>休息每满2小时恢复1点生命和理智，单次最多各4点，不超过上限；持续状态照常结算。</p>
        {locationLink("soot-lamp")}
        <button type="button" disabled={loading || game.location.id !== "soot-lamp"} onClick={() => execute("sleep", "soot-lamp")}>{game.location.id === "soot-lamp" ? "睡觉8小时 · 1回合" : "到达雾鸦旅店后可睡觉"}</button>
      </article>
      {SPECIAL_RECIPES.filter(recipe => recipe.stat).map(recipe => <article key={recipe.id} className={styles.card}><h4>{recipe.name}</h4><p>{recipe.description}</p>
        <button type="button" disabled={loading || Boolean(medicineReason) || money < recipe.sale} onClick={() => execute("buy-medicine", recipe.id)}>{medicineReason || (money < recipe.sale ? "资金不足 · " : "") + `购买成品 · ${recipe.sale}便士 · 1回合`}</button>
      </article>)}
      <p className={styles.hint}>开始追查「高窗之下」后，所有途径均可购买成品；仅听闻求医消息不会解锁。药师可自行制作，已有药剂仍可使用。药剂每次消耗一份，对应属性已满时不会消耗。</p>
    </section>}
    {tab === "work" && state.active && <section className={styles.active} aria-label="当前委托">
      <p className={styles.eyebrow}>正在进行 · 接单内容已保存</p><h3>{state.active.offer.title}</h3><p>{state.active.offer.scene}</p>
      {activeReason && <p>{activeReason}</p>}
      {locationLink(activeDefinition?.locationId)}
      <div className={styles.options}>{state.active.offer.options.map((option) => <button key={option.id} type="button" disabled={loading || Boolean(activeReason)} onClick={() => execute("resolve", state.active.id, option.id)}>
        <strong>{option.label}</strong><small>{state.active.stake ? option.id === "limited" ? "退回预留赌注" : "只赌一局 · 可能亏损全部6便士赌注，净收益最多6便士" : `基础报酬 ${option.reward} 便士${option.health ? ` · 生命 ${option.health}` : ""}${option.reputation < 0 ? " · 工作声誉 −1" : ""}`} · 消耗1回合</small>
      </button>)}</div>
      <button className={styles.link} type="button" disabled={loading} onClick={() => execute("abandon", state.active.id)}>放弃委托 · 不领取报酬，消耗1回合</button>
    </section>}

    {tab === "work" && <section aria-labelledby="work-list"><h3 id="work-list">可接工作</h3><details><summary>接单与报酬规则</summary><p className={styles.hint}>同时接取一份；接单1回合，完成1回合约30分钟。结算后间隔3回合再接新单。每3回合换一条未连续重复的候选。</p></details>
      {visibleWork.map((definition) => {
        const reason = actionGate(game, definition);
        const offer = commissionOffer(game, definition);
        const disabledReason = reason || (state.active ? "已有进行中的委托" : remaining ? `还需 ${remaining} 回合接新单` : money < (definition.stake || 0) ? "赌注不足" : "");
        return <article key={definition.id} className={styles.card}><div className={styles.meta}><span>{definition.name}</span><span>{disabledReason ? "条件未满足" : "可接取"}</span></div><h4>{offer.title}</h4><details><summary>委托详情与报酬</summary><p>{offer.scene}</p>
          <p className={styles.hint}>{definition.stake ? "预留6便士，仅一局小赌；45%赢6便士、20%打平、35%输6便士。" : `基础报酬 ${Math.min(...offer.options.map((option) => option.reward))}—${Math.max(...offer.options.map((option) => option.reward))} 便士；每晋升一级额外1苏勒，最多6苏勒（1苏勒=12便士）。`}</p>
          </details>{locationLink(definition.locationId || getOrganization(definition.organizationId)?.headquarters)}
          <button type="button" className="button button--primary" disabled={loading || Boolean(disabledReason)} onClick={() => execute("accept", definition.id)}>{disabledReason || "接取委托"}</button>
        </article>;
      })}
      {advancement.type === "ordinary" && <p>成为非凡者后，这里会显示对应途径的工作与能力。</p>}
      {definitions.some(lockedWork) && <button className={styles.link} type="button" aria-expanded={showLockedWork} onClick={() => setShowLockedWork(!showLockedWork)}>{showLockedWork ? "收起其他组织的委托" : `查看需加入组织的委托（${definitions.filter(lockedWork).length}）`}</button>}
    </section>}

    {tab === "craft" && recipes.length > 0 && <section aria-labelledby="recipe-list"><h3 id="recipe-list">配方与制作</h3><p className={styles.hint}>购买材料1回合，制作1回合。出售与使用也各消耗1回合。可用配方随序列解锁，材料保存在制作储备中。</p>
      {recipes.map((recipe) => {
        const reason = actionGate(game, recipe);
        return <article key={recipe.id} className={styles.card}><h4>{recipe.name}</h4><p>{recipe.description}</p><p className={styles.hint}>序列{recipe.maxSequence}解锁 · {recipe.material} {recipe.cost}便士 · 成品售价 {recipe.sale}便士 · 储备 {state.materials[recipe.id] || 0}份</p>
          <div className={styles.buttons}><button type="button" disabled={loading || Boolean(reason) || money < recipe.cost} onClick={() => execute("buy", recipe.id)}>{reason || "购买一份材料"}</button>
            <button type="button" disabled={loading || Boolean(reason) || Boolean(state.active) || !(state.materials[recipe.id] > 0)} onClick={() => execute("craft", recipe.id)}>制作成品</button></div>
        </article>;
      })}
    </section>}
    {tab === "craft" && Object.keys(state.products).length > 0 && <section aria-label="制作成品"><h3>行囊中的制作成品</h3>{Object.entries(state.products).map(([id, recipeId]) => {
      const recipe = SPECIAL_RECIPES.find((entry) => entry.id === recipeId);
      const item = game.inventory.find((entry) => entry.instanceId === id && entry.quantity > 0);
      return recipe && item ? <article className={styles.card} key={id}><h4>{item.name} ×{item.quantity}</h4><div className={styles.buttons}>
        {recipe.stat && <button type="button" disabled={loading} onClick={() => execute("use", id)}>使用一份</button>}
        <button type="button" disabled={loading || item.equipped} onClick={() => execute("sell", id)}>{item.equipped ? "先卸下装备" : `出售一份 · ${recipe.sale}便士`}</button>
      </div></article> : null;
    })}</section>}

    {tab === "craft" && !recipes.length && <p className={styles.hint}>当前途径尚无可制作配方。已持有的消耗品可以在行囊中使用。</p>}
    {tab === "organization" && <section aria-label="身份登记"><h3>身份与组织</h3>
      {advancement.pathwayId === "corpse_collector" && <article className={styles.card}><h4>墓地管理处</h4>{locationLink(SPECIAL_CONTACTS.registrationLocation)}<button type="button" disabled={loading || Boolean(state.active) || Boolean(registrationGate(game, "gravekeeper"))} onClick={() => execute("register", "gravekeeper")}>{registrationGate(game, "gravekeeper") || "登记为守墓人 · 1回合"}</button></article>}
      {game.organizationState?.membership?.status === "active" && <p>当前组织：{game.organizationState.membership.name}</p>}
      {ORGANIZATIONS.filter((organization) => organization.headquarters && organization.tags.includes("official")).map((organization) => {
        const reason = registrationGate(game, organization.id);
        return <article key={organization.id} className={styles.card}><h4>{organization.name}招募</h4><p>{organization.description || `${organization.church || organization.agency || "官方机构"}的非凡者组织。`}所有途径的非凡者均可申请，在组织驻地正式登记后开放本组织基础委托。</p>
          {locationLink(organization.headquarters)}
          {confirmJoin === organization.id ? <div><p>确认正式加入{organization.name}，接受组织纪律与任务安排？登记将消耗1回合。</p><div className={styles.buttons}><button type="button" disabled={loading || Boolean(state.active) || Boolean(reason)} onClick={() => execute("register", organization.id)}>确认加入{organization.name}</button><button type="button" onClick={() => setConfirmJoin(null)}>暂不加入</button></div></div>
            : <button type="button" disabled={loading || Boolean(state.active) || Boolean(reason)} onClick={() => setConfirmJoin(organization.id)}>{reason || `申请正式加入${organization.name}`}</button>}
        </article>;
      })}
    </section>}
    {tab === "work" && state.completed.length > 0 && <section aria-label="近期工作记录"><h3>近期结算</h3><ul className={styles.history}>{state.completed.slice(-5).reverse().map((entry) => <li key={entry.id}><span>{entry.title}</span><small>第{entry.turn}轮 · {entry.status === "abandon" ? "已放弃" : `入账${entry.reward}便士`}</small></li>)}</ul></section>}
  </div>;
}
