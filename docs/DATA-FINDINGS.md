# Google Timeline 数据格式 — 发现记录与领域知识

> 本文档沉淀开发过程中对 Google Timeline 真实导出数据的逆向分析结论。
> 数据源：项目 `docs/livedata/`（本地验证用，gitignored，不入库）。
> 维护：CEO / Dev / Reviewer 共同补充，新增发现直接追加。

---

## 1. 两份真实导出文件的对比（重要结论）

| 维度 | `Timeline-20250213.json` | `Timeline-20260820.json` |
|---|---|---|
| 导出来源 | **Google Takeout** | **Android「时间轴」内置导出** |
| 导出日期 | 2025-02-13 | 2026-08-20 |
| 顶层结构 | `semanticSegments` + `rawSignals` + `userLocationProfile` | 同左（完全一致） |
| semanticSegments | 83202 段（2012-12-30 → 2025-02-13） | 97382 段（2012-12-30 → 2026-08-20） |
| rawSignals | 50662 条（**2025-01-14 → 02-13，恰 29 天**） | 55509 条（**2026-07-21 → 08-20，恰 29 天**） |

### 核心结论 A：两种导出方式输出同一格式
Android Timeline Export 与 Takeout 产出的**顶层结构、字段 schema 完全一致**（semanticSegments / activity / visit / rawSignals / position 的所有 key 逐项核对相同）。**导出方式不影响格式**。

### 核心结论 B：rawSignals 是「滚动 30 天窗口」，semanticSegments 是永久历史
- `semanticSegments`：**长期永久**，覆盖导出日往回 13+ 年完整历史（Google 云端持久保存）
- `rawSignals`：**只保留导出日前 ~29 天**，过窗口后服务器清除，**任何导出方式都拿不回**
- 证据链：2025-01-14 → 02-13 的 rawSignals 在 2025-02-13 导出时存在；2026-08-20 导出时只剩 2026-07/08 窗口 → 那段已被清除
- **推论（用户启发）**：要积累高密度原始轨迹，应**定期（≤30 天）导出并存档**，rawSignals 天然互补合并

### 核心结论 C：2025-01-30 两文件语义段可精确对齐
- 2025-01-30（+08）：两文件都 31 段；timelinePath 轨迹点 **64 = 64 逐点相等**；28/31 段起止时间戳完全一致；无独有段
- 2025-01-31：28 段 vs 30 段，唯一差异为 Google 后导出把 3 小段合并成 1 大段（同一行程，粒度不同，数据不冲突）
- visit JSON 长度差异（255 vs 246）→ 同一停留点，后导出补充概率等元数据
- activity 类型可被重分类：同段 11:03:08 在 2026 版=`IN_BUS`，2025 版=`IN_PASSENGER_VEHICLE`（起始终点一致）→ **段的 activityType 不是稳定标识**

---

## 2. 新版扁平格式（format1 / semanticSegments）结构速查

### 2.1 顶层
```jsonc
{
  "semanticSegments": [ ... ],   // 段数组（visit / activity / timelinePath / timelineMemory）
  "rawSignals": [ ... ],          // 原始信号（position / wifiScan / activityRecord）
  "userLocationProfile": {        // 常去地点 / 常行路线 / 出行画像
    "frequentPlaces": [...],
    "frequentTrips": [...],
    "persona": { "travelModeAffinities": [...] | "chainAffinities": [...] }
  }
}
```

### 2.2 段类型（semanticSegments 内，同一时间轴互斥出现）
| 段类型 | 关键字段 | 说明 |
|---|---|---|
| `visit`（停留） | `visit.topCandidate.placeLocation.latLng`（字符串 `"lat°, lng°"`） | 地点访问；`topCandidate` 上有 `placeId/name/address` 等 |
| `activity`（出行） | `activity.start/end.latLng` + `activity.topCandidate.type` | **只带起终点、无轨迹点**；轨迹在同时间的 timelinePath 段 |
| `timelinePath`（轨迹） | 顶层 `timelinePath[].point/time` | **2 小时窗口连续轨迹**（平均 ~10 点，min 1 / max 106），JSON 里点坐标为 `"5.9896952°, 116.0920744°"` 字符串 |
| `timelineMemory`（记忆） | `timelineMemory.trip` | 行程记忆（少数段），无坐标，忽略 |

- `activity.topCandidate.type` 全集（实测）：`IN_PASSENGER_VEHICLE / IN_VEHICLE / IN_BUS / IN_SUBWAY / IN_TRAIN / IN_TRAM / IN_FERRY / WALKING / RUNNING / CYCLING / MOTORCYCLING / FLYING / IN_FLIGHT / UNKNOWN_ACTIVITY_TYPE`
- ⚠️ `UNKNOWN_ACTIVITY_TYPE` 前端无专属颜色/标签 → 落默认灰「移动」（可接受）

### 2.3 rawSignals 条目结构
```jsonc
{
  "position": {                      // 只有部分条目有 position（GPS/蜂窝/WiFi 定位）
    "LatLng": "5.9893557°, 116.0920298°",   // ⚠️ 大写 L！
    "accuracyMeters": 100,
    "altitudeMeters": 52.7,
    "source": "WIFI",                // GPS / WIFI / ...
    "timestamp": "2025-01-14T09:10:51.000+08:00",  // ⚠️ 嵌套在 position 内！
    "speedMetersPerSecond": 0.0
  },
  "wifiScan": { "deliveryTime": ..., "devicesRecords": [...] },   // 无 position
  "activityRecord": { "probableActivities": [...], "timestamp": ... }  // 无 position
}
```
- position 时间戳统计：2026 版 15479 条、2025 版 11773 条
- **解析器现状 bug**：`parseFormat1` 只收 `semanticSegments`，**rawSignals 从未解析**（Top-level `{semanticSegments, rawSignals}` 时整段丢弃）→ T13.6 待办
- `getLatLng` 不认识大写 `LatLng`；`addRawPoint` 的 `timeField` 拿不到嵌套 `position.timestamp` → 需兼容

---

## 3. 时区影响（重要陷阱）

### 问题：UTC 日 vs 本地日 两套口径不一致
| 环节 | 函数 | 时区口径 |
|---|---|---|
| 日期筛选器（用户点 2025-01-30） | `parseInputDate` | **本地（+08）零点** |
| 段时间戳解析 | `toMs` = `Date.parse` | ISO 带偏移 → 正确 UTC epoch |
| 地图「同一天」高亮分组 | `startOfDayMs`（`getUTC*`） | **UTC 日** ⚠️ |
| 日期跨度统计 | `dayKeyOf`（`toISOString`） | **UTC 日** ⚠️ |

### 实际影响
- 用户选 2025-01-30（+08）→ 筛选范围 = UTC `[01-29 16:00Z, 01-30 15:59Z]` → **过滤数据不丢**
- 但 `startOfDayMs`/`dayKeyOf` 用 UTC 日 → **凌晨 00:00–07:59（+08）的段被归到 UTC「前一天」** → 侧栏分组/地图高亮少显示凌晨轨迹
- 实测样例：2025-01-30 有 3 段真实 +08 时间为 `01-29 22:00 / 01-30 04:00 / 01-30 06:00`，UTC 日算法将它们标到 01-29

### 修复方向（未做）
`startOfDayMs` / `dayKeyOf` 应改用**本地时区**（`getFullYear/getMonth/getDate`），与筛选器对齐。

---

## 4. 轨迹缝合（stitch）经验

### 数据事实
- `timelinePath` 是**跨整个时间窗口的连续轨迹**（2h 含多次短途行程）；`activity` 是**窗口内某一段短途**（如 16:15-16:33 只占 16:00-18:00 trace 的第 0-4 点）
- 单 trace 平均 ~10 点，30k trace 级性能无忧（二分 + maxEndUpTo 前缀扇出）

### 已修复：匹配语义
- 旧：要求 activity 端点 ≡ trace **首/末点** → 中途行程（~64%）缝合失败 path=0
- 新（33b2e13）：trace 内找与 activity start/end **最近的点对**（`isNear` ≤0.02°≈2km），取**子段** `slice(i, j+1)`；`i==j` 拒绝单点退化；反向极端配对兼容
- 效果：2026-01-30 从 16/17 段有路 → **17/17**；16:15 段 path 0→5（精确覆盖 16:15-16:33）

### 已知边界（Reviewer 记录，未修）
- 折返型行程（同点重复坐标）可能触发 `i==j` 假拒绝 → 建议「距离相同取间隔最大」+ 测试
- trace 池未携带逐点时间，几何最近在窗口内折返/逗留场景理论上可选中时间不吻合中间点（被 overlap 闸门 + 采样密度缓解）

---

## 5. 数据导出指引（面向用户实践）

- **想保存高密原始轨迹**：每 ≤30 天导出一次文件存档（Android Timeline Export 或 Takeout 皆可），rawSignals 窗口互不重叠 → 将来 merge 即得连续高密度轨迹
- **只看完整路线**：任意一次导出即可（semanticSegments 永久，含 13 年轨迹）
- **跨时间长周期 App 合并**：T13.6/远期 — segments/visits 按时间指纹去重（保留最新字段全者），points 全量合并（天然互补），meta 重算

---

## 6. 相关任务与代码位置

| 项目 | 状态 | 代码/提交 |
|---|---|---|
| stitch 子段修复 + 路线点渲染 | ✅ 33b2e13 / 918a57a | `common.ts: findStitchCandidate / nearestTraceIndex`；`trips.ts: budgetRoutePoints`；`TripMap.tsx` |
| format1 rawSignals 解析（含大写 LatLng/嵌套 timestamp） | ⏳ KIV T13.6 | `formatTimelineArray.ts` / `common.ts: addRawPoint` |
| 时区 UTC/本地日期对齐 | ⏳ KIV | `trips.ts: startOfDayMs / dayKeyOf` |
| 多文件 merge 去重 | ⏳ Backlog | `index.ts: mergeTimelineData`（现为简单拼接） |
| 参考文档 | — | https://locationhistoryformat.com/reference/（旧 Takeout 格式，不含新版扁平结构） |

---

## 7. Trips 时间线衔接线边界：跟時間連 纯时间口径（CEO 拍板 2026-09-14；T14.3 起生效）

> **衔接线边界（CEO 拍板 2026-09-14，DECISIONS.md「T14.2 双闸门撤销」）**：`bridgeLines` 收敛为**纯时间口径 ——「跟時間連」**。对时间排序后的相邻段，沿用 T14.1 的可视端点（`polylineEndpoints`，path 首末 [长度<2 回退 start/end]）：
> 1. **所有时间相邻段一律建桥**——不论传输类型、不论端点相距多远、不论窗口是否重叠（`gapMs>0` 如实呈现无记录空档；`gapMs≤0` 表示重叠/相接，属 GPS 记录粒度的常态，粗/细两条记录同属一次行程时也照连）。
> 2. **唯一豁免是退化对**：可视端点完全重合（同一坐标的零长虚线，屏上本就相接）不建。
> 3. 重叠/相接桥 `label` 永远显示「衔接」（负值/零不呈现负数）；`BRIDGE_CAP=1000` 抽稀、`BRIDGE_ANNOTATE_MIN_MS=60s` 沿用 T14。

**阈值标定（历史背景，T14.2 已撤销）**：T14.2 曾对 2025（5.2 万段）/2026（6 万段）两文件全部「时间重叠相邻段」按 `活动类型对` 分类逐对量可视端点点距标定 1000m 双闸门，**该闸门已随 T14.3 撤销**。标定数据仅作领域知识留存，不再作为建桥判据：

| 分类 | 数量 | p50 | p75 | p90 | p95 | p99 | ≤500m | ≤1000m | ≤2000m |
|---|---|---|---|---|---|---|---|---|---|
| **cross-type-transfer**（两侧都是明确类型且不同，如驾车→步行） | 1255/1374 | **0m** | 105m | 385m | 766m | 2002m | 91.6% | **96.9%** | 99.0% |
| **trace-involved**（一侧是 raw timelinePath 轨迹段，即缝合自属 trace） | 27992/31859 | 1351m | 5697m | 10572m | 12761m | 17186m | 34.3% | 43.3% | 57.7% |

- 标定时选定 1000m 的理由曾是「换乘覆盖 96.9% vs 并行隔离 43%」的平衡点；用户实测量出它误杀**同程粗细双记录**（移动↔驾车重叠但相距数十公里——本质是**同一次行程的两种记录粒度**，不是并行行程），因此撤销距离闸门。
- 距离口径相关的诚实性由视觉手段承担：桥梁为**虚线**且 tooltip「衔接 +N 分钟」如实说明「此处无直接轨迹记录」，不伪造实线移动。
- 语义/展示：衔接桥的 `BridgeLine.gapMs` 为**带符号真实时间差**（负 = 重叠，0 = 相接），tooltip 绝不显示负数——`bridgeGapLabel` 对 <60s（含全部负值）一律显示「衔接」，正值按「衔接 +N 分钟/小时/天」。summary「N 处衔接」仍是实际绘制桥数。
- 实测回归（T14.3，livedata）：2025-01-30 20 段 → 17 桥（19 相邻对 − 2 退化）；2026 最忙本地日 2016-01-14 30 段 → 24 桥（29 − 5 退化），其中 21 条重叠桥（旧纯时间规则仅 3 条）。
---

## 8. 渲染性能压测（T23，2026-09-15）

> 方法：production build（`vite preview`）+ 真实 `docs/livedata/Timeline-20260820.json`（123.4MB），
> 浏览器 headless Chromium，1280×800，默认「时间轴」模式、日期范围「全部」（2012-12-30 → 2026-08-20，13.7 年）。
> 指标：`requestAnimationFrame` 帧间隔 + `PerformanceObserver('longtask')`；手势 = 鼠标拖拽平移 / 滚轮缩放。
> **注意**：headless + 瓦片网络使数据有噪声，绝对值仅作相对参考。

### 8.1 压测前的基线（`GLOBAL_PATH_POINT_CAP=30000` / `RAW_POINT_CAP=20000`，无低 zoom 分層）

| 场景 | 帧数 | 平均帧 | p95 | p99 | >50ms 帧 | longtask max |
|---|---|---|---|---|---|---|
| 平移（8 次拖拽） | 366 | 23.8ms | 39.6ms | 99.9ms | 11 | 120ms |
| 缩放（5 in + 5 out，跨越点层挂载阈值） | 113 | 82.3ms | **461ms** | 671ms | 24 | **1796ms** |

结论：**缩放明显卡顿**（p95 461ms、单次 longtask 达 1.8s），根因是「全部」视图合并出 ~30k 顶点：
① 一条 30k 顶点折线每次重绘；② 跨入高 zoom 时一次性挂载 ~30k 个 React `CircleMarker` 图层。

### 8.2 处置（两项「最便宜」手段）

1. **低 zoom 只画折线、不画点**（`TripMap.tsx: DOT_MIN_ZOOM=6` + `ZoomWatcher`）：`zoom < 6` 时
   timeline 路线点 / activityType 原始点与路线点均不挂载；折线始终保留。跨阈值只在 `zoomend` 触发一次挂载/卸载，
   不随每帧发生。
2. **降 cap**（`trips.ts`）：`GLOBAL_PATH_POINT_CAP 30000 → 12000`、`RAW_POINT_CAP 20000 → 12000`。
   仅影响大范围（「全部」）视图；单日/小范围轨迹本就低于 cap，不受影响。

### 8.3 压测后（`GLOBAL_PATH_POINT_CAP=12000`，低 zoom 分層）

| 场景 | 帧数 | 平均帧 | p95 | p99 | >50ms 帧 | longtask max |
|---|---|---|---|---|---|---|
| 平移（8 次拖拽，zoom 2，点层关闭） | 341 | 29.7ms | 47.6ms | 283ms | 17 | 698ms |
| 缩放（`setZoom` 动画，2→4→6→8→6→4→2，跨点层阈值） | — | — | — | — | — | 每次 277–538ms |

- 平移稳定在 ~34fps，p50 16.7ms（60fps），偶发 tile/GC 长任务（p99 偏高，噪声为主）。
- 缩放每次 transition：z4/z8/z2 ≈ 277–292ms（≈ Leaflet 250ms 动画本身）；**z6 首次挂载点层 ≈ 538ms**（动画 + 挂载）。
  对比基线单次 longtask 1796ms，跨阈值尖峰显著下降。
- 点层挂载尖峰仍约 +250ms（12000 个 React 图层）；若后续要再优化，方向是改用单一 Leaflet
  `LayerGroup`/canvas 批量绘制替代 per-vertex React 组件（本次不做，属结构改动）。

### 8.4 结论

「全部」视图平移/缩放由**明显卡顿**改善为**可接受**（缩放不再出现秒级冻结）。诚实性不受影响：
summary 仍如实显示 cap 后的点数与「已降采样显示」；低 zoom 隐藏的是**视觉上不可分辨**的密集圆点，
折线仍完整。此行为已写入 **PRD 功能 3（v1.17）**——「轨迹点在 zoom ≥ 6 显示为圆点；低 zoom 全景视图
（< 6）仅绘制折线以保证性能（折线完整不省略）」；`TripMap` 的 `DOT_MIN_ZOOM` 即该条款的实现阈值。

### 8.5 已知限制：path-less 且跨午夜的段

`clipSegmentPath`（T22/S2）只裁**實際存在的路徑頂點**；`path.length < 2` 的段原樣返回（不展開
`start`/`end` fallback，以免改變所有無路徑段的 `totalPathPoints` 語義）。因此一個**沒有
`timelinePath` 且跨越午夜**的語意段，仍會以**未裁的 `[start, end]` 直線**繪製（`boundsOf` /
`polylineEndpoints` / `TripMap.positions` 的既有 fallback），可能露出一點前一日端點。這是既有
fallback 的固有限制——沒有頂點可裁；真實資料的跨午夜段多帶 `timelinePath`，故影響極小。
若日後要消除，需在 fallback 端點間求與 range 邊界的交點（幾何插值），屬獨立改動。
