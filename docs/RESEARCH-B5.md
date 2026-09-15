# B5 侦察报告：livedata visit/activity 时间重叠形态

> **任务**: T32（B5 侦察 — livedata visit/activity 重叠形态量化）
> **日期**: 2026-09-15
> **作者**: CEO（依据 Dev 侦察 + Reviewer 审查）
> **状态**: 侦察完成 · 待用户拍板分支实验方向

---

## 1. 背景

### 1.1 B5 的任务来源

B5（P2, Backlog）:「livedata 完整支持（新版 Timeline.json 语义段重叠合并）」——在 activity 段继承 timelinePath 轨迹（T13.2/T13.3 已完成）之后，**进一步评估 visit 段与 activity 段的关联展示**（PRD 功能 3/13 延伸）。

初始假设：真实导出文件（livedata）里 visit 段与 activity 段可能时间重叠，T29 行程链的「纯前后配对」会因此产生错误展示。

### 1.2 为什么要侦察

- 无法做标准 A/B（纯本地、无埋点、无后端、隐私承诺）→ 采用**分支实验模式**（`experiment/<slug>` = 实验组，main = 对照组，用户本地真数据对比后拍板 merge/关闭）。
- 开分支做实验之前必须确认「实验做的是真现象」→ 先量化数据形态。
- 决策：2026-09-15 DECISIONS「B5 分支实验模式 + T32 侦察验收」。

### 1.3 数据与方法

| 项 | 内容 |
|----|------|
| 数据 | `docs/livedata/Timeline-20250213.json`（109MB，83,202 段）、`Timeline-20260820.json`（124MB，97,382 段） |
| 脚本 | `scripts/analyze-visit-activity-overlap.mjs`（独立 Node ESM，~4s/文件，全量扫描非抽样） |
| 算法 | O(V log S + k) 排序 + 二分定位 + 区间重叠判定；T29 配对精确模拟（与 `lib/tripChain.ts` 逻辑逐行对照一致） |
| 审查 | Reviewer PASS（c5c8d67；分类求和反查全对、T29 模拟与产品实现一致、N1 caveat 补入 §9.4） |
| 完整原始数据 | `scripts/out/overlap-report-{20250213,20260820}.txt`（含全部 10 个三角样本），DATA-FINDINGS §9 领域知识留档 |

---

## 2. 核心发现（反直觉）

### 发现 1：visit 与 activity-keyed 段是「干净时间分区」——零重叠

| 文件 | visits | activity-keyed 段 | 重叠对 |
|------|-------:|------------------:|-------:|
| 2025 | 30,682 | 26,843 | **0** |
| 2026 | 37,287 | 30,702 | **0** |

**Google Timeline 语义段模型把「停留」（visit）与「出行」（activity）设计为互斥、时间上不重叠**。一个 visit 结束后下一个 activity 才开始（0ms 或正 gap，绝无负 gap）。T29 行程链在 activity 段层面**100% 正确**。

> B5 原始问题「visit↔activity 段重叠展示」在语义段层面**不存在**。

### 发现 2：真实盲区在 timelinePath-only traces

产品解析层（`parse/common.ts addSegment`）把 **timelinePath-only 记录（2h 粗粒度 GPS 窗口）也推入 `state.segments`**，`prepareTrips` 将两层段（activity-keyed + trace）一并喂给 `buildTripChain`。重叠全部来自 trace 段：

| | 2025 | 2026 |
|---|-----:|-----:|
| 段总数（T29 实际输入） | 52,498（activity 26,843 + trace 25,655） | 60,073（30,702 + 29,371） |
| **重叠对**（全来自 trace） | **35,349** | **43,092** |
| 形态 A（trace ⊇ visit） | 8,579 | 10,988 |
| 形态 B（visit ⊇ trace） | 4,581 | 5,519 |
| 形态 C（头端相交） | 6,985 | 8,657 |
| 形态 D（尾端相交） | 15,204 | 17,928 |
| 中位重叠时长 | 46.6 min | 45.3 min |
| 最大重叠时长 | 120 min（= trace 窗口） | 120 min |

**本质**：trace 是「环境 GPS」（ambient GPS）——手机静止在停留期间也在记录 2h 定位窗口，物理上必然盖住 visit。这不是数据缺陷，是 Google 的记录粒度。

### 发现 3：T29「三角」（back-to-back）现象——23% 的链移动段受影响

T29 配对把一个 trace 段配成「V1 的 outgoing + V2 的 incoming」且同时与两个 visit 时间重叠：

| | 2025 | 2026 |
|---|-----:|-----:|
| 三角段 | **9,558**（占 42,082 链移动段 ~23%） | **11,117**（占 48,284 ~23%） |
| 三角 visit-pair | 12,037 | 15,517 |
| 三角中位重叠 | 11.9 min | 10.8 min |
| activity-keyed 段中的三角 | **0** | **0** |

**三角 100% 来自 timelinePath-only traces**（activity-keyed 段 0 个）。

典型样本（跨 2017–2024，两文件共有同源数据）：
```
trace 2017-12-16 02:00 → 04:00 (5.96923, 116.06471)
  fromVisit 00:50:59 → 06:40:49  overlap 120min（停留 5h50）
  toVisit   01:49:41 → 04:36:21  overlap 120min（停留 2h47）
```
→ 一个 2h GPS 窗口同时覆盖两个长停留，T29 配成「V1 → trace → V2」，duration 显示**整 2h 窗口**而非真实旅途。

### 发现 4（附带）：格式与数据事实补充

- 时间戳字段名是 `startTime`/`endTime`（DATA-FINDINGS §2.2 概述曾写 `startTimestamp`/`endTimestamp`，已修正）。
- `timelineMemory` 段仅 22 条，按设计忽略。
- 1,082 对 exact duplicate visit（同 start/end、不同 placeId 候选），占 visits ~3.5%。

---

## 3. 影响评估

### 3.1 对产品现状

- **activity-keyed 行程链**：完全正确，不涉及。
- **time 轴模式（功能 3 默认）**：合并排序 + 去重逻辑不受影响（三角是链模式专属）。
- **「按活动类型」模式（功能 13）**：~23% 链移动段是 2h trace 窗口——**duration/距离标签粒度偏粗**，activityType 缺失显示为默认「移動」。
- **用户感知**：多数三角涉及长停留（数小时），trace 是停留期间的环境 GPS；用户不太可能觉察 duration 偏大。**严重度：中低**。

### 3.2 对 B5 的影响

B5 的两个候选方向（A：过滤 trace 进链；C：关闭）均有完整数据支撑；**B（trace 降级展示）不推荐**——trace 本就不是「真实移动」，保留进链还标注只会增加 UI 噪音。

---

## 4. 建议

### 4.1 建议做分支实验（方向 A：过滤 timelinePath-only traces 进链）

**改动假说**：`buildTripChain` 输入只收 activity-keyed 段（丢弃 timelinePath-only trace），链的 duration/距离显示变准（=真实移动段），「三角」归零。

**已知 trade-off（completeness caveat，Reviewer N1）**：

| | 2025 | 2026 |
|---|-----:|-----:|
| visits 总数 | 30,682 | 37,287 |
| activity-keyed chain movements（过滤 trace 后的链边数） | 26,027 | 29,875 |
| **缺口** | ~4,655 visit（15%） | ~7,412 visit（20%） |

→ 过滤后**部分 visit 将缺失 incoming/outgoing**（这些 visit 只靠 trace 与他段相连）。实验必须量化：
1. 缺口 visit 的实际观感（链里变成孤立停留 vs 仍可用）
2. 补缺代价（是否值得为 trace-only 相连的 visit 引入降级展示）

**这是一个真正需要「人肉 A/B」权衡的点**：准确性 vs 完整性。实证后才能拍板。

### 4.2 实验设计要点（若开 `experiment/b5-livedata-overlap`）

1. 改动面 ≤ 1-3 文件（tripChain 输入过滤 / 或 prepareTrips 层过滤）
2. 用 livedata 全量跑链统计：过滤前后「三角数 → 0、duration 分布变化、缺口 visit 数」
3. 你本地对比 main vs 分支在 2025/2026 真数据上的链观感（重点看长停留密集期）
4. merge 门控走完整流程（Reviewer + 冒烟 + 验收）
5. 备选结论：缺口观感不可接受 → 关闭分支、B5 以「认知入档」收尾

### 4.3 不开分支的选项

如果倾向保守：B5 直接收尾（现象轻微、多为长停留、用户不易察觉），认知已完整留档（DATA-FINDINGS §9 + 本报告），未来若用户在实际使用中感到 duration 不准再开实验。**零风险、零投入**，但放弃一次「实证能否改善」的机会。

---

## 5. 结论

| 问题 | 答案 |
|------|------|
| B5 原始问题存在吗？ | **不存在**——visit 与 activity 段零重叠 |
| 真正的问题是什么？ | timelinePath traces（2h 环境 GPS）混入行程链，~23% 链移动段是粗粒度窗口 |
| 值得做实验吗？ | **值得试**——改动面小、可对比、trade-off 明确（准确性 vs 完整性）；但也存在「现象轻微不值得」的关闭路径 |
| 决策点 | 用户拍板：开分支实验（方向 A）/ 关闭 B5（认知已入档） |

---

*关联文档: DATA-FINDINGS.md §9（领域知识）、scripts/out/（原始数据）、DECISIONS.md 2026-09-15 21:35、NOTES.md 2026-09-15 21:30 / 21:31、TASKS.md T32（Done）*