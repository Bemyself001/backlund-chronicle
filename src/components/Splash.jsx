import background from "../../assets/promo-16x9.png";
import { TAPTAP_DOWNLOAD_URL } from "../data/promotion.js";
import styles from "./Splash.module.css";

export default function Splash({ onEnter }) {
  return (
    <main id="main" className={styles.page}>
      <img className={styles.background} src={background} alt="" fetchPriority="high" />
      <header className={styles.header}>
        <span>BACKLUND CHRONICLE</span>
        <span>私人调查档案 · 1349</span>
      </header>
      <section className={styles.content} aria-labelledby="splash-title">
        <p className={styles.eyebrow}>雾都来信 · 致未署名的调查员</p>
        <h1 id="splash-title">贝克兰德<span>纪事</span></h1>
        <p className={styles.subtitle}>雾气之下，命运正等待你的署名。</p>
        <div className={styles.actions}>
          <div className={styles.promotion}>
            {TAPTAP_DOWNLOAD_URL ? (
              <a className={styles.tapButton} href={TAPTAP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer sponsored">
                <span className={styles.tapWordmark}>TapTap</span><span>官方下载 <span aria-hidden="true">↗</span></span>
              </a>
            ) : (
              <button className={styles.tapButton} type="button" disabled aria-describedby="promotion-pending">
                <span className={styles.tapWordmark}>TapTap</span><span>官方下载 <span aria-hidden="true">↗</span></span>
              </button>
            )}
            <p className={styles.adNote}>广告合作{!TAPTAP_DOWNLOAD_URL && <span id="promotion-pending"> · 下载链接待接入</span>}</p>
          </div>
          <button className={styles.enterButton} type="button" onClick={onEnter}>
            签署档案并进入贝克兰德 <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <footer className={styles.footer}><span>煤烟 · 钟声 · 隐秘仪式</span><span>你的故事，从此入档。</span></footer>
    </main>
  );
}
