# hex-world-engine

为 AI 叙事游戏提供"世界物理层"的确定性六边形地图引擎。
AI 负责讲故事，引擎负责保管世界的一切真相：位置、地形、距离、规则。

## 分工原则

- AI **不**算坐标、**不**判方向、**不**选地块——只递语义意图、只读自然语言上下文；
- 引擎独占全部空间计算，结果翻译成自然语言回喂给 AI。

## 结构

```
src/
├── coordinates.mjs   坐标数学层：轴坐标 (q,r)、六方向邻接、距离、环/区域
├── generation.mjs    生成层：种子哈希惰性生成地形、确定性抽签
├── rules.mjs         规则层：createWorld / move / placeLocation / revealArea
├── context.mjs       查询层：describeSurroundings / describeKnownLocations / mapSummary
└── index.mjs         统一出口 + 存档（saveWorld / loadWorld）
tests/
└── engine.test.mjs   12 个测试：坐标公式、确定性、可重放、可存档、无AI模拟
```

## 快速开始

```js
import { createWorld, move, placeLocation, describeSurroundings } from "./src/index.mjs";

const state = createWorld(2026);          // 种子决定整个世界

// AI 提议生成一个地点：只给语义约束，坐标由引擎确定
placeLocation(state, { name: "废弃瞭望塔", terrain: "hill", direction: "东北", maxDistance: 3 });

// AI 提议移动：给方向名，引擎校验通行并揭开迷雾
move(state, "东北");

// 每轮把位置包注入 AI 上下文
console.log(describeSurroundings(state));
// 【当前位置】平原
// 【周围】
// - 东北：丘陵「废弃瞭望塔」
// - 东：森林
// - 东南：未知区域
// ...
```

## 关键机制

- **惰性生成**：未知格子第一次被查询时才由 `(seed, q, r)` 哈希出地形；同一坐标永远同一结果，世界如同开局即存在；
- **约束选址**：`placeLocation` 按地形/方向/距离圈定候选集，再用 `(seed, 名称, 轮数)` 哈希抽签——同一提议在同一轮永远选中同一格；
- **迷雾**：格子分"未知/已发现"，移动到即揭开，`revealArea` 可按视野半径成片揭开；
- **重名复用**：同名地点不会重复生成，第二次提议直接返回已有坐标；
- **确定性**：同一种子 + 同一操作序列 = 逐字节相同的世界，可测试、可重放、可调试。

## 运行测试与演示

```bash
node --test tests/engine.test.mjs   # 12 个测试
node demo.mjs                        # 一段无 AI 的探索演示
```

## 接入 AI 的方式

1. 将 `move` / `placeLocation` 注册为模型工具（tool calling）或 JSON 协议指令；
2. 每轮请求时把 `describeSurroundings(state)` + `describeKnownLocations(state)` 拼进上下文；
3. 工具被拒时把 `reason` 回填给下一轮，由 AI 在叙事中自然化解。

## 后续扩展方向

- 地形生成换 Simplex 噪声（npm 现成库），获得成片森林/山脉；
- A* 寻路（坐标数学层已提供 `distance` 作为启发函数）；
- 资源点、天气、视野规则——全部向 `state.tiles` 加字段、向规则层加入口，地基不动。
