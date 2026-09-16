# TASKS: Google Timeline Viewer

<!-- next: T38 -->

## 🔨 Doing（WIP ≤ 2）

## 📋 To Do

- [ ] **T36: 合并归档独立页（功能 14）— rawSignals 累积** [P2]
  - 背景: 用户要长期保留 rawSignals（Google 只留 ~29 天滚动窗口，定期导出存档即可突破），但**不累积多份完整 Timeline.json**（每份都带完整 semanticSegments，重复解析浪费）→ 独立页 merge 产出合并档文件 → 再导入观看
  - 方案（PRD v1.23，用户拍板）:
    - 入口: 新路由 `/app/merge`（独立页，不在 import 流程）；页面上两个 Select File：①主档案（已有合并档，可选——首次没有）②本次新导出 Timeline.json → [合并并下载] → 产出新合并档（下载保存，之后要导入观看时再导入）
    - 合并算法（核心「分而治之」）:
      - `semanticSegments` → **取新导出的那份**（永久历史，最新=最全；替换旧档语义段，不去重/不拼接）
      - `rawSignals` → **窗口互补累积**：新导出 29 天窗口与旧档案累积池——不重叠（间隔 ≥29 天）直接拼接；重叠则按「时间 ± 容差 + 位置」折叠重复点保留新点
      - 保留 `userLocationProfile`（取新导出）
    - 输出格式: `Timeline.json` schema（`{semanticSegments, rawSignals, userLocationProfile}`）→ **导入后可正常观看**（时间轴模式用累积 raw、旧日期自动回退语义段——功能 3 现有逻辑）
    - 纯本地、零网络请求（隐私一致）
  - 档位: L3（新页面 + 新算法 + 文件输出）
  - 指派: Dev + Reviewer
  - 来源: 用户讨论 2026-09-16 + PRD v1.23
  - 时间: 09-16 创建

## ⏸ KIV



## ⏸ KIV

- [ ] **T-K1: 移动端适配**
  - 等待: v1 发布后评估公开分享带来的移动访问占比
  - 时间: 09-13 创建

## 📭 Backlog（上 = 优先）

- [ ] [P2] 范围切换性能——Last year/All 预设全量重建 2.3s 单 longtask（4,593 stays + 12k 点重挂载）；一次性范围切换不阻塞发布，候选分块/异步重建（T37 附带发现）(09-16)
- [ ] [P2] 离线瓦片 / 自托管瓦片服务器 — 彻底消除瓦片请求隐私（→ PRD 不做）(09-13)
- [ ] [P2] 行程分享/导出（GeoJSON/KML）— （→ PRD 不做）(09-13)
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [x] ~~[P2] livedata 完整支持（新版 Timeline.json 语义段重叠合并）— activity 段继承 timelinePath 轨迹后，进一步评估 visit 段与 activity 段的关联展示（→ PRD 功能 3 延伸）~~ **(09-14→09-15 完成)** — 侦察（T32）证伪「visit↔activity 重叠」假设；真问题=timelinePath traces 混入 by-activity 链（23% 假移动）；实验分支（T33）验证方案 A 净改善（三角归零+零孤岛），已 merge；分析见 docs/RESEARCH-B5.md，结果见 docs/EXPERIMENT-B5.md
- [x] ~~[P2] raw 点渲染性能压测 — A1 遗留：RAW_POINT_CAP=20000 整量渲染 1.5 万+ CircleMarker 潜在卡顿~~ **(09-14→09-16 完成)** — T37 真实 15k 窗口压测放行：无卡顿无需降 cap；报告 DATA-FINDINGS §10

## ✅ Done

- [x] ~~T37: raw 点渲染性能压测（发布前）~~ (09-16→09-16) [P2] — 真实 livedata 15k 点窗口（2026 文件默认 30 天 = 15,072 raw → 12,000 绘制）production build 复测（headless Chromium + Playwright 真实手势）：缩放帧 p95 pooled **183ms**（单步 100–283ms）/ longtask max **219ms**（无秒级冻结），平移 **43/41fps**（16 拖中 11 拖无 longtask、5 拖零星，z12 首拖 tile+点层冷启动 max 647ms，p95 恒 50ms），均优于 §8 pre-fix（p95 461ms / 1796ms）→ **验收通过，产品代码零修改，无需降 cap**。附加场景（合并 62 天档 37,287 stays）同上结论；附带发现：切范围预设（Last year / All）有一次性 1.3–2.3s 长任务冻结，非阻塞，入 Backlog 候选。报告 **DATA-FINDINGS §10** + `scripts/out/perf-report.json`；可复现 `scripts/perf-raw-window.mjs` / `perf-make-merged.mjs` / `perf-browser.mjs` 三件套。**Reviewer PASS**（一般级已修：§10 平移 longtask 如实化 11/16 + 聚合 `Math.max` 修复 + 全景数据持久化 + Backlog 落子）。

- [x] ~~T30: UI/UX 精修批（PRD v1.20）~~ (09-15→09-15) [P1] — [#1–#5 用户反馈] **T30.1** Header NavLink 一律 `end`（`/app` 不再前缀匹配 `/app/places`）；**T30.2** `DateRangePicker` 重写为「紧凑按钮 + popover 双月历」（`.drp-trigger/.drp-popover/.drp-backdrop`；Esc/backdrop/双点完成/preset/换数据关闭、`drp.clear` 不关、`aria-expanded`/`aria-haspopup`、<768px 整行宽+70vh）；**T30.3** `lastNDaysRange(maxMs,n)`（`end - n*DAY + 1 … endOfDayMs`）入 `lib/trips.ts`、store `importFiles`/`loadSample` 默认近 30 天、快捷档复用保 active 一致；**T30.4** Places 默认半径 100 → **5**；**T30.5** 收尾（206 单测 / build / lint 全绿、双视口冒烟 0 pageerror、NOTES/PRD/TASKS 收尾），未 push。**修复联动 bug**：TripsPage `MapPane` 移除 `key={fitKey}`（TripMap 内部 FitController 已自行 re-fit），改 zustand `subscribe` 在 range/data 变化时清空 selected 三态——popover 双点选不再被 remount 打断、换窗丢弃越界选中行为不变。

- [x] ~~T31: fallback 门槛口径统一~~ (09-15→09-15) [P2] — 6 处 `>0` 统一走 `hasPath`（`boundsOf`/`polylineEndpoints`）或 `segmentPathOrEndpoints()`（其余 4 处）；渲染层 `>=2` 闸门统一走 `hasRenderablePath()`；`grep '\.path\.length [><=]'` 只出现在 `hasPath`/`hasRenderablePath`/`segmentVertices`/`parse` 四处；211 单测 + build + lint 全绿。来源: 2026-09-15 retro A3（→ PRD v1.21）；Reviewer PASS（零遗留）

- [x] ~~T32: B5 侦察 — livedata visit/activity 重叠形态量化~~ (09-15→09-15) [P2] — scripts/analyze-visit-activity-overlap.mjs 输出两份 livedata 的 visit↔activity 时间重叠统计；**零重叠**（activity-keyed vs visit）+ trace 层面 ~23% 三角；结论写入 NOTES + DATA-FINDINGS §9；Reviewer PASS（N1 caveat 已补、N2 报告已是 dot decimals 无须改、N3 path-less 跨午夜为固有限制）。不碰产品代码

- [x] ~~T33: 实验分支 — by activity 行程链过滤 timelinePath-only traces（B5 方案 A）~~ (09-15→09-15) [P2] — buildTripChain 内部过滤 `hasActivitySemantics !== false`（解析层 addSegment 设置标记）；三角 12,037/15,517 → 0/0、孤岛 0/0（推翻侦察 §5.2 误判的「15-20% 缺口」）、≈2h 假移动 19,891/22,701 → 75/75；ingle 216 全绿 + build + lint；Reviewer PASS；实验分支 `experiment/b5-livedata-overlap` fast-forward 并入 main；结果详见 docs/EXPERIMENT-B5.md

- [x] ~~T34: ARCHIVE 归档（Done 区 T1-T29 移入 ARCHIVE.md）+ 根 repo 游离文件清理~~ (09-15→09-15) [L1] — ①`docs/ARCHIVE.md` 新建，`## 2026-09-15 归档` 节收纳 **42 条**（T1–T29 含 T12.6/T13.x/T14.1-3/T16.x 等子任务，保留任务ID/标题/起止/关键结论一句）；②`docs/TASKS.md` Done 区只留 T30–T33（升序），旧任务全部剪走；③`TASKS.yaml` 已确认 done 条目保留、无需改动；④根 repo（opc-3.0）游离文件 `t31-timeline-mode.png` 已删除（未跟踪、无引用）。纯文档整理，无代码改动；无需 npm test
  - 验收: ①ARCHIVE.md 含 T1-T29 全条目（≥29 条）；②TASKS.md Done 区保留 T30-T33（旧任务全清）；③根 repo git status 不再显示 png；④无代码改动不跑 test
  - 档位: L1
  - 来源: CEO 盘点（2026-09-15）
  - 时间: 09-15 创建 → 09-15 Done

- [x] ~~T35: 导入进度显示修复（进度条静止 0%）~~ (09-15→09-16) [P1] — 用户实测 113MB 导入进度静止 0%；根因=单文件时 worker progress=index/fileCount 恒 0 + `parseTimelineFile` 同步无中间进度。方案（用户拍板，PRD v1.22）：**单文件导入**（去 `multiple`，多拖取第一份、Help/FAQ 文案同步单数化）+ 解析期**不确定动画进度条**（`.progress-fill--indeterminate` + `@keyframes progress-slide`，`prefers-reduced-motion` 降级）＋文案去 `{progress}%`（诚实原则，不假造数字）；`parseProgress` store 字段全量删除（ImportPanel 是唯一消费方，grep 零残留）、worker 消息协议保留（功能 14 将真实消费 per-file progress）；跨设备合并去重正式立项 **PRD 功能 14 独立页**（merge 产出新文件再导入，不在 import 流程）。220 单测（+4：i18n catalog 无 `%`/`{progress}` 断言 + ImportPanel 动画/无百分比/无 multiple 3 条）全绿 + lint + build；冒烟 113MB livedata 动画流动（transform 实时变化）+ 完成进 Trips（11,386 route points）+ sample 流程 OK；Reviewer PASS（G1 拖拽复数文案 → 已修：`dropHint`/`retry` 单数化；S2 判定 worker 协议保留正确）
  - 验收: ①解析态动画进度条（非静止 0%）+ 文案无百分比；②113MB livedata 全程流动、完成进 Trips；③worker progress 与 UI 脱钩；④220 单测全绿；⑤PRD 功能 1 与实作一致；⑥sample 冒烟动画可见
  - 档位: L2
  - 指派: Dev + Reviewer
  - 来源: 用户实测报告（2026-09-15）+ PRD v1.22
  - 时间: 09-15 创建 → 09-16 Done（commits `30843e3`/`79a7bea`（G1）/`69edd64`（Help 单文件化））

- [x] ~~T36: 合并归档独立页（功能 14）— rawSignals 累积~~ (09-16→09-16) [P2] — 用户长期保留 rawSignals（Google 只 ~29 天窗口）但不堆 N 份完整 Timeline.json → 独立页 `/app/merge`：主档案（可选）+ 新导出 → 合并 → 下载合并档 → 再导入观看。**分而治之算法**：`semanticSegments` 取新导出（最新=最全，不合并去重）+ `rawSignals` 窗口互补累积（重叠按 ±60s + 100m 折叠保留新点、间隔 ≥29 天直接拼接）+ `userLocationProfile` 取新；输出 Timeline.json schema 可再导入（时间轴用累积 raw、旧日期回退语义段——功能 3 现有逻辑）。实现：`src/lib/merge/`（纯算法 + largeFile 护栏）+ `merge.worker.ts`（离主线，100MB+ 不卡 UI）+ `pages/MergePage.tsx`（双 select + 不确定进度 + 下载 `timeline-merged-YYYYMMDD.json`）+ `extractFormat1Slices` parse 重构共享；13 i18n key en/zh parity。livedata 冒烟：2025(108MB)+2026(123MB) → raw=106,171 无损累积、semantic=97,382 单层、合并档 101.5MB（不翻倍——大头语义段只留一份）、再导入 27,252 points span 2025-01→2026-08 闭环。**243 单测**（+23）+ lint + build 全绿。Reviewer PASS（零阻断）；一般级 3 项已修：①空语义段新导出抛错（防静默清空旧语义层）②coordless exact-identity 去重（虽 livedata 实测精确重叠为 0）③>200MB 合并前确认护栏（内存峰值约 ×6、>300MB 建议分次导出）。**决策**：新导出内部近重复（2025 23.6%/2026 40.4%=静止/慢移真实信号密度）不去重——折叠只做旧→新方向，同文件合并两次幂等（15479/15479 全折叠），不削原始 GPS。功能从 Backlog 亮相，PRD v1.23
  - 档位: L3
  - 指派: Dev + Reviewer
  - 来源: 用户讨论 2026-09-16（功能 14 重定义）+ PRD v1.23
  - 时间: 09-16 创建 → 09-16 Done（commits `951ef4b` + `dd87fec`（一般级修复））

## ❌ Cancelled