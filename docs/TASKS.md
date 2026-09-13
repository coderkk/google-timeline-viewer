# TASKS: Google Timeline Viewer

<!-- next: T11 -->

## 🔨 Doing（WIP ≤ 2）

- [ ] **T9: 隐私与瓦片源设置**
  - 验收: 无任何分析 SDK；数据不落盘；瓦片源默认 OSM、可自定义 URL，选项旁隐私明示
  - 指派: Dev
  - 来源: PRD#功能5
  - 时间: 09-13 创建 → 09-13 Doing
  - 子任务:
    - [x] T9.1 设置面板：瓦片源自定义（URL 输入 + 恢复默认）+ 隐私说明文案 — Dev
    - [ ] T9.2 安全审查（数据生命周期 / 瓦片请求隐私） — Security Engineer

## 📋 To Do

- [ ] **T10: 部署 + 项目文档**
  - 验收: GitHub Pages 可访问；README 完整（简介/截图/用法/格式支持/隐私声明/OPC 3.0 说明）；构建通过
  - 指派: Dev
  - 来源: PRD#约束
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T10.1 GitHub Pages 部署 workflow + 构建脚本 — Dev
    - [ ] T10.2 README（中文） + 截图整理 + 项目介绍 — Writer
    - [ ] T10.3 实际部署到 GitHub Pages 验证 — Dev

- [ ] **T11: 端到端验收**
  - 验收: 对照 PRD 全功能 pass；示例数据全流程体验流畅；Reviewer + Security 报告通过
  - 指派: Reviewer
  - 来源: PRD
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T11.1 全流程手工验证（导入→Trips→Places→教程→设置→首页）— Reviewer
    - [ ] T11.2 性能抽查（大文件解析时间 / 半径查询响应）— Reviewer

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

## ✅ Done

- [x] ~~T1: 项目脚手架 + 应用框架~~ (09-13→09-13) — Vite+React19+TS+Leaflet+Router+Zustand；路由/Header/Footer 骨架；build 通过
- [x] ~~T2: 数据解析层（四格式 + Web Worker）~~ (09-13→09-13) — 18 单测通过；build/lint 通过；Reviewer 审查延后至下个节奏点
- [x] ~~T3: 模拟示例数据~~ (09-13→09-13) — gen-sample-data.mjs 产出 54 天/5 城市直出格式数据；载入模块 + 单测通过；UI 角标就绪
- [x] ~~T4: 导入集成 + 空状态首屏 + 全局状态~~ (09-13→09-13) — store（导入/示例/大文件确认/日期范围）+ 空状态页 + 拖拽导入面板；浏览器实测通过；22 单测全绿
- [x] ~~T5: Trips 视图（行程轨迹）~~ (09-13→09-13) — 日期范围选择器（三快捷档 + 单边日）全接入 store；路径绘制（waypointPath polyline 按交通方式着色 + 时长 tooltip）；三层降采样/上限（段 12000 / 点 30000 抽稀 / 标记 4000 / 列表 500，超限显示降采样提示）；轨迹 ↔ 停留点双向联动；map 容器高度锚定 viewport 修复超长 canvas 崩溃；40 单测 + build + lint 全过；playwright 实测含 123.4MB 真实导出
- [x] ~~T6: Places 视图（地图点击查访）~~ (09-13→09-13) — SpatialGrid(1°×1° bbox+haversine)+4 档半径圆+自动 zoom+点击浮层+结果定位高亮；50 单测+build+lint 全过；真实数据 37287 停留：10km→11 / 100km→30 / 1000km→38 / 5000km→37287，查询 0.2-21ms；Design QA 并入 T11
- [x] ~~T7: Landing 首页 + OPC 3.0 展示~~ (09-13→09-13) — Hero+痛点→方案+3 功能卡+隐私承诺+技术栈；Built with OPC 3.0 section（AI 流程叙事，无内部角色术语）+ Footer 品牌可点击锚点；「立即体验」→ loadSample 双 CTA；playwright 实测通过
- [x] ~~T8: 导出教程页~~ (09-13→09-13) — Android(系统设置 6 步)/iOS(Maps App 6 步)+4 格式说明+FAQ 折叠(aria-expanded)+体验示例 CTA；实测与 50 用例全过

## ❌ Cancelled