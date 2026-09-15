# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，里程碑按任务编号（T1–T26）记录。
版本号与 git tag 由维护者在发布时决定（当前尚未打 tag）。

## [Unreleased] — 2026-09-15

### Added
- **行程导出（GeoJSON / KML）**：导出当前筛选范围的轨迹与停留；确认弹窗 + 隐私护栏（剥离文件名/装置 metadata、绝不上传）（T25）
- **移动端适配**：< 768px 单月历、底部抽屉面板、地图全屏、触控目标 ≥ 44px（T24）
- **外部链接隐私披露**：地图点默认动作改为「复制坐标」（纯本机），Google Maps 外链 opt-in 并标注会发送坐标 + IP（T20）
- **跨午夜记录**：保留并标注「跨夜 · 自 MM-DD」，轨迹顶点裁剪到所选范围（T22）
- **更换数据**：日期范围上方显示当前文件名 + 更换按钮（T19）
- **双月历范围选择器**（T18）

### Changed
- **渲染性能**：低 zoom（< 6）仅绘制折线、不画点；`GLOBAL_PATH_POINT_CAP 30000 → 12000`、`RAW_POINT_CAP 20000 → 12000`（T23，见 `docs/DATA-FINDINGS.md §8`）
- **覆盖判定**：`coveredByRaw` 由「按段」改为「按顶点（±5min）」，修复保留窗边界的路线空洞（T21）

### Fixed
- `PlacesMap` 外链隐私披露补全；`navigator.clipboard` 不可用时降级为失败提示
- activityType 模式的跨午夜裁剪被下游 fallback 抵销（Reviewer S2 複審）

### Docs / Portfolio
- README 图片路径修复、重拍 10 张截图、修正 `<user>`/`(#)` 占位符、新增「What's new」（T26）
- 新增 `LICENSE`（MIT）与本 `CHANGELOG.md`（T26）
- 隐私声明补「Google Maps 外链为 opt-in」例外，与 Landing / 设置页对齐（T26 複審）

## 2026-09-14

### Added
- **时间轴模式（默认）**：rawSignals + 语义段路径按时间合并成一条连续轨迹；逐点真实时间；点选弹出 GPS 坐标（T15–T17）
- **左侧时间线**：轨迹点与停留按时间排序、按日分组（T17）
- **语义段回退**：Google raw 仅保留 ~30 天，旧日期自动用 `timelinePath`（T16）
- **rawSignals 原始点接入**：format1 `position` 类目解析为点（兼容大写 `LatLng` / 嵌套 `timestamp`），Trips 以灰色小点渲染、可开关（T13.6）
- 停留点历史访问面板（T13）、Trips 时间线衔接线（T14）

### Changed
- 衔接线改为「跟時間連」纯时间口径（T14.3）

### Fixed
- **时区分组**：`startOfDayMs` / `dayKeyOf` 改用本地时区，跨 UTC 日边界的段不再归错日（T13.7）

## 2026-09-13

### Added
- 项目脚手架 + 应用框架（React 19 + Vite + TS + Leaflet + Zustand + Router）（T1）
- 四格式 JSON 解析 + Web Worker（T2）、模拟示例数据（T3）、导入集成 + 空状态首屏（T4）
- Trips 行程轨迹（T5）、Places 点击查访（T6）、Landing 首页（T7）、导出教程页（T8）、隐私与瓦片源设置（T9）
- 安全加固：raw 点数硬上限、CSP、明文警告、示例数据标注（T9.3）
- **GitHub Pages 部署 workflow**：HashRouter + 相对 base `./` + `deploy.yml`（T10.1）
- **中文 README**（T10.2）
- **正式部署上线**：https://coderkk.github.io/google-timeline-viewer/ ，所有路由可达（T10.3）
- 产品改动：改名 **Timeline Map**、Light / Dark / System 主题、半径 1 / 5 / 10 / 50 / 100 KM、Places marker 颜色区分（T12 / T12.6）

### Security
- 数据仅存内存、无遥测；瓦片请求隐私提示
