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

## 三、可信度论证（bias direction）

> 本节回答：「结果为什么可信？」——逐条列出可能破坏结论的口径差异，做方向推理（偏高 or 偏低），证明误差方向是保守的（不夸大结论）。所有疑虑均来自实验脚本（`compare-chain-main-vs-branch.mjs`）与产品代码（`buildTripChain` / 解析层）之间的实现差异。

### 疑虑 A：无坐标 visit 的计数口径（脚本 vs 产品）

- **差异**: 实验脚本的 `visits` 数组只推入带 `rec.visit` 包装的记录，且对无坐标 visit **不 drop**（直接用 `toMs(startTime/endTime)` 计时）。产品解析层则会 **drop 缺坐标或缺时长的 visit**——同一数据，脚本可能多算了几条 visit。
- **方向**: 脚本 visits 数是产品的**上界**（脚本多、产品少）。若脚本世界里 isolated=0（每条脚本 visit 都有邻居），则产品的子集（更少 visit）必然也 isolated=0——**多算 visit 只会让「有孤立」更容易出现，不会掩盖孤立**。
- **反向**: 脚本会不会漏掉产品有而脚本没数的 visit？（如无 `visit` 包装但有位置语义的记录）——两文件 `other=0`（无未分类记录，`RESEARCH-B5.md` §5），且为直出格式（visit 必带 wrapper），排除此方向。
- **判定**: 保守 ✅

### 疑虑 B：坐标解析差异（E7 格式 / 坐标缺失）

- **差异**: 脚本 `getLatLng` 不处理 `latitudeE7/longitudeE7`（E7 坐标），只处理 `latLng` 字符串。若数据含 E7 坐标，脚本会把真实 activity 段误标为 trace 而过滤掉。
- **方向**: 误标 trace → 分支链边只会**更少**、isolated 只会**偏高**（更难达到 0）→ 实测仍为 0，意味着产品端（正确解析坐标）只会更宽松地保留段，isolated 同样为 0。
- **事实**: 当前两份 livedata 均使用 `latLng` 字符串格式（解析层 `parse` 单测覆盖 E7 分支），无实际影响；即使将来遇到 E7 数据，方向仍保守。
- **判定**: 保守 ✅

### 疑虑 C：脚本模拟与产品 `buildTripChain` 的逐行对齐

- **差异**: `simulateChain` 是脚本内重写的配对逻辑，产品是 `tripChain.ts buildTripChain`——两套代码。
- **方向**: 已逐行核对：相同排序比较器（`startMs` 升序、同时刻 segment 在前）、相同 prevSeg/nextSeg 单次扫描、相同事件构造顺序；唯一差异是 `filterTraces` 守卫（实验组）。若有不一致，只会让脚本的**数量逼近但不等**——且所有关键数字（三角、isolated、duration 分布）均可由脚本输出**完全复现**（`scripts/out/` 两份文件与报告一致），一致性已由 Reviewer 独立复核。
- **判定**: 保守 ✅

### 疑虑 D：量纲陷阱（孤立 ≠ 停留数 − 链边数）

- **差异**: 若误用「停留数 − 链边数」推孤立（初期侦察 §5.2 的错误口径），会得出 15-20% 缺口的假象。
- **方向**: 本报告的 isolated 是**直接数两侧（incoming+outgoing）均为 null 的停留**，非减法推导——链边是段的去重计数（一条边服务两个停留侧），与停留数不可比。
- **判定**: 保守 ✅（此量纲陷阱的教训已沉淀于 §四 知识沉淀 #4）

### 疑虑 E：三角归零的自洽性

- **事实**: 侦察（T32）已证明三角 100% 来自 timelinePath-only traces（activity-keyed 段 0 三角，`RESEARCH-B5.md` §4）。方案 A 过滤 trace → 三角**必然**归零——结果与数据模型的已知性质自洽，而非偶然。
- **判定**: 保守 ✅

### 疑虑 F：窄范围（日期子集）下的孤立行为

- **事实**: 用户选定窄日期窗口时，窗口边界处可能出现局部孤立（incoming/outgoing 落在窗口外）——这是按范围过滤的**预期行为**（同 T29 的「首尾可缺」语义），不是 T33 引入的回退。全量扫描的 0 孤立代表数据级结论，界面级子集行为由 T29 配对口径定义。
- **判定**: 声明为预期行为 ✅

**综合判定**: 六个疑虑逐一验证，全部为保守方向或预期行为。**isolated=0、三角归零、duration 缩短这三个关键结论可信**。

---

## 四、结论

### 4.1 产品决策

| 项目 | 决定 |
|------|------|
| **by activity 模式** | ✅ **可 merge**——三角归零、duration 真实、零孤立代价 |
| **timeline 模式** | 无改动（零影响） |
| **改动面** | 3 个文件，加 1 个谓词（`isActivityMovement`）+ 1 个段标记（`hasActivitySemantics`） |

### 4.2 知识沉淀

这次侦察→实验走完一轮完整的「假设→数据验证→修正→再验证」循环，沉淀了以下领域知识：

1. **Google Timeline 数据模型设计**：visit 与 activity 是干净时间分区（互斥），这保证了 T29 在语义段层面 100% 正确——原假设「visit↔activity 重叠」不存在（`RESEARCH-B5.md` §2）。

2. **ambient GPS 的角色**：timelinePath-only traces 是「环境 GPS 巡逻」（每 2h 一次的定位窗口），物理上必然盖住停留段——这不是数据缺陷，是 Google 的记录机制（`RESEARCH-B5.md` §3）。

3. **行程链的精度边界**：by activity 模式的行程链是「语义层移动」的展示，不应包含「物理层 GPS 巡逻」——过滤后链更干净、duration 更真实、用户感知改善显著。

4. **侦察报告里的「缺口」是错误推理**：「链边数 < 停留数」≠「有停留无连接」——链边是段的去重计数（一条边服务两个停留侧），侧数与段数不可比。正确口径是「两侧都为 null 的停留」，实测为 0。**这类量纲陷阱值得留存教训**。

---

## 五、修订历史

| 版本 | 变更 |
|------|------|
| 初版（2026-09-15 22:00） | 实验报告创建，记录方案 A 对比结果 |
| v2（2026-09-15 23:4x） | 新增 §三 可信度论证（bias direction）——六项疑虑逐条方向推理；后续章节重编号 |

---

*关联文档: RESEARCH-B5.md（侦察分析）、DATA-FINDINGS.md §9（领域知识留档）、scripts/out/chain-compare-*.txt（原始数据）、DECISIONS.md 2026-09-15 21:35*