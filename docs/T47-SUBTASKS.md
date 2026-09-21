# T47 拆分子卡方案

> T47 — 移动端适配立项盘查 + 拆分子卡
> 日期: 2026-09-21
> 基准: PRD v1.24 / TASKS T47 / 盘查报告 docs/records/mobile-audit/2026-09-21.md

## 一、盘查结论摘要

### 移动端适配现状（390px 视口）

| 指标 | 结果 |
|------|------|
| overflowX | ✅ 全部路由 0px — 无横向溢出 |
| 页面居中 | ✅ 内容页完美居中（偏移 0px） |
| 容器语义 | ✅ 地图页全屏无 footer / 内容页有 footer — 正确 |
| 字体大小 | ✅ 最小 11px（feature-card-text）— 可读 |
| 点击区域 | ❌ **6 处 nav-link 29px < 44px**（全路由） |
| 点击区域 | ❌ **Settings 页 btn-primary 39px < 44px** |
| 点击区域 | ❌ **Settings 页 theme-btn 37px < 44px** |
| 侧栏/抽屉 | ✅ trips-side 正常（max-height: 42vh） |
| 地图容器 | ✅ 正常填充剩余视口高度 |

### 核心发现

1. **布局层面已就绪**：T24 的 `@media (max-width: 768px)` 断点已覆盖了大部分移动端布局（侧栏变抽屉、地图全屏、导航横向滚动等）。390px 视口下无 overflowX、无布局错位、容器语义正确。
2. **唯一 P1 问题**：**触摸目标尺寸不足** — 6 个路由的 `.site-nav-link` 点击区域仅 29px（标准 44px），Settings 页的两个按钮也低于 44px。这是 CSS 级修复，改动面小。
3. **无 P2/P3 问题**：字体大小、页面偏移、侧栏行为均在可接受范围内。

### 决策依据（repo traffic）

- GitHub API 匿名请求无法获取 views/clones 数据（401 Unauthorized）
- 仓库元数据：0 stars, 0 forks（新项目，2026-09-13 创建）
- **结论**：移动端适配作为 P1 推进 — 公开产品必然面临移动端访问，越早修复成本越低

---

## 二、子卡方案（按优先级排序）

### P1 — 触摸目标修复（预计 L1）

**T47.1: 触摸目标尺寸统一 ≥44px**

- **范围**: 全局 CSS 修复（`index.css`）
- **改动**:
  1. `.site-nav-link` 加 `min-height: 44px`（当前 29px）
  2. Settings 页 `.btn-primary`（export 按钮）加 `min-height: 44px`（当前 39px）
  3. Settings 页 `.theme-btn` 加 `min-height: 44px`（当前 37px）
- **A17 断言**: 每个触摸目标 `min-height >= 44px`（与视口无关的绝对断言）
- **冒烟**: 通用（lint + test + build）— 无新增运行时面
- **联动面**: CSS 全局类，影响 Header nav + Settings 页
- **验收**: `mobile-audit.mjs` 390px 下所有 touchTarget >= 44px

### P2 — 移动端盘查脚本入库（预计 L1）

**T47.2: mobile-audit 脚本入库 + SMOKE-CHECKLIST 更新**

- **范围**: `scripts/mobile-audit.mjs` + `docs/SMOKE-CHECKLIST.md`
- **改动**:
  1. 将 `mobile-audit.mjs` 从 scratch 转正入库
  2. SMOKE-CHECKLIST 新增「移动端断点盘查」条目，指向 `mobile-audit.mjs`
  3. 模板 SMOKE-CHECKLIST 同步
- **验收**: 脚本可复现、SMOKE-CHECKLIST 引用正确

### P3 — PRD 移动端章节入册（预计 L1）

**T47.3: PRD 移动端适配章节**

- **范围**: `docs/PRD.md`
- **改动**:
  1. 新增「移动端适配」段落（当前状态 + 子卡计划）
  2. 修订历史追加 v1.25
- **验收**: PRD 含移动端适配章节，引用 T47 子卡

---

## 三、子卡依赖关系

```
T47.1 (触摸目标修复) — 独立，可立即执行
T47.2 (脚本入库)     — 依赖 T47.1 完成后入库（确保脚本已验证）
T47.3 (PRD 入册)     — 依赖 T47.1 完成后更新 PRD
```

---

## 四、A17 绝对锚点纪律

所有移动端断言必须含「与视口/祖先的绝对关系」，不得只用同族互等：

| 断言 | 类型 | 说明 |
|------|------|------|
| `min-height >= 44px` | 绝对尺寸 | 与视口无关的触摸目标标准 |
| `overflowX == 0px` | 视口绝对 | 相对于 `document.documentElement.clientWidth` |
| `|pageCenter - vpCenter| <= 1px` | 视口绝对 | 页面中心与视口中心对齐 |
| `pageWidth <= viewportWidth + 2` | 视口绝对 | 页面不超出视口 |
| `mapHeight >= expectedMinH` | 视口绝对 | 地图填充剩余视口高度 |

---

## 五、开销预估

| 子卡 | 预估 | 实际 |
|------|------|------|
| T47.1 | ~5min | |
| T47.2 | ~5min | |
| T47.3 | ~3min | |
| **总计** | **~13min** | |