# TASKS: Google Timeline Viewer

<!-- next: T36 -->

## 🔨 Doing（WIP ≤ 2）

- [ ] **T35: 导入进度显示修复（进度条静止 0%）** [P1]
  - 问题: 用户实测导入 113MB Timeline.json 时 "Parsing (0%)…" 与进度条**静止在 0%**——根因：单文件时 worker 事件 progress = index/fileCount = 0/1 = **恒 0**（只有 start/reading/parsing 都发 0，done 才跳 1）；`parseTimelineFile` 是同步函数（JSON.parse + 逐段遍历）无中断点，**真实中间进度不存在**
  - 方案（用户拍板，PRD v1.22）：**单文件导入**（移除多文件语义 → `multiple` 属性去掉或保留无害；合并去重移入**功能 14 独立页**，不在 import 流程）+ **解析期间显示不确定进度条（CSS 动画）＋「正在解析… 大文件可能需要一小段时间」**（去百分比，诚实原则——不假造数字）
  - 验收: ①`ImportPanel` 解析态显示**动画进度条**（非静止 0%），文案无 `(0%)` 百分比；②导入 113MB livedata 全程动画流动、完成后正常进 Trips；③`parse.worker.ts`/`worker.ts` 的 progress 语义与 UI 脱钩（UI 不再依赖进度数字）；④单测更新 + 全绿（216+）；⑤PRD 功能 1 描述与实作一致（单文件 + 动画进度）；⑥sample 冒烟：导入/更换数据流程动画可见
  - 档位: L2（跨 worker 语义 + UI 组件）
  - 指派: Dev
  - 来源: 用户实测报告（2026-09-15 23:5x）+ PRD v1.22
  - 时间: 09-15 创建 → 09-16 Doing

## 📋 To Do



## ⏸ KIV

- [ ] **T-K1: 移动端适配**
  - 等待: v1 发布后评估公开分享带来的移动访问占比
  - 时间: 09-13 创建

## 📭 Backlog（上 = 优先）

- [ ] [P2] 离线瓦片 / 自托管瓦片服务器 — 彻底消除瓦片请求隐私（→ PRD 不做）(09-13)
- [ ] [P2] 行程分享/导出（GeoJSON/KML）— （→ PRD 不做）(09-13)
- [ ] [P2] 跨设备多 Takeout 合并去重 — **已立项 功能 14**（→ PRD#功能14，MVP 后）**独立页**：merge 产出新文件再导入观看、不在 import 流程；含 T-K2③ rawSignals 滚动窗口互补合并（segments/visits 时间指纹去重 + points 互补合并）(09-13)；产品形态用户 09-15 拍板：单独 page + merge 后产出新档
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [x] ~~[P2] livedata 完整支持（新版 Timeline.json 语义段重叠合并）— activity 段继承 timelinePath 轨迹后，进一步评估 visit 段与 activity 段的关联展示（→ PRD 功能 3 延伸）~~ **(09-14→09-15 完成)** — 侦察（T32）证伪「visit↔activity 重叠」假设；真问题=timelinePath traces 混入 by-activity 链（23% 假移动）；实验分支（T33）验证方案 A 净改善（三角归零+零孤岛），已 merge；分析见 docs/RESEARCH-B5.md，结果见 docs/EXPERIMENT-B5.md
- [ ] [P2] raw 点渲染性能压测 — A1 遗留：RAW_POINT_CAP=20000 整量渲染 1.5 万+ CircleMarker 潜在卡顿（canvas 兜底已生效）；发布前用真实 15k 窗口压测后定降 cap 或分层预算 (09-14)

## ✅ Done

- [x] ~~T30: UI/UX 精修批（PRD v1.20）~~ (09-15→09-15) [P1] — [#1–#5 用户反馈] **T30.1** Header NavLink 一律 `end`（`/app` 不再前缀匹配 `/app/places`）；**T30.2** `DateRangePicker` 重写为「紧凑按钮 + popover 双月历」（`.drp-trigger/.drp-popover/.drp-backdrop`；Esc/backdrop/双点完成/preset/换数据关闭、`drp.clear` 不关、`aria-expanded`/`aria-haspopup`、<768px 整行宽+70vh）；**T30.3** `lastNDaysRange(maxMs,n)`（`end - n*DAY + 1 … endOfDayMs`）入 `lib/trips.ts`、store `importFiles`/`loadSample` 默认近 30 天、快捷档复用保 active 一致；**T30.4** Places 默认半径 100 → **5**；**T30.5** 收尾（206 单测 / build / lint 全绿、双视口冒烟 0 pageerror、NOTES/PRD/TASKS 收尾），未 push。**修复联动 bug**：TripsPage `MapPane` 移除 `key={fitKey}`（TripMap 内部 FitController 已自行 re-fit），改 zustand `subscribe` 在 range/data 变化时清空 selected 三态——popover 双点选不再被 remount 打断、换窗丢弃越界选中行为不变。

- [x] ~~T31: fallback 门槛口径统一~~ (09-15→09-15) [P2] — 6 处 `>0` 统一走 `hasPath`（`boundsOf`/`polylineEndpoints`）或 `segmentPathOrEndpoints()`（其余 4 处）；渲染层 `>=2` 闸门统一走 `hasRenderablePath()`；`grep '\.path\.length [><=]'` 只出现在 `hasPath`/`hasRenderablePath`/`segmentVertices`/`parse` 四处；211 单测 + build + lint 全绿。来源: 2026-09-15 retro A3（→ PRD v1.21）；Reviewer PASS（零遗留）

- [x] ~~T32: B5 侦察 — livedata visit/activity 重叠形态量化~~ (09-15→09-15) [P2] — scripts/analyze-visit-activity-overlap.mjs 输出两份 livedata 的 visit↔activity 时间重叠统计；**零重叠**（activity-keyed vs visit）+ trace 层面 ~23% 三角；结论写入 NOTES + DATA-FINDINGS §9；Reviewer PASS（N1 caveat 已补、N2 报告已是 dot decimals 无须改、N3 path-less 跨午夜为固有限制）。不碰产品代码

- [x] ~~T33: 实验分支 — by activity 行程链过滤 timelinePath-only traces（B5 方案 A）~~ (09-15→09-15) [P2] — buildTripChain 内部过滤 `hasActivitySemantics !== false`（解析层 addSegment 设置标记）；三角 12,037/15,517 → 0/0、孤岛 0/0（推翻侦察 §5.2 误判的「15-20% 缺口」）、≈2h 假移动 19,891/22,701 → 75/75；ingle 216 全绿 + build + lint；Reviewer PASS；实验分支 `experiment/b5-livedata-overlap` fast-forward 并入 main；结果详见 docs/EXPERIMENT-B5.md

- [x] ~~T34: ARCHIVE 归档（Done 区 T1-T29 移入 ARCHIVE.md）+ 根 repo 游离文件清理~~ (09-15→09-15) [L1] — ①`docs/ARCHIVE.md` 新建，`## 2026-09-15 归档` 节收纳 **42 条**（T1–T29 含 T12.6/T13.x/T14.1-3/T16.x 等子任务，保留任务ID/标题/起止/关键结论一句）；②`docs/TASKS.md` Done 区只留 T30–T33（升序），旧任务全部剪走；③`TASKS.yaml` 已确认 done 条目保留、无需改动；④根 repo（opc-3.0）游离文件 `t31-timeline-mode.png` 已删除（未跟踪、无引用）。纯文档整理，无代码改动；无需 npm test
  - 验收: ①ARCHIVE.md 含 T1-T29 全条目（≥29 条）；②TASKS.md Done 区保留 T30-T33（旧任务全清）；③根 repo git status 不再显示 png；④无代码改动不跑 test
  - 档位: L1
  - 来源: CEO 盘点（2026-09-15）
  - 时间: 09-15 创建 → 09-15 Done

## ❌ Cancelled