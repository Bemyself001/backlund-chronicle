import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import { findTravelRoute, getMapLocation, MAP_LOCATIONS, MAP_ROUTES } from "../data/map.js";
import styles from "./WorldMap.module.css";

export default function WorldMap({ game, loading, onClose, onTravel }) {
  const discoveredIds = useMemo(() => new Set([...game.discoveredLocations.map((location) => location.id), game.location.id]), [game.discoveredLocations, game.location.id]);
  const [selectedId, setSelectedId] = useState(game.location.id);
  const selected = getMapLocation(selectedId);
  const discovered = selected && discoveredIds.has(selected.id);
  const route = selected && discovered ? findTravelRoute(game.location.id, selected.id, discoveredIds) : null;
  const current = selected?.id === game.location.id;
  const routeNames = route?.path.map((id) => getMapLocation(id)?.name || id).join(" → ");

  return <Modal title="贝克兰德交通图" eyebrow="Municipal route dossier" onClose={onClose} wide>
    <div className={styles.layout}>
      <section className={styles.mapSection} aria-label="贝克兰德地点地图">
        <div className={styles.legend}><span><i data-kind="current" />当前位置</span><span><i data-kind="known" />已发现</span><span><i data-kind="unknown" />未知</span></div>
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
            const isKnown = discoveredIds.has(location.id);
            const isCurrent = game.location.id === location.id;
            return <button
              key={location.id}
              className={styles.node}
              style={{ left: `${location.x}%`, top: `${location.y}%` }}
              type="button"
              data-current={isCurrent}
              data-known={isKnown}
              aria-pressed={selectedId === location.id}
              aria-label={isKnown ? location.name : `${location.district}的未知地点`}
              onClick={() => setSelectedId(location.id)}
            ><b>{isKnown ? location.code : "?"}</b><span>{isKnown ? location.name.replace(`${location.district}·`, "") : "未知地点"}</span></button>;
          })}
          <div className={styles.scale} aria-hidden="true"><i /><span>城区示意 · 非精确比例</span></div>
        </div>
      </section>
      <aside className={styles.detail} aria-live="polite">
        <p>{discovered ? selected.district : "未归档区域"}</p>
        <h3>{discovered ? selected.name : "尚未发现的地点"}</h3>
        <span>{discovered ? selected.description : "继续探索、打听消息或取得相关线索后，这里才会显示详细资料。"}</span>
        {discovered && <dl>
          <div><dt>档案状态</dt><dd>{current ? "当前位置" : "已发现"}</dd></div>
          <div><dt>预计耗时</dt><dd>{current ? "—" : route ? `约 ${route.minutes} 分钟` : "暂无可用路线"}</dd></div>
          <div><dt>建议交通</dt><dd>{current ? "—" : route ? [...new Set(route.transports)].join("、") : "—"}</dd></div>
        </dl>}
        {routeNames && !current && <p className={styles.routeText}>推荐路线：{routeNames}</p>}
        <button className="button button--primary" type="button" disabled={!discovered || current || !route || loading} onClick={() => onTravel(selected)}>{current ? "你正在这里" : loading ? "本轮处理中" : "前往此处"}</button>
        <small>选择目的地会作为玩家行动提交，最终移动仍由本地规则验证。</small>
      </aside>
    </div>
  </Modal>;
}
