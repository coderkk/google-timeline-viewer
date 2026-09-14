# TASKS: Google Timeline Viewer

<!-- next: T15 -->

## 🔨 Doing（WIP ≤ 2）

## 📋 To Do

## ⏸ KIV

- [ ] **T-K1: 移动端适配**
  - 等待: v1 发布后评估公开分享带来的移动访问占比
  - 时间: 09-13 创建

## 📭 Backlog（上 = 优先）

- [ ] [P2] 行程统计报表 — 总距离/日均运动量/地点频次（→ PRD 不做，发布后）(09-13)
- [ ] [P2] 离线瓦片 / 自托管瓦片服务器 — 彻底消除瓦片请求隐私（→ PRD 不做）(09-13)
- [ ] [P2] 行程分享/导出（GeoJSON/KML）— （→ PRD 不做）(09-13)
- [ ] [P2] 跨设备多 Takeout 合并去重 — （→ PRD 不做）(09-13)；含 T-K2③ rawSignals 滚动窗口互补合并（segments/visits 时间指纹去重 + points 互补合并）(09-14)
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [ ] [P2] 多语言（英文为主，可换中文）— 需要 i18n 依赖，v2 加入（→ PRD 约束）(09-13)
- [ ] [P2] livedata 完整支持（新版 Timeline.json 语义段重叠合并）— activity 段继承 timelinePath 轨迹后，进一步评估 visit 段与 activity 段的关联展示（→ PRD 功能 3 延伸）(09-14)
- [ ] [P2] raw 点渲染性能压测 — A1 遗留：RAW_POINT_CAP=20000 整量渲染 1.5 万+ CircleMarker 潜在卡顿（canvas 兜底已生效）；发布前用真实 15k 窗口压测后定降 cap 或分层预算 (09-14)

## ✅ Done

- [x] ~~T1: 项目脚手架 + 应用框架~~ (09-13→09-13) — Vite+React19+TS+Leaflet+Router+Zustand；路由/Header/Footer 骨架；build 通过
- [x] ~~T2: 数据解析层（四格式 + Web Worker）~~ (09-13→09-13) — 18 单测通过；build/lint 通过；Reviewer 审查延后至下个节奏点
- [x] ~~T3: 模拟示例数据~~ (09-13→09-13) — gen-sample-data.mjs 产出 54 天/5 城市直出格式数据；载入模块 + 单测通过；UI 角标就绪
- [x] ~~T4: 导入集成 + 空状态首屏 + 全局状态~~ (09-13→09-13) — store（导入/示例/大文件确认/日期范围）+ 空状态页 + 拖拽导入面板；浏览器实测通过；22 单测全绿
- [x] ~~T5: Trips 视图（行程轨迹）~~ (09-13→09-13) — 日期范围选择器（快捷档+单边日）+ 路线按交通方式着色 + tooltip；三层降采样/上限；双向联动；viewport 锚定修复 canvas 崩溃；40 单测；playwright 实测含 123.4MB 真实导出
- [x] ~~T6: Places 视图（地图点击查访）~~ (09-13→09-13) — SpatialGrid(1°×1° bbox+haversine)+4 档半径圆+自动 zoom+点击浮层+结果定位高亮；50 单测；真实数据 5000km 查询 21ms；Design QA 并入 T11
- [x] ~~T7: Landing 首页 + OPC 3.0 展示~~ (09-13→09-13) — Hero+痛点→方案+3 功能卡+隐私承诺+技术栈；Built with OPC 3.0 section（无内部角色术语）+ Footer 品牌锚点；「立即体验」→ loadSample；playwright 实测通过
- [x] ~~T8: 导出教程页~~ (09-13→09-13) — Android(系统设置)/iOS(Maps App)步骤 + 4 格式说明 + FAQ 折叠(aria-expanded) + 体验示例 CTA；实测通过
- [x] ~~T9: 隐私与瓦片源设置~~ (09-13→09-13) — tileSource store(TileLayer 即时生效)+设置 UI(URL 校验/警告/生命卡/仅内存)+隐私明示文案；57 单测；Security 审查(有条件通过，0 致命/严重)
- [x] ~~T9.3: 安全审查建议项加固~~ (09-13→09-13) — G1(raw points 2M 硬上限+warning+2 单测)；S1(CSP meta，dev/preview 无阻断，frame 头无法经 meta 生效已记录)；S2(http 明文警告)；S3({s}+OSM 提示)；S5(示例数据「家（模拟）」)；63 单测+build+lint 全过
- [x] ~~T10.1: GitHub Pages 部署 workflow~~ (09-13→09-13) — HashRouter + base './' + deploy.yml(configure/upload/deploy-pages)；子路由刷新可达；未建 remote
- [x] ~~T10.2: README（中文）~~ (09-13→09-13) — 10 区块：简介/亮点/截图(3 张 landing)/快速开始/取数指南/格式表/隐私声明/架构图(Worker+SpatialGrid)/Built with OPC 3.0(无内部术语)/MIT 声明；Trips/Places/Help/Settings 截图后补
- [x] ~~T10.3: GitHub Pages 部署~~ (09-13→09-13) — Actions 成功；所有路由 200；7 张截图 200；Network 冒烟通过（无外部硬编码 URL）；https://coderkk.github.io/google-timeline-viewer/
- [x] ~~T12: 产品改动（改名 + Theme + 半径档位 + marker 颜色）~~ (09-13→09-13) — Timeline Map 改名 + Theme(Light/Dark/System) + 半径 1/5/10/50/100KM + Places marker 颜色区分 + 日期筛选全局共享；63 单测+build+lint 全过；已部署到 https://coderkk.github.io/google-timeline-viewer/
- [x] ~~T12.6: Places marker 颜色区分修复~~ (09-13→09-13) — 范围内所有停留点都显示 marker，点击处蓝色高亮 + 周围琥珀色；部署成功
- [x] ~~T13: Places 停留点点击历史~~ (09-13→09-13) — 点击 marker 弹出浮动面板显示该地点历史访问记录；visitHistory 分组工具 + VisitHistoryPanel 组件 + PlacesMap marker click handler；71 单测 + build + lint 全过
- [x] ~~T13.1: Trips/Places marker 细节修复~~ (09-14→09-14) — ① marker 日期 tooltip 加年份（fmtDateTime YYYY-MM-DD）② Places popup 加 Google Maps 链接 ③ 解析器新增 `path` fallback key；df24db2；71→71 单测
- [x] ~~T13.2: 真实 livedata 车辆 GPS 轨迹合并~~ (09-14→09-14) — 根因：新版 Timeline.json 的 activity 段（IN_BUS/IN_PASSENGER_VEHICLE）只带 start/end、无轨迹点，完整 GPS 在同时间 timelinePath 段；实现 stitchSegments 终 pass 把重叠 trace 轨迹缝合进 activity 段（maxEnd 前缀左扫 + 单次排序 pass + format1/2/3 覆盖 + 反向配对 + slice 防别名）；Reviewer 两轮（S1/S2/S3 + A1/A2/A3/A5）后通过；802ddf7；80 单测
- [x] ~~T13.3: Trips 轨迹缝合改进 + 路线点显示~~ (09-14→09-14) — ①缝合匹配从"端点≡trace首末点"改为"trace 中存在与 activity start/end 分别接近的点（子段轨迹）"，修 16:15/17:57 类中途行程失败（16:15 path=0→5 实测）；②Trips 视图把 segment.path 的点渲染为小圆点（默认开，顶栏可切换，ROUTE_POINT_CAP=5000 整体 strideTake 保两端）；③记录 rawSignals 评估（2026-01-30 无 rawSignals，条目仅为记录）；CEO 验收通过，已部署
- [x] ~~T13.6: rawSignals 解析接入~~ (09-14→09-14) — format1 接入 rawSignals：position 类目解析为点（大写 `LatLng`+嵌套 `timestamp`+精度），activityRecord/wifiScan 静默跳过，旧式扁平 shape 兜底（样例 432 条全进点流）；全局点流经 prepareTrips 进 Trips 视图渲染（灰色小点，showRoutePoints 可关）；单测 + livedata 真实文件精确计数 11773/15479；另修 timelineMemory 文档化"忽略"类型不再误报 warning（2025 文件 22 条假警告清零）；111 单测全绿；已自测待 Reviewer
- [x] ~~T13.7: 时区分组修复~~ (09-14→09-14) — startOfDayMs/dayKeyOf 改本地(+08)时区并对齐日期筛选器 parseInputDate；真实 2025 文件 17284 段旧 UTC 分组错日全修正；凌晨跨 UTC 日边界用例（22:00→前一日，00:30/04:00/06:00→当日）覆盖；111 单测全绿；已自测待 Reviewer
- [x] ~~T14: Trips 时间线连续轨迹~~ (09-14→09-14) — PRD 功能 3 v1.7；prepareTrips 段按 startMs 升序（时间线语义，跨零点按绝对 ms）+ bridgeLines 生成衔接线（{from,to,gapMs}，负/零 gap 与退化几何跳过，BRIDGE_CAP=1000 预算，纯时间口径无距离闸门）；TripMap 衔接线渲染（浅灰细虚线 + tooltip「衔接/衔接 +N 分钟/小时/天」+ 起终点时间）；实测段 activityColor 着色与 raw 灰点开关不受影响；TripsPage summary「· N 处衔接」+ MapPane/双实例直连；119 单测（+7）全绿；真实 livedata 最忙日 2016-01-14 31 段排序 + 4 处衔接验证；Reviewer 通过（有条件）N1 已修，CEO 拍板边界已记 DATA-FINDINGS §7；T14.1 桥接端点修复：bridgeLines from/to 改用可视端点（path 首末，<2 回退 start/end），重合跳过同步走可视端点，gapMs 纯时间口径不变——消除缝合 path≠start/end 导致的公里级视觉断口（livedata 实测修复前最大 1.30km）；120 单测全绿；待部署。T14.2 跨类型衔接双闸门：bridgeLines 改「时间 or 距离双闸门」——gapMs>0 照常建桥；gapMs≤0 且可视端点点距≤BRIDGE_OVERLAP_MAX_M=1000m 建桥（换乘衔接，GPS 记录粒度使驾车→步行时间重叠几分钟）；点距>1000m 跳过（真并行记录，诚实原则）；阈值经两份 real livedata 全量重叠对点距 CDF 标定（cross-type 换乘 p95=766m、1000m 覆盖 96.9%，trace-involved 长尾被闸门压住）；BridgeLine.gapMs 可负（带符号真实时间差），tooltip 对负/零/短差一律「衔接」不显示负数；123 单测（+3）全绿；build/lint 全过；待部署

## ❌ Cancelled