# TASKS: Google Timeline Viewer

<!-- next: T12 -->

## 🔨 Doing（WIP ≤ 2）

- [x] ~~T12: 产品改动（改名 + Theme + 半径档位 + marker 颜色）~~ (09-13→09-13) — 改名 Timeline Map + Theme Light/Dark/System + 半径 1/5/10/50/100 KM + Places marker 颜色区分 + Places 日期筛选；63 单测 + build + lint 全过

## 📋 To Do

## ⏸ KIV

- [ ] **T-K1: 移动端适配**
  - 等待: v1 发布后评估公开分享带来的移动访问占比
  - 时间: 09-13 创建

## 📭 Backlog（上 = 优先）

- [ ] [P2] 行程统计报表 — 总距离/日均运动量/地点频次（→ PRD 不做，发布后）(09-13)
- [ ] [P2] 离线瓦片 / 自托管瓦片服务器 — 彻底消除瓦片请求隐私（→ PRD 不做）(09-13)
- [ ] [P2] 行程分享/导出（GeoJSON/KML）— （→ PRD 不做）(09-13)
- [ ] [P2] 跨设备多 Takeout 合并去重 — （→ PRD 不做）(09-13)
- [ ] [P2] 性能基准脚本（scripts/ 独立 node 脚本，替代误入 src 的 bench）— T11.2 关注 (09-13)
- [ ] [P2] 多语言（英文为主，可换中文）— 需要 i18n 依赖，v2 加入（→ PRD 约束）(09-13)

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

## ❌ Cancelled