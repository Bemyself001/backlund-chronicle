import Modal from "./Modal.jsx";
import styles from "./ChangelogDialog.module.css";
import { LATEST_UPDATE } from "../data/changelog.js";

export default function ChangelogDialog({ onClose }) {
  return (
    <Modal title="更新日志" eyebrow="Release archive" onClose={onClose}>
      <article className={styles.entry} aria-labelledby="changelog-entry-title">
        <header className={styles.meta}>
          <span>Latest dispatch</span>
          <time dateTime={LATEST_UPDATE.date}>{LATEST_UPDATE.dateLabel}</time>
        </header>
        <h3 id="changelog-entry-title">{LATEST_UPDATE.title}</h3>
        <p className={styles.summary}>{LATEST_UPDATE.summary}</p>
        <ul className={styles.changes}>
          {LATEST_UPDATE.changes.map((change) => <li key={change}>{change}</li>)}
        </ul>
      </article>
      <div className={styles.actions}>
        <button className="button button--primary" type="button" onClick={onClose}>知道了</button>
      </div>
    </Modal>
  );
}
