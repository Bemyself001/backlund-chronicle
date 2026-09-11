import { useEffect, useRef, useState } from "react";
import { EMPTY_CHARACTER, LOW_SEQUENCE_PATHWAYS, randomCharacter } from "../data/defaults.js";
import { TALENTS, getTalent, talentItemSpec } from "../data/talents.js";
import { generateLoadout } from "../services/loadout.js";
import { loadoutInput } from "../data/loadout.js";
import { MAX_STARTING_MONEY_PENCE, moneyFromPence, formatMoney } from "../data/money.js";
import styles from "./CharacterCreation.module.css";
import { getOpening, OPENINGS } from "../data/openings.js";
import { getMapLocation } from "../data/map.js";

const AVATAR_SIZE = 192;

function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("请选择图片文件（PNG / JPG 等）。")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，请换一张试试。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片解析失败，请换一张试试。"));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const scale = Math.max(AVATAR_SIZE / image.width, AVATAR_SIZE / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        canvas.getContext("2d").drawImage(image, (AVATAR_SIZE - width) / 2, (AVATAR_SIZE - height) / 2, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const fields = [
  ["name", "姓名", "text"], ["gender", "性别", "select", ["女", "男", "非二元", "不公开"]], ["age", "年龄", "number"],
  ["origin", "出身地区", "text"], ["occupation", "初始职业", "text"], ["appearance", "外貌", "textarea"],
  ["personality", "性格", "textarea"], ["desire", "欲望", "textarea"], ["fear", "恐惧", "textarea"],
  ["secret", "私人秘密", "textarea"], ["background", "个人背景", "textarea"],
];

export default function CharacterCreation({ onBack, onCreate, settings, onApi }) {
  const [character, setCharacter] = useState({ ...EMPTY_CHARACTER });
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState(null);
  const controllerRef = useRef(null);
  const previewRef = useRef(null);
  const preview = review?.character === character && review?.settings === settings ? review.loadout : null;
  const talentItem = talentItemSpec(character.talent);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => { if (preview) previewRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }, [preview]);
  const opening = getOpening(character.startingDistrict);
  const fileInputRef = useRef(null);
  const pickAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      update("avatar", await readAvatarFile(file));
      setError("");
    } catch (avatarError) {
      setError(avatarError.message);
    }
  };
  const update = (key, value) => setCharacter((current) => ({ ...current, [key]: value }));
  const selectExtraordinary = (extraordinary) => setCharacter((current) => ({
    ...current,
    extraordinary,
    pathway: extraordinary === "low" ? LOW_SEQUENCE_PATHWAYS[0] : "无",
  }));
  const submit = async (event) => {
    event.preventDefault();
    if (controllerRef.current) return;
    if (!character.name.trim() || !character.background.trim()) { setError("请至少填写姓名与个人背景。"); return; }
    const age = Number(character.age);
    if (age < 16 || age > 80) { setError("年龄需在 16—80 岁之间。"); return; }
    if (character.extraordinary === "low" && !LOW_SEQUENCE_PATHWAYS.includes(character.pathway)) { setError("请选择一条有效的序列9途径。"); return; }
    try { loadoutInput(character); } catch (inputError) { setError(inputError.message); return; }
    if (preview) {
      try { onCreate({ ...character, age }, preview); } catch (creationError) { setError(creationError.message || "建档失败，请重试。"); }
      return;
    }
    setError("");
    setGenerating(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    try {
      const loadout = await generateLoadout(character, settings, controller.signal);
      if (!controller.signal.aborted) setReview({ character, settings, loadout });
    } catch (generationError) {
      setError(timedOut ? "整理超过一分钟，请重试或检查 API 设置。填写内容已保留。" : generationError.name === "AbortError" ? "已取消整理，填写内容已保留。" : generationError.message || "行装生成失败，请重试。");
    } finally {
      clearTimeout(timer);
      controllerRef.current = null;
      setGenerating(false);
    }
  };
  return (
    <main className={styles.page} id="main">
      <header className={styles.header}><button type="button" onClick={onBack}>← 返回</button><span>贝克兰德临时居民登记处</span><small>FORM BK—04</small></header>
      <section className={styles.layout}>
          <aside className={styles.intro}>
          <div className={styles.avatarFrame} data-filled={Boolean(character.avatar) || null}>
            <button type="button" className={styles.avatarPick} onClick={() => fileInputRef.current?.click()} aria-label={character.avatar ? "更换头像" : "上传头像"}>
              {character.avatar
                ? <img src={character.avatar} alt="角色头像预览" />
                : <><span className={styles.avatarIcon} aria-hidden="true" /><span className={styles.avatarHint}>点击录入肖像<br /><small>PNG / JPG，自动压缩</small></span></>}
            </button>
            {character.avatar && <button type="button" className={styles.avatarRemove} onClick={() => update("avatar", "")}>移除</button>}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
            <small className={styles.avatarNote}>不建议使用真实人像；仅在本地保存，可能用于 AI 对话。详见<a href="/privacy.html" target="_blank" rel="noreferrer">隐私政策</a></small>
          </div>
          <p className={styles.kicker}>CHARACTER DOSSIER</p><h1>建立你的<br />私人档案</h1>
          <p>这不是英雄履历，而是一份会被世界记住的过去。欲望会指引你，恐惧与秘密也会留下代价。</p>
          <button className="button button--secondary" type="button" disabled={generating} onClick={() => { setCharacter({ ...EMPTY_CHARACTER, ...randomCharacter(), avatar: character.avatar, startingDistrict: character.startingDistrict, clothingDescription: character.clothingDescription, carriedItemName: character.carriedItemName, carriedItemDescription: character.carriedItemDescription }); setError(""); }}>随机生成角色</button>
        </aside>
        <form className={styles.form} onSubmit={submit}>
          <fieldset className={styles.formFields} disabled={generating}>
          <fieldset className={styles.startingDistrict} aria-describedby="starting-district-help">
            <legend>故事起点 · 开局大区</legend>
            <p id="starting-district-help">选择故事开始时所在的大区。出身地区仍由个人资料决定，开局后可以自由前往其他城区。</p>
            <div className={styles.districtOptions}>
              {OPENINGS.map((entry) => <label key={entry.district} data-selected={opening.district === entry.district}>
                <input type="radio" name="startingDistrict" value={entry.district} checked={opening.district === entry.district} onChange={() => update("startingDistrict", entry.district)} />
                <span><strong>{entry.district}</strong><small>{entry.theme}</small></span>
              </label>)}
            </div>
            <div className={styles.openingPreview} aria-live="polite" aria-atomic="true">
              <small>开场预览 · {getMapLocation(opening.locationId).name}</small>
              <h2>{opening.title}</h2>
              <p>{opening.preview}</p>
              <span>生活、交涉或调查，由你决定第一步。</span>
            </div>
          </fieldset>
          <div className={styles.formHeading}><span>个人资料</span><p>带 * 的项目会影响开局叙事</p></div>
          <div className={styles.grid}>
            {fields.map(([key, label, type, options]) => <label key={key} className={`${styles.field} ${type === "textarea" ? styles.spanTwo : ""}`}><span>{label}{["name", "background"].includes(key) && " *"}</span>
              {type === "select" ? <select value={character[key]} onChange={(e) => update(key, e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
                : type === "textarea" ? <textarea rows={key === "background" ? 4 : 2} value={character[key]} onChange={(e) => update(key, e.target.value)} />
                  : <input type={type} min={type === "number" ? 16 : undefined} max={type === "number" ? 80 : undefined} value={character[key]} onChange={(e) => update(key, e.target.value)} />}
              {key === "name" && <small className={styles.fieldHint}>可使用虚构昵称；仅用于角色扮演，详见<a href="/privacy.html" target="_blank" rel="noreferrer">隐私政策</a></small>}
            </label>)}
          </div>
          <fieldset className={styles.loadoutFields}>
            <legend>开局行装</legend>
            <label className={styles.field}><span>衣着描述 *</span><textarea required maxLength={600} rows={3} value={character.clothingDescription} onChange={(event) => update("clothingDescription", event.target.value)} aria-describedby="clothing-help" /></label>
            <p id="clothing-help">描述身上穿戴的衣物，例如：深灰呢大衣、白衬衫、黑长裤和磨损的皮靴。整理后可预览衣物、穿戴部位和估算重量。</p>
            <label className={styles.field}><span>随身物品名称（可留空）</span><input maxLength={40} value={character.carriedItemName} onChange={(event) => update("carriedItemName", event.target.value)} placeholder="例如：旧相机" aria-describedby="carried-help" /></label>
            <label className={styles.field}><span>随身物品描述</span><textarea maxLength={300} rows={2} value={character.carriedItemDescription} onChange={(event) => update("carriedItemDescription", event.target.value)} placeholder="例如：父亲留下的折叠式相机，镜头边缘有一道划痕。" /></label>
            <p id="carried-help">可自选一件普通随身物品，数量为 1；容器按空容器计算，描述不会直接赋予特殊能力。家传怀表由对应天赋额外发放，不占此名额。罗盘、笔记本和火柴不再默认赠送。</p>
            <p>{settings.mockMode ? "当前为离线演示：按常见衣物名称本地整理，重量使用基础估值。复杂描述可切换至 AI 生成。" : "使用当前配置的 AI 整理行装，仅发送衣着和随身物品描述。"} <button className={styles.apiLink} type="button" onClick={onApi}>API 设置</button></p>
          </fieldset>
          <fieldset className={styles.identity}><legend>非凡身份</legend>
            <label><input type="radio" name="extraordinary" value="ordinary" checked={character.extraordinary === "ordinary"} onChange={() => selectExtraordinary("ordinary")} /><span><strong>普通人</strong><small>以知识、人脉与谨慎面对未知</small></span></label>
            <label><input type="radio" name="extraordinary" value="low" checked={character.extraordinary === "low"} onChange={() => selectExtraordinary("low")} /><span><strong>低序列非凡者</strong><small>拥有有限能力，也承担失控风险</small></span></label>
          </fieldset>
          <label className={`${styles.field} ${styles.pathwayField}`}><span>天赋</span><select value={character.talent} onChange={(e) => update("talent", e.target.value)} aria-describedby="talent-help">{TALENTS.map((talent) => <option key={talent.id} value={talent.id}>{talent.name}</option>)}</select><small id="talent-help">{getTalent(character.talent).description}天赋效果由本地引擎直接写入角色数值，开局即生效。</small></label>
          <label className={`${styles.field} ${styles.pathwayField}`}><span>开局资金</span><select value={character.startingMoneyPence} onChange={(e) => update("startingMoneyPence", Number(e.target.value))} aria-describedby="money-help">{[0, 12, 60, 240, 480, MAX_STARTING_MONEY_PENCE].map((amount) => <option key={amount} value={amount}>{formatMoney(moneyFromPence(amount))}</option>)}</select><small id="money-help">最多 3 镑；游戏内按 1 镑 = 20 苏勒 = 240 便士结算。</small></label>
          {character.extraordinary === "low" && <label className={`${styles.field} ${styles.pathwayField}`}><span>序列9途径</span><select value={character.pathway} onChange={(e) => update("pathway", e.target.value)} required aria-describedby="pathway-help">{LOW_SEQUENCE_PATHWAYS.map((pathway) => <option key={pathway} value={pathway}>{pathway}</option>)}</select><small id="pathway-help">初始仅开放常见途径；非凡能力同时伴随失控与暴露风险。</small></label>}
          </fieldset>
          {preview && <section ref={previewRef} className={styles.loadoutPreview} aria-labelledby="loadout-title" tabIndex={-1}>
            <h2 id="loadout-title">确认开局行装</h2>
            <p>{preview.mode === "ai" ? "AI 整理结果" : "本地整理结果"} · 重量为估值。确认后衣物将自动穿戴。</p>
            <ul>{preview.clothes.map((entry) => <li key={entry.slot}><strong>{entry.name} ×1</strong><small>{entry.slot} · {entry.weight} kg · 将穿戴</small><p>{entry.description}</p></li>)}</ul>
            <h3>自选随身物品 · {preview.carriedItem ? "1 / 1" : "0 / 1"}</h3>
            {preview.carriedItem ? <p>{preview.carriedItem.name} ×1 · {preview.carriedItem.weight} kg<br />{preview.carriedItem.description}</p> : <p>不携带自选物品。</p>}
            {talentItem && <><h3>天赋额外物品</h3><p>{talentItem.name} ×1 · {talentItem.weight} kg · 不占自选名额</p></>}
            <p>合计负重：{(preview.clothes.reduce((sum, entry) => sum + entry.weight, 0) + (preview.carriedItem?.weight || 0) + (talentItem?.weight || 0)).toFixed(2)} / 12 kg</p>
            <button className="button button--secondary" type="button" onClick={() => { setReview(null); setError(""); }}>修改或重新整理</button>
          </section>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {generating && <p role="status">正在整理开局行装，请稍候… <button type="button" className={styles.apiLink} onClick={() => controllerRef.current?.abort()}>取消整理</button></p>}
          <footer className={styles.formFooter}><p>{preview ? "确认这份行装后，将建立档案并进入所选大区。" : "先整理并确认行装，再进入故事。修改角色资料后需重新整理。"}</p><button className="button button--primary button--large" type="submit" disabled={generating}>{generating ? "正在整理…" : preview ? "确认行装并进入贝克兰德" : "整理开局行装"}</button></footer>
        </form>
      </section>
    </main>
  );
}
