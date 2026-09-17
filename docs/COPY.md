# COPY 主张登记表 — 对外主张 ↔ surface 对照

> 目的：**传播面（P2 Q5）** 的结构化落点。对外主张（README/Landing/Help/CHANGELOG/截图文案）必须登记，语义变更时按 surface 逐处更新——**截图是 grep 盲区**，靠这张表人工核对。
> **启用条件（强制）**：凡涉对外主张（命中 WORKFLOW §10 硬信号「对外主张」行）的项目强制启用；**隐私文案是最高风险主张，隐私段强制登记**。
> 每条主张 = 主张内容 + 涉及 surface 清单 + 引用 PRD 版本（主张与代码实作一致性的锚点）。
> 语义变更流程：改 COPY → 列出受影响 surface → 逐 surface 更新 → 哨兵测试（屏显/快照断言，Dev 转 i18n guard 测试）。
> **更新时点**：UI 视觉/文案变更的卡，Done 前强制更新截图一致性核对，不攒到发布。
> **非追加式文档纪律**：本表原地编辑，改动须记「变更日志」+ 标注编辑者，确认旧内容一行未丢。
>
> 注：本表于 T41（2026-09-17）首次落地，登记当时全部现有对外主张；PRD 版本锚点统一取 v1.24（最近一次 PRD 修订，T39 后）。

## 主张登记

| # | 主张（对外表述） | 涉及 surface（README/i18n/Help/Landing/截图/PRD） | PRD 版本 | 最后核对 | 备注 |
|---|----------------|--------------------------------------------------|----------|----------|------|
| 1 | **「坐标不出你的设备」**（设计原则，除下列外部请求外）**（隐私，强制）** | README 隐私声明 / `landing.privacy` / `settings.lifecycle`(5 条) / Help `faq.a4` / `map.coordsPrivacyNote` / 截图 landing-full.png + settings.png | v1.24（功能 5） | 2026-09-17（T40 线上验证后无改） | 隐私主张：发布阻塞项，须与行为逐条对照（T42 network-tap 机器断言落地后互为印证） |
| 2 | **「本地处理，不上传」**——全部在浏览器内存处理、不写 localStorage/IndexedDB、刷新即弃、无后端/登录/账号/统计 SDK **（隐私，强制）** | README 隐私声明 / `empty.privacy` / `settings.life1-3` / `merge.privacy` / `export.note4` / Help `faq.a3`+`faq.a4` / Landing `f3Text`+`privacy` | v1.24（功能 5/10/14） | 2026-09-17 | 对外最强承诺；tile 例外见 #3，Google Maps 外链例外见 #4 |
| 3 | **「瓦片请求泄露明示」**——默认请求 OSM 公共服务器，请求暴露 IP + 当前地图视野坐标范围；可切换自托管/内网瓦片源 **（隐私，强制）** | README 隐私声明 / `settings.tiles`+`tileWarn`+`life4` / Help `faq.a4` / Landing `privacy` | v1.24（功能 5） | 2026-09-17 | 措辞红线：不写「0 网络请求」（happy path 有 tile 请求）；T42 白名单把 OSM 默认源列为允许项 |
| 4 | **「Google Maps 外链为 opt-in」**——点选地点默认「复制坐标」（纯本机、零网络请求）；只有主动点「在 Google Maps 開啟」才发送坐标 + IP | README 隐私声明 / `map.copyCoords`+`map.coordsPrivacyNote` / `settings.life5` / Landing `privacy` | v1.24（功能 5） | 2026-09-17 | T20 引入的外链例外披露，Landing 与设置页「数据生命周期」均有对应 |
| 5 | 「每次导入一份存档（单文件导入）」 | README L117「每次导入一份」+ L126 合并引导 / `import.supported`+`import.dropHint` / Help `formatsTip`+`faq.a2`+`faq.a3` | v1.24（功能 1，v1.22 单文件化） | 2026-09-17（T35/T38 已核对） | 语义变更（v1.22）时已同步全部 surface；`data.filesSuffix` 死键已随 T41 清除 |
| 6 | 「四种格式一键导入」（Timeline.json / Records.json / YYYY_MM.json / Location History.json） | README「支持的格式」表 / `import.supported` / Help `help.formatsHint`+`help.formatTree` / `import.button` | v1.24（功能 1） | 2026-09-17 | 格式清单与 `src/lib/parse/` 四格式识别一一对应 |
| 7 | 「合并归档（功能 14）」——主档案 + 新导出 → 本地合并 → 下载合并档再导入；语义段取最新 + rawSignals 累积 | README L126/128/177 / `nav.merge` / MergePage 全文案 / Help `formatsTip`+`faq.a2`+`faq.a3` / Landing `f4Title`+`f4Text` | v1.24（功能 14，v1.23 重定义） | 2026-09-17（T36/T38/T39 已核对） | 措辞红线：无「dedup/去重」字眼（语义=取最新+累积，非通用去重）；「>200MB 确认 / >300MB 分次导出」护栏在 README + `merge.largeConfirm` 双处一致 |
| 8 | 「Landing 四张功能卡：Trips / Places / Privacy / Merge」 | Landing `f1Title/Text`−`f4Title/Text` + `landing.featuresTitle`（「四/四个能力」）/ README 功能亮点 / PRD 功能 7 验收「四卡展示」 | v1.24（功能 7） | 2026-09-17（T39 已核对） | 标题/卡文案 en/zh 同步；f4「只留一份」为「语义段取最新+raw 累积」的通俗表述，与 #7 同语义 |
| 9 | 「行程导出隐私护栏」——只导出当前筛选范围、剥离文件名/装置/路径 metadata、导出文件不受本工具保护；全程本机生成零上传 | README「导出行程」/ ExportButton `export.note1-4` / `export.title`+`export.range`+`export.contents` | v1.24（功能 10） | 2026-09-17 | 导出确认弹窗（export.png 截图）含范围/内容/警示三要素 |
| 10 | 「默认近 30 天范围」+ 快捷档（全部 / 近 30 天 / 近 1 年）+ 双月历点选 | DateRangePicker 全部 key（`drp.*`）/ README「双月历范围选择器」「保留快捷档」 | v1.24（功能 2，v1.20 重写） | 2026-09-17 | UI 行为主张（截图 trips.png 含旧版双月历，见截图核对表） |
| 11 | **「默认配置零未登记出网」（机器断言 `privacy-default-config-no-egress`）**——默认配置（瓦片源 = OSM、无持久化设置）下，应用运行时发起的全部网络请求 ∈ 白名单（self + OSM tile + blob 等非网络 scheme）；违例即 CI 门禁红灯 **（隐私，强制）** | README 隐私声明 / `tiles.ts` 默认 OSM / allowlist `meta.surfaces`（README + COPY + SMOKE-CHECKLIST + SettingsPage/Landing） | v1.24（功能 5） | 2026-09-17（T42 机器门禁落地） | 由 `scripts/smoke-network-tap.mjs` 机器断言（deploy.yml `privacy` job，退出码 0/1/2）——非人工勾选（宣言原则 9「承诺可机器验证」）；自定义瓦片源例外见 #12 |
| 12 | **「自定义瓦片源为用户显式 opt-in」（机器断言 `privacy-custom-tile-opt-in`）**——用户主动填写的自托管/内网/第三方瓦片源是**已明示例外**，不进动态白名单（默认拒绝仍成立）；设置页警告 + README + Landing/设置已披露 **（隐私，强制）** | SettingsPage `tiles`+`tileWarn` / README 隐私声明「地图瓦片」 / Landing `privacy` / allowlist `policy.customTileSource.surfaces` + `tiles.ts` 头注释 | v1.24（功能 5） | 2026-09-17（设计裁决 DESIGN-T42.md §1） | 裁决：动态放行 = 默认拒绝形同虚设；该面**不在默认配置门禁范围内**，由校准探针 B（UI 注入自定义源 → 必判 VIOLATION）单独验证量具有效 |

## 术语表（防术语漂移）

> README 叫「存档」、UI 叫「档案」这类用词不统一，主张本身没错，但属视觉语言回归，且是 grep 可查的。哨兵测试加 i18n/文案术语一致性断言。
> T41 首次登记（2026-09-17）：全 repo grep `存档` 确认「存档」仅出现在 NOTES/DATA-FINDINGS 内部文档（「定期导出存档 rawSignals」），**用户面（README/i18n/Help/Landing）零残留**；现存差异项见下。

| 标准术语 | README | i18n en | i18n zh | Help | Landing | 一致? |
|---------|--------|---------|---------|------|---------|-------|
| 合并归档（merge 功能名） | 「合并归档」（L126/128/177） | `nav.merge`「Merge」 | `nav.merge`「合并归档」 | 「合并归档」页（formatsTip/faq.a2/a3） | `f4Title`「合并归档，只留一份」 | 一致；唯一差异：`merge.title` 页面大标题 zh 作「合并时间轴归档」（en「Merge timeline archives」），比功能名多「时间轴」限定——同义表述，非漂移，保留 |
| 主档案（merge 页主档案输入） | 「主档案」（L128/177） | `merge.mainArchive`「Main archive」 | `merge.mainArchive`「主档案」 | （Help 文案经评论区引用同 key） | — | 一致 |
| 合并档 / 合并文件（merge 输出） | 「合并文件」「合并后的 Timeline.json」（L126/128） | `merge.lead`「merged file」 | `merge.lead`「合并档」 | 「合并文件」（formatsTip） | `f4Text`「一份 Timeline.json」 | 基本一致；README「合并文件」 vs zh「合并档」为同义词，非漂移 |
| 时间轴（Google Timeline 功能名） | 「时间轴」（L99-111） | 「Timeline」（全部 key） | 「时间轴」（nav/help/faq） | 「时间轴」（step.a4 等） | — | 一致 |
| 模拟/示例数据（内置 sample） | 混用「模拟数据」（L89「点击『立即体验』」语境）与「示例数据」（L179「状态管理」段） | `data.sample`「Sample data」/`empty.loadSample`「Load sample data」 | `data.sample`「模拟数据」/`empty.loadSample`「载入示例数据」 | `help.cta`「示例数据」 | `landing.sampleLabel`「模拟数据 · 非真实轨迹」 | **README 混用**「模拟/示例」两词（均指 sample）；zh i18n 也混用「模拟数据/示例数据」——非错误主张，属用词微漂移，候选统一为「模拟数据」对齐 `data.sample`（低优先，发布前随机清理） |
| 存档（archive） | README 用户面**不用**「存档」 | 无 | 无 | 无 | 无 | **用户面零「存档」**（内部文档 NOTES/DATA-FINDINGS 使用），对照成立，无漂移 |

## 变更日志

| 日期 | 改了什么主张 | 动了哪些 surface | 哨兵测试跑了没 |
|------|------------|-----------------|---------------|
| 2026-09-17 | 新增 #11/#12 两条隐私**机器断言**主张（默认配置零未登记出网 / 自定义瓦片源显式 opt-in）；白名单 `scripts/privacy-allowlist.json` 成为出网面单一事实源；#1/#3 备注的「T42 落地后互为印证」于本日兑现 | README 隐私声明（核对一致，无改动）/ SMOKE-CHECKLIST 隐私段（加可复现入口）/ TASKS T42 | 哨兵 = tap 脚本自身（A2 exit 0 + A3 三态必红，见 NOTES 2026-09-17 T42）；无 i18n guard 变动 |
| 2026-09-17 | **Reviewer G1–G3 修正（Dev 执行）**：①**G1** 主张 #6 的 i18n key 写错——`help.formatsTree`（复数）在 en/zh 双 catalog **不存在**，实际 key 为单数 `help.formatTree`（`en.ts:184` / `zh.ts:188`，消费方 `HelpPage.tsx:91`），已改正；②**G2** 术语表「模拟/示例数据」行 README 行号不实（旧写 L89/136、L98），实测仅 2 处：L89「模拟数据」（含『立即体验』语境）、L179「示例数据」（状态管理段），已改正；③**G3** 截图「疑似不一致」计数定死为 **6 张**（补 `mobile.png`，见截图核对表） | COPY 主张 #6 / 术语表 / 截图核对表 + 说明；TASKS T41 卡 | 无（纯文档核对，未动 src/，i18n catalog 与 guard 不受影响；243 单测/lint/build 复跑见 NOTES 2026-09-17） |

## 截图一致性核对

> 说明：T41（2026-09-17）未能逐张人工开图（工具无图像识别能力），一致性判断如实标注「待人工核对」，并附客观证据（截图生成时间 / 相关 UI 变更的 commit 与日期）供人工核对聚焦。发布链（`release-runbook.md`）已把截图核对列为必做项；**标注「疑似不一致」的截图必须重截后才能发布**。
> 截图全部生成于 2026-09-15 09:28–09:38（内容定格于 commit `2151b9d` T20-T26），晚于其后 UI 变更的有：**T30**（09-15 13:28，DateRangePicker 重写 + Places 默认半径 100→5）、**T35**（09-15/16，单文件化 + 不确定进度条）、**T36**（09-16，merge 页）、**T38**（09-16，Help FAQ/格式提示改「合并页已实现」）、**T39**（09-16，Landing 第 4 卡 +「四个能力」）。
> **G3 复核（2026-09-17）：「疑似不一致」定死为 6 张** —— `landing-full` / `trips` / `trips-activity` / `places` / `mobile` / `help`（原表误漏 `mobile`，NOTES/TASKS 的「6 张」为准）。其中 `mobile.png` 已用**生成该图的精确 commit `2151b9d`** 重渲染比对坐实：该 commit 下 390×780 移动端 `.drp` 高 547px、含 `drp-cal-weekdays` 整月内联日历（`hasTrigger:false`），而现版为 73px 紧凑 trigger + popover，像素差亦一致偏向旧版（date-picker 区 MAE 11.94@2151b9d vs 14.91@current）。

| 截图文件 | 图中展示的版本/卡片/文案 | 与当前 codebase 一致? | 最后核对 |
|---------|------------------------|----------------------|----------|
| `docs/screenshots/landing-full.png` | Landing 完整首页（hero + 功能卡 + 技术栈 + Built with + 隐私承诺） | **待人工核对（疑似不一致）**：生成 09-15 09:28，早于 T39（09-16 Landing 加 Merge 第 4 卡 + 标题「四个能力」）→ 图中很可能仍为 3 卡 | —（T41 未开图） |
| `docs/screenshots/landing-hero.png` | Landing Hero 区（标题 +「立即体验」+ How to export） | 待人工核对（hero 文案 v1.24 前后未变，风险低） | —（T41 未开图） |
| `docs/screenshots/landing-builtwith.png` | Built with OPC 3.0 section | 待人工核对（该区文案 T7 后未变，风险低） | —（T41 未开图） |
| `docs/screenshots/trips.png` | Trips 时间轴视图（左侧时间线 + 双月历 + 地图轨迹） | **待人工核对（疑似不一致）**：生成 09-15 09:29，早于 T30（09-15 晚 DateRangePicker 重写）→ 图中很可能为旧常驻双月历而非紧凑按钮 + popover | —（T41 未开图） |
| `docs/screenshots/trips-activity.png` | Trips「按活动类型」视图 | **待人工核对（疑似不一致）**：同上，早于 T30 双月历重写 | —（T41 未开图） |
| `docs/screenshots/places.png` | Places 视图（点击查访 + 半径圈） | **待人工核对（疑似不一致）**：生成 09-15 09:29，T30（09-15 晚）默认半径 100→5 → 图中默认可能是旧半径档 | —（T41 未开图） |
| `docs/screenshots/export.png` | 行程导出确认弹窗（GeoJSON/KML + 隐私护栏说明） | 待人工核对（T25 后导出文案未大改，风险低） | —（T41 未开图） |
| `docs/screenshots/mobile.png` | 移动端 390px 主流程 | **待人工核对（疑似不一致）**：生成 09-15 09:30，早于 T30（390px 日期控件由内联整月日历 → 紧凑 trigger + 整行 popover）。G3 以 `2151b9d` 重渲染实测坐实：图中为旧内联日历（`.drp` h=547、`hasWeekdays:true`），现版 h=73 无日历 | —（T41 未开图；2026-09-17 G3 复核） |
| `docs/screenshots/help.png` | 导出教程页（Android/iOS 步骤 + 格式说明 + FAQ） | **待人工核对（疑似不一致）**：生成 09-15 09:30，早于 T35（单文件化）、T38（09-16 FAQ/格式提示改「合并页已实现」）→ 图中 FAQ 文案可能过时 | —（T41 未开图） |
| `docs/screenshots/settings.png` | 设置页（瓦片源/主题/数据生命周期 5 条） | 待人工核对（tile/theme/lifecycle 均由 T20-T26 实现，早于截图；风险低-中） | —（T41 未开图） |