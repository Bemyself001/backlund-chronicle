import { useState } from "react";
import { EMPTY_CHARACTER, LOW_SEQUENCE_PATHWAYS, randomCharacter } from "../data/defaults.js";
import { MAX_STARTING_MONEY_PENCE, moneyFromPence, formatMoney } from "../data/money.js";
import styles from "./CharacterCreation.module.css";

const fields = [
  ["name", "姓名", "text"], ["gender", "性别", "select", ["女", "男", "非二元", "不公开"]], ["age", "年龄", "number"],
  ["origin", "出身地区", "text"], ["occupation", "初始职业", "text"], ["appearance", "外貌", "textarea"],
  ["personality", "性格", "textarea"], ["desire", "欲望", "textarea"], ["fear", "恐惧", "textarea"],
  ["secret", "私人秘密", "textarea"], ["background", "个人背景", "textarea"],
];

export default function CharacterCreation({ onBack, onCreate }) {
  const [character, setCharacter] = useState({ ...EMPTY_CHARACTER });
  const [error, setError] = useState("");
  const update = (key, value) => setCharacter((current) => ({ ...current, [key]: value }));
  const selectExtraordinary = (extraordinary) => setCharacter((current) => ({
    ...current,
    extraordinary,
    pathway: extraordinary === "low" ? LOW_SEQUENCE_PATHWAYS[0] : "无",
  }));
  const submit = (event) => {
    event.preventDefault();
    if (!character.name.trim() || !character.background.trim()) { setError("请至少填写姓名与个人背景。"); return; }
    const age = Number(character.age);
    if (age < 16 || age > 80) { setError("年龄需在 16—80 岁之间。"); return; }
    if (character.extraordinary === "low" && !LOW_SEQUENCE_PATHWAYS.includes(character.pathway)) { setError("请选择一条有效的序列9途径。"); return; }
    onCreate({ ...character, age });
  };
  return (
    <main className={styles.page} id="main">
      <header className={styles.header}><button type="button" onClick={onBack}>← 返回</button><span>贝克兰德临时居民登记处</span><small>FORM BK—04</small></header>
      <section className={styles.layout}>
          <aside className={styles.intro}>
          <p className={styles.kicker}>CHARACTER DOSSIER</p><h1>建立你的<br />私人档案</h1>
          <p>这不是英雄履历，而是一份会被世界记住的过去。欲望会指引你，恐惧与秘密也会留下代价。</p>
          <button className="button button--secondary" type="button" onClick={() => { setCharacter({ ...EMPTY_CHARACTER, ...randomCharacter() }); setError(""); }}>随机生成角色</button>
          <div className={styles.portrait} aria-label="风格化角色头像占位图"><div className={styles.head} /><div className={styles.shoulders} /><span>肖像待录入</span></div>
        </aside>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formHeading}><span>个人资料</span><p>带 * 的项目会影响开局叙事</p></div>
          <div className={styles.grid}>
            {fields.map(([key, label, type, options]) => <label key={key} className={`${styles.field} ${type === "textarea" ? styles.spanTwo : ""}`}><span>{label}{["name", "background"].includes(key) && " *"}</span>
              {type === "select" ? <select value={character[key]} onChange={(e) => update(key, e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
                : type === "textarea" ? <textarea rows={key === "background" ? 4 : 2} value={character[key]} onChange={(e) => update(key, e.target.value)} />
                  : <input type={type} min={type === "number" ? 16 : undefined} max={type === "number" ? 80 : undefined} value={character[key]} onChange={(e) => update(key, e.target.value)} />}
            </label>)}
          </div>
          <fieldset className={styles.identity}><legend>非凡身份</legend>
            <label><input type="radio" name="extraordinary" value="ordinary" checked={character.extraordinary === "ordinary"} onChange={() => selectExtraordinary("ordinary")} /><span><strong>普通人</strong><small>以知识、人脉与谨慎面对未知</small></span></label>
            <label><input type="radio" name="extraordinary" value="low" checked={character.extraordinary === "low"} onChange={() => selectExtraordinary("low")} /><span><strong>低序列非凡者</strong><small>拥有有限能力，也承担失控风险</small></span></label>
          </fieldset>
          <label className={`${styles.field} ${styles.pathwayField}`}><span>开局资金</span><select value={character.startingMoneyPence} onChange={(e) => update("startingMoneyPence", Number(e.target.value))} aria-describedby="money-help">{[0, 12, 60, 240, 480, MAX_STARTING_MONEY_PENCE].map((amount) => <option key={amount} value={amount}>{formatMoney(moneyFromPence(amount))}</option>)}</select><small id="money-help">最多 3 镑；游戏内按 1 镑 = 20 苏勒 = 240 便士结算。</small></label>
          {character.extraordinary === "low" && <label className={`${styles.field} ${styles.pathwayField}`}><span>序列9途径</span><select value={character.pathway} onChange={(e) => update("pathway", e.target.value)} required aria-describedby="pathway-help">{LOW_SEQUENCE_PATHWAYS.map((pathway) => <option key={pathway} value={pathway}>{pathway}</option>)}</select><small id="pathway-help">初始仅开放常见途径；非凡能力同时伴随失控与暴露风险。</small></label>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <footer className={styles.formFooter}><p>创建后将生成独立自动存档，你仍可从欢迎页开始其他角色。</p><button className="button button--primary button--large" type="submit">签署档案并进入贝克兰德</button></footer>
        </form>
      </section>
    </main>
  );
}
