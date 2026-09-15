# TASKS: Google Timeline Viewer

<!-- next: T35 -->

## 🔨 Doing（WIP ≤ 2）


## ✅ Done（新）

- [x] **T34: ARCHIVE 归档（Done 区 T1-T29 移入 ARCHIVE.md）+ 根 repo 游离文件清理** (09-15→09-15) [L1] — ①`docs/ARCHIVE.md` 新建，42 条归档（T1–T29 含子任务）；②`docs/TASKS.md` Done 区只留 T30–T33（按编号排序）；③`TASKS.yaml` 已确认 done 条目保留无需改动；④根 repo `t31-timeline-mode.png` 已删除。纯文档整理，无代码改动
  - 来源: CEO 盘点（2026-09-15）

## 📋 To Do




## ⏸ KIV

- [ ] **T-K1: 移动端适配**
  - 等待: v1 发布后评估公开分享带来的移动访问占比
  - 时间: 09-13 创建

## 📭 Backlog（上 = 优先）

- [ ] [P2] 离线瓦片 / 自托管瓦片服务器 — 彻底消除瓦片请求隐私（→ PRD 不做）(09-13)
- [ ] [P2] 行程分享/导出（GeoJSON/KML）— （→ PRD 不做）(09-13)
- [ ] [P2] 跨设备多 Takeout 合并去重 — （→ PRD 不做）(09-13)；含 T-K2③ rawSignals 滚动窗口互补合并（segments/visits 时间指纹去重 + points 互补合并）(09-14)
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [x] ~~[P2] livedata 完整支持（新版 Timeline.json 语义段重叠合并）— activity 段继承 timelinePath 轨迹后，进一步评估 visit 段与 activity 段的关联展示（→ PRD 功能 3 延伸）~~ **(09-14→09-15 完成)** — 侦察（T32）证伪「visit↔activity 重叠」假设；真问题=timelinePath traces 混入 by-activity 链（23% 假移动）；实验分支（T33）验证方案 A 净改善（三角归零+零孤岛），已 merge；分析见 docs/RESEARCH-B5.md，结果见 docs/EXPERIMENT-B5.md
- [ ] [P2] raw 点渲染性能压测 — A1 遗留：RAW_POINT_CAP=20000 整量渲染 1.5 万+ CircleMarker 潜在卡顿（canvas 兜底已生效）；发布前用真实 15k 窗口压测后定降 cap 或分层预算 (09-14)

## ✅ Done

- [x] ~~T33: 实验分支 — by activity 行程链过滤 timelinePath-only traces（B5 方案 A）~~ (09-15→09-15) [P2] — buildTripChain 内部过滤 `hasActivitySemantics !== false`（解析层 addSegment 设置标记）；三角 12,037/15,517 → 0/0、孤岛 0/0（推翻侦察 §5.2 误判的「15-20% 缺口」）、≈2h 假移动 19,891/22,701 → 75/75；ingle 216 全绿 + build + lint；Reviewer PASS；实验分支 `experiment/b5-livedata-overlap` fast-forward 并入 main；结果详见 docs/EXPERIMENT-B5.md

- [x] ~~T32: B5 侦察 — livedata visit/activity 重叠形态量化~~ (09-15→09-15) [P2] — scripts/analyze-visit-activity-overlap.mjs 输出两份 livedata 的 visit↔activity 时间重叠统计；**零重叠**（activity-keyed vs visit）+ trace 层面 ~23% 三角；结论写入 NOTES + DATA-FINDINGS §9；Reviewer PASS（N1 caveat 已补、N2 报告已是 dot decimals 无须改、N3 path-less 跨午夜为固有限制）。不碰产品代码

- [x] ~~T31: fallback 门槛口径统一~~ (09-15→09-15) [P2] — 6 处 `>0` 统一走 `hasPath`（`boundsOf`/`polylineEndpoints`）或 `segmentPathOrEndpoints()`（其余 4 处）；渲染层 `>=2` 闸门统一走 `hasRenderablePath()`；`grep '\.path\.length [><=]'` 只出现在 `hasPath`/`hasRenderablePath`/`segmentVertices`/`parse` 四处；211 单测 + build + lint 全绿。来源: 2026-09-15 retro A3（→ PRD v1.21）；Reviewer PASS（零遗留）

- [x] ~~T30: UI/UX 精修批（PRD v1.20）~~ (09-15→09-15) [P1] — [#1–#5 用户反馈] **T30.1** Header NavLink 一律 `end`（`/app` 不再前缀匹配 `/app/places`）；**T30.2** `DateRangePicker` 重写为「紧凑按钮 + popover 双月历」（`.drp-trigger/.drp-popover/.drp-backdrop`；Esc/backdrop/双点完成/preset/换数据关闭、`drp.clear` 不关、`aria-expanded`/`aria-haspopup`、<768px 整行宽+70vh）；**T30.3** `lastNDaysRange(maxMs,n)`（`end - n*DAY + 1 … endOfDayMs`）入 `lib/trips.ts`、store `importFiles`/`loadSample` 默认近 30 天、快捷档复用保 active 一致；**T30.4** Places 默认半径 100 → **5**；**T30.5** 收尾（206 单测 / build / lint 全绿、双视口冒烟 0 pageerror、NOTES/PRD/TASKS 收尾），未 push。**修复联动 bug**：TripsPage `MapPane` 移除 `key={fitKey}`（TripMap 内部 FitController 已自行 re-fit），改 zustand `subscribe` 在 range/data 变化时清空 selected 三态——popover 双点选不再被 remount 打断、换窗丢弃越界选中行为不变。

## ❌ Cancelled