# B5 实验报告：过滤 timelinePath-only traces —— 结果与结语

> **任务**: T33（实验分支 — by activity 行程链过滤 timelinePath-only traces）
> **分支**: `experiment/b5-livedata-overlap`
> **日期**: 2026-09-15
> **作者**: CEO（依据 Dev 实现 + Reviewer 审查）
> **前置阅读**: `RESEARCH-B5.md`（侦察分析 + 假设 + 方案对比）

---

## 〇、30 秒速览

| 侦察假设 | 实验结果 |
|---------|---------|
| 「方案 A 代价：15-20% 停留变孤立点」| **❌ 假设被推翻**——实测 isolated visits = 0，无代价 |
| 「三角（假移动）会归零」| **✅ 验证**——12,037/15,517 → 0/0 |
| 「≈2h 假移动段会清空」| **✅ 验证**——19,891/22,701 → 75/75 |
| 「中位链时长会缩短」| **✅ 验证**——50.4/47.8 min → 15.0/14.8 min |

结论：**方案 A 是净改善**（三角归零 + duration 回归真实 + 零孤立），可 merge。

---

## 一、实验背景

### 1.1 问题回顾

Google Timeline 的 `semanticSegments` 里有一类「孤儿 timelinePath-only records」——每 2 小时一次的 ambient GPS 巡逻窗口，无活动语义（`RESEARCH-B5.md` §3-4）。产品解析层把它们也压成 `Segment`，`buildTripChain`（by activity 模式）把它们当「移动段」配对，造成 **~23% 的链移动段是 2h 假移动**（三角现象，`RESEARCH-B5.md` §4）。

### 1.2 实验方案

在 `buildTripChain` 内部过滤：**只配对 `hasActivitySemantics !== false` 的段**（activity-keyed 段），跳过孤儿 trace。`hasActivitySemantics` 标记在解析层（`parse/common.ts addSegment`）从原始 record 形状一次性设置，遵循与侦察脚本完全一致的判据（`RESEARCH-B5.md` §5 三方交叉验证）。

时间轴模式（`prepareTimeline`）不受影响（该模式读物理点、不读链）。

---

## 二、实验结果（livedata 全量扫描）

数据源：`Timeline-20250213.json`（83,202 段）/ `Timeline-20260820.json`（97,382 段），脚本 `scripts/compare-chain-main-vs-branch.mjs`，与 `buildTripChain` 配对逻辑完全一致。

| 指标 | main（现状） | 分支（方案 A） | 变化 |
|------|------------:|--------------:|------|
| **链边数**（参与链的 unique segments） | 42,082 / 48,284 | 26,027 / 29,875 | −38%（仅真移动） |
| **三角**（同一段是 V1 outgoing + V2 incoming） | 12,037 / 15,517 | **0 / 0** | ✅ 归零 |
| **≈2h 假移动段**（110–130 min 桶） | 19,891 / 22,701 | **75 / 75** | ✅ 清空 |
| **孤立停留**（incoming+outgoing 均 null） | 0 / 0 | **0 / 0** | ✅ 无代价 |
| **中位链时长** | 50.4 / 47.8 min | **15.0 / 14.8 min** | 回归真实 |

### 2.1 Duration 分布对比（2025 文件）

```
                    main              branch
 < 10min         8,778           →  9,100
10–14min         3,655           →  3,902
 < 15min        12,433           → 13,002
15–30min         5,947           →  6,925
30–60min         3,055           →  4,349
 1–2h              545           →  1,112
 ≈2h            19,891  ← 三角核心 →    75    ← 清空
  > 2h             211           →    564
```

关键：**≈2h 桶从 19,891 条暴降至 75 条**（-99.6%）。这 19,891 条就是三角现象的主体——2h GPS 巡逻窗口被当成「移动 2 小时」。过滤后，原本被假移动覆盖的 visit 连接由**真实的 activity 段**接管（middle 桶计数上升属正常，因为三角段的替代者是更短的真实出行）。

---

## 三、结论

### 3.1 产品决策

| 项目 | 决定 |
|------|------|
| **by activity 模式** | ✅ **可 merge**——三角归零、duration 真实、零孤立代价 |
| **timeline 模式** | 无改动（零影响） |
| **改动面** | 3 个文件，加 1 个谓词（`isActivityMovement`）+ 1 个段标记（`hasActivitySemantics`） |

### 3.2 知识沉淀

这次侦察→实验走完一轮完整的「假设→数据验证→修正→再验证」循环，沉淀了以下领域知识：

1. **Google Timeline 数据模型设计**：visit 与 activity 是干净时间分区（互斥），这保证了 T29 在语义段层面 100% 正确——原假设「visit↔activity 重叠」不存在（`RESEARCH-B5.md` §2）。

2. **ambient GPS 的角色**：timelinePath-only traces 是「环境 GPS 巡逻」（每 2h 一次的定位窗口），物理上必然盖住停留段——这不是数据缺陷，是 Google 的记录机制（`RESEARCH-B5.md` §3）。

3. **行程链的精度边界**：by activity 模式的行程链是「语义层移动」的展示，不应包含「物理层 GPS 巡逻」——过滤后链更干净、duration 更真实、用户感知改善显著。

4. **侦察报告里的「缺口」是错误推理**：「链边数 < 停留数」≠「有停留无连接」——链边是段的去重计数（一条边服务两个停留侧），侧数与段数不可比。正确口径是「两侧都为 null 的停留」，实测为 0。**这类量纲陷阱值得留存教训**。

---

## 四、修订历史

| 版本 | 变更 |
|------|------|
| 初版（2026-09-15 22:00） | 实验报告创建，记录方案 A 对比结果 |

---

*关联文档: RESEARCH-B5.md（侦察分析）、DATA-FINDINGS.md §9（领域知识留档）、scripts/out/chain-compare-*.txt（原始数据）、DECISIONS.md 2026-09-15 21:35*