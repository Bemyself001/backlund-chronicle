import { useEffect, useRef } from "react";
import { API_SETUP_STEPS, HOME_TOUR_STEPS } from "../data/onboarding.js";
import styles from "./OnboardingGuide.module.css";

export function ApiSetupSteps({ inSettings = false }) {
  return <ol className={styles.steps}>
    {API_SETUP_STEPS.map((step, index) => <li key={step.title}>
      <span className={styles.number} aria-hidden="true">0{index + 1}</span>
      <div><strong>{step.title}</strong><p>{inSettings && index === 2 ? "在下方选择对应服务商，将密钥填入 API Key 栏，确认当前模型，然后点击「下一步」保存并返回首页。" : step.text}</p></div>
    </li>)}
  </ol>;
}

export default function OnboardingGuide({ step, onApi, onStep, onFinish }) {
  const heading = useRef(null);
  const setup = step === "setup";
  const index = HOME_TOUR_STEPS.findIndex(item => item.id === step);
  const current = HOME_TOUR_STEPS[index];
  const last = index === HOME_TOUR_STEPS.length - 1;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.closest("[data-onboarding-area]")?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  return <section className={styles.guide} aria-label="新手教程">
    <div className={styles.caption}><span>新手教程 · 调查准备</span><span>{setup ? "API 配置" : `首页导览 ${index + 1} / ${HOME_TOUR_STEPS.length}`}</span></div>
    <h2 ref={heading} tabIndex={-1}>{setup ? "先连接你的 AI 叙事伙伴" : current.title}</h2>
    <div id="onboarding-description">
      {setup ? <><p className={styles.intro}>跟随箭头打开「API 设置」，完成以下三步。</p><ApiSetupSteps /></> : <p className={styles.description}>{current.text}</p>}
    </div>
    <div className={styles.actions}>
      <button className={styles.skip} type="button" onClick={onFinish}>跳过教程</button>
      {index > 0 && <button className={styles.back} type="button" onClick={() => onStep(HOME_TOUR_STEPS[index - 1].id)}>上一步</button>}
      <button className={styles.next} type="button" onClick={setup ? onApi : last ? onFinish : () => onStep(HOME_TOUR_STEPS[index + 1].id)}>{setup ? "前往 API 设置" : last ? "完成教程" : "下一步"}<span aria-hidden="true"> →</span></button>
    </div>
    <p className={styles.footnote}>完成或跳过后，本机不再自动显示。</p>
  </section>;
}
