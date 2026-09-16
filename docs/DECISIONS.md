# Decisions

> 决策日志（追加式）。格式：`## YYYY-MM-DD HH:mm — 主题` + `决定: ... 理由: ...`

<!-- 示例：
## 2026-09-12 15:40 — 登录方案
决定: 用 JWT，不用 session。理由: 前后端分离，JWT 更简单。
-->

## 2026-09-14 14:30 — T13.3 验收通过
决定: Trips 轨迹缝合改进 + 路线点显示验收通过，部署上线。理由: 中途行程缝合从"端点≡首末点"改为"子段接近匹配"，16:15/16:42/17:57 三类中途行程实测修复；路线点渲染限 5000 点预算，97 测试全绿。

## 2026-09-14 16:20 — 双文件数据研究（rawSignals / 时区 / 合并）
决定: 第二份真实导出 Timeline-20250213.json 与现有导出 schema 一致（Android 导出 = Takeout 同一新版扁平格式）；rawSignals 为滚动 ~29 天窗口不可恢复（semanticSegments 永久）；两文件同段可精确对齐；时区分组错日确认为真实缺陷。理由: 领域知识建档 DATA-FINDINGS.md，指导后续解析器修复与合并策略。

## 2026-09-14 17:00 — PRD v1.6: rawSignals 与时区 bug 定性
决定: ①rawSignals 解析 = 功能 1 声明格式的半兑现 → 修，PRD 功能 1 补验收项；②时区分组 bug = 功能 2 显性缺陷 → 修，不入「不做」；③merge 去重 = PRD「不做」明确排除 → 保持 Backlog（跨设备多 Takeout 合并去重），不随 bug 混修。理由: PRD 核对结论——rawSignals 字段名在功能 1 中声明、验收未强制；时区错误违反功能 2 验收语义；merge 是已排除的新功能。

## 2026-09-14 18:30 — T13.6 / T13.7 验收通过
决定: rawSignals 解析接入（T13.6）与本地时区分组修复（T13.7）验收通过，代码可提交部署。理由: Review 首轮打回 S1（TripsPage 漏接 data.points 使 UI 渲染为死代码）→ Dev 补 prepareTripsForData 接线 + 链路断言 → 复验通过；真实导出 raw 点精确入库（11773/15479）、2025 文件 17284 段 UTC 错日全修正、112 单测 + build + lint 全绿。遗留 A1（1.5 万点渲染性能）与 A2/N1-N5 记录不修，A1 转 Backlog 发布前压测。

## 2026-09-14 20:00 — T14 验收通过 + 衔接线边界拍板
决定: ①Trips 时间线连续轨迹（T14）验收通过，代码可提交部署；②衔接线边界：仅 `gapMs > 0`（纯时间口径）补桥，时间重叠段不补（并行记录，补线会伪造连续移动），不引入距离闸门。理由: 用户痛点「多段独立 trace 断开杂乱」已解决——段按 startMs 排序 + 段间浅灰虚线衔接（tooltip 标注真实 gap），119 单测全绿、livedata 最忙日 31 段 4 桥验证；Reviewer 有条件通过（无 S 级），N1（60s 含界消歧）已修，A1 边界记入 DATA-FINDINGS §7。交通方式筛选不纳入（用户确认：不做筛选，改轨迹连续）。

## 2026-09-14 14:55 — T14.2 双闸门撤销：衔接线改「跟時間連」纯时间口径
决定: 撤销 T14.2「时间 or 距离双闸门」（gapMs≤0 且端点点距>1000m 跳过），衔接线改纯时间口径——时间排序后的**所有**相邻段一律建桥，示例 12:42→13:45→13:54→14:00→15:00→15:15→16:00→16:35 端点逐点相接；不再因类型不同/时间重叠/端点点距远而跳过（仅保留「可视端点完全重合」退化对免桥，本就无缝）；「跟種類連」模式（仅同类型段相连）作为可选 enhancement 入 Backlog 待定。理由: 用户两轮实测确认要的是「跟時間連」——跨类型与时间重叠恰是换乘/粗粒度占位段的常态（移動 14:00-16:00 与驾车 13:54-15:00 重叠 1h、端点 66.7km，实际是同一行程的粗/细双重记录，用户要求照连）；T14.2 的「重叠且远=并行记录不连」在 CEO 真实数据复现中被证伪——2025-01-30 全天 9 个被跳过相邻对全部是 移動↔驾车/步行 跨类型，正是用户抱怨的断口；虚线 + tooltip「衔接 +N 分钟」已诚实表达无直接轨迹记录，无需再删桥。

## 2026-09-14 15:20 — T15: Trip 时间轴视图（纯 GPS 轨迹）
决定: 默认 Trip 视图改为纯时间轴——所有 rawSignals（GPS 点）按时间排序连成一条线（单色），停驻点用不同颜色标记，移动点 tooltip 显示 GPS 坐标；无 activity type 着色、无 bridge lines、无 gapMs。可选「按活动类型」视图（切换开关）保留 T14.3 行为。理由: 用户反复反馈「跟時間連」的本质是看「几点到了哪里」的纯时间线，bridge lines 方案（T14 系列）偏离了这一核心诉求。rawSignals 是真实 GPS 记录，比语义段更直接地反映时间线。

## 2026-09-14 17:15 — T16: 时间轴路线回退语义段（修正 T15 的「纯 rawSignals」假设）
决定: 时间轴模式（默认视图）的路线不再只依赖 rawSignals——按本地日分桶：当日 raw≥2 用 raw，否则用该日 semanticSegments 的 timelinePath 轨迹拼接；summary 诚实标注来源（原始点 / 轨迹点（行程段）/（GPS+行程段））；「轨迹点」开关只控圆点、不隐藏路线。理由: T15 的「纯 rawSignals」假设被数据证伪——Google raw 只保留 ~30 天，2025-01-30 无 raw 点，时间轴模式显示「0 原始点」且地图无路径，但该日 semanticSegments 有 33 段完整轨迹；用户明确需求是「选一段时间就要能看到去过哪、路径怎么走」，不能因数据保留窗口而空白。按日分桶（而非简单「全区间有 raw 就用 raw」）兼顾近 30 天原始精度与旧日期可回退，且规避段间时间重叠导致的乱序。不改默认模式、不新增第三种视图——回退对用户透明。

## 2026-09-14 18:15 — T16.1: 时间轴「每个路径点都显示」（点跟随路线，不跟随 rawSignals）
决定: 时间轴模式的圆点集合从 `rawPoints` 改为 `route`（`TimelineVertex[]`）——每个路径顶点都画一个点，按时间排序后连线；raw 顶点带 `timestampMs`（tooltip 显示时间），语义段顶点无逐点时间（tooltip 标「行程段轨迹」，不伪造时间）。理由: 用户指出 2025-01-30 时间轴只见 13 个停留点、而「按活动类型」有 165 个路径点——「每個點都是走過的痕跡，時間軸要把全部點放出來」。T16 只把语义段接进了折线，点没跟上，属实现遗漏。语义段导出不含逐点时间，故不插值伪造（诚实原则，同 bridge tooltip 口径）。「轨迹点」开关恢复为 timeline 模式有 route 即显示（点已存在，开关有效）。

## 2026-09-14 18:45 — T16.2: 停留点独立配色 + 每点可点击看 GPS/开 Google Maps
决定: ①停留点（visits）不参与时间轴连线（本就独立 marker），marker 颜色由蓝改红 `#ef4444`（选中琥珀 `#f59e0b`），与蓝色路线明确区分；②每个点可点击查看 GPS——路线顶点点击弹 popup（坐标 + 时间/「行程段轨迹」+「在 Google Maps 開啟」链接），停留点 tooltip 亦带坐标与链接且链接可点。实现用单一共享 popup（`map.openPopup` + 真实 DOM，非 HTML 字符串）而非每顶点挂 `<Popup>`，以承受数万顶点的路线。理由: 用户指出停留点与路线同蓝难分辨、且「每個點都可以點擊看 GPS，那裡有鏈接進 google map」；canvas 圓點不觸發 DOM hover，原 hover tooltip 實際無效，改 click popup 才可靠。語義段頂點無逐點時間，popup 誠實標「行程段軌跡」，不偽造。

## 2026-09-14 19:25 — T17: 路径点时间 + 轨迹去重 + 左侧时间线
决定: ①解析 `timelinePath` 的逐点 `time` 并贯通到路线点（`PathPoint`/`TimelineVertex`），popup 显示真实经过时间——语义段导出确有逐点时间，先前丢弃属实现遗漏；②时间轴路线改为「raw 点 + 语义段路径点按时间排序合并，raw 已覆盖的段跳过、连续重复点折叠」——根治「線很多」（T13.2 縫合把同一 timelinePath trace 复制进 activity 段，旧逐段拼接会画两次）；③marker 加大；④Trips 左侧在时间轴模式显示时间线列表（点+停留按时间排序、按日分组、可点飞），不再只列停留点。理由: 用户要「知道我經過那地方時是幾點」，且左邊要是時間線而非只有 13 個停留點；无时间的路徑点仅用段内插值作排序键、不显示时间（不伪造）。

## 2026-09-14 19:40 — T16–T17 验收通过（用户确认）
决定: T16（时间轴路线回退语义段）/ T16.1（每个路径点都显示）/ T16.2（停留点独立配色 + 每点点击看 GPS/开 Google Maps）/ T17（路径点真实时间 + 轨迹去重 + 大 marker + 左侧时间线）全部验收通过，代码可提交部署。理由: 用户确认「現在我可以回想我旅行的時間和路線」——核心诉求（选一段时间就能看到去過哪、路徑怎麼走、幾點經過、連結開 Google Maps）已满足；真实 123.4MB 文件实测 2025-01-30 由「0 原始点、无路径」变为「115 轨迹点（行程段）+ 13 停留 + 左侧 122 条时间线」，popup 显示真实经过时间（如 2025-01-30 11:10），重复轨迹已折叠；2026-08-01 raw 窗口无回归（537 轨迹点 = 523 raw + 14 补点）；141 单测 + build + lint 全绿。

## 2026-09-15 09:50 — T20–T25 验收通过（Dev→Reviewer 两轮修正后 PASS）
决定: T20（外链隐私）/T21（coveredByRaw 按顶点）/T22（跨午夜标注+裁剪）/T23（渲染性能）/T24（移动端）/T25（GeoJSON/KML 导出）验收通过，可提交部署。理由: 流程改为 Dev 执行 + Reviewer 审查（不再由 CEO 直接写码）；Reviewer 首轮 PASS-WITH-CONDITIONS（S2 T23 vs PRD 冲突、S3 activityType 未裁剪），第二轮抓到 S3 修正被 `length>=2` fallback 抵销而 FAIL，Dev 三处 fallback 修为 `>0` + 回归测试后 **PASS**；167 单测 + build + lint 全绿。S2 决策：改 PRD（功能 3 加「zoom≥6 才画圆点，低 zoom 只画折线」+ v1.17），不改实现（避免 30k 点秒级冻结回归）。S3 决策：补 activityType 裁剪（PRD 验收未限定模式）。T20 补了 PlacesMap 的裸外链缺口（Security 阻塞项）。遗留：README 修复排最后（等 UI 定稿）。

## 2026-09-15 11:45 — T27/T28 验收通过（Dev↔Reviewer 四轮后 PASS）
决定: T27（行程统计报表，功能 11）/ T28（多语言 EN/简体中文，功能 12）验收通过，可提交部署。理由: Dev 执行 + Reviewer 审查；Reviewer 首轮 PASS-WITH-CONDITIONS（S3 store 内已解析字串不随语言切换；A1 活躍天数未裁范围；A2 距离口径随模式；A3 截断单位错 100×）→ Dev 修 → 二轮又抓到 `segmentsDistanceKm` 的 `>=2` fallback 与渲染器 `>0` 不一致 → Dev 修 → 三轮 Reviewer 抓到 Dev 为 N1 加的 `map.stop()` 造成「收起面板白屏」**致命回归（FAIL）** → Dev 回退 → 四轮 **PASS**。190→191 单测 + build + lint 全绿。决策：S3/A1/A2/A3 必修；A2 采「距离口径随模式」（各用该模式绘制几何，sample 8236 vs 8124 km）；A4（同名不同地合并）/A5（worker 未知警告模板）/N1（Leaflet `_leaflet_pos` 既有噪音）记录接受，不修。i18n：自建轻量 catalog（无新依赖）、默认跟随浏览器语言（zh*→中文，其余→English）、设置页手动切换、**不持久化**（维持隐私承诺）。遗留：`SAMPLE_LABEL`/`COORDS_PRIVACY_NOTE`/旧 zh helper 死码待清。

## 2026-09-15 12:20 — T29 行程链（功能 13）验收通过
决定: T29「行程链（visit↔activity 关联）」验收通过，可提交部署。范围（CEO 定调）：MVP **只做「按活动类型」模式**（该模式已有离散、带方式的移动段，配对语义最清楚；「时间轴」的前后轨迹延伸留待后续）。口径：visits 与 segments 依 startMs 排序（同时刻 segment 在 visit 前）取**紧邻前驱/后继**；距离沿 path haversine（`path.length>0` 否则 `[start,end]`，与渲染器/T27 一致）、时长 clamp 到 range。理由: 用户要「回想旅行的時間和路線」——把停留与前后移动串成行程日記。流程：Dev→Reviewer；Reviewer 首轮 PASS-WITH-CONDITIONS（S3 行动端 `.chain-move` 21px 触控回归、A1 PRD② 与实作不符）→ Dev 修（触控 44px、移动行补目的地、PRD 措辞收紧、chain 仅 activityType 计算、删 StopList 死码、补测试）→ **PASS**。202 单测 + build + lint 全绿。

## 2026-09-15 13:40 — T30 UI/UX 精修批验收通过（PRD v1.20）
决定: T30.1–T30.5 验收通过，可推送部署。内容：①**#2 bug** Header NavLink 一律 `end`——`/app` 不再前缀匹配 `/app/places`，导航只剩一个高亮；②**#1** `DateRangePicker` 改「紧凑按钮 + popover 双月历」——常驻一行（`当前范围 ▾`）不占垂直空间，点开双月历，Esc / 点击外部 / 完成双点 / 更换数据 自动关闭（`drp.clear` 不关）；③**#3** 导入后默认「近 30 天」——抽纯函数 `lastNDaysRange(maxMs, n)`（与快捷档同公式，active 状态天然一致），store 导入/示例成功时应用；④**#4** Places 默认半径 100 → **5 KM**；⑤联动 bug 修复 — `MapPane` 移除 `key={fitKey}`（TripMap 内部 FitController 已自行 re-fit）+ zustand `subscribe` 在 range/data 变化时清空 selected 三态（popover 双点选不再被 remount 打断、换窗丢弃越界选中行为不变）。理由: 用户反馈 5 项（DatePicker 占空间 / Trips+Places 同时高亮 / 默认近 30 天 / 半径默认 5KM / 时区讨论）。流程：Dev→Reviewer **PASS**（Places 双点选补验、z-index 分层实测 390px；3 条一般级放行：文件尾缺换行、popover 焦点陷阱待无障碍打磨、无数据态 presets 锚点 1970 沿用旧逻辑）。条规偏差：代码在 Reviewer 过审前已 commit（Dev 记入 NOTES，不改历史）。206 单测 + build + lint 全绿。

## 2026-09-15 13:40 — 时区决策：不做时区设置/换算（用户拍板「维持现况」）
决定: 时间一律按「本地时区（浏览器）」显示，**不做**时区设置、**不做**「当地时间」换算，分日分组维持本地时区。理由（数据实证）：`Timeline-20260820.json` 全档案 **97,382 笔 ISO 字符串 offset 恒为 +08:00**（Google 统一用账户主时区标签），真实当地时区另存 `startTimeTimezoneUtcOffsetMinutes`（台湾 480 / 日本 540；`timelinePath` 无此字段）；用户实证「墙钟时间 = 我在当地的体验时间」（如 ISO 写 `8:00+08` 实际是他记忆中的日本 8:00+09）。故本地时区显示＝墙钟＝体验时间，本就正确；且路线点无当地 offset 字段，「逐笔当地时区」不可完整实现。Designer 两轮咨询后亦翻转支持（首轮建议 C 逐笔当地，据数据改为 A+）。结论已写入 PRD v1.20 约束「时区」。

## 2026-09-15 20:40 — T31 验收通过（fallback 门槛口径统一）
决定: T31 验收通过：抽出 `MIN_PATH_LEN`/`hasPath`/`segmentPathOrEndpoints`/`MIN_POLYLINE_LEN`/`hasRenderablePath` 共用常量，6 处 `>0` 几何源选择与 4 处渲染层 `>=2` 闸门统一单一口径；解析层 `>=2`（缝合池）有意保留并注释差异。理由: 2026-09-15 retro A3，消除 `>=2` vs `>0` 两次回退根源（T20-25/T27）；211 单测 + build + lint 全绿；Reviewer PASS 零遗留（N1 措辞已同步）。

## 2026-09-15 22:20 — T33 验收通过：by-activity 行程链过滤 timelinePath-only traces（B5 方案 A merge）
决定: T33 验收通过，实验分支 `experiment/b5-livedata-overlap` fast-forward 并入 main。改动：解析层 `addSegment` 为 Segment 设 `hasActivitySemantics` 标记（判据 = activityRec ∥ activityType ∥ start/end 坐标任意存在），`buildTripChain` 内部用 `isActivityMovement()` 过滤（undefined 默认保留，兼容旧手写段）。timeline 模式零改动。
理由: livedata 全量验证——三角 12,037/15,517 → 0/0、孤立停留 0/0（**推翻侦察 §5.2 误判的「15-20% 缺口」**：量纲错误，链边是段去重计数不可与停留数相减）、≈2h 假移动 19,891/22,701 → 75/75、中位链时长 50.4/47.8 → 15.0/14.8 min；216 单测 + build + lint 全绿；Reviewer PASS 零遗留。用户拍板「修正在按活动类型就可以」。分析：docs/RESEARCH-B5.md；结果：docs/EXPERIMENT-B5.md。

## 2026-09-15 21:35 — B5 开「分支实验模式」+ T32 侦察验收
决定: ①B5 采用**分支实验模式**：main=对照组、`experiment/b5-livedata-overlap`=实验组，用户本地真数据对比后拍板 merge/关闭/取代码——替代无法做的 A/B（纯本地无埋点、无后端、隐私承诺）。规则：实验期宽松 Review、merge 门控走完整流程、>1 周未定提醒。②T32 侦察验收通过（commit c5c8d67，Reviewer PASS）。
理由: ①无行为数据可替用户决策，分支=人肉 A/B，最诚实的验证路径；②侦察发现（scripts/analyze-visit-activity-overlap.mjs，两文件全量）——visit 与 activity-keyed 段**零重叠**（干净时间分区，30,682/37,287 visits），T29 在此层面 100% 正确；**三角现象（~23% chain movements）全部来自 timelinePath-only traces**（2h GPS 窗口 ambient GPS），非 activity 段——B5 原设「visit↔activity 关联展示」问题在语义段层面**不存在**，真实盲区是 trace 段进链导致 duration/距离标签偏粗。

## 2026-09-16 08:00 — T35 验收通过 + 导入单文件化（PRD v1.22 / 功能 14 立项）
决定: T35 验收通过，可推送部署（Reviewer PASS）。①**导入 = 单文件查看器**：去除 `multiple`、多拖取第一份、Help/FAQ 文案单数化；②解析期间显示**不确定动画进度条**（`.progress-fill--indeterminate` + `prefers-reduced-motion` 降级），文案去百分比——**诚实原则，不假造数字**（同步解析无真实中间进度）；③`parseProgress` store 字段全量删除（唯一消费方 ImportPanel，worker 消息协议保留待功能 14 复用）；④**跨设备多 Takeout 合并去重立项 PRD 功能 14（独立页，MVP 后）**：merge 产出新文件 → 再导入观看，不在 import 流程做内存拼接。
理由: 用户实测 113MB 导入进度静止 0%——根因=单文件时 worker `progress = index/fileCount` 恒 0、`parseTimelineFile` 同步无中间进度，「进度百分比」对单文件同步解析本就不存在（T35）；产品形态用户拍板——timeline 只有单文件导入、「合并去重应在一个单独的 page，merge 过后产出新的档案」（功能 14，从 PRD「不做」移到立项）。220 单测（+4）+ lint + build 全绿；冒烟 113MB livedata 动画流动（transform 实时变化）+ 完成进 Trips（11,386 route points）+ Help/FAQ 文案无多文件误导。

## 2026-09-16 09:30 — T36 验收通过 + 功能 14 重定义「合并归档」（PRD v1.23）
决定: T36 验收通过，可推送部署（Reviewer PASS）+ 功能 14 从「跨设备多 Takeout 合并去重」**重定义为「合并归档（rawSignals 累积）」**。①独立页 `/app/merge`：主档案（可选）+ 新导出 → 合并 → 下载合并档 → 再导入观看；②**分而治之算法**：`semanticSegments` **取新导出**（永久历史最新=最全，不合并去重）+ `rawSignals` **窗口互补累积**（间隔 ≥29 天直接拼接；重叠按 ±60s+100m 折叠保留新点）+ `userLocationProfile` 取新；③输出 Timeline.json schema 可再导入；④**去重方向决策**：新导出内部近重复点（静止/慢移密集 ping，2025 占 23.6%/2026 占 40.4%）**不折叠**（折叠只做旧→新方向）——否则每轮合并都会永久削掉 20-40% 原始 GPS，违背「保留 rawSignal」的首动机；同文件合并两次幂等成立；⑤护栏：空语义段新导出抛错（防静默清空旧语义层）+ >200MB 合并前确认（内存峰值约 ×6）。
理由: 用户澄清真实动机——timeline.json 一直变大是因为每份都带完整 semanticSegments（永久历史）；要的其实只有 rawSignals（Google 只留 ~29 天窗口，定期导出存档可突破），故「取最新语义段 + 累积 raw」只需 1 份合并档、处理 ≈ 解析最新一份（不随历史 ×N）；「跨设备」语义移除（核心是**跨时间**累积）。livedata 实测：108MB+123MB → 合并档 101.5MB（紧凑序列化，语义段只留一份）、raw 无损 106,171 → 再导入 27,252 points span 2025-01→2026-08 闭环；243 单测（+23）+ lint + build 全绿；Reviewer PASS（一般级 3 项已修）。

## 2026-09-16 10:30 — T37 验收通过：发布前 15k 点窗口性能复测（零产品改动）
决定: T37 验收通过，可推送部署。结论——**无需降 cap、无需分层预算，产品代码零修改**。真实 livedata 15k 点窗口（2026 默认 30 天 = 15,072 raw → 12,000 绘制）production build 复测：缩放帧 p95 **183ms**（vs §8 pre-fix 461ms）、longtask max **219ms**（vs 1796ms）、平移 43/41fps（vs post-fix 34fps）；附带场景合并档 62 天/37,287 stays 全景同结论。附带发现「切范围预设 Last year 2.3s / All 1.3s 一次性长任务」——非阻塞，入 Backlog 候选（分块/异步重建）。
理由: T23 处置（低 zoom 点关闭 + cap 12000）在真实负载下持续有效；§8 基线对照同口径（重载对照 §10.2 合并档 37k stays 独立支撑，183<461 非仅负载变轻）。**诚实原则实践**：Reviewer 抓出入库数据与报告表述矛盾（16 拖中实为 11 拖无 longtask、z12 首拖 tile 冷启动 647ms）→ 已修 DATA-FINDINGS §10 如实记录 + perf-browser.mjs 聚合 `Math.max` 修复 + 全景数据持久化；历史日志（TASKS/NOTES 旧条目）不改写，§10 为唯一权威口径。报告 DATA-FINDINGS §10 + scripts/ 三件套可复现 + perf-report.json 逐帧数据入库。

## 2026-09-16 11:30 — T38 验收通过：发布前收尾（README/i18n 单文件化 + 合并已实现表述）
决定: T38 验收通过，可推送。发布门面过时表述已清：README 3 处（L117/L126/L166 单文件化 + 合并归档引导 + 架构图改「单文件解析」并加「合并归档（独立 Worker）」铭文）+ i18n 3 key×双语（「规划中」→ 已实现，删 dedup 字眼守住不夸大）+ 全仓 grep 零命中。双视口 19 项×2 冒烟 0 pageerror（mobile `_leaflet_pos` 竞态 N1 例外，见下）+ 真实跑通 merge worker。243 单测 + lint + build 全绿。
理由: 发布前的诚实原则——T35/T36 落地后，对外文档必须反映现实（单文件导入、合并页已上线，「合并去重 dedup」字眼会夸大 T36 语义）。**N1 记录**：Reviewer 复跑 4 轮发现 mobile（390×844）点击停留 → tooltip 弹出路径 `_leaflet_pos` undefined pageerror **复现 3/4**（desktop 0/4）——历史 DECISIONS 记为「偶发已知噪音不修」，复现率与旧判断不符且出现在新访客首次交互路径；本轮断言全部仍通过（可恢复、无白屏）。**待 CEO 发布前决策**：重新评估 N1（修 or 明确发布容忍度）。
