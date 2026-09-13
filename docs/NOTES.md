# Notes

> 开发日志（追加式）。格式：`## YYYY-MM-DD HH:mm — 角色` + 内容。

<!-- 示例：
## 2026-09-12 14:20 — Dev
完成 T1 登录 API。自测通过。已知问题: token 刷新逻辑待优化。

## 2026-09-12 15:10 — Reviewer
审查 T1。通过。建议: 密码 hash 用 bcrypt（一般级，不阻塞）。
-->

## 2026-09-13 14:20 — Dev
完成 T1 项目脚手架 + 应用框架：Vite + React 19 + TypeScript（严格模式）+ Leaflet/react-leaflet + React Router + Zustand；路由（首页/Trips/Places/教程/设置）、Header/Footer 骨架、Layout。`npm run build` 通过。

## 2026-09-13 14:28 — Dev
T2 数据解析层开工。完成内部统一数据模型（`src/lib/types.ts`）+ 四格式解析器（`src/lib/parse/`）+ Web Worker 封装 + vitest 单测（18 个用例）。详见提交信息；`npm run test` / `build` / `lint` 全通过。已知问题：Web Worker 在 node 环境不可测，需 T4 浏览器实测；解析层保留全量 path 点，抽稀/降采样留给 T5.3 渲染层。

## 2026-09-13 15:40 — Dev
完成 T3（模拟示例数据）+ T4（导入集成 + 空状态首屏 + 全局状态）。

**T3.1** `scripts/gen-sample-data.mjs`（node，mulberry32 确定性种子）产出 `src/lib/sample/sample-timeline.json`（262.8 KB）：虚构人物 7-20→9-11 共 54 天行程，含台北 home/work + 台中（周末驾车）+ 新加坡/吉隆坡（航班 + 跨境驾车）多地停留；1677 轨迹点（1387 路径点 + 432 rawSignals）、191 停留、197 行程段。直接数组格式（顶层数组，每元素 `semanticSegments` + `rawSignals`），坐标均为公开地标坐标。文件内无标注，标注走导出常量。

**T3.2** `src/lib/sample/index.ts`：导出 `SAMPLE_LABEL = '模拟数据 · 非真实轨迹'` + `loadSampleTimeline()`（内联 `?raw` JSON → 走 T2 `parseTimelineFile`，复用真实解析管线）。新增单测 `src/lib/sample/sample.test.ts`（4 用例：零 warning / 日期跨度 / 多城市多活动 / 加载函数）。

**T4.1** `src/store/timelineStore.ts`（zustand）：`data/String 状态机（empty/parsing/ready/error）+ errorMsg + parseProgress + dataSource（none/user/sample）+ 全局 dateRange`。actions：`importFiles`（>100MB 大文件 confirm 确认，worker onProgress 进度驱动，失败/全空置 error+指引）、`loadSample`、`clearData`、`setDateRange`、`resetDateRange`。导入完成自动 navigate → /app（`RouterBridge` 桥接 useNavigate，见 `src/components/RouterBridge.tsx`）。

**T4.2** `src/pages/EmptyState.tsx`：欢迎语 + 一句话说明 + 大导入按钮 + 支持格式提示 + 「载入示例数据」（带模拟数据角标）+ 教程链接 `/help` + 隐私承诺行。Trips/Places 无数据时渲染它，示例数据时页头显示角标。视觉复用 index.css 风格（卡片式 drop-zone / 进度条 / 错误态样式）。

**T4.3** `src/components/ImportPanel.tsx`：点击选文件 + 整区拖拽 + 多文件 + 解析进度条（worker onProgress → 0-100）+ 错误态（errorMsg + 重新选择文件指引）。

**验证**：`npm run build` ✅（bundle 含内联 sample JSON，~543KB，chunk-size 警告为 Leaflet+示例数据所致，可接受）；`npm run test` 22 passed（含 T2 18 用例不回归）✅；`npm run lint` 无 error ✅；dev 端到端冒烟（playwright）：空状态首屏可见 → 载入示例 → 自动跳 /app 显示 197 段/191 停留 + 角标 ✅；真实 Timeline.json 走 worker 导入 → 跳 /app 显示 1 段/1 停留 ✅；无 console 报错。

**已知问题**：① 新直出直接数组格式的 `rawSignals` 暂未被 T2 解析器消费（格式 1 的 `points` 恒为 0），示例 JSON 已按真实结构附带 rawSignals 以备后续；② Web Worker 路径经浏览器实测 OK，node 单测仍不覆盖 worker；③ build 存在 chunk>500KB 警告（示例数据内联所致），后续 T10 如需可 code-split 或改 public/ 外置。
