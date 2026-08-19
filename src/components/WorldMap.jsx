import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import { findLocationRelations, findTravelRoute, getMapLocation, MAP_LOCATIONS, MAP_ROUTES, normalizeLocationKnowledge } from "../data/map.js";
import styles from "./WorldMap.module.css";

export default function WorldMap({ game, loading, onClose, onTravel, onInvestigate }) {
  const discoveredIds = useMemo(() => new Set([...game.discoveredLocations.map((location) => location.id), game.location.id]), [game.discoveredLocations, game.location.id]);
  const knowledgeById = useMemo(() => normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id), [game.locationKnowledge, game.discoveredLocations, game.location.id]);
  const [selectedId, setSelectedId] = useState(game.location.id);
  const selected = getMapLocation(selectedId);
  const selectedKnowledge = selected ? knowledgeById[selected.id] || { status: "unknown", note: "" } : { status: "unknown", note: "" };
  const discovered = selected && selectedKnowledge.status === "discovered";
  const rumored = selected && selectedKnowledge.status === "rumored";
  const route = selected && discovered ? findTravelRoute(game.location.id, selected.id, discoveredIds) : null;
  const current = selected?.id === game.location.id;
  const routeNames = route?.path.map((id) => getMapLocation(id)?.name || id).join(" → ");
  const relations = discovered ? findLocationRelations(game, selected) : null;
  const hasRelations = relations && (relations.quests.length || relations.clues.length || relations.npcs.length);

  return <Modal title="贝克兰德交通图" eyebrow="Municipal route dossier" onClose={onClose} wide>
    <div className={styles.layout}>
      <section className={styles.mapSection} aria-label="贝克兰德地点地图">
        <div className={styles.legend}><span><i data-kind="current" />当前位置</span><span><i data-kind="known" />已发现</span><span><i data-kind="rumored" />听闻</span><span><i data-kind="unknown" />未知</span></div>
        <div className={styles.mapCanvas}>
          <div className={styles.districtLabels} aria-hidden="true"><span className={styles.north}>北区</span><span className={styles.queen}>皇后区</span><span className={styles.hillston}>希尔斯顿</span><span className={styles.east}>东区</span><span className={styles.bridge}>桥区</span></div>
          <svg className={styles.routes} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {MAP_ROUTES.map((entry) => {
              const from = getMapLocation(entry.from);
              const to = getMapLocation(entry.to);
              const known = discoveredIds.has(entry.from) && discoveredIds.has(entry.to);
              return <line key={`${entry.from}-${entry.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} data-known={known} />;
            })}
          </svg>
          {MAP_LOCATIONS.map((location) => {
            const status = knowledgeById[location.id]?.status || "unknown";
            const isKnown = status === "discovered";
            const isCurrent = game.location.id === location.id;
            return <button
              key={location.id}
              className={styles.node}
              style={{ left: `${location.x}%`, top: `${location.y}%` }}
              type="button"
              data-current={isCurrent}
              data-status={status}
              aria-pressed={selectedId === location.id}
              aria-label={isKnown ? `${location.name}${isCurrent ? "，玩家当前位置" : ""}` : status === "rumored" ? `${location.district}的地点传闻` : `${location.district}的雾中区域`}
              onClick={() => setSelectedId(location.id)}
            >{isCurrent && <i className={styles.playerMarker} aria-hidden="true" />}<b>{isKnown ? location.code : status === "rumored" ? "?" : "·"}</b><span>{isKnown ? location.name.replace(`${location.district}·`, "") : status === "rumored" ? "地点传闻" : "雾中区域"}</span></button>;
          })}
          <div className={styles.scale} aria-hidden="true"><i /><span>城区示意 · 非精确比例</span></div>
        </div>
      </section>
      <aside className={styles.detail} aria-live="polite">
        <p>{discovered || rumored ? selected.district : "未归档区域"}</p>
        <h3>{discovered ? selected.name : rumored ? "地图上的地点传闻" : "雾中区域"}</h3>
        <span>{discovered ? selected.description : rumored ? selectedKnowledge.note || selected.rumor : "这里还没有可供追查的传闻。继续探索、交谈或取得相关线索后，地图会补充记录。"}</span>
        {discovered && <dl>
          <div><dt>Location ID</dt><dd><code>{selected.id}</code></dd></div>
          <div><dt>档案状态</dt><dd>{current ? "当前位置" : "已发现"}</dd></div>
          <div><dt>预计耗时</dt><dd>{current ? "—" : route ? `约 ${route.minutes} 分钟` : "暂无可用路线"}</dd></div>
          <div><dt>建议交通</dt><dd>{current ? "—" : route ? [...new Set(route.transports)].join("、") : "—"}</dd></div>
        </dl>}
        {routeNames && !current && <p className={styles.routeText}>推荐路线：{routeNames}</p>}
        {discovered && hasRelations && <div className={styles.relations} aria-label="与该地点相关的档案">
          {relations.quests.length > 0 && <section><h4>相关任务</h4><ul>{relations.quests.slice(0, 3).map((quest) => <li key={quest.id}><strong>{quest.title}</strong><small>{quest.status}</small></li>)}</ul></section>}
          {relations.clues.length > 0 && <section><h4>相关线索</h4><ul>{relations.clues.slice(0, 3).map((clue) => <li key={clue.id}><strong>{clue.title}</strong>{clue.detail && <small>{clue.detail.slice(0, 40)}</small>}</li>)}</ul></section>}
          {relations.npcs.length > 0 && <section><h4>相关人物</h4><ul>{relations.npcs.slice(0, 3).map((npc) => <li key={npc.id}><strong>{npc.name}</strong><small>{npc.role}</small></li>)}</ul></section>}
        </div>}
        {discovered
          ? <button className="button button--primary" type="button" disabled={current || !route || loading} onClick={() => onTravel(selected)}>{current ? "你正在这里" : loading ? "本轮处理中" : route ? "前往此处" : "暂无可用路线"}</button>
          : rumored
            ? <button className="button button--primary" type="button" disabled={loading} onClick={() => onInvestigate(selected, selectedKnowledge)}>{loading ? "本轮处理中" : "调查该区域"}</button>
            : <button className="button button--primary" type="button" disabled>尚无线索</button>}
        <small>{discovered ? "地图会携带 Location ID 提交目的地；移动成功后，玩家标记会立即更新。" : rumored ? "调查会进入正常回合；只有本地确认成功后，地点才会正式解锁。" : "未知区域不会提前泄露名称与详情。"}</small>
      </aside>
    </div>
  </Modal>;
}
