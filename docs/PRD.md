# PRD: Google Timeline Viewer — 2026-09-13

## 背景
Google 停用 Timeline 网页版后，位置历史只以 JSON 导出（手机可直接导出、Takeout 可拉旧数据），但裸 JSON 无法可视化，等于数据在手却"看不到"。需要做一个纯本地运行的查看器，把 Timeline 数据还原成可视化的行程和地点历史。同时该项目是作者的 **portfolio 作品**，将公开分享给大众免费使用——既是实用工具，也是产品思维与工程能力的展示面。

## 目标
①用户导入自己的位置历史 JSON，在一个纯浏览器应用里按日期回放行程、点击地图查看访问历史，**数据全程不出设备**；②公开部署为一个任何人可用、拿得出手的 portfolio 项目（含 Landing 首页、教程、示例数据、开源仓库与文档）。

## 功能范围

- [ ] **功能 1: 空状态首屏 + 多格式 JSON 导入** — 未导入数据时显示引导页（欢迎语 + 导入按钮 + 「如何导出数据」教程入口 + 隐私承诺）；点击导入后支持以下格式：①新版设备导出 `Timeline.json`（direct-array：`semanticSegments[]`/`rawSignals`/`userLocationProfile`，Android 系统设置导出 / iOS Maps App 导出）②`Records.json`（locations[] + activitySegments[]）③Semantic Location History 的 `YYYY_MM.json`（timelineObjects[]：placeVisit/activitySegment）④旧版 `Location History.json`；支持一次导入多个文件；解析在 Web Worker 中执行，文件过大时给出提示 — 验收: 四类样例文件都能导入并统计出行程/停留点数量；空状态引导页可见且导入后消失
- [ ] **功能 2: 日期范围筛选** — 全局时间筛选（起止日期），Trips 与 Places 两个视图共享；按日期过滤行程和停留点 — 验收: 选择 2024 年 5 月，地图只显示该月数据
- [ ] **功能 3: Trips 视图（行程轨迹）** — 选中日期范围内：绘制行驶路线（activitySegment.waypointPath），标出停留点（placeVisit 位置与时长）；渲染有点数上限保护，超限降采样 — 验收: 导入样例数据后选择日期范围，能看到路线 + 停留点标记
- [ ] **功能 4: Places 视图（地图点击查历史）** — 无标记的干净地图；点击任一位置 → 显示该点经纬度 + 以该点为中心、可选半径（10/100/1000/5000 KM）内的所有历史停留点列表（地点名/地址/时间/距离）；半径圈可视化并自动调整 zoom 保证圆完整可见；点击结果列表中的地点可跳转到对应位置 — 验收: 点击地图 → 浮层显示经纬度 + 半径内停留点列表，切换半径档列表实时变化
- [ ] **功能 5: 本地隐私** — 数据只在内存中，刷新即弃；不写 localStorage/IndexedDB、不接任何分析/遥测 SDK；设置中提供瓦片源自定义（默认 OpenStreetMap），选项旁明示"瓦片请求会把你的 IP 与当前视野坐标发给瓦片服务器" — 验收: 不使用 DevTools 时确认无任何网络请求携带原始坐标 JSON；可切换到自定义瓦片源
- [ ] **功能 6: 导出教程页** — 常驻入口（主界面可见）：Android 导出步骤（系统设置 → 位置 → 位置服务 → 时间轴 → 导出时间轴数据）、iOS 导出步骤（Google Maps → 头像 → 设置 → 个人内容/位置和隐私 → 导出时间轴数据）、新旧格式说明（设备导出的 Timeline.json vs Takeout 的 Records.json / Semantic Location History）、FAQ（找不到时间轴、换手机丢数据、启用 Timelime 备份） — 验收: 教程页图文步骤完整，Android/iOS 路径区别清楚
- [ ] **功能 7: Landing 首页** — 官网式首页（portfolio 展示面）：产品是什么 + 为什么做 + 功能亮点（行程回放 / 点击查访 / 数据不出设备）+「立即体验」（跳转工具 + 一键载入示例数据）+ 隐私承诺 + 技术栈 + 教程入口；底部加 **「Built with OPC 3.0」section**（讲一人公司 AI 团队如何 brainstorm→PRD→任务→开发→审查→验收做出此产品，含 OPC 3.0 介绍链接）；**Footer 放 "Created by OPC 3.0"**（可点击，指向该 section / 作者 GitHub） — 验收: 访客无需个人数据，从首页即可浏览并一键体验示例数据；footer 品牌露出完整
- [ ] **功能 8: 示例数据** — 内置一份可一键加载的模拟 Timeline 数据（覆盖多天行程 + 多地停留，结构对齐真实导出格式），UI 上明显标注"模拟数据，非真实轨迹" — 验收: 点击加载示例数据后，Trips/Places 全部功能可用

## 不做
- 离线瓦片打包/自托管瓦片服务器（→ Backlog）
- 行程统计报表（总距离、日均轨迹、地点频次）→ Backlog
- 跨设备/多 Takeout 数据合并去重 → Backlog
- 行程分享/导出截图 → Backlog

> 移动端专项适配：公开分享后访问面扩大，从"不做"移入 KIV（T5），发布前评估。

## 约束
- **纯前端**：React + Vite + TypeScript + Leaflet（OpenStreetMap），无后端
- 数据安全性：位置数据最高敏感，必须"数据不出设备"；**公开 demo 绝不使用作者真实位置数据**
- 性能：多年数据可达数十万坐标点，解析与查询不得阻塞主线程（Web Worker + 空间索引）
- 交付节奏：MVP 优先，浏览器为主，打包为静态站点
- **部署**：静态托管（GitHub Pages / Cloudflare Pages 等），公开仓库 + README + 截图（portfolio 完整性）

## 修订历史
- v1.0 (2026-09-13): 初版，基于 brainstorms/2026-09-13#1100 拍板
- v1.1 (2026-09-13): 新增功能 6（导出教程页）；功能 1 增加新版设备导出格式（Timeline.json direct-array）与空状态首屏
- v1.2 (2026-09-13): 定位升级为 portfolio + 公开产品——新增功能 7（Landing 首页）与功能 8（示例数据）；部署约束改为公开静态托管；移动端适配从"不做"移入 KIV
- v1.3 (2026-09-13): 功能 7 增加「Built with OPC 3.0」section 与 footer "Created by OPC 3.0" 品牌露出