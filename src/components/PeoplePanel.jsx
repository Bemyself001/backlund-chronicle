import { syncKnownPeople } from "../engine/people.js";
import styles from "./PeoplePanel.module.css";

const CONTACT_LABELS = { heard: "听闻", known: "旧识", met: "已见面" };

export default function PeoplePanel({ game, tasks, onSelectQuest }) {
  const projection = { ...game };
  syncKnownPeople(projection);
  const people = projection.relationships.filter(person => person?.dossier);
  const legacy = projection.relationships.filter(person => person && !person.dossier);
  const instances = [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])];
  return <section className={styles.people} aria-label="人物档案">
    <h3>人物档案 <small>{people.length} 位已知人物</small></h3>
    <p className={styles.intro}>记下你已获知的重要人物。身份与经历随调查补全，听闻不代表已经相识。</p>
    {!people.length && <p className={styles.empty}>尚未获知重要人物。调查线索、接触委托后，相关人物会自动记入这里。</p>}
    <div className={styles.list}>
      {people.map(person => {
        const records = person.dossier.records;
        const latest = records.at(-1)?.turn == null ? records.at(-1) : records.findLast(record => record.turn === person.dossier.updatedTurn) || records.at(-1);
        const related = tasks.filter(task => {
          const instance = instances.find(entry => entry.instanceId === task.id);
          return instance && person.dossier.questIds.includes(instance.definitionId);
        });
        return <article className={styles.card} key={person.id}>
          <header className={styles.heading}>
            <div><h4>{person.name}</h4>{person.alias && <p className={styles.alias}>代号 · {person.alias}</p>}</div>
            <span className={styles.contact} data-contact={person.contact}>{CONTACT_LABELS[person.contact]}</span>
          </header>
          <p className={styles.role}>{person.role}</p>
          <p>{person.connection}</p>
          {person.status && <p className={styles.status}>{person.status}</p>}
          {latest && <p className={styles.recent}><strong>最近进展</strong>{latest.text}</p>}
          {person.lastKnownLocation && <p className={styles.location}><strong>最后已知地点</strong>{person.lastKnownLocation}</p>}
          {related.length > 0 && <div className={styles.quests} aria-label="关联任务">{related.map(task =>
            <button key={task.id} type="button" onClick={() => onSelectQuest(task.id)} aria-label={`查看关联任务：${task.title}`}>{task.title}<span aria-hidden="true">↗</span></button>
          )}</div>}
          <details className={styles.history}>
            <summary>获知记录{records.length > 0 ? ` · ${records.length}` : ""}</summary>
            {records.length ? <ol>{records.map(record => <li key={record.id}>
              <small>{record.turn == null ? "轮次未记录" : `第 ${record.turn} 轮`} · {record.source}</small><p>{record.text}</p>
            </li>)}</ol> : <p>沿用旧档中已登记的人物，尚无可核对的详细经历。</p>}
            {person.note && <p><strong>关系备注：</strong>{person.note}</p>}
            {person.value !== 0 && <p className={styles.relation}>关系数值：{person.value > 0 ? "+" : ""}{person.value}</p>}
          </details>
        </article>;
      })}
    </div>
    {legacy.length > 0 && <details className={styles.legacy}><summary>其他已有关系 · {legacy.length}</summary>{legacy.map((person, index) => <article key={person.id || index}>
      <h4>{person.name}</h4><p>{person.role}</p><p>{person.note}</p>
      {Number.isFinite(person.value) && <small>关系数值：{person.value > 0 ? "+" : ""}{person.value}</small>}
    </article>)}</details>}
  </section>;
}
