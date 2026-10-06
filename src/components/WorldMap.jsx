import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import CityAtlas from "./CityAtlas.jsx";
import { findLocationRelations, findTravelRoute, getChildLocations, getMapLocation, getMapLocations, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "../system/map.js";
import { cityTerrainLabel, canExploreHex, visibleHexes } from "../system/hexworld.js";
import styles from "./WorldMap.module.css";
import { prayerAvailability } from "../engine/prayer.js";
import { CITY_GEOGRAPHY, MAP_DISTRICTS, SPECIAL_ACTIONS, ORGANIZATIONS, VISITABLE_PEOPLE } from "../content/index.js";

const KIND_LABELS = {
  street: "街道", residence: "住所", shop: "店铺", tavern: "酒馆", office: "事务所", church: "教会", warehouse: "仓库",
  station: "交通点", institution: "机构", hideout: "隐秘据点", interior: "内部地点", other: "地点", landmark: "地标",
};

export default function WorldMap({ game, loading, onClose, onTravel, onInvestigate, onExplore, onPray, onSpecial, initialLocationId }) {
  const discoveredIds = useMemo(() => new Set([...game.discoveredLocations.map((location) => location.id), game.location.id]), [game.discoveredLocations, game.location.id]);
  const knowledgeById = useMemo(() => normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id, game), [game]);
  const allLocations = useMemo(() => getMapLocations(game), [game]);
  const locationById = useMemo(() => new Map(allLocations.map((location) => [location.id, location])), [allLocations]);
  const hexCells = useMemo(() => visibleHexes(game, 4).map((cell) => {
    const location = cell.tile.locationId ? locationById.get(cell.tile.locationId) : null;
    const status = location ? knowledgeById[location.id]?.status || "unknown" : null;
    const explorable = !location && canExploreHex(game, cell.q, cell.r, game.world).ok;
    return { ...cell, location, status, explorable };
  }), [game, locationById, knowledgeById]);
  const [district, setDistrict] = useState("");
  const [zoom, setZoom] = useState(1);
  const currentRecord = getMapLocation(game.location.id, game);
  const playerHex = game.world?.player || null;
  const [selectedId, setSelectedId] = useState(initialLocationId || (currentRecord?.scope === "interior" ? currentRecord.parentId : currentRecord?.id || null));
  const [selectedHex, setSelectedHex] = useState(initialLocationId || currentRecord || !playerHex ? null : { q: playerHex.q, r: playerHex.r });
  const exploreCell = selectedHex ? hexCells.find((cell) => cell.q === selectedHex.q && cell.r === selectedHex.r) : null;
  const selectedHexIsCurrent = Boolean(selectedHex && playerHex && selectedHex.q === playerHex.q && selectedHex.r === playerHex.r);
  const selected = getMapLocation(selectedId, game);
  const selectedKnowledge = selected ? knowledgeById[selected.id] || { status: "unknown", note: "" } : { status: "unknown", note: "" };
  const discovered = selected && isDiscoveredLocationStatus(selectedKnowledge.status);
  const rumored = selected && selectedKnowledge.status === "rumored";
  const route = selected && discovered ? findTravelRoute(game.location.id, selected.id, discoveredIds, game) : null;
  const current = selected?.id === game.location.id;
  const prayer = prayerAvailability(game, selected?.id);
  const routeNames = route ? [game.location.name, ...(route.crossings || []), selected?.name].filter(Boolean).join(" → ") : "";
  const relations = discovered ? findLocationRelations(game, selected) : null;
  const hasRelations = Boolean(relations && (relations.quests.length || relations.clues.length || relations.npcs.length));
  const children = selected ? getChildLocations(game, selected.id).filter((location) => knowledgeById[location.id]?.status !== "unknown") : [];
  const dynamicCount = (game.mapExtensions?.locations || []).filter((location) => location.lifecycle !== "archived").length;
  const catalog = allLocations.filter(location => location.scope !== "interior" && (!district || location.district === district) && knowledgeById[location.id]?.status !== "unknown");
  const pickCell = cell => {
    if (cell.location) { setSelectedHex(null); setSelectedId(cell.location.id); }
    else { setSelectedId(null); setSelectedHex({ q: cell.q, r: cell.r }); }
  };

  return <Modal title="贝克兰德城区图" eyebrow="Backlund city atlas" onClose={onClose} wide>
    <div className={styles.layout}>
      <section className={styles.mapSection} aria-label="贝克兰德六边形城区图">
        <div className={styles.mapSummary}><span>{MAP_DISTRICTS.length} 个城区</span><span>固定地标 {allLocations.filter((location) => location.source === "static").length}</span><span>剧情生长 {dynamicCount}</span><small>北上南下 · 河流向东</small></div>
        <div className={styles.legend}><span><i data-kind="current" />当前位置</span><span><i data-kind="known" />已发现</span><span><i data-kind="rumored" />听闻</span><span><i data-kind="unknown" />迷雾</span></div>
        <div className={styles.mapControls}>
          <label>城区<select aria-label="选择城区" value={district} onChange={event => setDistrict(event.target.value)}><option value="">全城总览</option>{MAP_DISTRICTS.map(name => <option key={name}>{name}</option>)}</select></label>
          <div className={styles.zoomControls} aria-label="地图缩放"><button type="button" aria-label="缩小地图" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button><button type="button" onClick={() => setZoom(1)} aria-label="恢复全城总览">{Math.round(zoom * 100)}%</button><button type="button" aria-label="放大地图" disabled={zoom === 3} onClick={() => setZoom(value => Math.min(3, value + .5))}>＋</button></div>
        </div>
        <CityAtlas cells={hexCells} playerHex={playerHex} selectedId={selected?.parentId || selectedId} selectedHex={selectedHex} onSelect={pickCell} route={route} district={district} zoom={zoom} />
        <p className={styles.mapCaption}>{CITY_GEOGRAPHY.note} 点选编号查看地点，放大后可滚动浏览。</p>
        <label className={styles.locationIndex}>地点目录<select aria-label="选择地图地点" value={catalog.some(location => location.id === selectedId) ? selectedId : ""} onChange={event => { if (event.target.value) { setSelectedHex(null); setSelectedId(event.target.value); } }}><option value="">{catalog.length ? "选择已知地点或传闻" : "本区暂无线索"}</option>{catalog.map(location => <option key={location.id} value={location.id}>{location.code} · {isDiscoveredLocationStatus(knowledgeById[location.id]?.status) ? location.name : location.district + "的地点传闻"}</option>)}</select></label>
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
        {discovered && <div className={styles.locationBadges}><span>{KIND_LABELS[selected.kind] || "地点"}</span><span>{selected.source === "dynamic" ? "剧情生长" : selected.provenance === "canon" ? "原著地点" : "游戏地点"}</span>{selectedKnowledge.status === "visited" && <span>已到访</span>}</div>}
        <span>{discovered ? selected.description : rumored ? selectedKnowledge.note || selected.rumor : "这里还没有可供追查的传闻。继续探索、交谈或取得相关线索后，地图会补充记录。"}</span>
        {discovered && ORGANIZATIONS.filter((entry) => entry.headquarters === selected.id).map((organization) => <p key={organization.id}>{organization.church || organization.agency || "官方机构"} · {organization.name}驻地，可在此申请正式加入并办理组织事务。</p>)}
        {discovered && <dl>
          <div><dt>地图编号</dt><dd>{selected.code}</dd></div>
          <div><dt>档案状态</dt><dd>{current ? "当前位置" : selectedKnowledge.status === "visited" ? "已到访" : "已发现"}</dd></div>
          <div><dt>预计耗时</dt><dd>{current ? "—" : route ? `约 ${route.minutes} 分钟` : "暂无可用路线"}</dd></div>
          <div><dt>建议交通</dt><dd>{current ? "—" : route ? [...new Set(route.transports)].join("、") : "—"}</dd></div>
        </dl>}
        {routeNames && !current && <p className={styles.routeText}>推荐路线：{routeNames}{route.crossings?.length ? "。沿大桥过河，耗时已计入绕行。" : ""}</p>}
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
        {discovered && selected.id === "soot-lamp" && <button type="button" className="button button--primary" disabled={loading} onClick={onSpecial}>旅店休息 · 恢复生命与理智</button>}
        {discovered && VISITABLE_PEOPLE.filter(person => person.locationId === selected.id).map(person => <button key={person.id} type="button" className="button button--primary" disabled={loading} onClick={onSpecial}>人物拜访 · {person.name}</button>)}
        {discovered && prayer.church && <>
          <button className="button button--primary" type="button" disabled={loading || !prayer.ok} onClick={() => onPray(selected.id)}>{loading ? "本轮处理中" : prayer.reason || "祷告 · 理智与灵性各恢复 2 点"}</button>
          <small>向{prayer.church.deity}祷告，消耗一回合。每 5 回合可用一次，所有教堂共享冷却；恢复不超过各自上限。</small>
        </>}
        {discovered && (SPECIAL_ACTIONS.some((entry) => entry.locationId === selected.id) || ORGANIZATIONS.some((entry) => entry.headquarters === selected.id)) && <button type="button" className="button button--primary" disabled={loading} onClick={onSpecial}>特殊行动 · 工作与登记</button>}
        <small>{discovered ? "新地点会连接已知锚点并由本地计算路线；到访后状态会永久记录。" : rumored ? "调查会进入正常回合；只有本地确认成功后，地点才会正式解锁。" : "未知区域不会提前泄露名称与详情。"}</small>
        </>}
      </aside>
    </div>
  </Modal>;
}
