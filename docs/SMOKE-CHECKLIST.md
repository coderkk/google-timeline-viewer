# SMOKE-CHECKLIST — 瀏覽器冒煙清單（按任務類型）

> 目的: 避免每次「從腦中隨機抽驗」造成遺漏（教訓: T30 冒煙漏 popover 焦點陷阱、T27 白屏回歸、T38 同族漏 Places）。
> 用法: Dev 提交審查前按卡上 `冒煙:` 標註類別勾選必驗項做瀏覽器實測，**把勾選結果附在提交說明**（缺則 Reviewer 可打回）。
> 冒煙 = **獨立維度，與檔位解耦**。**三層義務（A13 裁決基準）**：①**標準項（通用必驗段）任何檔位都要跑**，豁免只針對本次改動引發的迴歸冒煙；②**類別冒煙（§A-D）= 迴歸冒煙**，L1 豁免（無類別標註），L2/L3 按卡上標註跑；③**發佈鏈任務（發佈前收尾/終批/發佈驗證）不論檔位跑全集 = 標準項 + 全部類別**（發佈門禁不隨檔位縮水）。
> 位置: 項目級清單（本文件），模板在 `templates/project/docs/SMOKE-CHECKLIST.md`；Dev 複製當前任務對應的類型段落 + 旅程板到提交說明即可。

## 可複現入口（A10 / WORKFLOW 規則 16，2026-09-17 T43 落地）

> 每條勾選項後標註可複現入口：**能腳本化的指向 `scripts/` 命令**；**純人工項（截圖核對、視覺確認、真數據體感）如實標「人工項」**——標不出入口不是「不用做」，是「人來做」，勾選人自己對結果負責（誠實原則，不假裝都有腳本）。

| 入口 | 覆蓋 |
|------|------|
| `node scripts/smoke-release.mjs` | **發佈冒煙門禁**：雙視口 1440×900 / 390×844 × landing 200 / origin match / 4 卡 / 標題 / tags / CTA / help 路由 / overflowX / 0 pageerror（已知 frame-ancestors 噪音除外）。`--base <url>` 指本地 build；缺省 = live URL。退出碼 **0=全過 / 1=斷言失敗 / 2=運行錯誤** |
| `node scripts/smoke-race-check.mjs` | **N1 競態封印**：Places 點地圖跳離×6 + Trips 重導入瞬跳×3 + 側欄收展×3，須 0 `_leaflet_pos` pageerror |
| `node scripts/smoke-network-tap.mjs` | **隱私網絡門禁**（deploy.yml 阻塞）：雙視口 S1–S8 全流程捕獲 ⊆ 白名單；退出碼 0/1/2/3 |
| `node scripts/perf-browser.mjs` / `perf-raw-window.mjs` / `perf-make-merged.mjs` | **C 類性能壓測**（T37 三件套） |
| — | 其餘**純人工項**（截圖核對 / 視覺確認 / 真數據導入體感 / 統計肉眼比對）逐條標註 |

## 類別速查

| 類別 | 何時標註 | 對應段落 |
|------|---------|---------|
| A 導入/數據 | import/parse/merge/統計 | §A |
| B UI/交互 | 組件/狀態機/旅程變更 | §B（含旅程板） |
| C 性能/渲染 | 壓測/優化/門檻 | §C（分佈量判據） |
| D 文檔/配置/部署 | 文案/模板/gitignore/發布 | §D |
| 發布鏈 | 發布前收尾/終批/發布驗證 | 全集 + `docs/release-runbook.md`（卡上冒煙字段寫「全集+runbook」） |

## 通用必驗（所有類型都會跑）

- [ ] 0 pageerror（console errors = 0；既有已知告警除外並註明來源 + 觸發條件 + 記錄日期——A12 量化規則）— **可複現**: `node scripts/smoke-release.mjs`（雙視口 landing/help 路徑；兩路徑均是顯式 pageerror 斷言）；**全旅程頁面 0 pageerror 無腳本可覆蓋 = 人工項兜底**（`smoke-network-tap.mjs` S1–S8 只是網絡視角遍歷全旅程頁——只註冊 dialog/request 事件，**不判 pageerror**，勿誤認它兜了錯誤檢查）；首交互競態區由 `smoke-race-check.mjs`（0 `_leaflet_pos` pageerror 專項）
- [ ] 主流程單測 + build（tsc / vite build）綠 — **可複現**: `cd src && npm run lint && npm run test && npm run build`
- [ ] 桌面視口 1280px 過一遍主流程 — **人工項**（腳本固定視口 1440×900 / 390×844，1280 需手動過一遍）
- [ ] 移動視口 390px 過一遍主流程（含**首次交互路徑**——首訪即加載/跳轉的競態區，N1 教訓）— **半機器化**：landing/help/overflowX/0 pageerror 由 `smoke-release.mjs` 390 視口覆蓋；首交互競態區由 `smoke-race-check.mjs`；完整導入→trips 旅程體感 — **人工項**

## §A 導入/數據處理任務（import、parse、merge、統計…）

- [ ] sample 與真數據各過一遍導入 — **半機器化**：真實 import worker 路徑由 `smoke-network-tap.mjs` S4（fixture + `.trips-summary` 數據就緒斷言）；真數據體感 — **人工項**
- [ ] 大檔案（若涉及）壓測載入時間 / long task — **人工項**（110MB+ livedata；按 A16 預算按需跑）
- [ ] 空數據 / 畸形數據：有錯誤提示，不白畫面 — **人工項**（錯誤提示內容是語義判斷）
- [ ] 摘要統計與數據一致（抽一筆人工比對）— **人工項**（肉眼比對無腳本代替）
- [ ] **三方對賬（A15）**：腳本輸出 ↔ 報告引用 ↔ 入庫數據一致 — **人工項**（核對動作本身）

## §B UI/交互重寫（組件、狀態機、模式切換、旅程變更…）

> **B 類按「旅程板」鋪，不按功能鋪**（Designer 評審 2026-09-16）：缺陷常跨旅程出現——任務涉及旅程 B-2 時，先核旅程板清單 + 環境矩陣再動工；旅程級缺陷 → 新增/修訂旅程板，不塞組件補丁。

### B-1 組件狀態機（單組件內）

- [ ] 雙視口: 1280px + 390px（行動端）— **人工項**（smoke-release 腳本視口為 1440/390，1280 手動；組件可達性按 B-2 旅程）
- [ ] 開/關、展開/收起往返切換 ≥3 次（狀態不殘留）— **人工項**（交互體感無腳本代替）
- [ ] 模式 / 語言 / 數據切換後回到原場景正常（re-render 不崩、無 remount 打斷）— **人工項**
- [ ] 鍵盤: Esc 可關、focus 不丟失（或標註為已知一般級限制）— **人工項**（鍵盤語義是交互判斷）
- [ ] aria: 觸發按鈕 `expanded` / `haspopup` 等屬性正確 — **人工項**

### B-2 旅程板（項目級維護）

> 旅程 = 用戶從入口到完成的完整路徑。從真實教訓提煉，不從組件清單推導：

| 旅程 | 路徑 | 判別斷言（可驗證，非「看起來 ok」） |
|------|------|-----------------------------------|
| **J1 首次訪問** | 打開 → Landing → 導入 → 看到數據 | 首屏 0 錯誤；導入後統計數=期望值；無白屏 |
| **J2 回訪/換數據** | 打開 → 再導入另一份 → 視圖切換 | 舊數據不殘留；重新渲染無 remount 打斷；**N1 封印**：`node scripts/smoke-race-check.mjs`（Places 點地圖即跳離×6 + Trips 重新導入瞬跳×3 + 側欄收展×3，必須 0 `_leaflet_pos` pageerror） |
| **J3 移動端單程** | 390px 下從 Landing 到三角視圖完成單程 | 首訪交互不炸（N1 競態區）；控件可觸達 |

> 旅程級回歸：本次改動涉及的旅程段全路徑跑一遍（不只組件內）。可複現入口：**J2 密封腳本** = `smoke-race-check.mjs`；**J1/J3 首屏 0 錯誤** = `smoke-release.mjs`（雙視口 landing/help；其餘旅程頁 0 pageerror 為人工項兜底）；**路由可達** = `smoke-network-tap.mjs` S1–S8 全路由遍歷（網絡視角，不判 pageerror）+ `smoke-release.mjs` help 路由；完整旅程體感（導入→統計→切換）— **人工项**。

### B-3 環境矩陣（加權組合抽查）

| 環境軸 | 取值 |
|--------|------|
| 設備 | 桌面 1280 / 平板 768 / 移動 390 |
| 輸入 | 真數據 / sample / 空 / 畸形 |
| 渲染 | reduced-motion on/off、放大 200%（若支持） |

- [ ] 任務涉環境軸組合中取 2-3 組加權組合實測（改動概率 × 破壞成本高者優先）— **人工項**（環境抽查是語義動作）
- [ ] 競態/時序類改動：**動畫中途切換路徑**（250ms 內導航——N1 同族），移動 390px 下實測 — **可複現**: `node scripts/smoke-race-check.mjs`（含 Places 點地圖即跳離×6，須 0 pageerror）

## §C 性能 / 渲染（分佈量判據，防「重跑至綠」）

> C 類 **不賭單次採樣**（負載波動出假 PASS/假 FAIL——T39 WIDE 教訓）。**判據寫進卡**：

- [ ] **分佈量斷言**：取 pooled p95（≥3 次採樣合併）對比基準值 × 容忍係數 k；單樣本超限不算 FAIL，記錄分佈 — **可複現**: `node scripts/perf-browser.mjs` / `scripts/perf-raw-window.mjs`（T37；判據按本段，重跑規則人工守）
- [ ] **負載指紋**（防空轉跑綠）：記錄採樣時 CPU 負載基線（longtask 計數 / 內存），聲明「低負載下測得」，超標時複測或標註環境說明 — **半機器化**：腳本記錄原始數據，基準判定 — **人工項**
- [ ] **門檻行為**：LOD / 點數門檻超預算時兩端保留、downsample 生效（縱向比較 > 絕對閾值）— **人工項**（縱向比較是語義判斷）
- [ ] 曾優化過的 long task 複測（Performance 記錄全量入庫，不只看最後一次跑了綠）— **可複現**: `scripts/perf-browser.mjs`（記錄全量輸出至 `scripts/out/`）
- [ ] **重跑規則**：有效重跑上限 3 次且全分佈入庫；連續 FAIL 2 次即上報 CEO，不悶頭重跑到綠 — **人工項**（紀律，人守）

## §D 文檔 / 配置 / 部署

- [ ] 文件模板 / gitignore 一致 — **人工項**（diff 判斷）
- [ ] build 產物可部署；部署後 hash 比對 live 是否更新 — **半機器化**：`sha256sum dist/index.html` vs `curl -s <live>/index.html | sha256sum`（命令可跑，比對結論人工判）
- [ ] 對外主張與 codebase 一致（COPY.md 對照；**截圖人工核對**——grep 盲區）— **人工項**（逐張開圖看實物 vs 當前 UI；標註「疑似不一致」的重截後再發佈，見 runbook）
- [ ] CHANGELOG 已切版/追加（發布鏈：先於 tag）— **人工項**

## 隱私/數據斷言（Security Engineer 2026-09-16；機器斷言，非人工勾選）

> **可複現入口（T42 落地，2026-09-17）**：
> - 執行：`node scripts/smoke-network-tap.mjs --base <preview-url>`（本機 `vite preview`；CI 由 `python3 -m http.server 4173 -d dist` 供給）
> - 單一白名單源：`scripts/privacy-allowlist.json`（self + OSM tile host + blob:/data:/about:/file: 非網絡 scheme）
> - **已進 `deploy.yml` 作阻塞門禁**：build → privacy → deploy（`deploy.needs: [build, privacy]`）；退出碼 **0 = 乾淨 / 1 = 違例 / 2 = 量具壞（校準失敗，絕不假綠）**

- [ ] **運行時 network-tap**：`page.on('request')` 全量捕獲，斷言捕獲集合 ⊆ 白名單（self + tile hosts + 已登記端點 + blob 下載）——**已機器化**：雙視口 S1–S8 全流程捕獲 + 逐請求裁決（ALLOW-SELF / ALLOW-TILE / VIOLATION-*）
- [ ] **單元斷言**：隱私處理邏輯（metadata 剝離、導出清洗）有純函數單測
- [ ] **校準（量具自檢）**：探針 A（fetch 注入）+ 探針 B（自定義瓦片 UI 注入）均須被判 VIOLATION-HOST；未判中 → exit 2，不綠
- [ ] 措辭注意：**不寫「0 網絡請求」**（happy path 存在 tile 請求會成噪音）——寫「集合 ⊆ 白名單」

## 提交說明附註格式

```markdown
自測: tsc ✓ / tests 243 ✓ / build ✓
冒煙: A+B(J1,J3 移動首訪)+C 型（SMOKE-CHECKLIST §A §B-1/§B-2 §C）
  - 0 pageerror ✓（唯一告警 = 既有 CSP meta + frame-ancestors 注記，非回歸；觸發: 首頁加載；記錄 2026-09-16）
  - 1280+390 雙視口 ✓（390 首訪 J1 全路徑含競態區）
  - N1 封印 ✓（smoke-race-check.mjs: A 6/6、B 3/3、C 3/3，0 pageerror）
  - 開闔 3 次狀態不殘留 ✓
  - Esc 關閉 ✓（焦點陷阱: 一般級已知限制，見 NOTES）
  - C 類: pooled p95 = 31ms（n=5）≤ 基準 28ms×1.3，負載指紋低 ✓
  - network-tap: `node scripts/smoke-network-tap.mjs --base <url>` exit 0（捕獲集 ⊆ 白名單 ✓；校準雙探針 flagged ✓）
  - release-smoke: `node scripts/smoke-release.mjs --base <url>` exit 0、18/18 PASS、0 pageerror（僅既有 CSP 噪音 ✓）
```