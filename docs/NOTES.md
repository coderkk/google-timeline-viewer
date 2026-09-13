# Notes

> 开发日志（追加式）。格式：`## YYYY-MM-DD HH:mm — 角色` + 内容。

## 2026-09-14 07:05 — Dev
修复 7674cb4 后 Reviewer（S1/S2/A1/A2/A3）审查发现的拼接缺陷 + S3/A5 顺手项。

**S1（严重）左向扇出提前终止**：`findStitchCandidate` 左扫原终止条件 `pool[i].endMs >= segment.startMs` 假定「按 startMs 排序 ⇒ endMs 单调」——不成立（短窗口 trace 可夹在长窗口 trace 之间），会挡住更靠左的真实重叠 trace 且终 pass 单次→永久漏匹配。修复：新增 `buildMaxEndUpTo`（maxEnd 前缀，`maxEndUpTo[i]=max(endMs of pool[0..i])`），左扫改为 `maxEndUpTo[i] >= segment.startMs`（前缀单调，退出安全）。仍 O(log n + 扇出)。

**S2 即时借道分支删除**：`addSegment` 的即时分支在**文件顺序**（未排序）池上二分，借到次优 trace，且「已借走(path≥2)的段被终 pass 跳过」静默打破 `>best` 保证。修复：删除即时借道，全部交给 `stitchSegments` 唯一一次排序后的终 pass（逻辑等价且正确，每个 path<2 段对全池取最优）。同时修正代码注释与 NOTES 中「池天然按 startMs 排序」的错误说法（设备导出会乱序：activity/trace 交叠出现）。

**S3 format2/3 缺终 pass**：`formatRecords.ts` / `formatSemanticHistory.ts` 解析器末尾补 `stitchSegments(state)`（pool 空直接 return，无害）。pooling 逻辑格式无关，三种格式统一终 pass。

**A1 别名陷阱**：`segment.path = candidate.points.slice()`（原直接共享 trace 自身数组）。

**A2 反向轨迹匹配**：`consider` 增加反向配对（start↔末点、end↔首点），trace 点序反向不再漏配，成本极低。

**A5 顺手**：`formatTimelineArray.ts` 补文件尾换行。

**A3 测试**（`stitch.test.ts`）：新增 4 个 `findStitchCandidate` 单测（S1 非单调 endMs 场景——断言左扫越过短窗口 T1 命中 T0 / 多候选重叠取最长者（严格 `>`）/ 反向点序配对命中 / 端点不近配拒绝）；livedata 断言从 `>0` 收紧到精确值：2025-01-31 IN_BUS **5 条全中**（bus=5、withPath=5、covering=5）；修复测试名拼写 timelimePath→timelinePath。

**验证**：`npm run test` **80 passed**（76 回归 + 4 新增，含 livedata 5/5 精确断言）✅ / `npm run build`（tsc + vite）✅ / `npm run lint` 0 error ✅。commit `7674cb4` 的原有真实拼接结果不变（livedata 仍 5/5）。

## 2026-09-14 06:55 — Dev
完成 segment 轨迹合并（path stitching）：真实设备导出（129MB live data）里短 `activity` 行程段只有 start/end 坐标、轨迹在 2 小时 `timelinePath` 段里，导致车辆行程渲染成退化直线/散点。已把时间重叠 + 起终点接近的 coarse trace 合并进 activity 段。

**修改文件**：
- `src/lib/parse/common.ts`：`ParseState` 新增 `timelinePathPool`（`TimelinePathCandidate[]`，含 startMs/endMs/points）；`addSegment` 遇到含 `timelinePath` 的记录时把轨迹注册进池子（设备导出按时间有序，池天然按 startMs 排序），并即时尝试为 path<2 的段借轨迹；新增 `findStitchCandidate`（池按 startMs 二分定位起点 + 向两侧扇出：要求时间窗口真正 overlap（>0ms）且 activity.start/end 距轨迹首/末点 ≤0.02°（≈2km），取重叠最长者）+ `stitchSegments`（收尾 pass，先对池排序，再为所有 path<2 段补路径——覆盖「activity 出现在其 trace 之前」的乱序情况）。`activityType` 与 start/end 坐标保留 activity 自己的值，path 仅用于渲染路线。
- `src/lib/parse/formatTimelineArray.ts`：`parseFormat1` 末尾调用 `stitchSegments(state)`。
- `src/lib/parse/__tests__/stitch.test.ts`（新）：合成 fixture 4 用例（trace 前置于 activity→终 pass 拼接 / trace 后置→即时拼接 / trace 自身保留 / 坐标近但时间不重叠→不拼接）+ live data 用例（文件不存在自动 skip）。

**验证**（`Timeline-20260820.json` 129MB 实测）：2025-01-31 的 5 个 IN_BUS 段全部获得真实路径——08:39→11 点(08-10 trace)、12:18→11 点(12-14 trace)、15:41→6 点(14-16 trace)、17:14→9 点(16-18 trace)、17:57→8 点(18-20 trace，靠终 pass 命中后置 trace)；修复前全部为 0 点。`npm run test` **76 passed**（71 回归 + 5 新增）✅ / `npm run build`（tsc + vite）✅ / `npm run lint` 0 error ✅。

**其他**：① 轨迹点元素 `{point, time}` 的 `pointFromPathElement` 只取 `point` 字段，点数不受 `time` 影响（确认，无需改动）；② 匹配按「重叠最长 + 端点半近」启发式，`/docs/livedata/` 不入库（.gitignore 已含，本次一并提交项目级 `.gitignore` 固定该规则）；③ 已知限制：合成数据/极端乱序下仍为 best-effort，不报错不回退。

## 2026-09-14 00:04 — Dev
修复三个问题：marker 日期格式 + Google Maps 链接 + 汽车 GPS 轨迹。

**修改文件**：
- `src/lib/trips.ts`：`fmtDateTime` 从 `fmtDay`（MM-DD）改为 `toInputDate`（YYYY-MM-DD），Places 视图停留点日期显示从 "01-30 14:30" → "2025-01-30 14:30"。
- `src/components/PlacesMap.tsx`：`CircleMarker` 新增子元素 `<a>` 弹窗，含 Google Maps 链接（`https://www.google.com/maps?q=lat,lng`），`onClick` 阻止冒泡防止触发地图拾取。
- `src/lib/parse/common.ts`：`pathToPoints` 新增 `path` 作为嵌套对象 fallback key（原仅支持 `waypoints`/`points`）；`PATH_KEYS` 新增 `path` 字段，使 `addSegment` 可解析 `path` 命名的轨迹数组。

**问题 3 根因分析**：Google Timeline 导出的 `activitySegment` 轨迹字段名存在变体——部分导出使用 `waypointPath`（已支持），部分使用 `path`（原未支持）。`pathToPoints` 在 `waypointPath` 非数组且非 `{waypoints|points}` 对象时返回空数组，导致 `addSegment` 路径为空、`TripMap` 因 `latLngs.length < 2` 跳过渲染。修复后 `path` 作为 fallback key 被正确解析。

**验证**：`npm run build` ✅ / `npm run test` **71 passed**（无回归）✅ / `npm run lint` 无 error ✅。

<!-- 示例：
## 2026-09-12 14:20 — Dev
完成 T1 登录 API。自测通过。已知问题: token 刷新逻辑待优化。

## 2026-09-12 15:10 — Reviewer
审查 T1。通过。建议: 密码 hash 用 bcrypt（一般级，不阻塞）。
-->

## 2026-09-13 23:33 — Dev
完成 Places 视图停留点点击历史功能：点击地图上的停留点 marker 后，弹出浮动面板显示该地点的历史访问记录（时间线）。

**新增文件**：`src/lib/geo/visitHistory.ts`（`visitGroupKey` + `groupVisitsByLocation`：按 name → address → 坐标桶分组，倒序排列）；`src/lib/geo/visitHistory.test.ts`（8 用例）；`src/components/VisitHistoryPanel.tsx`（浮动面板：地点名 + 访问次数 + 时间线列表，含关闭按钮）。

**修改文件**：`src/components/PlacesMap.tsx`（`CircleMarker` 新增 `click` 事件处理器，`stopPropagation` + `onVisitClick` callback；新增 `onVisitClick` prop）；`src/pages/PlacesPage.tsx`（新增 `historyVisit` state + `handleVisitClick`/`handleHistoryClose`；`useMemo` 预计算 `visitGroups`；PlacesMap 传 `onVisitClick`；地图区域内渲染 `VisitHistoryPanel`）；`src/index.css` 追加 visit-history-panel 样式段（~60 行，浮动卡片，bottom-right 定位，max-height 40vh，overflow-y auto）。

**验证**：`npm run build` ✅ / `npm run test` **71 passed**（63 回归 + 8 新增）✅ / `npm run lint` 无 error ✅。

**已知问题**：① 分组使用精确字符串匹配（同名才算同一地点），后续如需可加入模糊匹配或 placeId 去重；② 面板在侧栏折叠时仍显示在地图区域右上角，不占用侧栏空间。

<!-- 示例：
## 2026-09-12 14:20 — Dev
完成 T1 登录 API。自测通过。已知问题: token 刷新逻辑待优化。

## 2026-09-12 15:10 — Reviewer
审查 T1。通过。建议: 密码 hash 用 bcrypt（一般级，不阻塞）。
-->

## 2026-09-13 14:20 — Dev
完成 T1 项目脚手架 + 应用框架：Vite + React 19 + TypeScript（严格模式）+ Leaflet/react-leaflet + React Router + Zustand；路由（首页/Trips/Places/教程/设置）、Header/Footer 骨架、Layout。`npm run build` 通过。

## 2026-09-13 14:28 — Dev
T2 数据解析层开工。完成内部统一数据模型（`src/lib/types.ts`）+ 四格式解析器（`src/lib/parse/`）+ Web Worker 封装 + vitest 单测（18 个用例）。详见提交信息；`npm run test` / `build` / `lint` 全通过。已知问题：Web Worker 在 node 环境不可测，需 T4 浏览器实测；解析层保留全量 path 点，抽稀/降采样留给 T5.3 渲染层。

## 2026-09-13 15:40 — Dev
完成 T3（模拟示例数据）+ T4（导入集成 + 空状态首屏 + 全局状态）。

**T3.1** `scripts/gen-sample-data.mjs`（node，mulberry32 确定性种子）产出 `src/lib/sample/sample-timeline.json`（262.8 KB）：虚构人物 7-20→9-11 共 54 天行程，含台北 home/work + 台中（周末驾车）+ 新加坡/吉隆坡（航班 + 跨境驾车）多地停留；1677 轨迹点（1387 路径点 + 432 rawSignals）、191 停留、197 行程段。直接数组格式（顶层数组，每元素 `semanticSegments` + `rawSignals`），坐标均为公开地标坐标。文件内无标注，标注走导出常量。

**T3.2** `src/lib/sample/index.ts`：导出 `SAMPLE_LABEL = '模拟数据 · 非真实轨迹'` + `loadSampleTimeline()`（内联 `?raw` JSON → 走 T2 `parseTimelineFile`，复用真实解析管线）。新增单测 `src/lib/sample/sample.test.ts`（4 用例：零 warning / 日期跨度 / 多城市多活动 / 加载函数）。

**T4.1** `src/store/timelineStore.ts`（zustand）：`data/String 状态机（empty/parsing/ready/error）+ errorMsg + parseProgress + dataSource（none/user/sample）+ 全局 dateRange`。actions：`importFiles`（>100MB 大文件 confirm 确认，worker onProgress 进度驱动，失败/全空置 error+指引）、`loadSample`、`clearData`、`setDateRange`、`resetDateRange`。导入完成自动 navigate → /app（`RouterBridge` 桥接 useNavigate，见 `src/components/RouterBridge.tsx`）。

**T4.2** `src/pages/EmptyState.tsx`：欢迎语 + 一句话说明 + 大导入按钮 + 支持格式提示 + 「载入示例数据」（带模拟数据角标）+ 教程链接 `/help` + 隐私承诺行。Trips/Places 无数据时渲染它，示例数据时页头显示角标。视觉复用 index.css 风格（卡片式 drop-zone / 进度条 / 错误态样式）。

**T4.3** `src/components/ImportPanel.tsx`：点击选文件 + 整区拖拽 + 多文件 + 解析进度条（worker onProgress → 0-100）+ 错误态（errorMsg + 重新选择文件指引）。

**验证**：`npm run build` ✅（bundle 含内联 sample JSON，~543KB，chunk-size 警告为 Leaflet+示例数据所致，可接受）；`npm run test` 22 passed（含 T2 18 用例不回归）✅；`npm run lint` 无 error ✅；dev 端到端冒烟（playwright）：空状态首屏可见 → 载入示例 → 自动跳 /app 显示 197 段/191 停留 + 角标 ✅；真实 Timeline.json 走 worker 导入 → 跳 /app 显示 1 段/1 停留 ✅；无 console 报错。

**已知问题**：① 新直出直接数组格式的 `rawSignals` 暂未被 T2 解析器消费（格式 1 的 `points` 恒为 0），示例 JSON 已按真实结构附带 rawSignals 以备后续；② Web Worker 路径经浏览器实测 OK，node 单测仍不覆盖 worker；③ build 存在 chunk>500KB 警告（示例数据内联所致），后续 T10 如需可 code-split 或改 public/ 外置。

## 2026-09-13 17:24 — Dev
完成 T5 Trips 视图，浏览器实测覆盖示例数据 + 真实导出。

**新增模块**：`src/lib/trips.ts`（filterTrips/boundsOf/prepareTrips：DP 抽稀 + GLOBAL_PATH_POINT_CAP=30000 + MAX_SEGMENTS=12000 + MARKER_CAP=4000 + LIST_LIMIT=500，任一超限置 `downsampled=true`，UI 显示角标）、`src/components/TripMap.tsx`（Leaflet 地图：单共享 canvas renderer 绘全部路径/标记，FitController 仅在过滤窗口“跨天结构变化”时 fitBounds，flyTo 只对点击目标触发）、`src/components/DateRangePicker.tsx`（快捷档 全部/近30天/近1年 + 起/止单边日，写全局 dateRange）、`src/components/StopList.tsx`（前 500 停留列表，点击反查）、TripsView 重建（摘要行/图例/降采样提示/侧栏折叠）。

**关键修复（本次最大坑）**：TripsPage 由 EmptyState 切换挂载时，`.app-main--app` 作 `.app-shell` 的 flex 子项（`flex:1` → basis 0 + `min-height:auto`）会拉伸到**内容高度**（≈侧栏 191 项 ≈15000px），导致 map 容器 `.trip-map` 随之 15000px 高 → Leaflet canvas 超大 → Chromium raster 崩溃（SIGBUS，且叠加沙箱磁盘 100% 打满/123MB livedata 内存压力）。修复：`.trips-shell` 高度直接锚定 `calc(100vh - var(--header-height))`（不依赖 main 百分比），全链路由 15000px → 612px。另删调试期 `.trip-map`/`.trips-map-wrap` 的 `min-height:320px` hack。

**crash 其次原因（环境）**：`/` 磁盘一度 100%（npm cache 2GB + journald 689MB + apt cache），Chromium 写 mmap 缓存失败也会 SIGBUS（BUS_ADRERR）。已清理（`npm cache clean --force` + `journalctl --vacuum-size=100M` + `apt-get clean`），现空余 ≥2.7GB。

**lint 约束（react-hooks v7 严格版）**：TripMap 渲染期不再读写 ref/不再惰性 `useState` 初始化 renderer（改模块级 `L.canvas({padding:0.5})`）；DateRangePicker 渲染期去掉 `Date.now()`（endAnchor 用 `dataTimeRange.maxMs ?? 0`）；TripsPage 去掉 effect 内 setState（拆 `<MapPane key={fitKey}>` 重挂载重置选中）。canvas 圆不触 DOM hover，选中标记的 tooltip 改 `openTooltip()/closeTooltip()` 命令式开关（react-leaflet 的 `permanent` prop 不会自动打开）。

**验证**（playwright，headless chromium）：样例 5/5 无崩溃；空态→载入示例→地图（canvas 980×612）→摘要「197 段 · 191 停留 · 1,387 点」→近30天 120/115/831→全部复位→侧栏折叠/展开 map 存活→停靠点击选中 + tooltip 弹出，`ERRORS: none`。真实 123.4MB 导出：大文件 confirm → worker 解析 → 「12000 段 · 37287 停留 · 31,360 点」+ 降采样角标 + 列表 500 条 + 点选 tooltip，无 error 🎯。`npm run build` ✓ / `npm run lint` 无 error ✓ / `npm run test` 40 passed ✓。

**依赖**：仅新增 devDependency `@types/leaflet ^1.9.22`（类型包，无运行时依赖，符合 owner 约束）。

**已知问题**：① 无数据/仅 1 停留等退化场景的 tooltip 定位可能贴屏幕边缘，后续 polish；② `fitKey` 仅按“选中窗口跨天结构”变化自动 fit，同天窗口内换筛选只 invalidate；③ T5.1 起止日期输入为 `<input type=date>`，火狐/Safari 样式差异未处理。

## 2026-09-13 19:20 — Dev
完成 T6 Places 视图（地图点击按半径查停留）+ 收尾。

**新增模块**：`src/lib/geo/SpatialGrid.ts`（经纬 1°×1° 均匀网格索引：`add/build/queryCircle`，先用 BBOX_SAFETY=1.25 扩边选候选格，再 haversine 精确过滤，环形查询在跨 180° 与两极处做了防护）、`src/lib/geo/places.ts`（`PLACE_RADII_KM=[10,100,1000,5000]` + `PLACES_RESULT_LIMIT=200` + `fmtDistanceKm` 自适应小数位）、测试 `SpatialGrid.test.ts` + `places.test.ts`（10 用例）。UI：`src/components/PlacesMap.tsx`（ClickController 单监听拾取 / RadiusCircle 琥珀 #f59e0b 半径圈 + rAF 后 `fitBounds` 保证圆完整 / FlyController 结果 flyTo + 高亮圆点 + 常驻 tooltip / InvalidateController 侧栏折叠后重铺）、`src/pages/PlacesPage.tsx` 重写（网格 useMemo 按数据集 + 全局日期范围重建，200ms 防抖查询 + 500ms 慢查询「查询中…」提示，结果按开始时间倒序，前 200 条 + 「还有 N 条」提示）、`src/index.css` Places 样式段。

**收尾**：删除本地 benchmark 脚本 `src/lib/geo/bench.real.test.ts`（import node:fs/path/perf_hooks + `import.meta.dirname` → tsc `-b` 报 TS2591/TS2339；且依赖 gitignored `docs/livedata/`，按 T4 约束不进可提交代码——需要定向性能验证建议后续入 `scripts/` 作为独立 node 脚本而非测试文件）。删除前已跑基准并记录量级。

**真实数据性能量级**（`Timeline-20260820.json`，123.4MB，37,287 停留；`npx vitest run bench.real`，本地一次性，不入库）：解析 ≈2.3s；网格构建 ≈14ms；台北 (25.033, 121.565) 圆查询——**10km→13 hits (0.8ms) / 100km→30 hits (0.2ms) / 1000km→38 hits (0.3ms) / 5000km→37,287 hits (21ms)**；距离精度校验 mismatch=0。数量级上大半径全量命中时单次查询 ~20ms，UI 无感知。

**验证**：`npm run build` ✅ / `npm run lint` 无 error ✅ / `npm run test` **50 passed**（40 回归 + 10 新增）✅。浏览器实测（playwright，headless chromium）：**样例数据** 载入 → /app/places → 点击台北市中心 → 浮层 `25.00597, 121.55273` + 「169 个停留点在此范围内」(100km)，列表 Home/Bella/Nexus 等含地址·时间·距离；半径切换 10→10 / 100→169 / 1000→174 / 5000→191 实时更新，琥珀半径圈可见且自动 zoom（100km→z8）；点击结果 → flyTo + 高亮标记 + tooltip（Home · 9-12 02:35 · 3h55m）；再点地图重置选中。**真实数据**（123MB 导入）→ 37287 停留，点击台北 → 100km→30 / 10km→11 / 1000km→38 / 5000km→37287（与 bench 一致；10km 差 2 hits 系点击中心 ~3km 偏移的边缘差异）；点结果 → flyTo + tooltip 正常。全程 console 0 error。

**已知问题/待 CEO 决断**：① T6.4 design QA（Designer 子任务）本轮未独立走，视觉按 Trips 同款风格实现，建议并入 T11 Reviewer 验收；② 结果列表 `key=index`（排序固定倒序，仅去重场景闪烁风险，低优先级）；③ 5000km 全量命中时列表封顶 200 条并提示缩窄范围（符合设计）；④ 真实导入时浏览器 parse ~15-30s（worker 内），Places 网格构建 <30ms，无卡顿。

## 2026-09-13 23:20 — Dev
完成 T7 Landing 首页（portfolio 展示面）+ T8 导出教程页。

**T7 Landing**（`src/pages/Landing.tsx` 重写）：五个 section。
1. Hero — 产品名 GT Viewer + 「把 Google Timeline 数据从 JSON 变回你的行程地图」定位 + 双 CTA：「立即体验」(onClick → loadSample，busy 时禁用)、「如何导出数据」→ /help；无注册/账号/试玩提示。
2. 痛点→方案 — 一句话：Timeline 网页版关停 / 裸 JSON 人不可读 / 本工具还原成行程地图。
3. 三功能卡 — Trips（行程回放）、Places（点击地图查访，10–5000KM）、Privacy（数据不出设备），grid 3 列，暗色卡片。
4. 技术栈行（React·TS·Vite·Leaflet·WebWorker·Zustand）+ 教程入口 + 隐私承诺段（边界线分隔，灰色调）。
5. Built with OPC 3.0 — 有 `id="built-with-opc"` 锚点（Footer anchor 目标）；文案讲述 AI 驱动产品流程（需求→方案→开发→审查→验收，无内部角色术语）+ 5 步 pill 列表 + OPC 3.0 介绍 + 占位链接（`OPC_3_LINK='#'`，T10 换真链接）。

`useEffect` 在 hash 匹配时自动 scrollIntoView（解决从 /help 跨页加载后 native fragment scroll 可能失灵的问题）。`src/lib/site.ts` 新增 `OPC_3_LINK` 占位常量。

**T7 Footer**（`src/components/Footer.tsx`）：「Created by OPC 3.0」由 span 改为 `<a href="/#built-with-opc">`；CSS 去除下划线、hover 变色 accent。同一页面点击 → 原生 fragment scroll；其他页面点击 → 全量加载 Landing → useEffect 自动滚动到 built-with section。

**T8 教程页**（`src/pages/HelpPage.tsx` 重写）：
- Android 6 步数字卡（「设置→位置→位置服务→时间轴→导出时间轴数据」，含机型/语言差异提示）+ 文件路径示例；
- iOS 6 步数字卡（Google Maps App 内路径，含「文件」App 存储提示）+ 文件路径示例；
- 4 格式说明（Timeline.json / Records.json / YYYY_MM.json / Location History.json）+ 树形路径 code block；
- FAQ 折叠（新增 `src/components/FAQ.tsx`：4 条 — 找不到菜单 / 换机丢数据 / 文件大 / 数据安全，多开，按钮+caret动态+−，answer 白色 pre-line，有 `aria-expanded`）；
- 底部 CTA「回到首页，一键体验示例数据 →」→ Link `/`。

**CSS**（`src/index.css`）新增 ~280 行：Landing（hero/landing-section/feature-cards/tech-line/privacy-promise/landing-builtwith/opc-steps）+ Help（step-cards 两列+数字圆/step-continue全宽/help-tip 左accent边框/format-rows/format-row/code-block/faq/faq-q/faq-a/help-cta）+ footer brand link 样式 + 860px 媒体断点（feature-cards→1col、step-cards→1col）。

**验证**：`npm run test` 50 passed（无回归）✅ / `npm run lint` 无 error ✅ / `npm run build` 通过（chunk 警告同前）✅。Playwright 浏览器实测：
- `/` Landing：hero 可见 → 三卡无溢出（scrollWidth===clientWidth=1003px）→ Built with section 锚点可见 → Footer 原生 fragment scroll ✓；
- 「立即体验」→ loadSample → /app（197 段/191 停留 + 模拟数据角标）✓；
- Footer `/help` → 点击 → /#built-with-opc 跨页滚动 ✓（useEffect fallback，rect.top ≈ 0）；
- `/help`：Android 6 步 + iOS 6 步 + 4 格式 + FAQ 开/关 ✓（aria-expanded 动态、answer 隐藏/显示、caret −/+ 切换）→ 再点击关闭折叠 ✓；
- 水平溢出检查（/ 与 /help）无 ✅；
- console：0 error / 0 warning（仅 React DevTools info）✅。

**已知问题**：① OPC 3.0 链接为占位 `#`，T10 部署时换真 URL；② Landing 全页截图存 `docs/screenshots/` 待 T10 README 用；③ step-cards 第 6 步（最终产出）若需要全宽视觉，可加 `.step-continue` class（当前两列排列已足够清晰，未启用）。

## 2026-09-13 23:50 — Dev
完成 T9.1 隐私与瓦片源设置面板（PRD#功能5）。

**T9.1.1 store 扩展**（`src/store/timelineStore.ts`）：新增 `tileSource: { name, url, attribution }`（并入 timelineStore；单一全局 store，地图组件本就消费它，未另设 settingsStore）——初始值 = OSM 默认瓦片；`setTileSource(url, attribution?)`（name 标记为「自定义」）、`resetTileSource()`（回 OSM 默认）。**仅内存，不写 localStorage**（与产品 no-persistence 承诺一致：刷新重置是预期行为，写入文案）。

**T9.1.2 瓦片配置 + 校验**（`src/lib/tiles.ts`）：`OSM_TILE_SOURCE` 默认值（`https://tile.openstreetmap.org/{z}/{x}/{y}.png` + 官方 attribution，符合 OSM 使用政策——官方推荐不带 `{s}` 子域名的主 URL）；`tileUrlError(url)` 校验（空串→合法=恢复默认信号；必须 http/https 可解析；必须含 `{z}/{x}/{y}` 三 token，缺失列出具体缺失项）。新增 `tiles.test.ts` 7 用例。

**T9.1.3 地图接入**：TripMap / PlacesMap 从 store 读 `tileSource` 传 `<TileLayer url attribution>`；改变量 React 重建 layer，设置即时生效（含已打开地图）。

**T9.1.4 设置 UI**（`src/pages/SettingsPage.tsx` 重写）：瓦片源名称显示（OpenStreetMap / 自定义 + 徽标）；URL 输入（`{z}/{x}/{y}` 占位符校验，非法时红色警告 + 应用禁用；合法时绿色提示）；应用（空串=恢复默认）/ 恢复默认按钮；「自定义瓦片源 = 自担风险」明示文案（原样：瓦片请求会把你的 IP 与当前地图视野的坐标范围发送给瓦片服务器…）；「数据生命周期」说明卡（内存处理/不写 localStorage 与 IndexedDB/不上传/无分析遥测 SDK；唯一外发请求是瓦片）。CSS 追加 settings 段（~100 行）。

**验证**：`npm run test` **57 passed**（50 回归 + tiles 7 新增）✅ / `npm run build` 通过 ✅ / `npm run lint` 无 error ✅。Playwright 实测：/settings 面板可见；非法 URL（缺 token）→ 警告 + 应用禁用；应用开源变体 `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` → 返 /app Trips 与 /app/places 地图 network 均为 `a/b/c.tile.openstreetmap.org`（200，无 `tile.openstreetmap.org` 请求）→ 自定义源驱动确认；恢复默认 → 地图回 `tile.openstreetmap.org`（200）✓；刷新页面 → 设置重置为 OSM（预期）✓；空 URL 应用 → 恢复默认 ✓；全程 console 0 error / 0 warning；localStorage 无键、IndexedDB 无库 ✓。

**已知问题**：① 自定义源未提供 attribution 输入（存储默认为空串），Leaflet attribution 控件留空——如需要可后续加 attribution 输入框；② URL 校验是轻量的「tokens 齐全 + http(s)」检查，不做实际连通性探测（探测本身也会向第三方暴露请求，与隐私目标相悖）。

## 2026-09-13 20:30 — Dev
完成 T9.3 安全加固 + T10.1 GitHub Pages 部署 workflow + HashRouter + README 4 张截图。

## 2026-09-13 23:55 — Dev
完成 T12 产品改动（改名 + Theme + 半径档位 + marker 颜色 + 日期筛选）。

**T12.1 改名**：`src/lib/site.ts` `SITE_NAME` 从 "GT Viewer" → "Timeline Map"；`src/pages/Landing.tsx` 标题/描述/功能卡文案；`src/index.html` `<title>` 标签；`README.md` 标题 + 功能亮点半径说明；Places 功能卡从 "10–5000KM" 改为 "1–100KM"。

**T12.2 Theme**：`src/index.css` 新增 `@media (prefers-color-scheme: light)` + `[data-theme='dark/light']` CSS 变量覆盖；`src/store/timelineStore.ts` 新增 `ThemeMode` 类型 + `themeMode: 'system'` 初始值 + `setThemeMode()` action；`src/App.tsx` 添加 `useEffect` 同步 `data-theme` 到 `<html>`；`src/pages/SettingsPage.tsx` 新增主题切换按钮组（跟随系统/浅色/深色），CSS 新增 `.theme-selector` + `.theme-btn` 样式。默认跟随系统。

**T12.3 半径档位**：`src/lib/geo/places.ts` `PLACE_RADII_KM` 从 `[10, 100, 1000, 5000]` → `[1, 5, 10, 50, 100]`；`src/pages/PlacesPage.tsx` 按钮文案从 "{radius} km" 改为 "{radius}"（数值小不加单位更清晰）；新增 `.places-radii-label` 显示 "1–100 KM"；summary 行追加 "1–100 KM 可选"；`places.test.ts` 断言更新为 5 档。

**T12.4 Places marker 颜色**：`src/components/PlacesMap.tsx` 新增常量 `PLACES_CLICK_MARKER_COLOR='#3b82f6'`（accent 蓝）+ `PLACES_STOP_MARKER_COLOR='#94a3b8'`（默认灰）；点击处使用 `L.marker` + 自定义 HTML divIcon（蓝色实心圆 + 白边 + 阴影）；选中停留点仍用 `CircleMarker`（琥珀色）；CSS 新增 `.leaflet-marker-icon.places-click-marker` 清除 Leaflet 默认样式。

**T12.5 Places 日期筛选**：`src/pages/PlacesPage.tsx` 侧栏顶部插入 `<DateRangePicker />` 组件，复用 Trips 视图的全局日期筛选，与 Trips 共享 `dateRange` store。

**验证**：`npm run build` ✅ / `npm run test` **63 passed**（含 places.test.ts 更新）✅ / `npm run lint` 无 error ✅。

**已知问题**：① Places 视图的周围停留点列表尚未在地图上渲染为 circleMarker（仅高亮点击处 + 选中停留点），后续如需可加；② Theme 切换不持久化（刷新重置为 system），与产品 no-persistence 承诺一致。

## 2026-09-13 23:30 — Dev
完成 T12.6 Places 地图停留点 marker 批量渲染：点击地图后，范围内**所有停留点**均显示 amber CircleMarker，点击处用蓝色 divIcon 高亮，半径圈保持透明填充+描边；空态无 marker。

**修改文件**：`src/components/PlacesMap.tsx`（新增 `visits: Visit[]` prop，遍历渲染 `CircleMarker`，移除冗余的单独 selected marker，清理未用 import `Tooltip`/`fmtDateTime`/`fmtDuration`）；`src/pages/PlacesPage.tsx`（传 `results.map(r => r.record)` 给 `visits` prop）。

**验证**：`npm run build` ✅ / `npm run test` **63 passed**（无回归）✅ / `npm run lint` 无 error ✅。

## 2026-09-13 14:20 — Dev
完成 T9.3 安全加固 + T10.1 GitHub Pages 部署 workflow + HashRouter + README 4 张截图。

**T9.3 安全加固（Security 报告原样采纳）**：
- **G1 raw points 上限**：`src/lib/parse/common.ts` 新增 `MAX_RAW_POINTS = 2_000_000`；`addRawPoint` 累计达上限后丢弃后续点并只发**一次** warning（`"x.json": raw points 超过 200 万，已截断`，`rawTruncated` 防重）；`index.ts` `mergeTimelineData(list, warnings=true)` 对跨文件合并结果也截断 + `累计 raw points 超过 200 万，已截断`，worker（`parse.worker.ts`）把合并截断警告并入 `allWarnings` 透传给 UI。新增 2 单测（单文件截断告警一次 / 合并截断）。
- **S1 CSP meta**（`index.html`）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; worker-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`。**实测**：dev（vite 5173）与生产 preview（4173）均无资源被拦、无 ws 阻断（CSP 规范里 `connect-src 'self'` 对同源 `ws://` 是放行的，Vite HMR 正常）；唯一 console 消息是浏览器提示「`frame-ancestors` 在 `<meta>` 里被忽略」——此为规范行为，`frame-ancestors` 需 HTTP 响应头才生效，而 GitHub Pages 静态托管无法加自定义头，故保留在 meta 中（**取舍**：frame 防护生效不了，其余指令全部生效；将来若要严控可改换 Vercel/Cloudflare 或自托管并配置头，不阻塞当前部署）。
- **S2 http:// 明文警告**：`src/lib/tiles.ts` 新增 `tileUrlNotes(url)`，`http:` 协议 → 「⚠ 明文传输：数据可能被网络中间人篡改，建议使用 https 或内网瓦片源」（`kind: cleartext`）；SettingsPage 在输入下方按规则渲染（有校验错误时降级为红色错误条）。新 `.tile-note-warn` CSS（琥珀色粗体）。
- **S3 {s} 子域说明**：`tileUrlNotes` 对含 `{s}` 的 URL 追加「{s} 将向 a/b/c 多个主机发起请求」（`subdomains`）；若域名含 `openstreetmap.org` 再追加「OSM 公共服务器不支持 {s}，瓦片将加载失败」（`osm-subdomains`）；设置页静态说明段同步补了同文案。新增 `tileUrlNotes` 4 单测。
- **S5 示例数据命名**：`scripts/gen-sample-data.mjs` 把 `Home` → 「家（模拟）」、`Nexus Co., Ltd.` → 「公司（模拟）」（seed 不变 `20260913`，同 PRNG 重新生成则全部后续随机值序列改变，输出会整体变化，无妨——seed 确定即可复现）；已重跑生成 `src/lib/sample/sample-timeline.json`，python 校验全部 17 个地点名无旧英文名、UI 显示正常、无奇怪字符。

**T10.1 GitHub Pages 部署 + HashRouter**：
- `src/main.tsx`：**BrowserRouter → HashRouter**（静态托管无服务端重写，子路由刷新 404 的根治方案）。**锚点适配**：Footer「Created by OPC 3.0」从原生 `<a href="/#built-with-opc">` 改为路由 `<Link to={{ pathname:'/', hash:'#built-with-opc' }}>`，HashRouter 下 URL 变 `#/#built-with-opc`；Landing 现有 `useEffect` 读 `useLocation().hash` + `scrollIntoView` 逻辑保留即生效（无需 native fragment）。**实测**：preview 下从 `/help` 点 footer 链接 → 跳转 Landing 并滚到 `#built-with-opc` 顶部（落点差因页面高度不足 clamping，section 完整可见）。
- `vite.config.ts`：`base: './'` 相对 base（适配 GitHub Pages `/<repo>/` 子路径部署，所有资源路径可移植）。
- 新建 `.github/workflows/deploy.yml`：push main（+ workflow_dispatch）→ `actions/checkout` + `setup-node(22, cache:npm)` → `npm ci` → `lint` → `test` → `build` → `actions/configure-pages` + `upload-pages-artifact(path: dist)` → `deploy-pages`。permissions: pages:write / id-token:write；concurrency 组防堆叠。**未创建 remote/推送**（gh 未安装、无 remote，T10.3 由 CEO 协调）。

**README 截图补全**（`docs/screenshots/`，playwright 对 preview 实际流程截图，命名固定）：`trips.png`（Trips：载入示例 + 近 30 天 + 地图 + 侧栏，「模拟数据 · 非真实轨迹」角标）· `places.png`（Places：点击台北市中心 25.04,121.51 → 100km 半径圈 + 浮层「98 个停留点在此范围内」+ 结果列表）· `help.png`（教程页顶部）· `settings.png`（设置页：瓦片源 + 生命卡 + `{s}` 说明）。加已有 3 张 landing 图，README 引用齐全。

**验证**：`npm run test` **63 passed**（57 回归 + G1 2 + tileUrlNotes 4）✅ / `npm run build` ✅（tsc + vite）/ `npm run lint` 0 error ✅。**验收自查**（playwright，preview 4173 + dev 5173）：`#/`、`#/app`、`#/app/places`、`#/help`、`#/settings` 全部可达（HashRouter 单文档内路由）；Landing 锚点从 /help 跨页跳转滚动正常；CSP dev/preview 均无资源拦截（仅 frame-ancestors meta 忽略提示，见 S1 取舍）；设置页输入 `http://{s}.tile.openstreetmap.org/...` 实测同时出现明文警告 + {s} 说明 + OSM 不支持三条提示 ✅；canvas Trips 路线绘制（采样 alpha>0）、Trips 侧栏 115 停留、Places 半径圆 `leaflet-interactive` 可见 ✅。

**已知问题**：① S1 的 `frame-ancestors` 在 meta 下被忽略（需 HTTP 头，GitHub Pages 不支持），见取舍记录；② deploy.yml 首次启用时需在 GitHub repo 开 Pages 指向 Actions（`Settings → Pages → Source: GitHub Actions`），T10.3 协调；③ `vite preview` 对 SPA 刷新 `#/xxx` 天然可达（单文档），真站验证仍留 T10.3。

## 2026-09-14 09:30 — Dev
完成 T13.1 + T13.2（真实 livedata 支持修复，三轮迭代）。

**T13.1 细节修复**（df24db2）：① Trips marker tooltip 日期加年份：`trips.ts:fmtDateTime` 从 `fmtDay`（MM-DD）→ `toInputDate`（YYYY-MM-DD）；② Places popup 加 Google Maps 链接：`PlacesMap.tsx` CircleMarker 弹窗内 `<a href="https://www.google.com/maps?q=lat,lng">`，`onClick` 阻止冒泡；③ `common.ts:pathToPoints` 新增 `path` fallback key，`PATH_KEYS` 增加 `path`。

**T13.2 根因分析（CEO + Dev 联合）**：用户真实数据 `docs/livedata/Timeline-20260820.json`（129MB，新版 Google Timeline 设备导出）`semanticSegments` 中同一时间段同时存在两类重叠段：①`timelinePath` 段（2 小时粒度，`{point,time}` 完整 GPS 轨迹 8-11 点）；②`activity` 段（`{start:{latLng}, end:{latLng}, distanceMeters, topCandidate:{type:IN_BUS/WALKING/...}}`，**只有起终点无轨迹点**）。此前 `activity` 车辆行程渲染成退化直线 → 用户"汽车 GPS 没显示"。真实轨迹在同时间 `timelinePath` 段，未与 activity 关联。

**修复方案**（7674cb4 初版 → c2b28f3 审查加固 → 802ddf7 尾换行）：
- `common.ts`：`ParseState.timelinePathPool` 池化含 timelinePath 的段；`findStitchCandidate` 查候选（时间真重叠 + 起终点距 trace 首末点 ≤0.02°≈2km，取重叠最长）
- `stitchSegments` 终 pass：**唯一一次排序**后为所有 path<2 段匹配（S2 修复：删除即时借道分支，保证 `>best`）；左扫用 `maxEndUpTo` 前缀 max（S1 修复：endMs 非单调不漏配）；反向配对（A2）；`candidate.points.slice()` 防别名（A1）
- `formatTimelineArray.ts` / `formatRecords.ts` / `formatSemanticHistory.ts` 末尾调 `stitchSegments`（S3：format1/2/3 全覆盖；入池唯一条件=含 timelinePath 键且 path≥2，无误伤）
- `stitch.test.ts`：4 个合成单测（S1 短窗口跨越/多候选取最长/反向点序/端点拒绝）+ livedata 精确断言（2025-01-31 IN_BUS 5/5 全获得真实路径）

**验证**：`npm run test` 80 passed / `npm run build` ✅ / `npm run lint` 0 error ✅。livedata 实测 4s（含 JSON.parse）。129MB livedata 已 gitignore，未提交。Reviewer 两轮（S1 严重 + S2/S3 + A1/A2/A3/A5 建议）修复后**通过**。

## 2026-09-14 10:00 — CEO 验收
验收 T13.1 + T13.2：三个用户反馈全部闭环。
1. **marker 日期加年份** ✅ — Trips tooltip 显示 YYYY-MM-DD
2. **popup Google Maps 链接** ✅ — 点击停留点弹窗内可跳转 Google Maps
3. **汽车移动 GPS 显示** ✅ — 真实 livedata 的 IN_BUS / IN_PASSENGER_VEHICLE 行程已缝合 timelinePath 轨迹（2025-01-31 实测 5/5 车辆段获得真实路径，路径点 6-11 个）

部署：三个 commit 均通过 GitHub Actions 成功部署（最新 802ddf7 线上 200）。新增 Backlog 项：livedata 完整支持延伸（visit 段与 activity 段关联展示）。
