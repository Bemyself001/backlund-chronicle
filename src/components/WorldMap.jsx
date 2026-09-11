import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import { findLocationRelations, findTravelRoute, getChildLocations, getMapLocation, getMapLocations, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "../data/map.js";
import { cityTerrainLabel, canExploreHex, hexPolygonPoints, hexToPixel, visibleHexes } from "../data/hexworld.js";
import styles from "./WorldMap.module.css";

const KIND_LABELS = {
  street: "街道", residence: "住所", shop: "店铺", tavern: "酒馆", office: "事务所", church: "教会", warehouse: "仓库",
  station: "交通点", institution: "机构", hideout: "隐秘据点", interior: "内部地点", other: "地点", landmark: "地标",
};

export default function WorldMap({ game, loading, onClose, onTravel, onInvestigate, onExplore }) {
  const discoveredIds = useMemo(() => new Set([...game.discoveredLocations.map((location) => location.id), game.location.id]), [game.discoveredLocations, game.location.id]);
  const knowledgeById = useMemo(() => normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id, game), [game]);
  const allLocations = useMemo(() => getMapLocations(game), [game]);
  const locationById = useMemo(() => new Map(allLocations.map((location) => [location.id, location])), [allLocations]);
  const hexCells = useMemo(() => visibleHexes(game, 4).map((cell) => {
    const location = cell.tile.locationId ? locationById.get(cell.tile.locationId) : null;
    const status = location ? knowledgeById[location.id]?.status || "unknown" : null;
    const explorable = !location && canExploreHex(game, cell.q, cell.r).ok;
    return { ...cell, location, status, explorable };
  }), [game, locationById, knowledgeById]);
  const hexLayout = useMemo(() => {
    const size = 34;
    const points = hexCells.map((cell) => ({ cell, ...hexToPixel(cell.q, cell.r, size) }));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const pad = size * 1.6;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return { size, points, minX, minY, width: Math.max(...xs) - minX + pad, height: Math.max(...ys) - minY + pad };
  }, [hexCells]);
  const currentRecord = getMapLocation(game.location.id, game);
  const playerHex = game.world?.player || null;
  const [selectedId, setSelectedId] = useState(currentRecord?.scope === "interior" ? currentRecord.parentId : currentRecord?.id || null);
  const [selectedHex, setSelectedHex] = useState(currentRecord || !playerHex ? null : { q: playerHex.q, r: playerHex.r });
  const exploreCell = selectedHex ? hexCells.find((cell) => cell.q === selectedHex.q && cell.r === selectedHex.r) : null;
  const selectedHexIsCurrent = Boolean(selectedHex && playerHex && selectedHex.q === playerHex.q && selectedHex.r === playerHex.r);
  const selected = getMapLocation(selectedId, game);
  const selectedKnowledge = selected ? knowledgeById[selected.id] || { status: "unknown", note: "" } : { status: "unknown", note: "" };
  const discovered = selected && isDiscoveredLocationStatus(selectedKnowledge.status);
  const rumored = selected && selectedKnowledge.status === "rumored";
  const route = selected && discovered ? findTravelRoute(game.location.id, selected.id, discoveredIds, game) : null;
  const current = selected?.id === game.location.id;
  const routeNames = route?.path.map((id) => id === game.location.id ? game.location.name : getMapLocation(id, game)?.name || id).join(" → ");
  const relations = discovered ? findLocationRelations(game, selected) : null;
  const hasRelations = relations && (relations.quests.length || relations.clues.length || relations.npcs.length);
  const children = selected ? getChildLocations(game, selected.id).filter((location) => knowledgeById[location.id]?.status !== "unknown") : [];
  const dynamicCount = (game.mapExtensions?.locations || []).filter((location) => location.lifecycle !== "archived").length;

  return <Modal title="贝克兰德城区图" eyebrow="Hex borough atlas" onClose={onClose} wide>
    <div className={styles.layout}>
      <section className={styles.mapSection} aria-label="贝克兰德六边形城区图">
        <div className={styles.mapSummary}><span>固定地标 {allLocations.filter((location) => location.source === "static").length}</span><span>剧情生长 {dynamicCount}</span><small>移动到新区块会揭开周边迷雾</small></div>
        <div className={styles.legend}><span><i data-kind="current" />当前位置</span><span><i data-kind="known" />已发现</span><span><i data-kind="rumored" />听闻</span><span><i data-kind="unknown" />迷雾</span></div>
        <div className={styles.mapCanvas}>
          <svg className={styles.hexGrid} viewBox={`${hexLayout.minX} ${hexLayout.minY} ${hexLayout.width} ${hexLayout.height}`} role="img" aria-label="六边形城区格网">
            {hexLayout.points.map(({ cell, x, y }) => {
              const known = cell.location && isDiscoveredLocationStatus(cell.status);
              const rumored = cell.location && cell.status === "rumored";
              const isCurrent = playerHex && cell.q === playerHex.q && cell.r === playerHex.r;
              const interactive = Boolean(cell.location || cell.explorable || isCurrent);
              const pick = () => { if (cell.location) { setSelectedHex(null); setSelectedId(cell.location.id); } else if (cell.explorable || isCurrent) { setSelectedId(null); setSelectedHex({ q: cell.q, r: cell.r }); } };
              return <g
                key={`${cell.q},${cell.r}`}
                className={styles.hexCell}
                data-terrain={cell.discovered ? cell.tile.terrain : "fog"}
                data-status={cell.status || (cell.discovered ? "open" : "unknown")}
                data-current={isCurrent || null}
                data-explorable={cell.explorable || null}
                data-selected={selectedHex && selectedHex.q === cell.q && selectedHex.r === cell.r ? true : null}
                data-dynamic={cell.location?.source === "dynamic" || null}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={cell.location ? (known ? `${cell.location.name}${isCurrent ? "，玩家当前位置" : ""}` : rumored ? `${cell.location.district}的地点传闻` : `${cell.location.district}的雾中区域`) : isCurrent ? `${game.location.name}，玩家当前位置` : cell.explorable ? `可探索的${cityTerrainLabel(cell.tile.terrain)}` : (cell.discovered ? cityTerrainLabel(cell.tile.terrain) : "迷雾区域")}
                onClick={interactive ? pick : undefined}
                onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(); } } : undefined}
              >
                <polygon points={hexPolygonPoints(x, y, hexLayout.size - 1.5)} />
                {isCurrent && <polygon className={styles.currentRing} points={hexPolygonPoints(x, y, hexLayout.size - 7)} />}
                {known && <text x={x} y={y - 3} className={styles.hexCode}>{cell.location.code}</text>}
                {known && <text x={x} y={y + 13} className={styles.hexName}>{cell.tile.name || cell.location.name.replace(`${cell.location.district}·`, "")}</text>}
                {rumored && <text x={x} y={y + 6} className={styles.hexRumor}>?</text>}
                {!cell.location && cell.discovered && <text x={x} y={y + 4} className={styles.hexTerrain}>{cityTerrainLabel(cell.tile.terrain)}</text>}
              </g>;
            })}
          </svg>
          <div className={styles.scale} aria-hidden="true"><i /><span>六边形城区格网 · 地形与距离由本地引擎确定</span></div>
        </div>
      </section>
      <aside className={styles.detail} aria-live="polite">
        {selectedHex && exploreCell ? selectedHexIsCurrent ? <>
          <p>当前位置 · 未归档区域</p>
          <h3>{game.location.name}</h3>
          <span>你正在一处普通街区。它不会占用重要地点档案；选择地图上任意已发现地点，即可从这里计算路线并动身返回。</span>
          <dl>
            <div><dt>地点类型</dt><dd>{cityTerrainLabel(exploreCell.tile.terrain)}</dd></div>
            <div><dt>档案状态</dt><dd>普通探索区域</dd></div>
            <div><dt>可用行动</dt><dd>继续探索或前往重要地点</dd></div>
          </dl>
          <button className="button button--primary" type="button" disabled>你正在这里</button>
          <small>普通街区只保留探索与路线信息，不会出现在重要地点目录中。</small>
        </> : <>
          <p>未归档区域</p>
          <h3>未登记的{cityTerrainLabel(exploreCell.tile.terrain)}</h3>
          <span>这片{cityTerrainLabel(exploreCell.tile.terrain)}尚无档案记录，离你的位置只有一街之隔。走上前去，看看雾后藏着什么。</span>
          <dl>
            <div><dt>行动</dt><dd>步行探索</dd></div>
            <div><dt>预计耗时</dt><dd>约 13 分钟</dd></div>
            <div><dt>说明</dt><dd>探索即刻完成，不占用回合</dd></div>
          </dl>
          <button className="button button--primary" type="button" disabled={loading} onClick={() => onExplore(selectedHex)}>{loading ? "本轮处理中" : "探索这一带"}</button>
          <small>探索由本地完成：揭开周边迷雾并留下一段沿途见闻。若发现值得记录的地点，地图会另作归档。</small>
        </> : <>
        <p>{discovered || rumored ? selected.district : "未归档区域"}</p>
        <h3>{discovered ? selected.name : rumored ? "地图上的地点传闻" : "雾中区域"}</h3>
        {discovered && <div className={styles.locationBadges}><span>{KIND_LABELS[selected.kind] || "地点"}</span><span>{selected.source === "dynamic" ? "剧情生长" : "城市档案"}</span>{selectedKnowledge.status === "visited" && <span>已到访</span>}</div>}
        <span>{discovered ? selected.description : rumored ? selectedKnowledge.note || selected.rumor : "这里还没有可供追查的传闻。继续探索、交谈或取得相关线索后，地图会补充记录。"}</span>
        {discovered && <dl>
          <div><dt>Location ID</dt><dd><code>{selected.id}</code></dd></div>
          <div><dt>档案状态</dt><dd>{current ? "当前位置" : selectedKnowledge.status === "visited" ? "已到访" : "已发现"}</dd></div>
          <div><dt>预计耗时</dt><dd>{current ? "—" : route ? `约 ${route.minutes} 分钟` : "暂无可用路线"}</dd></div>
          <div><dt>建议交通</dt><dd>{current ? "—" : route ? [...new Set(route.transports)].join("、") : "—"}</dd></div>
        </dl>}
        {routeNames && !current && <p className={styles.routeText}>推荐路线：{routeNames}</p>}
        {discovered && children.length > 0 && <section className={styles.childLocations} aria-label="该地点内部已知区域"><h4>内部地点</h4><div>{children.map((child) => {
          const childDiscovered = isDiscoveredLocationStatus(knowledgeById[child.id]?.status);
          return <button type="button" key={child.id} onClick={() => setSelectedId(child.id)}><span>{childDiscovered ? child.name.replace(`${child.district}·`, "") : "内部地点传闻"}</span><small>{childDiscovered ? "已确认" : "传闻"}</small></button>;
        })}</div></section>}
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
        <small>{discovered ? "新地点会连接已知锚点并由本地计算路线；到访后状态会永久记录。" : rumored ? "调查会进入正常回合；只有本地确认成功后，地点才会正式解锁。" : "未知区域不会提前泄露名称与详情。"}</small>
        </>}
      </aside>
    </div>
  </Modal>;
}
