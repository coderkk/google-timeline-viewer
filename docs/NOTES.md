# Notes

> 开发日志（追加式）。格式：`## YYYY-MM-DD HH:mm — 角色` + 内容。

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
