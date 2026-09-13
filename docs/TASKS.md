# TASKS: Google Timeline Viewer

<!-- next: T11 -->

## 🔨 Doing（WIP ≤ 2）

- [ ] **T2: 数据解析层（四格式 + Web Worker）**
  - 验收: 四类格式样例解析为统一模型；大文件走 Worker 不卡主线程；单测覆盖坐标转换（E7）、时间戳解析、空数据处理
  - 指派: Dev
  - 来源: PRD#功能1
  - 时间: 09-13 创建 → 09-13 Doing
  - 子任务:
    - [ ] T2.1 内部统一数据模型（points/visits/segments + 时间范围统计）— Dev
    - [ ] T2.2 四格式解析器：Timeline.json(direct-array semanticSegments) / Records.json / Semantic Location History(timelineObjects) / Location History.json — Dev
    - [ ] T2.3 Web Worker 解析封装 + 大文件内存提示 + 多文件合并导入 — Dev
    - [ ] T2.4 单元测试（vitest）：解析器 + 坐标/时间转换 — Dev

## 📋 To Do

- [ ] **T2: 数据解析层（四格式 + Web Worker）**
  - 验收: 四类格式样例解析为统一模型；大文件走 Worker 不卡主线程；单测覆盖坐标转换（E7）、时间戳解析、空数据处理
  - 指派: Dev
  - 来源: PRD#功能1
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T2.1 内部统一数据模型（points/visits/segments + 时间范围统计）— Dev
    - [ ] T2.2 四格式解析器：Timeline.json(direct-array semanticSegments) / Records.json / Semantic Location History(timelineObjects) / Location History.json — Dev
    - [ ] T2.3 Web Worker 解析封装 + 大文件内存提示 + 多文件合并导入 — Dev
    - [ ] T2.4 单元测试（vitest）：解析器 + 坐标/时间转换 — Dev

- [ ] **T3: 模拟示例数据**
  - 验收: 一键加载后 Trips/Places 可完整体验；数据明显标注"模拟数据，非真实轨迹"；覆盖多日行程 + 多地停留
  - 指派: Dev
  - 来源: PRD#功能8
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T3.1 生成器脚本，产出符合 Timeline.json 格式的模拟数据文件 — Dev
    - [ ] T3.2 载入示例数据按钮 + 标注（空状态首屏 + Landing 均可用） — Dev

- [ ] **T4: 导入集成 + 空状态首屏 + 全局状态**
  - 验收: 空状态引导页（欢迎语/导入按钮/教程入口/隐私承诺）可见，导入后自动进入主界面；日期筛选状态全局共享
  - 指派: Dev
  - 来源: PRD#功能1、功能2
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T4.1 全局 store：数据集 + 日期范围筛选（Trips/Places 共享）— Dev
    - [ ] T4.2 空状态首屏组件（欢迎 / 导入 / 教程入口 / 隐私承诺 / 载入示例）— Dev
    - [ ] T4.3 导入面板（拖拽 + 多选文件 + 解析进度 + 错误提示）接入解析层 — Dev

- [ ] **T5: Trips 视图（行程轨迹）**
  - 验收: 选日期范围后显示路线 + 停留点；大段轨迹降采样不卡；点轨迹可反查停留点
  - 指派: Dev
  - 来源: PRD#功能3
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T5.1 日期范围选择器（起止日 + 快捷档）接入 store — Dev
    - [ ] T5.2 路线绘制（waypointPath polyline）+ 停留点标记（placeVisit + 时长 tooltip）— Dev
    - [ ] T5.3 降采样 / 点数上限保护 — Dev
    - [ ] T5.4 轨迹 ↔ 停留点双向联动（点标记高亮对应路线）— Dev

- [ ] **T6: Places 视图（地图点击查访）**
  - 验收: 无标记地图点击 → 浮层显示经纬度 + N 个停留点；半径 10/100/1000/5000KM 切换实时更新；半径圈可见且自动 zoom；点击结果定位到地点
  - 指派: Dev
  - 来源: PRD#功能4
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T6.1 空间网格索引（纬度 1° × 经度 1°）构建 + 半径查询（haversine 精确过滤）— Dev
    - [ ] T6.2 点击拾取 + 浮层（经纬度 / 半径内记录数 / 结果列表：地点名·地址·时间·距离）— Dev
    - [ ] T6.3 半径档选择（10/100/1000/5000KM）+ 半径圈渲染 + 自动 zoom 保证圆完整 — Dev
    - [ ] T6.4 结果列表点击定位 + design QA（浮层交互 / 半径圈视觉） — Designer

- [ ] **T7: Landing 首页 + OPC 3.0 展示**
  - 验收: 首页完整：产品介绍/亮点/立即体验（跳转 + 载入示例）/隐私承诺/技术栈/教程入口/Built with OPC 3.0 section；Footer "Created by OPC 3.0" 可点击
  - 指派: Dev
  - 来源: PRD#功能7
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T7.1 Landing 页面结构与文案 — Dev
    - [ ] T7.2 Built with OPC 3.0 section + Footer 品牌链接 — Dev
    - [ ] T7.3 「立即体验」按钮（跳工具 + 载入示例数据联动） — Dev

- [ ] **T8: 导出教程页**
  - 验收: Android/iOS 导出步骤图文完整；新旧格式说明 + FAQ；页面常驻入口可达
  - 指派: Dev
  - 来源: PRD#功能6
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T8.1 教程页内容 + 分步展示组件 — Dev
    - [ ] T8.2 FAQ 折叠组件 — Dev

- [ ] **T9: 隐私与瓦片源设置**
  - 验收: 无任何分析 SDK；数据不落盘；瓦片源默认 OSM、可自定义 URL，选项旁隐私明示
  - 指派: Dev
  - 来源: PRD#功能5
  - 时间: 09-13 创建
  - 子任务:
    - [ ] T9.1 设置面板：瓦片源自定义（URL 输入 + 恢复默认）+ 隐私说明文案 — Dev
    - [ ] T9.2 安全审查（数据生命周期 / 瓦片请求隐私） — Security Engineer

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

## ✅ Done

- [x] ~~T1: 项目脚手架 + 应用框架~~ (09-13→09-13) — Vite+React19+TS+Leaflet+Router+Zustand；路由/Header/Footer 骨架；build 通过

## ❌ Cancelled