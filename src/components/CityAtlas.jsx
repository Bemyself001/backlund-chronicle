import { useEffect, useMemo, useRef } from "react";
import { CITY_GEOGRAPHY, adjacentHexes, cellKey, districtAt } from "../system/mapGeometry.js";
import { cityTerrainLabel, hexPolygonPoints, hexToPixel } from "../system/hexworld.js";
import { isDiscoveredLocationStatus } from "../system/map.js";
import styles from "./CityAtlas.module.css";

const SIZE = 32;
const point = hex => hexToPixel(hex.q, hex.r, SIZE);
const mapPoint = ([x, y]) => ({ x: (x - 50) / 5 * SIZE * 1.5, y: (y - 50) / 5 * SIZE * Math.sqrt(3) });
const districtColors = ["#e0d5bd", "#d9dac9", "#ded1b8", "#e6d8bb", "#d1d8c4", "#dcd0be", "#ccc9bd", "#cdd6ce", "#e5d4b5", "#d3ccb7", "#dbd9c3"];

export default function CityAtlas({ cells, playerHex, selectedId, selectedHex, onSelect, route, district, zoom }) {
  const viewport = useRef(null);
  const layout = useMemo(() => {
    const points = cells.map(cell => ({ cell, ...point(cell) }));
    const minX = Math.min(...points.map(p => p.x)) - 42, minY = Math.min(...points.map(p => p.y)) - 44;
    return { points, minX, minY, width: Math.max(...points.map(p => p.x)) - minX + 42, height: Math.max(...points.map(p => p.y)) - minY + 44 };
  }, [cells]);
  const borders = useMemo(() => cells.flatMap(cell => {
    if (!cell.tile.district || cell.tile.terrain === "bridge") return [];
    const center = point(cell);
    return adjacentHexes(cell).slice(0, 3).flatMap((neighbor, index) => {
      const other = districtAt(neighbor);
      if (!other || other === cell.tile.district) return [];
      const side = [0, 5, 4][index];
      const a = side * Math.PI / 3, b = (side + 1) * Math.PI / 3;
      return [`M${center.x + SIZE * Math.cos(a)},${center.y + SIZE * Math.sin(a)} L${center.x + SIZE * Math.cos(b)},${center.y + SIZE * Math.sin(b)}`];
    });
  }), [cells]);
  useEffect(() => {
    if (zoom === 1) { viewport.current?.scrollTo(0, 0); return; }
    const target = viewport.current?.querySelector('[data-selected="true"]');
    if (target) {
      const rect = target.getBoundingClientRect(), container = viewport.current.getBoundingClientRect();
      viewport.current.scrollBy({ left: rect.x + rect.width / 2 - container.x - container.width / 2, top: rect.y + rect.height / 2 - container.y - container.height / 2 });
    }
  }, [zoom, selectedId, selectedHex]);
  const riverPoints = CITY_GEOGRAPHY.river.cells.map(([q, r]) => point({ q, r }));
  const riverLine = riverPoints.map(p => `${p.x},${p.y}`).join(" ");
  const bridge = point(CITY_GEOGRAPHY.crossings[0]);
  const routeLine = route?.hexPath?.map(hex => { const p = point(hex); return `${p.x},${p.y}`; }).join(" ");
  return <div className={styles.viewport} ref={viewport} tabIndex={0} aria-label="城区地图，可放大后滚动查看">
    <svg className={styles.atlas} style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`} role="group" aria-label="贝克兰德区划与塔索克河">
      <title>贝克兰德城区图：北上南下，塔索克河自西向东蜿蜒，下游偏东南</title>
      <desc>{CITY_GEOGRAPHY.note}。放大可查看地点名称，地点目录提供相同的选择功能。</desc>
      <g aria-hidden="true">
        {layout.points.map(({ cell, x, y }) => <polygon key={cellKey(cell)} points={hexPolygonPoints(x, y, SIZE)} fill={cell.tile.terrain === "river" || cell.tile.terrain === "bridge" ? "#91b4b4" : districtColors[CITY_GEOGRAPHY.districts.findIndex(d => d.name === cell.tile.district)] || "#dfd4bd"} opacity={district && cell.tile.district !== district ? .35 : 1} />)}
        <path d={borders.join(" ")} className={styles.boundaries} />
        <polyline points={riverLine} className={styles.river} />
        <polyline points={riverLine} className={styles.current} />
        {[3, 10, 17].map(index => { const p = riverPoints[index]; return <text key={index} x={p.x} y={p.y + 5} className={styles.flowArrow}>›</text>; })}
        <g className={styles.bridge} transform={`translate(${bridge.x} ${bridge.y})`}><rect x="-9" y="-31" width="18" height="62" /><path d="M-5,-31 V31 M5,-31 V31" /><text x="24" y="9">贝克兰德大桥</text></g>
        <text x={riverPoints[2].x - 5} y={riverPoints[2].y + 45} className={styles.riverName}>塔 索 克 河 →</text>
        <text x={riverPoints[17].x - 24} y={riverPoints[17].y + 60} className={styles.downstream}>下游 · 东南 ↘</text>
        {CITY_GEOGRAPHY.districts.map(d => { const p = mapPoint(d.label); return <text key={d.name} x={p.x} y={p.y} className={styles.district} data-muted={Boolean(district && district !== d.name)}>{d.name}</text>; })}
        <g className={styles.compass} transform={`translate(${layout.minX + 26} ${layout.minY + 36})`}><path d="M0,28 V-5 M-7,6 L0,-8 L7,6" /><text x="0" y="-16">北</text></g>
        {routeLine && <polyline className={styles.route} points={routeLine} />}
      </g>
      {layout.points.map(({ cell, x, y }) => {
        const known = cell.location && isDiscoveredLocationStatus(cell.status);
        const rumored = cell.status === "rumored";
        const current = playerHex?.q === cell.q && playerHex?.r === cell.r;
        const selected = cell.location ? selectedId === cell.location.id : selectedHex?.q === cell.q && selectedHex?.r === cell.r;
        const interactive = Boolean(known || rumored || cell.explorable || current);
        const label = known ? cell.location.name : rumored ? `${cell.location.district}的地点传闻 ${cell.location.code}` : current ? "玩家当前位置" : `可探索的${cityTerrainLabel(cell.tile.terrain)}`;
        return <g key={cellKey(cell)} className={styles.cell} data-current={current || null} data-selected={selected || null} data-discovered={cell.discovered || null} data-landmark={Boolean(known || rumored)} data-muted={Boolean(district && cell.tile.district !== district)} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `${label}${current && known ? "，玩家当前位置" : ""}` : undefined} onClick={interactive ? () => onSelect(cell) : undefined} onKeyDown={interactive ? event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onSelect(cell); } } : undefined}>
          <polygon points={hexPolygonPoints(x, y, SIZE - 2)} />
          {cell.explorable && <circle cx={x} cy={y} r="3" className={styles.exploreDot} />}
          {(known || rumored) && <><circle cx={x} cy={y - 3} r="11" className={styles.pin} /><text x={x} y={y + 3} className={styles.pinMark}>{current ? "◆" : rumored ? "?" : "•"}</text><text x={x} y={y + 25} className={styles.code}>{cell.location.code}</text></>}
          {current && !known && <circle cx={x} cy={y} r="10" className={styles.pin} />}
          {known && (zoom > 1 || selected) && <text x={x} y={y - 24} className={styles.placeName}>{cell.location.shortName || cell.location.name.split("·").at(-1)}</text>}
        </g>;
      })}
    </svg>
  </div>;
}
