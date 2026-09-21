# TASKS: Google Timeline Viewer

<!-- next: T53 -->

## 🔨 Doing（WIP ≤ 2）

## 📋 To Do

- [ ] **T-K1: 移动端适配** — **已提前立项 → T47（CEO 拍板 09-20 00:05）**；本条保留历史锚（原判据「等公开分享移动占比」已在 T47 卡内由 repo traffic 数据源承接）

## 📭 Backlog（上 = 优先）

> 三个 P1 项已于 09-17 拆卡：隐私断言机器化 → **T42**；流程修订落地 → **T41**；A10 验证脚本入库 → **T43**。

- [x] ~~[P1] **隐私断言机器化（Security Engineer 全员追认抓到的真缺口）**~~ → **已拆卡 T42**
- [x] ~~[P1] **流程修订落地：项目级文档补齐**~~ → **已拆卡 T41**
- [x] ~~[P1] **A10–A15 Retro 行动项**~~ → **已拆卡 T43**（A11–A15 已进 WORKFLOW，无需重复落地）

- [ ] [P2] 范围切换性能——Last year/All 预设全量重建 2.3s 单 longtask（4,593 stays + 12k 点重挂载）；一次性范围切换不阻塞发布，候选分块/异步重建（T37 附带发现）(09-16)
- [ ] [P2] 离线瓦片 / 自托管瓦片服务器 — 彻底消除瓦片请求隐私（→ PRD 不做）(09-13)
- [ ] [P2] 行程分享/导出（GeoJSON/KML）— （→ PRD 不做）(09-13)
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [x] ~~[P2] livedata 完整支持（新版 Timeline.json 语义段重叠合并）— activity 段继承 timelinePath 轨迹后，进一步评估 visit 段与 activity 段的关联展示（→ PRD 功能 3 延伸）~~ **(09-14→09-15 完成)** — 侦察（T32）证伪「visit↔activity 重叠」假设；真问题=timelinePath traces 混入 by-activity 链（23% 假移动）；实验分支（T33）验证方案 A 净改善（三角归零+零孤岛），已 merge；分析见 docs/RESEARCH-B5.md，结果见 docs/EXPERIMENT-B5.md
- [x] ~~[P2] raw 点渲染性能压测 — A1 遗留：RAW_POINT_CAP=20000 整量渲染 1.5 万+ CircleMarker 潜在卡顿~~ **(09-14→09-16 完成)** — T37 真实 15k 窗口压测放行：无卡顿无需降 cap；报告 DATA-FINDINGS §10

## ✅ Done

- [x] ~~T47: 移动端适配立项（盘查 + 数据源采集 + 子卡拆分）~~ (09-21→09-21) [P1] — 先侦察不急于写全：① `scripts/mobile-audit.mjs` 新建（Playwright 390px 视口全路由盘查：overflowX / 页面几何 / 字体 / 触摸目标 / 侧栏 / 地图容器），产出 `docs/records/mobile-audit/2026-09-21.md`；② `scripts/repo-traffic.mjs` 新建（GitHub API traffic 采集），产出 `docs/records/repo-traffic/2026-09-21.md`；③ `docs/T47-SUBTASKS.md` 拆分子卡方案（3 个子卡 P1/P2/P3 排序）。**盘查结论**：布局层面已就绪（T24 断点覆盖充分），唯一 P1 问题 = 触摸目标尺寸不足（6 nav-link 29px < 44px + Settings 页 2 按钮 < 44px）；无 overflowX / 布局错位 / 字体过小。子卡：T47.1 触摸目标修复（L1，CSS 3 行）→ T47.2 脚本入库 → T47.3 PRD 入册。**A17 绝对锚点**：所有断言含与视口/祖先的绝对关系（min-height >= 44px、overflowX == 0px、|center - vpCenter| <= 1px）。**255 tests + 4 skip / lint 0 error / build 全绿**。**标准项: N/A（无新增运行时面，smoke 覆盖存量）**。
   - 档位: L2（盘查 + 脚本 + 方案）
   - 冒烟: 通用（lint + test + build）——无新增运行时面
   - 指派: Dev
   - 来源: 09-13 KIV T-K1 → 09-20 CEO 提前立项
   - 时间: 09-20 创建 → 09-21 Done

- [x] ~~T47.1: 触摸目标修复（P1, L1）~~ (09-21→09-21) — CSS 3 行：`.site-nav-link` + `.btn-primary` + `.theme-btn` 各加 `min-height: 44px`（WCAG 2.5.5 触摸目标 ≥44px）。255 tests + 4 skip / lint 0 error / build 全绿。**标准项: N/A（无新增运行时面，smoke 覆盖存量）**。NOTES 追加。
   - 档位: L1
   - 冒烟: 通用（lint + test + build）
   - 指派: Dev
   - 来源: T47 盘查 → T47.1（P1 子卡）
   - 时间: 09-21 创建 → 09-21 Done

- [x] ~~T47.2: mobile-audit 脚本入库 + SMOKE-CHECKLIST 更新（P2, L1）~~ (09-21→09-21) — 盘查脚本 `scripts/mobile-audit.mjs` 已入库到 SMOKE-CHECKLIST + 模板同步。255 tests + 4 skip / lint 0 error / build 全绿。**标准项: N/A（无新增运行时面，smoke 覆盖存量）**。NOTES 追加。
   - 档位: L1
   - 冒烟: 通用（lint + test + build）
   - 指派: Dev
   - 来源: T47 盘查 → T47.2（P2 子卡）
   - 时间: 09-21 创建 → 09-21 Done

- [x] ~~T47.3: PRD 移动端适配章节入册（P3, L1）~~ (09-21→09-21) — PRD 新增「移动端适配」章节（当前状态盘查结论 + 子卡计划表 T47.1/T47.2/T47.3 + A17 绝对锚点纪律）+ 修订历史 v1.25。255 tests + 4 skip / lint 0 error / build 全绿。**标准项: N/A（无运行时触达，纯文档改动）**。NOTES 追加。
   - 档位: L1
   - 冒烟: 通用（lint + test + build）
   - 指派: Dev
   - 来源: T47 盘查 → T47.3（P3 子卡）
   - 时间: 09-21 创建 → 09-21 Done

- [x] ~~T52: Collection/Bookmark（date range 收藏，关联 filename）~~ (09-21→09-21) — L2：① `src/lib/collections.ts`（localStorage CRUD，filename 隔离 key `collections_{filename}`，边界安全降级）② `src/components/CollectionPanel.tsx`（收藏按钮 + label 输入 + 列表展示 + 加载/删除）③ i18n en/zh 各 8 key ④ CSS ⑤ TripsPage + PlacesPage 集成 ⑥ 17 单测 + lint + build 全绿（272 tests + 4 skip）。**验收**: ①collection 关联 filename ✓ ②加载 collection 自动设置 DRR ✓ ③切换 timeline 自动切换上下文 ✓ ④归档记录补齐 ✓。**标准项: N/A（无新增运行时面，smoke 覆盖存量）**。NOTES 追加。
   - 档位: L2
   - 冒烟: 通用（lint + test + build）
   - 指派: Dev
   - 来源: 用户反馈（2026-09-21）
   - 时间: 09-21 创建 → 09-21 Done

- [x] ~~T46: 内容页水平居中修复——merge/help/settings 根容器缺 `margin: 0 auto`~~ (09-19→09-19) [P1] — 用户实测「merge, guide, settings content 没有在中间」。根因：`.page-help`/`.settings-page`/`.merge-page` 均 `max-width: 780px` 但无 `margin: 0 auto` → `.page` 普通 block 在 `.app-main`（可用宽 1060px）内左对齐、右侧空 ~280px；Landing 子块全带 margin auto 故居中，仅三个内容页偏左。**T44 只断言互等未断言居中**（两页同偏左故 PASS）——T45 D-1「布局核对」首次实战。修复：index.css 三处各加 `margin: 0 auto`。脚本 `smoke-merge-layout.mjs` 断言升级：三页（merge/settings/help）几何互等 + 每页水平居中 `|center−viewportCenter|≤1` + **每页 overflowX 强制项**（Reviewer 建议 3）。**验证全绿**：lint ✓ / **250 tests + 4 skip** / build ✓；smoke **22/22 PASS exit 0**——desktop left **190→330**、center 720==720 真居中；mobile left 20、center 195==195；0 pageerror（1 已知 CSP 噪音）/ overflowX 0px×6 / 零残留。截图 4 张 `docs/screenshots/center-*-t46.png`。**Reviewer PASS**（0 致命/0 严重/2 一般/1 建议，全消费：shot-t46.mjs 泄漏 vite pid 44636 已 taskkill、NOTES 措辞收窄、next 指针→T47、overflowX 逐页化）；NOTES L1574-1582。
   - 档位: L1（CSS 3 行 + 脚本断言扩展）
   - 冒烟: 布局核对（§D D-1）+ 通用（lint/test/build + smoke 双视口）
   - 指派: Dev + Reviewer
   - 来源: 用户实测反馈（2026-09-19）
   - 时间: 09-19 创建 → 09-19 Done（未提交）

- [x] ~~T48: 合并页下载文件名旁侧显示文件大小~~ (09-20→09-20) [P2] — L1 产品候选消化：MergePage 合并完成后从 Blob.size 计算文件大小，以 `filename.json (XX MB)` 格式显示在成功信息下方。新增 `formatBytes` 工具函数（B/KB/MB/GB 四档，1 位小数）+ `fileSize` state。255 tests + 4 skip / lint 0 error / build 全绿。**标准项: N/A（无新增运行时面，smoke 覆盖存量 merge 页）**。NOTES 追加。
   - 档位: L1
   - 指派: Dev
   - 来源: 09-19 To Do 候选（用户评估后开卡）→ 09-20 CEO 拍板直接消化
   - 时间: 09-20 创建 → 09-20 Done

- [x] ~~T45: 冒烟纪律补「布局核对」~~ (09-19→09-19) [P1] — T44 教训落地：D 类冒烟含布局核对。①项目 `docs/SMOKE-CHECKLIST.md`：头部教训行补 T44 + 类别速查 D 行→「文档/配置/部署/布局」+ 触动词「新增页面·路由·布局容器语义」+ §D 新增 **D-1 布局核对**（双视口页面几何与同族一致 / 路由容器语义（地图全屏无 footer vs 标准列+footer）/ 无 overflowX / 相邻 margin+导航高亮，逐项标可复现或人工项）+ 通用必验补适用前提框；②模板 `templates/project/docs/SMOKE-CHECKLIST.md`：同步项目版领先内容（可复现入口表前移、隐私机器断言段补单一源+校准双探针+退出码、A12 量化、N1 封印脚本引用、提交附注格式）+ 同款 D-1（不写死项目路由，通用表述）；③公司 `.agents/skills/opc-workflow/WORKFLOW.md` 规则 5：类别定义句补「D 文档/部署/布局——D 类含新增页面/路由的布局核对」+ **另例**（T44 教训）：含新增页面/路由/布局容器语义变更的卡冒烟强制含布局核对（§D D-1），不因 L1 豁免。**Reviewer PASS**（0 致命/0 严重/0 一般/6 建议）：三层义务一致性核过（另例=第②层内与 Designer 例同构的定向缩小豁免，不碰第①层标准项）；全员过目窗口结论「可关闭（附条件）」。
  - **建议消费（CEO 验收轮，全消费）**：①项目版补适用前提框 ✓ ②WORKFLOW/模板「无运行时触达的 L1」→档位中立「任务」✓ ③全员窗口补 Designer 视角=视为已过（D-1 是流程纪律非视觉决策，语义锚 T44 经验，DECISIONS 记录）④T45 卡补基准区（见下行）⑤NOTES 裸行→标准小节头 ✓ ⑥TASKS KIV 重复段去重 ✓
  - 基准: 纯文档×3 文件（项目 SMOKE-CHECKLIST / 模板 SMOKE-CHECKLIST / WORKFLOW 规则 5），联动面: WORKFLOW 规则 5 三层义务 + A13 裁决基准 + A16 预算线；前提: 不新增类别字母、不改三层义务结构
  - 冒烟: D（文档）/ 标准项: N/A（无运行时触达）/ 开销: ~10min
  - 指派: Dev + Reviewer
  - 来源: T44 教训 + CEO 拆卡（2026-09-19）
  - 时间: 09-19 创建 → 09-19 Done（未提交）

- [x] ~~T44: merge 页布局修复——居中 / Footer / margin 对齐~~ (09-18→09-19) [P1] — 用户实测反馈 `/app/merge` 贴左、无 footer、顶距 0。根因：`Layout.tsx` `isApp = pathname.startsWith('/app')` 把 `/app/merge` 误判为地图全屏页（`.app-main--app` = padding:0/无居中/overflow:hidden）+ `!isApp` 隐藏 Footer；T36 上线仅验证功能路径、D 类冒烟只查 pageerror 不查视觉（CEO 验收漏项）。修复：`isMapPage = pathname === '/app' || pathname === '/app/places'`（`startsWith('/app')` 全仓唯一使用点，Header NavLink 全 `end`、RouterBridge 无依赖，无连锁）。**250 单测（+4 Layout.test）** + lint + build 全绿。验收证据：`scripts/smoke-merge-layout.mjs`（T44 回归脚本）双视口 **14/14 PASS**——merge 与 /settings **严格几何相等**（desktop left=190 top=97 width=780; mobile left=20 top=97 width=350）+ footer 存在 + Trips/Places 仍全屏无 footer + 0 pageerror/0 overflowX；截图 `docs/screenshots/merge-page-{desktop,mobile}-t44.png`。**Reviewer PASS-WITH-CONDITIONS**（Windows 服务清理 + T39 假信号复核）。**副产品（大收获）**：诊断「Windows 起 web 服务常 stuck/timeout」——负 pid 进程组 kill 在 Windows 恒 ESRCH 无效（Reviewer 对照探针 + 现场 6 孤儿 vite 实证）、detached 子进程 stdio pipe 挂住事件循环（须 process.exit 兜底）、spawn('npx') ENOENT、URL.pathname POSIX 路径、ANSI 色码打断解析、.ps1 执行策略——规范落公司根 `docs/HOWTO.md` §12；**PASS 消费轮（Dev）**：①smoke-merge-layout/race-check 停服改 Windows 有效清理（`taskkill /PID /T /F` + 正 pid SIGKILL 兜底，POSIX 分支保留）+ 注释去「零残留」不实宣称 + race-check 补 npx/路径/ANSI Windows 兼容；复测两脚本 exit 0 且残留 vite 计数 0；②T39「故障注入零残留」旧记录 = Windows 假信号（`kill(-pid)` no-op + `pgrep` 非 Windows 命令），复核结论追加 NOTES 不改历史；③Layout.tsx 尾换行补齐。NOTES 追加 L1536-1569。
  - 档位: L1
  - 指派: Dev + Reviewer
  - 来源: 用户实测反馈（2026-09-18）
  - 时间: 09-18 创建 → 09-19 Done

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

- [x] ~~T38: 发布前收尾——README/Landing/i18n 过时表述 + 双视口末轮冒烟~~ (09-16→09-16) [P1] — T35（单文件化）+ T36（合并已实现）后清理发布门面过时表述：README L117「多文件可一次性合并导入」→「每次导入一份」、L126「全选后自动合并」→ 引导合并归档页、L166 架构图「多文件合并」→「单文件解析」+ 新增「合并归档（独立 Worker）」铭文；i18n 三处（`help.formatsTip`/`faq.a2`/`faq.a3`）「规划中/planned」→ 已实现（合并页），且**刻意删掉「dedup」字眼**（T36 语义=语义段取最新+raw 累积，非通用去重，守住不夸大）；全仓 grep `多文件|合并导入|一次性导入|planned|规划中` **零命中**。双视口冒烟 19 项×2（desktop 1440×900 + mobile 390×844）0 pageerror、真实跑通 merge worker（prod 构建 chunk `.merge-ok`）；243 单测 + lint + build 全绿。Reviewer PASS（一般级 N1：mobile `_leaflet_pos` 竞态**复现率 3/4** 与「偶发」旧记录不符，待 CEO 发布前复核——见 DECISIONS；建议级：README 架构图 Merge Worker 仅文字可选加框、en formatsTip "monthly" 措辞与 zh 统一、L166 右边框 1 列偏移、CSP frame-ancestors meta 无效已知记录）
  - 档位: L1
  - 指派: Dev + Reviewer
  - 来源: CEO 发布前核对（2026-09-16）
  - 时间: 09-16 创建 → 09-16 Done（commit `ba6090c`）

- [x] ~~T39: 发布前终批——N1 mobile 竞态修复 + Landing 第 4 卡（合并归档）~~ (09-16→09-16) [P1] — **N1（发布阻断）**：真根因 = Leaflet `_onZoomTransitionEnd` 250ms setTimeout 在 `map.remove()`（删 `_mapPane`）后触发（栈 `_onZoomTransitionEnd→_move→_getNewPixelOrigin→_getMapPanePos→getPosition(undefined)`），抛出窗口「重新导入→立即导航离开」（unmount 时 zoom 动画未结束）。修复 = unmount cleanup 置 `map._animatingZoom=false`（纯字段复位，非 map 方法——守 T27 `map.stop()` 白屏教训），timer 首行守卫变 no-op。**Reviewer REJECT 打回**（同族竞态 Places 漏覆盖：`RadiusCircle` L73 `fitBounds(animate)` + 中间 zoom Δ≤4 → 点地图 → 跳 Merge 复现 6/6）→ 抽共享 hook `useResetZoomAnimOnUnmount`（`src/src/lib/`），Trips FitController + Places 常驻 `ResetZoomAnimController` 双视图同挂；Places 6/6→0/6 pageerror + smoke/whammy 全 0 + 封印脚本 `scripts/smoke-race-check.mjs` 入库（SMOKE-CHECKLIST B 段发布前必跑）。**Reviewer 复验**：脚本 S1 server 泄漏→门禁假信号（kill 只杀 npx 子进程残留）+ G1 runError 吞败 → 修复（`--port 0` OS 分配 + stdout `Local:` 解析 + `detached` 进程组 kill(-pid) 全路径 + runError 计败 + navAt<250ms 判据）→ Reviewer 终验 **PASS**（故障注入 exit 1 零残留、正常 exit 0、A 6/6 真实踩窗、产品零改动、243 单测 + lint + build 全绿）。**Landing 4 卡**：`f4Title/Text` en/zh（en "Merge exports, keep it all" / zh 合并归档，只留一份——无 dedup 不夸大）+ featuresTitle「四个能力」+ CSS 4/2/1 列响应式 + PRD 功能 7 同步 v1.24 + 双视口 4 卡 0 overflowX/0 pageerror。**验收通过**；建议项记录待后续（WIDE 阈值负载脆→页内 performance.now 测净时序 / SIGKILL 后复核）。
  - 档位: L2（bug 修复 + UI）
  - 指派: Dev + Reviewer
  - 来源: T38 Reviewer N1 + CEO 拍板（2026-09-16）
  - 时间: 09-16 创建 → 09-16 Done（commits `7df39ae` → `c134bd0`（REJECT 补 Places）→ `185b6ed`（封印脚本 S1/G1））

- [x] ~~T40: 发布——GitHub Pages 部署 + 线上验证 + 打 tag + 发布记录~~ (09-16→09-16) [P0] — push main 自动触发 `deploy.yml`（lint → 243 单测 → build → upload → deploy-pages）**success**（run 35056682330，HEAD `1c9ca2e`）。线上验证（双视口 playwright 冒烟 14/14 PASS）：Landing 4 卡（Trips/Places/Privacy/Merge）+ 双视口 0 overflowX + hash 路由可达 + 0 pageerror（仅已知 CSP `frame-ancestors` meta 噪音，已有 DECISIONS 记录）；bundle 特征确认 = T39 终版（`Merge exports, keep it all` / `_animatingZoom` 复位）。CHANGELOG 补 **v1.0.0** 发布段（Added: 合并归档页 / Landing 4 卡 · Changed: 单文件导入 + 不确定进度 / i18n 同步 · Fixed: zoom 竞态根治 + 性能复测）；tag `v1.0.0`；DECISIONS 记录。发布地址 `https://coderkk.github.io/google-timeline-viewer/`
  - 档位: L1（部署 + 验证 + 记录）
  - 指派: CEO + Dev
  - 来源: 用户拍板「发布」（2026-09-16）
  - 时间: 09-16 创建 → 09-16 Done

- [x] ~~T41: 流程修订落地：项目级文档补齐~~ (09-17→09-17) [P1] — ①`docs/release-runbook.md` 落地（模板 + 项目适配：deploy.yml 自动部署链、T42 privacy job / T43 smoke-release.mjs 后续引用、截图核对接 COPY 表）；②`docs/COPY.md` 落地：**10 条主张登记**（隐私段 1-4 强制：坐标不出设备 / 本地处理不上传 / 瓦片请求明示 IP+bbox / Google Maps 外链 opt-in；另 6 条 = 单文件导入 / 四格式 / 合并归档 / Landing 4 卡 / 导出护栏 / 默认近 30 天）+ 术语表 6 组对照 + 截图表 10 张；③活 bug：`data.filesSuffix` 死键（唯一消费方 = DataBar `dataFileCount>1` 死分支）en/zh 双 catalog 删除 + `dataFileCount` 全字段清除（store 接口/初始/set×3/DataBar selector/ImportPanel mock），保留 1 档展示路径；全 repo grep `filesSuffix|dataFileCount|moreFiles|more files` → src/ 零命中（仅余 3 处历史文档追溯非死代码）。**243 单测 + lint + build 全绿**；冒烟 D+通用：preview + Playwright sample/user 双路径 DataBar 单文件名、无「+N more」、0 pageerror。截图核对如实标注：T41 无图像识别能力 → 全 10 张「待人工核对」，其中 **6 张**按 git 时间线标「疑似不一致」（`landing-full` / `trips` / `trips-activity` / `places` / `mobile` / `help`；早于 T30/T35/T36/T38/T39），发布前须人工重截（已入 runbook 硬条件）。**【09-17 G3 复核定死】6 张为准**：原 COPY 表只标了 5 张（漏 `mobile.png`）；`mobile.png` 以生成该图的精确 commit `2151b9d` 重渲染实测坐实——该 commit 下 390×780 `.drp` h=547 含整月内联日历（`hasWeekdays:true`），现版 h=73 紧凑 trigger 无日历，像素差亦偏向旧版
  - 验收: ①runbook/COPY 落地且 COPY 登记与实际主张一致；②i18n 无残留键 + 死分支清除（243 单测 + lint + build 全绿）；③冒烟 D 类（文案/截图核对）+ 0 pageerror —— **全过**
  - 冒烟: D + 通用
  - 指派: Dev + Reviewer
  - 来源: 2026-09-16 流程修订（Reviewer G7）+ CEO 指令「宣言/流程同步到项目 repo」
  - 时间: 09-17 创建 → 09-17 Done（尚未提交）

- [x] ~~T42: 隐私断言机器化（network-tap）~~ (09-17→09-17) [P1] — 设计 `docs/DESIGN-T42.md`（Security 出网面盘点 N1–N8 + 牙①②③裁决：默认拒绝 / 自定义瓦片源 = 用户显式 opt-in 例外不进动态白名单 / privacy job 结构硬门禁）。交付：①`scripts/privacy-allowlist.json` 单一机器源（self + OSM tile + blob:/data:/about:/file: + policy 三硬化断言：无 query / 无 payload / CSP connect-src 无 host token）；②`scripts/smoke-network-tap.mjs`（Playwright **零新依赖**，双视口 1440×900+390×844 × S1–S8：landing→sample/OSM 瓦片爆发→settle→**fixture 真实导入走 worker**→places→merge→export blob 下载→settings/help/landing；逐请求裁決 ALLOW-SELF/ALLOW-TILE/VIOLATION-HOST/PATH/QUERY/PAYLOAD + 空转守卫 + 校准双探针 A/B + CSP 静态复核；退出码 0/1/2/3）；③`deploy.yml` 重写 build → **privacy**（下载 dist + python http.server + 跑 tap）→ **deploy**（`needs: [build, privacy]` = 牙③不可豁免）；④SMOKE-CHECKLIST 隐私段加可复现入口；⑤COPY #11/#12 两机器断言主张。**A1–A6 全过**：A2 默认配置双视口 exit 0（108 捕获全 ALLOW，OSM 瓦片 71 请求 ≈ zoom 4/5/12/13，tile 必达信号满足）；**A3 三态必红**（注入 `fetch('https://example.com/…')` → exit 1 列 `VIOLATION-HOST` → 还原 → exit 0）——**过程中抓到真 bug**：初版逐请求违例只进 `report.violations` 未进 `assertFailures` → 注入态假绿（verdict PASS/exit 0），三态必红暴露后修复闭环（量具自检价值实证，宣言原则 2）；A4 `--calibrate-only` exit 0；A5 `T42_VACUOUS_SIM=1` exit 1（空转守卫）；A6 exit 2（`T42_PROBE_A_URL=''` 校准量具坏）/ exit 3（死 base）可区分。C3 README「隐私声明」外部请求两例外（OSM 瓦片 + Google Maps 外链 opt-in）= allowlist 非 self 面，核对一致。**243 单测 + lint + build 全绿**（scripts/ 零新增依赖）
  - 验收: ①本地默认配置跑 tap 0 违例（A2 ✓）；②注入违例 URL 非零退出（A3 ✓，且抓到假绿真 bug）；③deploy.yml privacy job 存在且 deploy 依赖它（B1/B2 ✓）；④Security 评审通过（硬门禁，待 Reviewer/Security 本轮）
  - 冒烟: D + 通用
  - 指派: Dev（Security 设计前置已完）
  - 来源: Security Engineer 全员追认抓到的真缺口（2026-09-16）；设计 `docs/DESIGN-T42.md`
  - 时间: 09-17 创建 → 09-17 Done（尚未提交）

- [x] ~~T43: A10 验证脚本入库~~ (09-17→09-17) [P1] — ①`scripts/smoke-release.mjs`（新，RELEASE-SMOKE v1）：T38 双视口冒烟从 `scripts/out/gh-live-smoke.mjs` 收编——`--base <url>` 本地 build / 缺省 live URL；**self origin 运行期派生**（origin match 断言）；双视口 1440×900+390×844 × 9 项 = 18 项（landing 200 / 4 卡 / title / tags / CTA / help 路由 / overflowX / 0 pageerror 显式断言，过滤已知 frame-ancestors 噪音）；退出码 **0=全过 / 1=断言失败 / 2=运行错误**（断连快速失败）；结构对齐 smoke-network-tap.mjs；零新依赖。②`src/src/components/DataBar.test.tsx`（新）：三态 label 锁定（sample / unnamed / fileName），+3 单测。③SMOKE-CHECKLIST 头部「可复现入口」指引 + 每条勾选项标注脚本命令或**如实标「人工项」**（截图核对/视觉确认/真数据体感/肉眼比对，诚实原则）；runbook 线上冒烟改指 `scripts/smoke-release.mjs`。**验证**：本地 build+preview exit 0、18/18 PASS、0 pageerror（仅既有 CSP 噪音）；负向校准死端口 exit 2 / 无 `.feature-card` 最小页 exit 1；live 模式 exit 0；246 单测 + lint + build 全绿。`scripts/out/gh-live-smoke.mjs` 为 git 跟踪历史产物，保留不删。**【09-17 Reviewer PASS 消费轮】**：G1 help route 改断 `.help-section` 选择器 + `page.url()` 尾 `#/help`（旧 `h1,.section-title,main` 遇坏哈希 route 会假绿；裸页 `<main><h1>not the app</h1></main>` 负向校准 help route **必 FAIL** ✓）；G2 SMOKE-CHECKLIST「0 pageerror」条归因去假（tap 只注册 dialog/request、**不判 pageerror**；全旅程页面 0 pageerror = 人工项兜底，第 32 行 + 第 67 行同行皆有此误、均已修）；S2–S6：CLI 支持 `--base=<url>` 等号形式，缺值/未知参数/非 http(s) URL → usage 报错 exit 2（不再静默回落 live URL）、landing 200 显式 `status()===200`、hero CTA hidden = FAIL、pageerror 过滤后逐行打印被忽略行；**S1 `data.unnamed` = CEO 裁决保留**（`dataLabel===null` 防御性死分支 + DataBar.test.tsx 对应用例，文档化防御、无害，不删）。
  - 验收: ①smoke-release.mjs 落 `scripts/`（非 out/）✓；②本地 build + preview 冒烟 exit 0、0 pageerror（已知噪音除外）✓；③SMOKE-CHECKLIST 头部「可复现入口」指引 ✓；④Reviewer 确认（待本轮）
  - 冒烟: D + 通用
  - 指派: Dev + Reviewer
  - 来源: 2026-09-16 v1.0.0 发布 Retro（A10 → WORKFLOW 规则 16）
  - 时间: 09-17 创建 → 09-17 Done（尚未提交）

## ❌ Cancelled