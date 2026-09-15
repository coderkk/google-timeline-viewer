# Notes

> 开发日志（追加式）。格式：`## YYYY-MM-DD HH:mm — 角色` + 内容。

## 2026-09-15 12:10 — Dev 修正 Reviewer T29（S3/A1/A2/A3/A4/N1/N）

**S3（行動端觸控目標回歸）**：`index.css` 的 `@media (max-width:768px)` 觸控目標清單加入 `.chain-stay, .chain-move`（`min-height: 44px`）。**390px 實測**：`.chain-move` 由 21px → **44px**；`.chain-stay` 67px。

**A1（保留內聯顯示，補相鄰停留名）**：保留「常駐內聯移動行」做法；移動行補目的地：
- incoming → `↑ 抵达：方式 · 时长 · 距离 → 本站`（en `→ this stay`）
- outgoing → `↓ 移动：方式 · 时长 · 距离 → {下一站名}`（缺名用座標；最後一站用 segment end 座標）
- `ChainMovement` 新增 `end: Point` 供最後一站 fallback；i18n key `chain.outgoing/incoming` 加 `{dest}`、新增 `chain.destHere`。
- 同時修 **PRD 功能 13 ②**：改為「左側以**常駐**行程鏈列表顯示；點停留飛到該點、點移動飛到該段並高亮」，移除 click-to-show「← 從哪來 / → 去哪」措辭。

**A2（chain 只在 activityType 計算）**：`TripsPage` 的 `buildTripChain` `useMemo` 加 `mode` 依賴，時間軸模式回傳模組級 `EMPTY_CHAIN`，不再白算。

**A3/A4（PRD 措辭收緊）**：刪 PRD 功能 13 括號中「不重叠即相邻」半句（自相矛盾），只留「按時間排序取緊鄰前驅/後繼；首尾可缺」；並在 `tripChain.ts` 檔頭 + PRD 明示**配對邊界**：只有緊鄰前驅/後繼進鏈，兩停留之間的**中間段**與**不鄰接任何停留**的段不進鏈（設計使然）。

**N1（清死碼）**：刪除 `src/src/components/StopList.tsx`（已無引用）。`.stop-list-*` CSS class 仍被 `TimelineList`/Places 使用，**未動 CSS**。

**N（補測試）**：新增「同時刻 segment 排在 visit 前（segment 為 incoming）」測試。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **202 passed**（15 檔；201 → +1）。**390px 瀏覽器實測**：鏈頭 `Trip chain (191)`、`.chain-move` 全部 44px、入向行 `↑ Arrived by: Driving · 20m · 7.6 km → this stay`、出向行 `↓ Movement: Driving · 20m · 7.3 km → 家（模拟）`、0 pageerror。**未 commit、未 push**。

## 2026-09-15 11:55 — Dev T29 行程鏈（visit↔activity 關聯，功能 13）

**範圍**：MVP 只做「按活動類型」模式；時間軸模式不動。

**`lib/tripChain.ts`（純函式、O(n log n) 排序 + O(n) 掃描）**
- **配對口徑**：把 visits 與 segments 合併成事件、依 `startMs` 升序（同時刻 segment 排在 visit 前，代表「停留一開始就在移動」）；一次前掃記下每個位置「最近的前驅 segment」，一次後掃記下「最近的後繼 segment」。每個 visit 得 `incoming`/`outgoing`（首尾可缺）；跨午夜以絕對 `startMs` 正確配對。
- **每段提供**：`activityType`、`durationMs`（`endMs-startMs`，**clamp 到 range**，與統計 A1 一致）、`distanceKm`（沿 `path` 的 haversine；`path.length > 0 ? path : [start, end]`，與渲染器 S3 口徑一致——單點 path → 0）。
- `ChainVisit` 另帶 `stayDurationMs`（clamp 到 range）與 `visitIndex`（呼叫端陣列索引，供選取）。
- 未涵蓋：兩個 segment 之間沒有 visit 的段不進鏈（visit-centric，MVP 可接受）。

**`components/TripChainList.tsx`**
- 停留行：名稱/座標 + 地址 + `時間 → 時間 · 停留時長`；其下縮排「↓ 移动：方式 · 時長 · 距離」。
- **去重**：每個移動只渲染一次——若它是前一個停留的 `outgoing` 就不再作為本停留的 `incoming` 重複顯示（`rows` 先算好，避免 render 中可變賦值，通過 `react-hooks/immutability`）。
- 點停留 → `flyTarget` 飛到該點並清除段選取；點移動行 → 飛到該段 path 中點並以 `highlightedSegments`（單段 Set）高亮（`TripMap.hasSelection` 會淡化其餘幾何）。空狀態 / 超過 `LIST_LIMIT` 沿用既有文案 key。

**`pages/TripsPage.tsx`**：`buildTripChain(preparedTrips.visits, preparedTrips.segments, dateRange)` 以 `useMemo` 計算後傳入 `MapPane`；`MapPane` 在 `activityType` 模式渲染 `TripChainList`（取代 `StopList`），新增 `selectedSegmentIndex` state 與 `highlightedSegments` 分支；`StopList` 已不再使用。另把活動類型的 key 對應抽到共用 `lib/i18n/activity.ts`（`activityMessageKey`），`TripChainList` 與圖例共用。

**i18n**：新增 `chain.head` / `chain.empty` / `chain.outgoing` / `chain.incoming`（zh + en），en 無殘留中文。

**驗證**：
- 單測 `tripChain.test.ts` **10 條**：正常前後配對、首尾無鄰（各一）、無相鄰段、跨午夜、排序 + `visitIndex` 保留、時長 clamp、距離（path≥2 / path<2 fallback / 單點=0）。
- 瀏覽器（production build + sample）：
  - 切「按活动类型」→ 鏈頭 `Trip chain (191)`、191 停留行、229 移動行；首項 `↑ Arrived by: Driving · 20m · 7.6 km` + `↓ Movement: Driving · 20m · 7.3 km`；鏈內 CJK 僅 sample 地名（無 UI 中文）。
  - 點停留 → `.chain-stay.selected`=1、地圖中心移至該點；點移動行 → `.chain-move.selected`=1、停留選取清除、中心移至該段；0 pageerror。
  - 切简中 → `行程链（191）`、`↑ 抵达：驾车 · 20分钟 · 7.6 公里`、`↓ 移动：驾车 · 20分钟 · 7.3 公里`。
  - 收合/展開面板（S1 回歸路徑）在 activityType 下不白屏、鏈仍在、0 pageerror。

**驗證指令**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **201 passed**（15 檔；191 → +10）。**未 commit、未 push**。

## 2026-09-15 11:40 — Dev 回退 N1「防禦性修正」（引入白屏致命回歸）

**誠實記錄**：上一則（11:25）我為 N1 在 `FitController` 的 effect cleanup 加了 `map.stop()`。**這是錯的**——它引入了致命回歸。

**症狀（Reviewer 實測，deterministic）**：載入示例 → 點 Trips 頂欄「收起面板」→ `#root` children = 0、**整頁白屏**；console `TypeError: Cannot read properties of undefined (reading '_leaflet_pos')`，堆疊為 `getCenter → setZoom → stop`（effect cleanup）。

**根因**：`sidebarOpen` 切換時 `MapPane` / 直連 `TripMap` 兩棵樹互換 → `FitController` 卸載 → cleanup 執行；此時 react-leaflet 已開始移除 map/pane，`map.stop()` 內部的 `setZoom → getCenter → _getMapPanePos` 讀到**已卸離的 pane** 而 throw，React 樹崩潰 → 白屏。

**處置：直接回退** `map.stop()`，恢復 cleanup 只 `cancelAnimationFrame(raf)`。並在該 cleanup 留註解：**永遠不要在 unmount cleanup 呼叫任何 map 方法**（N1 的消音若要做，只能在非 unmount 時機用 ref 區分，且必須實測；本輪不做）。

**N1 狀態**：恢復為**非阻塞已知 console 噪音**（`_leaflet_pos` @ `_onZoomTransitionEnd`，快速離開地圖且動畫未完時偶發），不影響功能，不修。

**實測（production build + Playwright，回退後）**：
1. 載入示例 → Trips：`#root` children=1
2. **收起面板 → 展開面板**：collapsed map present=true；expand 後 map present=true、1051×462、children=1 —— **不白屏**
3. 時間軸 ↔ 按活動類型：children=1
4. Places → Trips：children=1
5. Settings 切語言 → Trips：children=1
全程 **0 個 pageerror**（無 `_leaflet_pos`）。截圖：`.playwright-mcp/gtv-expand-ok.png`。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **191 passed**。**未 commit、未 push**。`stats.ts` 的 S3 修正未動。

## 2026-09-15 11:25 — Dev 修正 Reviewer S3 最終 + N1 判斷

**S3（`segmentsDistanceKm` fallback 門檻與渲染器不一致）**：`lib/stats.ts` 的 `s.path.length >= 2 ? s.path : [s.start, s.end]` 改為 **`> 0`**。對照渲染器 `TripMap.positions`（`> 0`）、`polylineEndpoints`（`> 0`）、`boundsOf`（`> 0`）——`prepareTrips` 裁切後跨午夜段可能只剩 1 個頂點，地圖只畫 1 點不畫線，距離須為 0；原 `>= 2` 會 fallback 到**未裁切的 `[start,end]`**，把範圍外整條腿的距離算進 activityType 的總距離。**補測試**：`segmentsDistanceKm([單點段]) === 0`，且該段 `start` 與 `path[0]` 不同（證明若走 fallback 會有非零距離）。

**N1（Leaflet `TypeError: ... '_leaflet_pos'` @ `_onZoomTransitionEnd`）— 判斷為既有，非本輪引入**：
- 觸發：快速離開 `#/app`、地圖於 zoom 動畫期間卸載時，`transitionend` 在 map pane 已被移除後仍觸發 Leaflet `_onZoomTransitionEnd`，讀取已卸離的 `_leaflet_pos` 而拋錯。
- 為何既有：zoom 動畫由 `FitController` 的 `map.fitBounds(...)`（T5 起）觸發，其生命週期在本輪（T27/T28）**完全未改**；本輪新增的 `TripStatsPanel` 是純 DOM、`stats.ts` 是純函式、i18n 只改文字。故與 T27/T28 無關。
- 處置：採 Reviewer 允許的**可選低風險收斂**——在 `FitController` 的 effect cleanup 加 `map.stop()`（child cleanup 先於 `MapContainer` 的 `map.remove()` 執行，會取消進行中的動畫，避免 detached pane 上的 `transitionend`）。未做其他改動。
- 註：headless 環境用多次快速切頁**未能穩定重現**（時序敏感），故上述為根因分析 + 防禦性收斂，非「已驗證修復」。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **191 passed**（14 檔；190 → +1 S3 測試）。**未 commit、未 push**。

## 2026-09-15 11:10 — Dev 修正 Reviewer T27/T28（S3 + A1/A2/A3）

**背景**：Reviewer 對 T27/T28 判 PASS-WITH-CONDITIONS（S3 必修、A1/A2/A3 必修、A4/A5/N 記錄）。

**S3（store 內已解析字串不隨語言切換）**：store 不再存放任何已翻譯字串。
- `dataLabel` 只存**首個檔名**，另加 `dataFileCount`；sample 以 `dataSource==='sample'` 推導；`DataBar` 顯示時才組合（sample → `t('data.sample')`；多檔 → `${name} ${t('data.filesSuffix',{count})}`）。
- 自訂瓦片名改用中性 sentinel `CUSTOM_TILE_NAME='custom'`（`lib/tiles.ts`），`SettingsPage` 由 `isDefault` 推導顯示 `OpenStreetMap` 或 `t('settings.customTileName')`。
- **實測**：設简中 → 載入示例 → DataBar「模拟数据」；切 English → DataBar「Sample data」（無 CJK）；Settings 自訂瓦片名 en「Custom」/ zh「自定义」。

**A1（活躍天數/日均停留未裁到範圍）**：`computeTripStats` 新增 `range`，對段與停留的 interval 及停留時長做 `clampInterval`（range 邊為 null 不裁）。跨午夜記錄不再把範圍外那天計入活躍日，`totalStayMs` 只含範圍內部分。補測試：單日範圍 + 跨午夜段/停留 → 活躍天數 = 1、時長 = 範圍內部分；open range 不裁。

**A2（距離口徑隨模式）**：新增 `segmentsDistanceKm`（逐段 path 或 start→end 的 haversine 和）；`computeTripStats` 加 `distanceSource: 'route' | 'segments'`，`TripStatsPanel` 依 `mode`（timeline→route、activityType→segments）傳入，確保與地圖繪製口徑一致。**實測 sample「全部」**：timeline **8236 km** vs activityType **8124 km**（兩者確實不同，符合兩模式畫的幾何不同）。未採更複雜的「統一幾何」方案，因 Reviewer 明確要求「與地圖口徑一致」，而兩模式地圖本就畫不同幾何。

**A3（截斷警告單位錯 100×）**：`MAX_RAW_POINTS=2_000_000` 原以 `/1_000_000` 標「万」→ 顯示「2 万」（實為 20k）。改除數為 `10_000` →「200 万」；`localizeWarning` en 規則同步做 万→M 換算（200万 → 2M）。補/改測試：parse 測試斷言含 `200 万`；i18n 測試斷言 `累计 raw points 超过 200 万` → `Cumulative raw points exceeded 2M`。

**A4/A5/N1（記錄，不修）**：
- **A4**：地點聚合沿用 `name → address → 粗座標`，**同名不同地會被合併**——已在 `lib/stats.ts` 檔頭註明。
- **A5**：Web Worker 的**未知**解析 warning 模板 `localizeWarning` 不匹配時原樣輸出，英文 UI 可能殘留中文（diagnostic，正常檔案不顯示）——已記。
- **N1**：死碼 `SAMPLE_LABEL` / `COORDS_PRIVACY_NOTE` / `trips.ts` 舊 zh 格式化 helper **暫不刪**（待 CEO 決定）。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **190 passed**（14 檔；186 → +4：A1 裁切、A2 segmentsDistance、open-range、A3 單位）。**未 commit、未 push**。

## 2026-09-15 10:55 — Dev T27 行程統計報表 + T28 多語言（EN/简中）

**T27（功能 11）**：新增 `lib/stats.ts`（`routeDistanceKm` / `computeTripStats`）+ `components/TripStatsPanel.tsx`。
- **面板位置**：Trips 左側欄，DataBar → DateRangePicker → **TripStatsPanel** → 時間線/停留列表。理由：與日期範圍同區、隨篩選即時更新、時間軸與活動類型兩種模式都可見、不佔用頂欄也不遮地圖；移動端抽屜內同樣可讀。
- **口徑**：總距離 = timeline route 連續頂點 haversine 累加；活躍天數 = 段與停留 `[start,end]` 覆蓋的本地日聯集（用 `setDate` 逐日步進，DST 安全，並對病態長跨度設 20000 天上限）；日均距離 = 總距離/活躍天數；日均停留 = Σ(visit 時長)/活躍天數；地點頻次 = `groupVisitsByLocation` 聚合後按次數（同次數比時長）排序取 Top 5。
- **效率**：全部 O(n) 掃描，`useMemo` 綁定 `[route, segments, visits]`，不在 render 做 O(n²)。
- **sample 實測（全部）**：總距離 **8236 km**、活躍 **55 天**、日均 **150 km/天**、日均停留 **16h 11m**；Top 5：家（模拟）78 次 · 339h30m、公司（模拟）37 · 375h25m、Bella 咖啡館 32 · 36h20m、大安森林公園 10 · 15h、南門市場 10 · 7h30m。
- 單測 `stats.test.ts`（距離、跨日活躍天數、日均、Top N cap、零活動）。

**T28（功能 12）**：自建輕量 i18n，**無新增依賴**。
- 架構：`src/lib/i18n/zh.ts`（key 的 source of truth）+ `en.ts`（`satisfies Record<MessageKey,string>`，缺/多 key 即型別錯誤）+ `index.tsx`（`I18nProvider` / `useI18n()` / `detectLang` / `translate` / 格式化）+ `warnings.ts`（解析 warning 的英文模板映射）。
- **預設語言**：`navigator.language` 以 `zh` 開頭 → 简中，其餘 → English。**設置頁手動切換**（English / 简体中文）。**不持久化**——刷新回瀏覽器語言（已實測）。
- **格式化隨語言**：日期 `2026-09-15` vs `Sep 15, 2026`、時間 `14:05`、時長 `9小时5分` vs `9h 5m`、千分位（`Intl.NumberFormat`）、距離 `公里`/`km`、月標題、週首字母。
- **覆蓋範圍**：Header/Footer、Landing、EmptyState、ImportPanel、DataBar、DateRangePicker、Trips（summary/legend/toggle/empty/downsampled）、TripStatsPanel、TimelineList、StopList、TripMap（tooltip + 點擊 popup）、Places、VisitHistoryPanel、Help（含步驟/FAQ/格式表）、Settings、ExportButton、tiles 驗證訊息、store（大檔確認/未識別/範例標籤/自訂瓦片名）、`document.title` 與 `<html lang>`。
- **未覆蓋 / 限制（誠實列出）**：①Web Worker 的解析 warning 以 `localizeWarning` 對已知模板做 best-effort 英譯；**未匹配的新模板會原樣輸出**。②`import.workerFailed` 等 worker 端錯誤訊息在產生時用 `detectLang()`（瀏覽器語言），不隨手動切換；③多檔 `dataLabel` 在導入當下以當時語言生成（切語言後不重算）；④`sample/SAMPLE_LABEL`、`coords/COORDS_PRIVACY_NOTE`、`trips.ts` 的 zh 格式化 helper 保留但已不在 UI 使用（供舊測試/相容）。
- **驗證**：production build + Playwright（瀏覽器 en-US）**逐頁掃描 CJK**：Landing / Trips / Places（含查詢結果）/ Help / Settings / 匯出彈窗 → **無 UI 中文殘留**（僅 sample 資料地名與語言選項「简体中文」為刻意保留）；切換简中後 summary/stats/日曆標題均正確；**刷新後回英文**（無持久化）。單測 `i18n.test.ts`（key 集合一致、en catalog 無 CJK、detectLang、formatters、localizeWarning）。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **186 passed**（14 檔；167 → +19：stats 8 + i18n 8 + localizeWarning 3）。**未 commit、未 push**。

## 2026-09-15 10:55 — Dev 更新 OPC 3.0 連結（改指作者網站）

**CEO 新決定**：OPC 3.0 連結改指向使用者的個人網站 **`https://coderkk.net`**（原本指向私有 repo `coderkk/opc-3.0`，公開訪客會 404）。
- `src/src/lib/site.ts`：`OPC_3_LINK` → `'https://coderkk.net'`；註解更新為「指向作者網站；OPC 3.0 repo 私有，公開連結會 404」。
- `README.md`：`[OPC 3.0](https://github.com/coderkk/opc-3.0)` → `https://coderkk.net`。
- 全庫 grep：`src/`、`README.md` 已無 `github.com/*/opc-3.0` 殘留；唯一殘留在本 `docs/NOTES.md` 的**歷史條目（10:40）**——屬已發生事實的日誌，**刻意不改寫**，僅於該條目加「已被本條取代」標記。**不再有 404 問題**。

**驗證**：production build + Playwright 讀 Landing「了解更多 →」→ `href = "https://coderkk.net"`；`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **167 passed**。**未 commit、未 push**（CEO 統一提交）。

## 2026-09-15 10:40 — Dev 設定 OPC 3.0 連結（Reviewer T26 S3）

> **註：本條 URL 已由 10:55 條目取代**（原指私有 repo `github.com/coderkk/opc-3.0`；因公開訪客 404，CEO 改指 `https://coderkk.net`）。以下為當時的事實記錄。

**CEO 拍板 URL** `https://github.com/coderkk/opc-3.0`：
- `README.md`：`[OPC 3.0](https://github.com/opencode/opc-3.0)` → `https://github.com/coderkk/opc-3.0`。
- `src/src/lib/site.ts`：`OPC_3_LINK` 由 `'#'` → `'https://github.com/coderkk/opc-3.0'`；順手移除過時註解「Placeholder replaced at T10 deployment…」，改註明私有 repo 的已知取捨。
- 檢查殘留：全庫 grep `href="#"` / `OPC_3_LINK`，僅 `site.ts` 定義與 `Landing.tsx:112` 使用；`Footer.tsx` 是站內 `<Link to="/#built-with-opc">`（非外鏈），不動。

**驗證**：production build + Playwright 讀 Landing 的「了解更多 →」→ `href = "https://github.com/coderkk/opc-3.0"`；Footer「Created by OPC 3.0」= `#/#built-with-opc`（站內，正確）。`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **167 passed**。

**已知取捨（CEO 已知悉）**：該 OPC 3.0 repo **維持私有** → 公開 portfolio 訪客點此連結**會得到 404**。CEO 接受此取捨，明確要求**不移除連結、不改指向別處**。若日後要避免 404，需改為公開或移除連結。

**未 commit、未 push**（CEO 統一提交）。

## 2026-09-15 10:25 — Dev 修正 Reviewer T26 複審（S2 + A1/A2）

**背景**：Reviewer 對 T26 判 PASS-WITH-CONDITIONS。

**S2（阻塞，README 隱私聲明缺外鏈例外）**：原絕對句「你的坐标永远不出你的设备」只列瓦片例外，與同檔 What's new 及 App Landing 矛盾。已改為「**除下列外部请求外，你的坐标不出你的设备**」，並補一條與 Landing/設置頁對齊的說明：地圖點彈窗預設「複製坐標」（純本機、不聯網）；只有主動點「在 Google Maps 開啟」才把坐標 + IP 送給 Google；瓦片請求同理。

**A1（CHANGELOG 遺漏）**：補齊缺漏里程碑——`T10.1`（Pages 部署 workflow）/`T10.2`（中文 README）/`T10.3`（正式部署上線）併入 09-13 節；`T12`（改名 Timeline Map + Theme + 半徑檔位 + marker 顏色）與 `T12.6` 併入 09-13；`T13.6`（rawSignals 接入）/`T13.7`（時區修復）併入 09-14；另加 T26 的 `Docs / Portfolio` 條目（README/截圖/LICENSE/CHANGELOG）。

**A2（settings.png 未含外鏈披露）**：以 production build 重截 `settings.png`（1440×900，滾動至「数据生命周期」），現完整入鏡 5 條含「外部链接例外：…若你主动点『在 Google Maps 開啟』，该坐标与你的 IP 会发送给 Google」。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **167 passed**（僅動文件與截圖）。**未 commit、未 push**。**未觸碰** README 的 OPC 3.0 連結與 `site.ts` 的 `OPC_3_LINK`（待 CEO 給 URL）。

## 2026-09-15 10:05 — Dev T26（README / portfolio 修复）

**來源**：Writer 於 2026-09-15 brainstorm 提的發現。僅動文件與截圖，未動程式。

**修復項**：
1. **README 圖片路徑全裂**：原本引用裸檔名（`landing-full.png` 等），實際在 `docs/screenshots/` → 全部改為 `docs/screenshots/…`。
2. **重拍截圖（10 張，sample data）**：用 production build + 「立即體驗」載入模擬資料，避免真實位置資料。清單：
   - `landing-full.png`（全頁）、`landing-hero.png`（Hero）、`landing-builtwith.png`（Built with OPC 區塊）
   - `trips.png`（時間軸模式 + 左側時間線 + 雙月曆 + 更換資料）
   - `trips-activity.png`（按活動類型 + 交通方式圖例 + 銜接）
   - `places.png`（地圖點擊查詢 98 停留）
   - `export.png`（行程匯出彈窗 + 隱私護欄）
   - `mobile.png`（390px 移動端抽屜版面）
   - `help.png`、`settings.png`
3. **重複圖**：`landing-hero.png` 與 `landing-builtwith.png` 原 md5 完全相同（其一錯）→ 兩張都重拍為各自內容，現 md5 相異（`716f6e…` vs `c9a03b…`）。
4. **LICENSE**：新增 `LICENSE`（MIT，Copyright (c) 2026 coderkk）。
5. **佔位符**：`https://github.com/<user>/…` 與 demo `<user>` → `coderkk`；badge `(#)` → LICENSE / GitHub Actions / live demo 真實連結。
6. **What's new / 近期更新**：README 新增段落（時間軸模式、逐點真實時間、雙月曆、左側時間線、更換資料、匯出、移動端、跨午夜）。
7. **CHANGELOG.md**：新增，記 T1–T25 里程碑（Keep a Changelog 風格，**未打 git tag**，交 CEO 決定）。
8. 順修：Places 半徑文案 `10–5000KM` → `1–100 KM`（與功能/實作一致）。

**驗證**：以腳本抽取 README 全部相對連結/圖片目標（12 個，含 `CHANGELOG.md`/`LICENSE`）逐一 `os.path.exists` → **全部存在、0 缺失**；`<user>`、`](#)` 佔位符 0 殘留；`docs/screenshots/` 10 檔全部被引用、無多餘。`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **167 passed**（未動程式）。**未 commit、未 push**。

**未完成 / 待辦**：CHANGELOG 版本號與 git tag 留待 CEO 發布決策；截圖為 headless Chromium 產生，若需更精緻的宣傳圖可日後人工重拍。

## 2026-09-15 09:45 — Dev 修正 Reviewer S2 複審（裁切被 fallback 抵銷）

**背景**：Reviewer 複審判 FAIL——S3 的裁切被下游 `path.length >= 2` fallback 用**未裁的 `segment.start/end`** 抵銷；跨午夜段裁到剩 1 點時 activityType 仍畫 01-29 的點/線/bounds。

**修法（三處 `>= 2 → > 0`，有 path 就以 path 為準）**：
1. `TripMap.tsx` `positions`：`segment.path.length > 0 ? segment.path : [start, end]`（單點 Leaflet 安全）。
2. `trips.ts` `polylineEndpoints`：`> 0` 用 path 首末，否則 `start`/`end`。
3. `trips.ts` `boundsOf`：`path.length > 0` 只 grow path；否則 fallback `start`/`end`（path-less 段保留既有 fallback）。
4. 未動 `segmentVertices` 的 `>= 2`：`buildTimelineRoute` 對每個頂點另按 `sortMs` 過濾，時間軸模式本就不會被未裁端點畫出，維持原狀以縮小影響面。

**回歸測試（+3，共 167）**：①`boundsOf(prepareTrips(跨午夜段, range).segments, [])` = 僅 `{9,9}`（不含 01-29 的 `(1,1)`）；②path-less 段 `boundsOf` 仍 fallback `start/end`；③`bridgeLines` 對裁到 1 點的段，`from` = 該點 `(9,9)` 而非未裁 `start (1,1)`。

**`>= 2 → > 0` 影響確認**：現有 `boundsOf` 測試的 path 端點 = start/end（不受影響）；`bridgeLines` 測試的 path 皆 ≥2 點（`>0` 不觸發差異）；新測試覆蓋 1 點情境。無測試被破壞。

**A（重繪）**：`TripMap` 的 `handleZoom` 改為**只在 `zoom >= DOT_MIN_ZOOM` 布林值翻轉時**才呼叫 `onZoomChange`（`lastDotsAvailable` ref），不再每次 `zoomend` 都上報 → `TripsPage` 不再每個 zoom 級別重繪整個 `TripsView`。

**N（文件訂正）**：①上則 09:30 S3 條目「`prepareTrips`（→ `positions`/`routePoints`/`boundsOf`）共用裁切」與事實不符（首輪 `boundsOf` 未裁），已就地加訂正說明；②上則 interactive tooltip 敘述「不再於 mouseout 自動關閉」錯誤——Leaflet 在 `!permanent` 時**仍**綁 `mouseout: closeTooltip`，已訂正為「`interactive` 只讓 tooltip 內容可互動；可靠入口是左欄選停留的 permanent tooltip，hover tooltip 在觸屏不保證穩定」。③`clipSegmentPath` 註解 + `DATA-FINDINGS §8.5` 明示「path-less 且跨午夜的段仍以未裁 `[start,end]` 畫線，屬既有 fallback 固有限制」。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **167 passed**（12 檔）。**未 commit、未 push**。

## 2026-09-15 09:30 — Dev 修正 Reviewer S2/S3 + A/N（T20–T25）

**背景**：Reviewer 對 T20–T25 判 PASS-WITH-CONDITIONS（2 阻塞 + A/N）。CEO 拍板處置，以下逐條。

**S2-a（T23 與 PRD 功能 3 衝突）**：採「改 PRD 不改實作」。`PRD.md` 功能 3 補「轨迹点在 **zoom ≥ 6** 显示为圆点；低 zoom 全景视图（< 6）仅绘制折线以保证性能（折线完整不省略）」，並加修訂記錄 **v1.17**（引用 T23 / `DATA-FINDINGS §8`）；`DATA-FINDINGS §8.4` 反向連回該 PRD 條款，並註明 `DOT_MIN_ZOOM` 即其閾值。

**S2-b（低 zoom 開關靜默空操作）**：採建議①。`TripMap` 匯出 `DOT_MIN_ZOOM`、新增 `onZoomChange` prop（`ZoomWatcher` 於 mount + `zoomend` 回報）；`TripsPage` 上提 `mapZoom` state，軌跡點開關在 `zoom < 6` 時 `disabled`，外層 `<span class="trips-toggle-wrap">` 承載 `title`（disabled button 收不到 pointer 事件，自身 title 不會顯示）。CSS 加 `.trips-toggle:disabled` 樣式。

**S3（activityType 未裁跨午夜）**：抽 `segmentVertices(segment)`（含無 `timestampMs` 的插值排序鍵）為單一真相，`clipSegmentPath(segment, range)` 依時間裁頂點，`buildTimelineRoute` 與 `prepareTrips` 共用。**取捨**：`clipSegmentPath` 對 `path.length < 2` 的段原樣返回，不展開 start/end fallback，以免改變所有無路徑段的 `totalPathPoints` 語義。補單測：`clipSegmentPath` 跨午夜裁點、open range 全保留、插值判定、path-less 不展開、`prepareTrips` 實際裁掉（= activityType 渲染輸入）。
> **訂正（S2 複審後）**：本條首輪敘述為「`prepareTrips`（→ `positions`/`routePoints`/`boundsOf`）共用裁切」——**與事實不符**：首輪只裁了 `segment.path`，`boundsOf` 仍 grow 未裁的 `start`/`end`，且下游 `path.length >= 2` fallback 會用未裁端點畫線，導致裁到 1 點時仍重現 01-29 幾何。S2 複審已將 `boundsOf` 與三處 `>= 2 → > 0` fallback 一併修正（見頂部 09:45 條目），此句現才成立。

**A 級**：
- `ExportButton.tsx`：`URL.revokeObjectURL` 改 `setTimeout(..., 1000)`（避免 Firefox/舊 Safari 取消下載）；加 Esc 關閉 + 開啟後 focus 進對話框 + 關閉還焦 trigger（focus trap 未做，範圍外）。
- `CopyCoordsButton.tsx`：加 `aria-live="polite"`。
- `TripMap.tsx` / `PlacesMap.tsx` 的停留 `<Tooltip>` 加 `interactive`（讓 tooltip 自身內容 `pointer-events:auto`，觸屏可點到內含按鈕）。
> **訂正（S2 複審後）**：首輪寫「interactive tooltip 不再於 mouseout 自動關閉」——**錯誤**。Leaflet 在 `!permanent` 時仍綁 `mouseout: closeTooltip`；`interactive` 只讓 tooltip 內容可互動，hover tooltip 仍可能因 mouseout 關閉。因此**可靠入口是「左欄選停留 → permanent（selected）tooltip」**，hover 觸發的複製按鈕在觸屏上不保證可穩定點擊（本輪接受此限制，不硬解）。仍成立的副作用：tooltip 區域 `pointer-events:auto` 會小範圍攔截地圖拖拽。
- 補單測：`coords.test.ts`（clipboard guard reject / 成功寫入 / URL / note）、`±5min` 邊界（恰好 = 覆蓋、略超 = 保留）、`cap → downsampled` 傳播（`prepareTimeline` route cap、`prepareTrips` combined path cap）。另 `coords.ts` 加 `typeof navigator` 守衛以便在 node 測試環境不炸。

**N 級**：`.trip-tip-actions .trip-tip-link { margin-top: 0 }`（與複製按鈕對齊）；NOTES T25 條目 `ExportDialog.tsx → ExportButton.tsx`；PRD 功能 10 移到功能 9 之後。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **164 passed**（12 檔；+13：coords 4 + clipSegmentPath 5 + ±5min 2 + cap 傳播 2）。**未 commit、未 push**。

## 2026-09-15 09:05 — Dev（覆核 T20–T22 + T23/T24/T25）

**覆核 T20–T22（CEO 直接實作、未提交）**：讀 diff 逐項核對 PRD 驗收 → **T21/T22 正確**（按頂點覆蓋 ±5min、跨午夜按 `sortMs` 裁到 range，單測已覆蓋）；**T20 發現缺口**：Security 點名的 `PlacesMap.tsx` 外鏈仍是裸的 `<a>Open in Google Maps</a>`，無隱私標注、無複製坐標。已修：
- 抽出 `lib/coords.ts`（`writeCoordsToClipboard` + `COORDS_PRIVACY_NOTE` + `googleMapsUrl`）與 `components/CopyCoordsButton.tsx`，TripMap/PlacesMap 共用。
- `PlacesMap` 的停留 marker 改用 `<Tooltip>`（座標 + 複製坐標 + Google Maps 連結 + 外鏈警示），與 TripMap 一致。
- 順手加固：`navigator.clipboard` 在非安全上下文可能不存在 → 回傳 rejected promise（不再同步 throw），UI 顯示「複製失敗」。
- 驗證（sample，Places）：setView 台北 → 169 停留；hover marker → tooltip 含「複製坐標 / 在 Google Maps 開啟 / 外部链接会把坐标与你的 IP 发送给 Google」，href 正確。

**T23 渲染效能壓測**：production build + 真實 123.4MB `Timeline-20260820.json`（route 30k 點）。基線縮放 p95 461ms、longtask max 1796ms（明顯卡頓）。處置：①`TripMap` 低 zoom（<6）只畫折線不畫點（`DOT_MIN_ZOOM` + `ZoomWatcher`）②`GLOBAL_PATH_POINT_CAP 30000→12000`、`RAW_POINT_CAP 20000→12000`。結果：平移 ~34fps、縮放 277–538ms、秒級凍結消除。完整數據 `DATA-FINDINGS.md §8`。

**T24 移動端**：CSS `@media (max-width:768px)`：單月曆、Trips/Places 抽屜 overlay（地圖全高）、頂欄收拢、觸控 ≥44px、Header nav 橫向滾動。375×667 實測（sample）：單月、地圖 471px 全高、抽屜 280px、可見地圖 191px、全按鈕 44px、無橫向溢出。

**T25 行程導出**：`lib/export.ts` + `ExportButton.tsx`（DataBar 入口）。GeoJSON/KML，導出當前篩選範圍軌跡 + 停留；確認彈窗 + 隱私護欄（剝離 metadata、不自動上傳、本地 Blob）。實測 GeoJSON 1 LineString+191 Point、KML 192 Placemark、0 網絡請求、無檔名泄漏。

**驗證**：`npx tsc --noEmit` / `npm run lint` / `npm run build` 全綠；`npm run test` **151 passed**（+8 export 單測；T20–T22 基線 143）。**未 commit、未 push**，待 Reviewer。

**已知問題 / 待決**：①低 zoom 隱藏點層後「顯示/隱藏軌跡點」按鈕在 zoom<6 無視覺效果（語義仍在，PRD 功能 3「每個頂點都顯示為圓點」在低 zoom 有偏差，已記 DATA-FINDINGS §8）②點層首次掛載（z6）仍有 ~250ms 尖峰，徹底解法是改用非 React 批量圖層（本次未做）③效能數據為 headless 環境，絕對值有噪聲。

## 2026-09-15 08:30 — Dev T22（跨午夜：标注 + 路径裁剪）

**用户困惑**：选 2025-01-30 出现 2025-01-29。根因 = overlap 语义纳入**跨午夜记录**（visit 01-29 16:58→01-30 08:47；timelinePath 01-29 22:00→01-30 00:00），且段的路径点整段带入。CEO 建议 A+C、团队共识：记录保留并标注，路径点裁剪。

**实现**：
- `buildTimelineRoute`：在 `candidates.sort` 后、去重前，按顶点 `sortMs` 裁到 `range`（`startMs`/`endMs` 非 null 时）。跨午夜段不再把前一天的点画到地图。
- `TimelineList`：读 store `dateRange.startMs`，对 `visit.startMs < rangeStartMs` 的停留加 badge「跨夜 · 自 MM-DD」。
- `TripMap`：新增 `rangeStartMs` prop；停留 tooltip 加同款标注；`TripsPage` 两处（MapPane / 直连）传入。
- CSS：`.timeline-badge` / `.trip-tip-overnight`（琥珀虚线胶囊）。

**测试**（143，+1）：新增「clips an overlapping segment's vertices to the selected range (T22)」——段跨 range，仅中间顶点保留。

**验证**（sample data）：选 2026-07-21 → 过夜停留显示 badge「跨夜 · 自 07-20」；时间线列表的轨迹点只有 07-21 的（07-20 的已被裁掉）。143 单测 + build + lint 全绿。

**流程备注**：本任务由 CEO 直接执行（用户指示「先做 T22」）；**T23–T25 + README 应交 Dev 执行、Reviewer 审查**。T20/T21/T22 目前均未提交。

## 2026-09-15 07:15 — Dev T20 + T21（外链隐私 + 覆盖判定修正）

**来源**：2026-09-15 brainstorm 团队讨论（Security Engineer 提阻塞项、Reviewer 提正确性风险）。先改 PRD（功能 5 外链例外、功能 2 跨午夜、v1.15）再开 T20/T21。

**T20 外链隐私（Security 阻塞项）**：`googleMapsUrl()` 把精确坐标放进 URL 送 google.com，点击还泄漏 IP/Referer，与「数据不出设备」矛盾。改：
- 地图点弹窗默认动作 = **「复制坐标」**（`navigator.clipboard.writeText`，纯本机）；Google Maps 外链保留但加注「外部链接会把坐标与你的 IP 发送给 Google」。
- 停留 tooltip 同样加复制按钮 + 注明；CSS `.trip-popup-copy` / `.trip-tip-copy`（tooltip 内需 `pointer-events:auto`）。
- Landing 隐私承诺 + 设置页「数据生命周期」补「外链例外」。
- 验证：点弹窗含复制+链接+提示；点「复制坐标」→「已复制」，`performance.getEntriesByType('resource')` 过滤 google/maps **为空**（默认路径零外送）；左栏选停留 → tooltip 齐全。

**T21 coveredByRaw 边界修正（Reviewer 提的正确性风险）**：原逻辑「段跨度内命中一个 raw 点 → 整段丢弃语义路径」。30 天保留窗边界、或 raw 有缺口时，长段会被误判「已覆盖」→ 路线空洞。改为**按顶点**判定：顶点时间 ±5min 内有 raw 点才丢弃，否则保留。跨边界/跨缺口的段仍贡献未覆盖顶点。

**测试**（142，+1 净）：新增「边界不留洞」用例（raw 只覆盖段前 30min → 段末端顶点保留、source=mixed）；改写「已被 raw 覆盖」用例（顶点级覆盖）。`npm run test` 142 / build / lint 全绿。

**待办**：T22（A1 跨午夜标注+裁剪）、T23（性能压测）、T24（移动端）、T25（导出）；README 修复排最后（等 UI 定稿）。

## 2026-09-14 21:10 — Dev T18 + T19（双月历日期选择 + 更换数据）

**需求来源**：用户三条——①DatePicker 难用（选 A：双月历范围选择器）②选 2025-01-30 却出现 2025-01-29（**用户暂缓决定**，见下）③选了 JSON 后能否换（→ 放日期范围上方：按钮 + 文件名）。

**流程**：按新规则先写 PRD（功能 2 修订 + 新增功能 9、v1.14）再拆 T18/T19，再动手。

**实现**：
- **T18 `DateRangePicker` 重写**：双月历（当前月 + 下月并排），点起始日 → 点结束日；区间高亮（`is-start`/`is-end`/`in-range`）、标今日、前后翻月（‹ ›）与翻年（« »）；保留 全部/近 30 天/近 1 年 快捷（应用时同步把视图跳到该月）；底部「起始 → 结束」文字 + 「清除」；单边 = 只点一天即从该日起。CSS 以 `.drp-cal-*` 取代旧 `.drp-fields/.drp-field`。
- **T19 `dataLabel` + `DataBar`**：store 增 `dataLabel`（`importFiles` 记文件名/多档「X 等 N 个文件」、`loadSample` 记「模拟数据」、`clearData` 置 null）；新增 `DataBar` 组件（「当前数据」+ 文件名 + 「更换数据」按钮 → `clearData`），放在日期范围**上方**（Trips 与 Places 共用）。`clearData` 此前从未被任何 UI 调用，本次首次接线。

**验证**（用 sample data，秒级——遵守新规则「UI 用 sample」）：DataBar 显示「模拟数据」；双月历点 09-10 → 09-14，标签「2026-09-10 → 2026-09-14」、start/end 高亮 + 3 个 in-range、地图过滤为「68 轨迹点 · 8 停留」；点「更换数据」→ 回空状态（导入按钮出现、DataBar 消失）；Places 侧栏同样有 DataBar + 双月历。141 单测 + build + lint 全绿。

**暂缓（待用户决定）**：选 2025-01-30 出现 2025-01-29，根因是**跨午夜记录**（visit 01-29 16:58→01-30 08:47、timelinePath 01-29 22:00→01-30 00:00）被 overlap 语义纳入，且段的路径点整段带入。已提供 A/B/C 方案，用户表示「再想想」。

## 2026-09-14 20:05 — CEO T16–T17 验收通过 + 已部署
用户确认「現在我可以回想我旅行的時間和路線」。提交 `b4ed89b`（14 files, +947/−72）并 push `origin/main`，GitHub Actions 部署成功：线上 `assets/index-CBgmSybv.js`（本地构建 hash 一致），bundle 含「在 Google Maps 開啟 / 时间线（ / 行程段轨迹 / 轨迹点（行程段）」。线上冒烟：Landing 正常 →「立即体验」载入示例数据 → Trips 时间轴 `1,335 轨迹点（GPS+行程段）· 191 停留`、左側「时间线（621）」。https://coderkk.github.io/google-timeline-viewer/

## 2026-09-14 19:20 — Dev T17 路径点时间 + 去重 + 大 marker + 左侧时间线

**用户反馈**：①「行程段轨迹」要顯示時間，才知道幾點經過那地方；②marker 大一點；③「感覺連接的線還是很多」；④左邊要顯示時間線，不是只有 13 個停留點。

**根因**：`semanticSegments[].timelinePath` 每個點其實都有 `time`（真實 GPS 時間），但解析器 `pointFromPathElement` 只取座標、丟掉時間 → 時間軸只能顯示「行程段軌跡」。而「線很多」是因為 T13.2 縫合把 timelinePath trace 複製進無 path 的 activity 段，兩者時間+座標完全相同，舊 route 逐段拼接 → 同一條軌跡畫兩次。

**实现**：
1. **`src/lib/types.ts`**：新增 `PathPoint extends Point { timestampMs?: number }`；`Segment.path` 改 `PathPoint[]`。
2. **`src/lib/parse/common.ts`**：`pointFromPathElement` 讀 `time`/`timestampMs`/`timestamp`（`timelinePath` 的 `time` 為 ISO）→ 路徑點帶真實時間；`pathToPoints`/`firstPath`/`TimelinePathCandidate` 改 `PathPoint[]`。
3. **`src/lib/trips.ts` `buildTimelineRoute` 重写**：不再按日分桶拼接，而是把 raw 點 + 語義段路徑點合成**一條按時間排序的軌跡**：
   - 段的路徑點帶自身時間；無時間者用段內插值作**排序鍵**（僅排序，不顯示）。
   - **已被 raw 覆蓋的段跳過**（段 span 內有 raw 點 → 用更精細的 raw），避免同一段路畫兩次；raw 視窗外才用語義段。
   - 連續重複點（同位置 ~1m 且同時 ±1s）折疊 → 消除縫合重複。
   - `source` 依實際來源給 raw/segments/mixed。
4. **`TripMap.tsx`**：路線點半徑 2.5→4、停留 marker 6/9→8/12；popup 顯示真實時間（有時間時），無時間才標「行程段軌跡」；`flyTarget` 型別放寬為 `Point`。
5. **新增 `TimelineList.tsx` + CSS**：左側時間線——把路線點（有時間者）與停留點合併按時間排序、按本地日分組；每列 `HH:mm` + 座標 / 停留時段+時長；點擊飛到該點。timeline 模式用 TimelineList，activityType 模式保留 StopList。

**测试**（`trips.test.ts` 等，139 → **141**）：更新縫合/解析用例納入 `timestampMs`；新增「帶 timelinePath 逐點時間」「raw 覆蓋的段被跳過（不重畫）」；cap 用例點距改 >1e-5 避免被去重。buildTimelineRoute describe 更名 T16/T17。

**验证**（浏览器，clean reload + 真实 123.4MB 文件）：
- 2025-01-30：summary 由 172 → **115 轨迹点**（去重掉縫合重複）；左側「时间线（122）」= 109 有時間的點 + 13 停留；點地圖藍點 popup 顯示真實時間「35.45121, 138.81386 / **2025-01-30 11:10** / 在 Google Maps 開啟」；canvas 藍 3344px、紅（大 marker）873px。
- 2026-08-01（raw 窗口）：523 原始點 → 537 軌跡點（523 raw + 14 個未被 raw 覆蓋段的補點），label 誠實為「GPS+行程段」。
- 141 單測 + build + lint 全綠。未 commit、未部署。

## 2026-09-14 18:40 — Dev T16.2 停留点配色 + 点选 GPS 弹窗（Google Maps 链接）

**用户反馈**：①13 個停留點不用連（確認：visits 本就不在 route 折線內，屬獨立 marker）；②停留點 marker 換顏色（原本和路線同藍色 #3b82f6，難分辨）；③172 軌跡點連線正確；④每個點（marker）可點擊看 GPS，並附連結開 Google Maps。

**实现**（`src/components/TripMap.tsx` + `src/index.css`）：
- **停留 marker 配色**：`fillColor` 由 `selected ? #f87171 : #3b82f6` 改為 `selected ? #f59e0b : #ef4444`（琥珀/紅），與路線藍明確區分；停留點本就不參與折線，維持不連。
- **點擊看 GPS + Google Maps 連結**：
  - 路線頂點：移除只在 hover 生效（canvas 圓點不觸發 DOM hover，實際無效）的 `<Tooltip>`，改為 `click` → `map.openPopup(...)`。新增模組級 `pointPopupContent()` 用 **真實 DOM**（非 HTML 字串，座標不可能被當 markup）建構 popup：座標 + 時間（語義段頂點顯示「行程段軌跡」）+ `<a>` Google Maps 連結（`target=_blank rel=noopener`）。用 `MapContainer ref` 取得 map 後 `openPopup(content, latlng)`，**單一共享 popup**，避免為每個頂點掛一個 `<Popup>`（路線可達數萬點）。
  - 停留 marker：tooltip 增座標 + Google Maps 連結；CSS `.trip-tip-link { pointer-events: auto }` 讓 Leaflet 預設 `pointer-events:none` 的 tooltip 內連結仍可點。
  - 座標去重：popup/tooltip 僅在有「名稱」時才另起一行顯示座標（路線頂點標題即座標，不重複）。

**验证**（浏览器，clean reload + 真实 123.4MB 文件，2025-01-30 时间轴）：
- 停留 marker 紅色：canvas 檢出 482 個紅色像素（#ef4444）；路線藍 4786。
- 點路線點 → `.leaflet-popup` 內容「35.46409, 138.80301 / 行程段軌跡 / 在 Google Maps 開啟」，href `https://www.google.com/maps?q=35.4640884,138.8030056`、target `_blank` ✅
- 點停留點 → tooltip「35.03430, 137.22202 / 2025-01-30 15:00 · 15m / 在 Google Maps 開啟」，link `pointer-events: auto`、實際點擊開啟新分頁 ✅
- 139 單測 + build + lint 全綠。未 commit、未部署。

## 2026-09-14 18:10 — Dev T16.1 时间轴轨迹点跟随路线（每个路径点都显示）

**用户反馈**：2025-01-30 时间轴只看到 13 个点（停留 marker），但「按活动类型」有 165 个路径点。用户要求：时间轴要把**全部**走过的点放出来、按时间排、再连起来——「每個點都是走過的痕跡」。

**根因**：T16 把语义段轨迹接进了 `route` 折线，但 TripMap 的圆点仍只遍历 `rawPoints`（2025-01-30 为 0），所以只有 13 个 visit marker。折线画了、点没画。

**实现**：
- `TimelinePayload.route` 类型由 `Point[]` 改为 `TimelineVertex[]`（`TimelineVertex extends Point { timestampMs?: number }`，新增导出；注意与既有 `RoutePoint`（budgetRoutePoints 用，带 `color`）区分，避免命名冲突）。`buildTimelineRoute` 的 raw 顶点带 `timestampMs`，语义段顶点不带（导出无逐点时间，不伪造）。
- `TripMap` timeline 模式圆点改为遍历 `timelineRoute`（`route` 或回退 `rawPoints`），每个顶点一个圆点；tooltip 有 `timestampMs` 显示时间，否则显示「行程段轨迹」。
- `TripsPage.showPointsToggle` 修正：timeline 模式只要 `route.length > 0` 就显示开关（T16 曾误判为「无 raw 点即无点可切」而隐藏；现在点跟随路线，开关有效）。

**验证**（浏览器，clean reload + 真实 123.4MB 文件）：
- 2025-01-30 时间轴 → summary「172 轨迹点（行程段）· 13 停留」；overlay canvas 单实例；开点蓝像素 5302、关点 4634（差 668 = 172 个路线圆点，密集处重叠；折线 4634 保留）→ 证明圆点随路线绘制且开关有效。
- 2026-08-01（raw 窗口）→「523 原始点」不变。
- 139 单测 + build + lint 全绿。未 commit、未部署。

## 2026-09-14 17:40 — Reviewer + Dev T16 复审轮（PASS-WITH-CONDITIONS）

**Reviewer 结论**：PASS-WITH-CONDITIONS，无 S1/S2 阻塞。确认：本地日分桶与筛选器同时区（`dayKeyOf`=本地）、范围过滤、`[start,end]` 回退、全局 cap + downsampled、`prepareTimeline` 第 4 参向后兼容（3 参调用全过）、`route` 四组合渲染正确、`fitBounds` 依赖数组无 stale closure、summary 三源诚实、无 O(n²)；139/139 单测 + build + lint 全绿。

**已修（本轮）**：
- **A1** `buildTimelineRoute` 契约不对称 → 函数内自行 `filterRawPoints` + 按 `timestampMs` 排序（调用方仍可传全量流）；docstring 明确。
- **A2** `DateRangePicker.tsx` 混入无关改动（行为等价的重构 + 描述不存在的 bug 的注释）→ **整文件 revert 到 HEAD**，T16 diff 只含相关文件。
- **A4** 措辞纠正：NOTES/DECISIONS 原称「分桶规避段间时间重叠导致的乱序」不准确——分桶只解决**跨日 source 选择**；日内重叠段仍按 `startMs` 顺序全部拼接，这与 T14.3「跟時間連」一致（粗/细双记录照连、不去重），已在 docstring 写明。
- **N1** `trips.test.ts` 补文件末尾换行。
- **N3** 时间轴模式下无 raw 点时「轨迹点」开关无可见效果 → 该模式下无 raw 点则**隐藏**开关（`showPointsToggle`）。

**记录不修（advisory）**：A3（`preparedTimeline` 在 activityType 模式下也重算 route，线性但可懒算）、A5（测试缺口：单点 raw 无段分支、route cap→downsampled 传播、跨零点排序、DST 日界——DST 为既有问题）。均记入 Backlog 待发布前评估。

**浏览器复验（reload 后）**：2025-01-30 时间轴 → 「172 轨迹点（行程段）· 13 停留」、开关隐藏、canvas 4634 蓝像素（路线在）；切「按活动类型」→「20 段 · 165 点 · 13 停留 · 17 处衔接」、开关恢复；2026-08-01 时间轴 →「523 原始点 · 18 停留」（raw 窗口无回归）。未 commit、未部署。

## 2026-09-14 17:10 — Dev T16 时间轴路线回退语义段（raw 仅存 ~30 天）

**用户反馈**：Google Timeline 的用法就是选一段时间、看那段时间去过哪、路径怎么走。rawSignals 只保留 ~30 天，所以旧日期本来就没有 raw 点；不能因此让地图空着。实测 `Timeline-20260820.json` 的 2025-01-30。

**根因**：T15 的时间轴模式把路线**只**绑定到 `rawSignals`（`TripMap` 里 `timelinePath = rawPoints.map(...)`）。2025-01-30 的 raw 点为 0 → 无 polyline，summary 显示「0 原始点」，地图只剩 13 个 visit marker。但该日 `semanticSegments` 有 33 段（其中多段带 `timelinePath`），解析后 `segment.path` 已有完整行程轨迹——数据在，只是时间轴模式没用。

**实现**：

1. **`src/lib/trips.ts`**：
   - `TimelinePayload` 增 `route: Point[]`（折线顶点，时间序）与 `routeSource: 'raw' | 'segments' | 'mixed'`。
   - 新增 `buildTimelineRoute(rawPoints, segments, range)`：按**本地日**分桶——当日 raw ≥2 用 raw（保留 ~30 天窗口内的原始观感与精度）；否则用该日语义段 `path`（`<2` 回退 `[start,end]`）按 `startMs` 时间序拼接；跨天自然形成时间线。全局 30000 点预算（`GLOBAL_PATH_POINT_CAP`，超限 `strideTake` 保两端并置 `downsampled`）。分桶避免了段间时间重叠（同程粗细双记录）导致的乱序/重复。
   - `prepareTimeline(visits, range, points, segments = [])` 增第 4 参（向后兼容：既有 3 参调用 segments 为空 → route 回退 raw/空）。
   - `boundsIncludeRawPoints` 入参放宽为 `readonly Point[]`（route 是 `Point[]`）。

2. **`src/components/TripMap.tsx`**：新增 `route?: readonly Point[]` prop；timeline 折线改用 `route`（缺省回退 `rawPoints`）；折线**不再受** `showRoutePoints` 门控——该开关只控逐点圆点（「轨迹点」语义），路线本身始终绘制。

3. **`src/pages/TripsPage.tsx`**：`prepareTimeline(...)` 传入 `data.segments`；`fitBounds` 与 summary 改用 `route`；summary 诚实标注来源（`原始点` / `轨迹点（行程段）` / `轨迹点（GPS+行程段）`）；`MapPane`/直连两处 `TripMap` 传 `route`。

**测试**（`trips.test.ts`，131 → **139**，+8）：
- `prepareTimeline`：无 raw 时回退语义段路径（route 非空、source='segments'）；同日优先 raw。
- `buildTimelineRoute`：语义段按时间序拼接、跨天 mixed 源、范围筛选、空 path 回退 `[start,end]`、超预算 cap 保两端 + downsampled、无几何时 source='raw' 且 route 空。

**验证**：
- `npm run test` trips 56 passed（其余 parse 用例 22 passed 隔离复跑通过；全量并发下 `parse.test.ts` 一条 2M 点 cap 用例超 5s 为既有 flaky，非本次改动）。
- `npm run build`（tsc+vite）✅ / `npm run lint` 0 error ✅。
- livedata 浏览器实测（`Timeline-20260820.json` 123.4MB）：
  - 2025-01-30 时间轴模式 → summary「172 轨迹点（行程段） · 13 停留」，overlay canvas 检出 4634 个 #3b82f6 蓝色像素（路线已绘）；旧行为为「0 原始点」+ 0 蓝。
  - 2026-08-01（raw 窗口内）→「523 原始点 · 18 停留」，与文件 rawSignals 精确计数一致（无回归）。
  - 「轨迹点」开关关闭 → 蓝像素 5525→4474（圆点消失、路线保留）。
  - 「按活动类型」模式不受影响（19 段 · 149 点 · 18 停留 · 523 原始点 · 18 处衔接）。
- 未 commit、未部署。

## 2026-09-14 16:00 — Dev T15 Trip 时间轴视图（纯 GPS 轨迹线）

用户反馈 T14 系列（bridge lines）仍未解决——他们要的不是虚线桥，而是一条纯时间线：所有 rawSignals（GPS 点）按时间排序连成一条线（单色），停驻点用不同颜色标记，移动点 tooltip 显示 GPS 坐标。

**实现**：

1. **`src/lib/trips.ts`**：新增 `TimelinePayload` 接口 + `prepareTimeline(visits, range, points)` 函数：
   - 收集所有 rawSignals，按 `timestampMs` 排序
   - 保留 `RAW_POINT_CAP=20000` 降采样逻辑（strideTake，保两端）
   - visits 过滤 + 倒序排序 + MARKER_CAP 降采样
   - 现有 `prepareTrips` / `prepareTripsForData` 保留不变

2. **`src/components/TripMap.tsx`**：新增 `mode?: 'activityType' | 'timeline'` prop：
   - timeline 模式：一条蓝色 polyline（#3b82f6, 2px, 实线）连接所有 rawSignals 点；每个 rawSignal 点渲染为小圆点 + tooltip（`{lat.toFixed(4)}, {lng.toFixed(4)} | {fmtDateTime(timestampMs)}`）
   - activityType 模式：保留现有行为（segments 按活动着色 + bridges 虚线）
   - visit markers 两种模式通用（红色）

3. **`src/pages/TripsPage.tsx`**：新增模式切换开关：
   - 两个按钮：「时间轴」|「按活动类型」，默认选中「时间轴」
   - timeline 模式调用 `prepareTimeline`，activityType 模式调用 `prepareTripsForData`
   - summary 行根据模式显示不同信息
   - 新增 CSS `.trips-mode-toggle` + `.trips-mode-btn`

**测试**（`trips.test.ts`，124 → **131**）：
- 新增 7 个 `prepareTimeline` 单测：排序、范围筛选、RAW_POINT_CAP 降采样、新近排序、保两端端点、空输入、MARKER_CAP 降采样

**验证**：`npm run test` **131 passed** / `npm run build` ✅ / `npm run lint` 0 error ✅。未 commit、未部署。

## 2026-09-14 15:17 — Dev T14.3 撤销双闸门：跟時間連纯时间口径
CEO 决策（DECISIONS.md「T14.2 双闸门撤销」）：`bridgeLines` 回归纯时间语义——**所有时间相邻段不论类型/重叠/距离一律建桥**。

**根因**：T14.2 距离闸门（重叠且可视端点 >1000m 即跳过）在 2025-01-30 误杀交叉时间相邻对（用户实测「13:45 後沒有連去移動」）。复核该日 20 段：被跳过的 9 对全为跨类型**重叠**对，其中多条是本该相连的同程粗细双记录（如移动 12:00-14:00 ↔ 驾车 13:54-15:00，端点相距 66.7km/property）。同窗口粗细两种记录属同一次行程，断开违背「跟時間連」。

**改动**（`src/lib/trips.ts`）：
1. 删除 `BRIDGE_OVERLAP_MAX_M = 1000` 常量 + 双闸门注释。
2. `bridgeLines` 删掉距离闸门行（`gapMs ≤ 0 && haversineKm(...)>1000m → skip`）；`bridgeLines`/`bridgeGapLabel` 的 JSDoc 重写为「跟時間連」契约（重叠是 GPS 粒度的常态，粗细双记录同程也连，虚线+「衔接 +N 分钟」已诚实现「无直接轨迹记录」）。
3. 仅保留退化跳过（可视端点完全重合的零长线），`BRIDGE_CAP=1000` stride 抽稀、`BRIDGE_ANNOTATE_MIN_MS=60s`、`polylineEndpoints` 均不变。
4. `haversineKm` 值导入从 trips.ts 移除（不再使用；types.ts 定义保留）。

**测试**（`trips.test.ts`，123 → **124**）：
- 原「重叠/相接且远离 → 跳过」两用例（~11km 并行对 / ~60km 驾车-移动对）**翻转**为「无论距离一律建桥」；原「CLOSE 步行换乘」用例语义改为重叠必建桥 + 元数据契约（gapMs 保持负/零、label=「衔接」、from/to 贴合可视端点）。
- 新增合成回归固守用户例：驾车12:42-13:45 → 驾车13:54-15:00 → 移动14:00-16:00（端点距相邻驾车段 ~60km）→ 驾车15:15-16:35，断言 3 桥链 0→1→2→3、gapMs=+9min/-60min/-45min、label 分别「衔接 +9 分钟」/「衔接」。
- livedata 回归改为最忙本地日全桥数校验：桥数 == 相邻对 − 退化对，且 > 旧纯时间规则计数；删除「≤1000m 闸门契约」断言（不再成立）。

**真实数据验证**（CEO 临测脚本 verify-day.test.ts，跑完已删）：
- 2025-01-30：20 段 → **17 桥**（19 相邻对 − 2 退化），SKIP 列表只剩 4→5 / 17→18 两条「identical endpoint (degenerate drop)」，无 UNEXPECTED；13:30-14:30 窗口 seg9→10→11→12 **全建桥**（seg10 驾车13:54-15:00 → seg11 移动14:00-16:00，66.7km 重叠现已连通）。
- 2026 最忙本地日 2016-01-14：30 段 → **24 桥**（29 相邻对 − 5 退化），其中 21 条重叠桥；旧纯时间规则仅 3 桥。

**验证**：`npm run test` **124 passed** / `npm run build` ✅ / `npm run lint` 0 error ✅。未 commit、未部署。

## 2026-09-14 14:28 — Dev 修 Reviewer A1（桥 tooltip 倒退箭头）
重叠衔接桥 `fromMs=驾车段end(08:31)`、`toMs=步行段start(08:25)` → tooltip「08:31 → 08:25」倒退箭头穿帮。修复（`TripMap.tsx` 一行）：`gapMs ≤ 0` 用双向符号「↔」、`gapMs > 0` 保留「→」——重叠/相接是连接（无时序方向），双向符号比 min→max 更诚实（不伪装时序推进），正 gap 无记录空档仍沿线符号。验证：test 123 passed / build ✅ / lint 0 error。未 commit、未部署。

## 2026-09-14 14:25 — Dev T14.2 跨类型换乘段不建桥（修复）
用户实测：Trips 时间线「移动連移動、駕車連駕車」，但驾车↔步行/移动之间断开。

**根因**：`bridgeLines` 只认 `gapMs > 0` 建桥。真实数据中换乘衔接（驾车段结束 → 步行段开始）常因 GPS 记录粒度**时间重叠几分钟**（gap ≤ 0）→ 被跳过 → 跨类型段视觉断开；同类型段首尾相接（gap > 0）→ 有桥。

**修复**（`src/lib/trips.ts`）：bridgeLines 改「时间 or 距离双闸门」（沿用 T14.1 可视端点 `polylineEndpoints`）：
1. `gapMs > 0` → 建桥（现状；无记录空档如实呈现）
2. `gapMs ≤ 0`（重叠/相接）且可视端点 haversine 距离 ≤ `BRIDGE_OVERLAP_MAX_M = 1000m` → 建桥（**换乘衔接**）
3. `gapMs ≤ 0` 且点距 > 1000m → 跳过（**真并行记录**，诚实原则）
- 端点重合跳过判断保留在双闸门前（退化零长线不入列）。
- `BridgeLine.gapMs` 改为**带符号真实时间差**（负=重叠，0=相接）；`bridgeGapLabel` 对 <60s（含全部负值/零）一律返回「衔接」，**负值永不显示**（杜绝「衔接 +-6 分钟」）。

**阈值标定（livedata 实测）**：对 2025/2026 两份真实导出（5.2 万/6 万段）全量「时间重叠相邻段」按类别逐对量可视端点点距，CDF：
- **cross-type-transfer**（驾车→步行等真换乘）1255/1374 对：p50=0m、p75≈105m、p90≈385m、p95≈766m、p99≈2002m；**≤500m 91.6% / ≤1000m 96.9% / ≤2000m 99.0%**。
- **trace-involved**（raw timelinePath 与其缝合 activity 的重叠对）27992/31859 对：p50≈1.35-1.47km、p75≈5.7km 长尾；≤1000m 仅 43.3%、≤2000m 57.7%。
- **选 1000m**：500m 会漏 5% 真换乘（385-1000m 的城市内换乘）；2000m 只多收 2% 换乘却把 trace-involved 远对连到 58%（误连并行风险↑）。1000m = 换乘覆盖 96.9% 与并行隔离（只连 43% 近 trace 对）平衡点。
- 最忙日 2016-01-14（UTC 日口径 30 段）：旧纯时间规则桥数 ≤ 新双闸门桥数，新增桥含 gapMs=0 的相接换乘与负 gap 的重叠换乘。

**测试**（`trips.test.ts`，120 → **123**）：
- 新增「重叠但接近 → 建桥」（驾车 8:00-8:31 / 步行 8:25-8:45，端点 ~78m，断言 gapMs=-6min、from/to 精确贴合可视端点、label=「衔接」）。
- 新增「重叠且远离 → 跳过」（~2.6km，>1000m 闸门）。
- 旧「重叠+相接跳过」用例改名为「FAR apart (parallel records)」语义不变（fixture 端点本就 ~11km，仍跳过，回归保护并行诚实原则）。
- 标签用例补负值/零断言（`-6min` → 「衔接」；`0` → 「衔接」）。
- 新增 **livedata 真实文件回归用例**（沿用 skipIf 缺文件自动跳过 + 180s timeout）：解析 2026 真实导出 → 最忙本地日（segments 最多的一天）→ 断言①桥数 > 0；②existence of gapMs≤0 桥；③新闸门桥数 > 纯时间老规则计数（证明修复在真实数据上生效）；④所有 gapMs≤0 桥端点距离 ≤1000m（闸门契约）；⑤其 label 均「衔接」。

**验证**：`npm run test` **123 passed**（120 回归 + 2 合成 + 1 livedata）/ `npm run build`（tsc+vite）✅ / `npm run lint` 0 error ✅。未 commit、未部署。

## 2026-09-14 07:50 — Dev
完成 T13.3 ① + ②（③仅为记录项，无行动）：缝合匹配中途子段 + Trips 路线点渲染。

**改动 1 — 缝合匹配从「端点≡trace首末点」改为「trace 内子段匹配」**（`src/lib/parse/common.ts`）：
- 根因：新版导出的 `timelinePath` 是 2 小时窗口连续轨迹（16:00-18:00 含 18 点），`activity` 段常是其中一段短途行程（start=16:15 点、end=16:33=trace[4]，非 trace 末点）。旧 `findStitchCandidate` 只接受 activity 起点≡trace首点 且 终点≡trace末点 → 64% 中途行程失配 → path=0 → 路线退化。
- 新语义：新增 `nearestTraceIndex`（对每个候选 trace 的点线性扫描，找到与 segment.start / segment.end 在 `MAX_STITCH_DEG=0.02°` 容差内**距离最近**的点下标 i / j）。i≤j → 返回 `{...candidate, points: points.slice(i, j+1)}` 子段（新对象，不污染池；调用方照旧 `.slice()` 复制）。i>j → 仅当原始反向配对成立（start≈末点 且 end≈首点）时接受，子段按行程方向 reverse 后返回；i==j（两端点塌缩到同一点）拒绝，防退化 1 点 path。性能不变（二分 + maxEndUpTo 前缀扇出，trace 平均 ~10 点线性扫）。
- 保持 `isNear` 容差与 `stitchSegments` 终 pass 结构不变。

**改动 2 — Trips 路线轨迹点渲染**：
- `src/lib/trips.ts`：新增 `ROUTE_POINT_CAP=5000`、`RoutePoint{lat,lng,color}`、`budgetRoutePoints(segments, cap)`（把 prepared.segments 的 path（已 DP 化简）拍平成点并带回 activityType 颜色；总量超预算时按比例 strideTake 抽稀，保两端）。3 个单测。
- `src/components/TripMap.tsx`：新增 `showRoutePoints?: boolean`（默认 true）prop；`useMemo` 调 `budgetRoutePoints`，在 Polyline 之上、停留点 marker 之下渲染 `CircleMarker`（radius 3，type 同色，fillOpacity 0.6；有选中停留点时降透明度不妨碍聚焦）；停留点 marker 更大且后渲染，不被遮挡。
- `src/pages/TripsPage.tsx`：顶栏新增「显示/隐藏轨迹点」toggle（本地 state，默认开），双 TripMap 实例共用。`src/index.css` 加 `.trips-toggle--plain`（去掉 auto margin，避免与侧栏 toggle 抢右侧）。

**测试**（`stitch.test.ts` 重构 +9，`trips.test.ts` +3）：S1 左扫 / 最长重叠 / A2 反向仍断言，但适配新契约（候选对象改为 new object，身份断言 `toBe(pool[0])` → `startMs` + 返回 points 断言）；新增 中途子段返回 5 点子段 / 邻近双点选更近 / 全段前向兼容 / 无近点拒绝 / i>j 非反向拒绝 / i==j 退化拒绝 / parse 管线的中途逐段集成用例（16:15→16:33 从 18 点窗口取 5 点子段）。

**验证**：`npm run test` **96 passed**（87 回归 + 9 新增，含 livedata 5/5 精确断言）✅ / `npm run build`（tsc + vite）✅ / `npm run lint` 0 error ✅。

**已知问题/记录**：①③ rawSignals 评估——livedata 里 2026-01-30 无 rawSignals，故 ③ 仅作记录不行动；②反向子段仅支持「trace 极端配对」（start≈末点/end≈首点），窗口中途的折返行程仍不缝合（保守策略，防乱序窗口误配，如需可后续放宽）；③路线点预算 5000 独立于全局 30000 path 预算，全部视图下圆点近似显示。

## 2026-09-14 07:05 — Dev
修复 7674cb4 后 Reviewer（S1/S2/A1/A2/A3）审查发现的拼接缺陷 + S3/A5 顺手项。

**S1（严重）左向扇出提前终止**：`findStitchCandidate` 左扫原终止条件 `pool[i].endMs >= segment.startMs` 假定「按 startMs 排序 ⇒ endMs 单调」——不成立（短窗口 trace 可夹在长窗口 trace 之间），会挡住更靠左的真实重叠 trace 且终 pass 单次→永久漏匹配。修复：新增 `buildMaxEndUpTo`（maxEnd 前缀，`maxEndUpTo[i]=max(endMs of pool[0..i])`），左扫改为 `maxEndUpTo[i] >= segment.startMs`（前缀单调，退出安全）。仍 O(log n + 扇出)。

**S2 即时借道分支删除**：`addSegment` 的即时分支在**文件顺序**（未排序）池上二分，借到次优 trace，且「已借走(path≥2)的段被终 pass 跳过」静默打破 `>best` 保证。修复：删除即时借道，全部交给 `stitchSegments` 唯一一次排序后的终 pass（逻辑等价且正确，每个 path<2 段对全池取最优）。同时修正代码注释与 NOTES 中「池天然按 startMs 排序」的错误说法（设备导出会乱序：activity/trace 交叠出现）。

**S3 format2/3 缺终 pass**：`formatRecords.ts` / `formatSemanticHistory.ts` 解析器末尾补 `stitchSegments(state)`（pool 空直接 return，无害）。pooling 逻辑格式无关，三种格式统一终 pass。

**A1 别名陷阱**：`segment.path = candidate.points.slice()`（原直接共享 trace 自身数组）。

**A2 反向轨迹匹配**：`consider` 增加反向配对（start↔末点、end↔首点），trace 点序反向不再漏配，成本极低。

**A5 顺手**：`formatTimelineArray.ts` 补文件尾换行。

**A3 测试**（`stitch.test.ts`）：新增 4 个 `findStitchCandidate` 单测（S1 非单调 endMs 场景——断言左扫越过短窗口 T1 命中 T0 / 多候选重叠取最长者（严格 `>`）/ 反向点序配对命中 / 端点不近配拒绝）；livedata 断言从 `>0` 收紧到精确值：2025-01-31 IN_BUS **5 条全中**（bus=5、withPath=5、covering=5）；修复测试名拼写 timelimePath→timelinePath。

**验证**：`npm run test` **80 passed**（76 回归 + 4 新增，含 livedata 5/5 精确断言）✅ / `npm run build`（tsc + vite）✅ / `npm run lint` 0 error ✅。commit `7674cb4` 的原有真实拼接结果不变（livedata 仍 5/5）。

## 2026-09-14 06:55 — Dev
完成 segment 轨迹合并（path stitching）：真实设备导出（129MB live data）里短 `activity` 行程段只有 start/end 坐标、轨迹在 2 小时 `timelinePath` 段里，导致车辆行程渲染成退化直线/散点。已把时间重叠 + 起终点接近的 coarse trace 合并进 activity 段。

**修改文件**：
- `src/lib/parse/common.ts`：`ParseState` 新增 `timelinePathPool`（`TimelinePathCandidate[]`，含 startMs/endMs/points）；`addSegment` 遇到含 `timelinePath` 的记录时把轨迹注册进池子（设备导出按时间有序，池天然按 startMs 排序），并即时尝试为 path<2 的段借轨迹；新增 `findStitchCandidate`（池按 startMs 二分定位起点 + 向两侧扇出：要求时间窗口真正 overlap（>0ms）且 activity.start/end 距轨迹首/末点 ≤0.02°（≈2km），取重叠最长者）+ `stitchSegments`（收尾 pass，先对池排序，再为所有 path<2 段补路径——覆盖「activity 出现在其 trace 之前」的乱序情况）。`activityType` 与 start/end 坐标保留 activity 自己的值，path 仅用于渲染路线。
- `src/lib/parse/formatTimelineArray.ts`：`parseFormat1` 末尾调用 `stitchSegments(state)`。
- `src/lib/parse/__tests__/stitch.test.ts`（新）：合成 fixture 4 用例（trace 前置于 activity→终 pass 拼接 / trace 后置→即时拼接 / trace 自身保留 / 坐标近但时间不重叠→不拼接）+ live data 用例（文件不存在自动 skip）。

**验证**（`Timeline-20260820.json` 129MB 实测）：2025-01-31 的 5 个 IN_BUS 段全部获得真实路径——08:39→11 点(08-10 trace)、12:18→11 点(12-14 trace)、15:41→6 点(14-16 trace)、17:14→9 点(16-18 trace)、17:57→8 点(18-20 trace，靠终 pass 命中后置 trace)；修复前全部为 0 点。`npm run test` **76 passed**（71 回归 + 5 新增）✅ / `npm run build`（tsc + vite）✅ / `npm run lint` 0 error ✅。

**其他**：① 轨迹点元素 `{point, time}` 的 `pointFromPathElement` 只取 `point` 字段，点数不受 `time` 影响（确认，无需改动）；② 匹配按「重叠最长 + 端点半近」启发式，`/docs/livedata/` 不入库（.gitignore 已含，本次一并提交项目级 `.gitignore` 固定该规则）；③ 已知限制：合成数据/极端乱序下仍为 best-effort，不报错不回退。

## 2026-09-14 00:04 — Dev
修复三个问题：marker 日期格式 + Google Maps 链接 + 汽车 GPS 轨迹。

**修改文件**：
- `src/lib/trips.ts`：`fmtDateTime` 从 `fmtDay`（MM-DD）改为 `toInputDate`（YYYY-MM-DD），Places 视图停留点日期显示从 "01-30 14:30" → "2025-01-30 14:30"。
- `src/components/PlacesMap.tsx`：`CircleMarker` 新增子元素 `<a>` 弹窗，含 Google Maps 链接（`https://www.google.com/maps?q=lat,lng`），`onClick` 阻止冒泡防止触发地图拾取。
- `src/lib/parse/common.ts`：`pathToPoints` 新增 `path` 作为嵌套对象 fallback key（原仅支持 `waypoints`/`points`）；`PATH_KEYS` 新增 `path` 字段，使 `addSegment` 可解析 `path` 命名的轨迹数组。

**问题 3 根因分析**：Google Timeline 导出的 `activitySegment` 轨迹字段名存在变体——部分导出使用 `waypointPath`（已支持），部分使用 `path`（原未支持）。`pathToPoints` 在 `waypointPath` 非数组且非 `{waypoints|points}` 对象时返回空数组，导致 `addSegment` 路径为空、`TripMap` 因 `latLngs.length < 2` 跳过渲染。修复后 `path` 作为 fallback key 被正确解析。

**验证**：`npm run build` ✅ / `npm run test` **71 passed**（无回归）✅ / `npm run lint` 无 error ✅。

<!-- 示例：
## 2026-09-12 14:20 — Dev
完成 T1 登录 API。自测通过。已知问题: token 刷新逻辑待优化。

## 2026-09-12 15:10 — Reviewer
审查 T1。通过。建议: 密码 hash 用 bcrypt（一般级，不阻塞）。
-->

## 2026-09-13 23:33 — Dev
完成 Places 视图停留点点击历史功能：点击地图上的停留点 marker 后，弹出浮动面板显示该地点的历史访问记录（时间线）。

**新增文件**：`src/lib/geo/visitHistory.ts`（`visitGroupKey` + `groupVisitsByLocation`：按 name → address → 坐标桶分组，倒序排列）；`src/lib/geo/visitHistory.test.ts`（8 用例）；`src/components/VisitHistoryPanel.tsx`（浮动面板：地点名 + 访问次数 + 时间线列表，含关闭按钮）。

**修改文件**：`src/components/PlacesMap.tsx`（`CircleMarker` 新增 `click` 事件处理器，`stopPropagation` + `onVisitClick` callback；新增 `onVisitClick` prop）；`src/pages/PlacesPage.tsx`（新增 `historyVisit` state + `handleVisitClick`/`handleHistoryClose`；`useMemo` 预计算 `visitGroups`；PlacesMap 传 `onVisitClick`；地图区域内渲染 `VisitHistoryPanel`）；`src/index.css` 追加 visit-history-panel 样式段（~60 行，浮动卡片，bottom-right 定位，max-height 40vh，overflow-y auto）。

**验证**：`npm run build` ✅ / `npm run test` **71 passed**（63 回归 + 8 新增）✅ / `npm run lint` 无 error ✅。

**已知问题**：① 分组使用精确字符串匹配（同名才算同一地点），后续如需可加入模糊匹配或 placeId 去重；② 面板在侧栏折叠时仍显示在地图区域右上角，不占用侧栏空间。

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

## 2026-09-13 17:24 — Dev
完成 T5 Trips 视图，浏览器实测覆盖示例数据 + 真实导出。

**新增模块**：`src/lib/trips.ts`（filterTrips/boundsOf/prepareTrips：DP 抽稀 + GLOBAL_PATH_POINT_CAP=30000 + MAX_SEGMENTS=12000 + MARKER_CAP=4000 + LIST_LIMIT=500，任一超限置 `downsampled=true`，UI 显示角标）、`src/components/TripMap.tsx`（Leaflet 地图：单共享 canvas renderer 绘全部路径/标记，FitController 仅在过滤窗口“跨天结构变化”时 fitBounds，flyTo 只对点击目标触发）、`src/components/DateRangePicker.tsx`（快捷档 全部/近30天/近1年 + 起/止单边日，写全局 dateRange）、`src/components/StopList.tsx`（前 500 停留列表，点击反查）、TripsView 重建（摘要行/图例/降采样提示/侧栏折叠）。

**关键修复（本次最大坑）**：TripsPage 由 EmptyState 切换挂载时，`.app-main--app` 作 `.app-shell` 的 flex 子项（`flex:1` → basis 0 + `min-height:auto`）会拉伸到**内容高度**（≈侧栏 191 项 ≈15000px），导致 map 容器 `.trip-map` 随之 15000px 高 → Leaflet canvas 超大 → Chromium raster 崩溃（SIGBUS，且叠加沙箱磁盘 100% 打满/123MB livedata 内存压力）。修复：`.trips-shell` 高度直接锚定 `calc(100vh - var(--header-height))`（不依赖 main 百分比），全链路由 15000px → 612px。另删调试期 `.trip-map`/`.trips-map-wrap` 的 `min-height:320px` hack。

**crash 其次原因（环境）**：`/` 磁盘一度 100%（npm cache 2GB + journald 689MB + apt cache），Chromium 写 mmap 缓存失败也会 SIGBUS（BUS_ADRERR）。已清理（`npm cache clean --force` + `journalctl --vacuum-size=100M` + `apt-get clean`），现空余 ≥2.7GB。

**lint 约束（react-hooks v7 严格版）**：TripMap 渲染期不再读写 ref/不再惰性 `useState` 初始化 renderer（改模块级 `L.canvas({padding:0.5})`）；DateRangePicker 渲染期去掉 `Date.now()`（endAnchor 用 `dataTimeRange.maxMs ?? 0`）；TripsPage 去掉 effect 内 setState（拆 `<MapPane key={fitKey}>` 重挂载重置选中）。canvas 圆不触 DOM hover，选中标记的 tooltip 改 `openTooltip()/closeTooltip()` 命令式开关（react-leaflet 的 `permanent` prop 不会自动打开）。

**验证**（playwright，headless chromium）：样例 5/5 无崩溃；空态→载入示例→地图（canvas 980×612）→摘要「197 段 · 191 停留 · 1,387 点」→近30天 120/115/831→全部复位→侧栏折叠/展开 map 存活→停靠点击选中 + tooltip 弹出，`ERRORS: none`。真实 123.4MB 导出：大文件 confirm → worker 解析 → 「12000 段 · 37287 停留 · 31,360 点」+ 降采样角标 + 列表 500 条 + 点选 tooltip，无 error 🎯。`npm run build` ✓ / `npm run lint` 无 error ✓ / `npm run test` 40 passed ✓。

**依赖**：仅新增 devDependency `@types/leaflet ^1.9.22`（类型包，无运行时依赖，符合 owner 约束）。

**已知问题**：① 无数据/仅 1 停留等退化场景的 tooltip 定位可能贴屏幕边缘，后续 polish；② `fitKey` 仅按“选中窗口跨天结构”变化自动 fit，同天窗口内换筛选只 invalidate；③ T5.1 起止日期输入为 `<input type=date>`，火狐/Safari 样式差异未处理。

## 2026-09-13 19:20 — Dev
完成 T6 Places 视图（地图点击按半径查停留）+ 收尾。

**新增模块**：`src/lib/geo/SpatialGrid.ts`（经纬 1°×1° 均匀网格索引：`add/build/queryCircle`，先用 BBOX_SAFETY=1.25 扩边选候选格，再 haversine 精确过滤，环形查询在跨 180° 与两极处做了防护）、`src/lib/geo/places.ts`（`PLACE_RADII_KM=[10,100,1000,5000]` + `PLACES_RESULT_LIMIT=200` + `fmtDistanceKm` 自适应小数位）、测试 `SpatialGrid.test.ts` + `places.test.ts`（10 用例）。UI：`src/components/PlacesMap.tsx`（ClickController 单监听拾取 / RadiusCircle 琥珀 #f59e0b 半径圈 + rAF 后 `fitBounds` 保证圆完整 / FlyController 结果 flyTo + 高亮圆点 + 常驻 tooltip / InvalidateController 侧栏折叠后重铺）、`src/pages/PlacesPage.tsx` 重写（网格 useMemo 按数据集 + 全局日期范围重建，200ms 防抖查询 + 500ms 慢查询「查询中…」提示，结果按开始时间倒序，前 200 条 + 「还有 N 条」提示）、`src/index.css` Places 样式段。

**收尾**：删除本地 benchmark 脚本 `src/lib/geo/bench.real.test.ts`（import node:fs/path/perf_hooks + `import.meta.dirname` → tsc `-b` 报 TS2591/TS2339；且依赖 gitignored `docs/livedata/`，按 T4 约束不进可提交代码——需要定向性能验证建议后续入 `scripts/` 作为独立 node 脚本而非测试文件）。删除前已跑基准并记录量级。

**真实数据性能量级**（`Timeline-20260820.json`，123.4MB，37,287 停留；`npx vitest run bench.real`，本地一次性，不入库）：解析 ≈2.3s；网格构建 ≈14ms；台北 (25.033, 121.565) 圆查询——**10km→13 hits (0.8ms) / 100km→30 hits (0.2ms) / 1000km→38 hits (0.3ms) / 5000km→37,287 hits (21ms)**；距离精度校验 mismatch=0。数量级上大半径全量命中时单次查询 ~20ms，UI 无感知。

**验证**：`npm run build` ✅ / `npm run lint` 无 error ✅ / `npm run test` **50 passed**（40 回归 + 10 新增）✅。浏览器实测（playwright，headless chromium）：**样例数据** 载入 → /app/places → 点击台北市中心 → 浮层 `25.00597, 121.55273` + 「169 个停留点在此范围内」(100km)，列表 Home/Bella/Nexus 等含地址·时间·距离；半径切换 10→10 / 100→169 / 1000→174 / 5000→191 实时更新，琥珀半径圈可见且自动 zoom（100km→z8）；点击结果 → flyTo + 高亮标记 + tooltip（Home · 9-12 02:35 · 3h55m）；再点地图重置选中。**真实数据**（123MB 导入）→ 37287 停留，点击台北 → 100km→30 / 10km→11 / 1000km→38 / 5000km→37287（与 bench 一致；10km 差 2 hits 系点击中心 ~3km 偏移的边缘差异）；点结果 → flyTo + tooltip 正常。全程 console 0 error。

**已知问题/待 CEO 决断**：① T6.4 design QA（Designer 子任务）本轮未独立走，视觉按 Trips 同款风格实现，建议并入 T11 Reviewer 验收；② 结果列表 `key=index`（排序固定倒序，仅去重场景闪烁风险，低优先级）；③ 5000km 全量命中时列表封顶 200 条并提示缩窄范围（符合设计）；④ 真实导入时浏览器 parse ~15-30s（worker 内），Places 网格构建 <30ms，无卡顿。

## 2026-09-13 23:20 — Dev
完成 T7 Landing 首页（portfolio 展示面）+ T8 导出教程页。

**T7 Landing**（`src/pages/Landing.tsx` 重写）：五个 section。
1. Hero — 产品名 GT Viewer + 「把 Google Timeline 数据从 JSON 变回你的行程地图」定位 + 双 CTA：「立即体验」(onClick → loadSample，busy 时禁用)、「如何导出数据」→ /help；无注册/账号/试玩提示。
2. 痛点→方案 — 一句话：Timeline 网页版关停 / 裸 JSON 人不可读 / 本工具还原成行程地图。
3. 三功能卡 — Trips（行程回放）、Places（点击地图查访，10–5000KM）、Privacy（数据不出设备），grid 3 列，暗色卡片。
4. 技术栈行（React·TS·Vite·Leaflet·WebWorker·Zustand）+ 教程入口 + 隐私承诺段（边界线分隔，灰色调）。
5. Built with OPC 3.0 — 有 `id="built-with-opc"` 锚点（Footer anchor 目标）；文案讲述 AI 驱动产品流程（需求→方案→开发→审查→验收，无内部角色术语）+ 5 步 pill 列表 + OPC 3.0 介绍 + 占位链接（`OPC_3_LINK='#'`，T10 换真链接）。

`useEffect` 在 hash 匹配时自动 scrollIntoView（解决从 /help 跨页加载后 native fragment scroll 可能失灵的问题）。`src/lib/site.ts` 新增 `OPC_3_LINK` 占位常量。

**T7 Footer**（`src/components/Footer.tsx`）：「Created by OPC 3.0」由 span 改为 `<a href="/#built-with-opc">`；CSS 去除下划线、hover 变色 accent。同一页面点击 → 原生 fragment scroll；其他页面点击 → 全量加载 Landing → useEffect 自动滚动到 built-with section。

**T8 教程页**（`src/pages/HelpPage.tsx` 重写）：
- Android 6 步数字卡（「设置→位置→位置服务→时间轴→导出时间轴数据」，含机型/语言差异提示）+ 文件路径示例；
- iOS 6 步数字卡（Google Maps App 内路径，含「文件」App 存储提示）+ 文件路径示例；
- 4 格式说明（Timeline.json / Records.json / YYYY_MM.json / Location History.json）+ 树形路径 code block；
- FAQ 折叠（新增 `src/components/FAQ.tsx`：4 条 — 找不到菜单 / 换机丢数据 / 文件大 / 数据安全，多开，按钮+caret动态+−，answer 白色 pre-line，有 `aria-expanded`）；
- 底部 CTA「回到首页，一键体验示例数据 →」→ Link `/`。

**CSS**（`src/index.css`）新增 ~280 行：Landing（hero/landing-section/feature-cards/tech-line/privacy-promise/landing-builtwith/opc-steps）+ Help（step-cards 两列+数字圆/step-continue全宽/help-tip 左accent边框/format-rows/format-row/code-block/faq/faq-q/faq-a/help-cta）+ footer brand link 样式 + 860px 媒体断点（feature-cards→1col、step-cards→1col）。

**验证**：`npm run test` 50 passed（无回归）✅ / `npm run lint` 无 error ✅ / `npm run build` 通过（chunk 警告同前）✅。Playwright 浏览器实测：
- `/` Landing：hero 可见 → 三卡无溢出（scrollWidth===clientWidth=1003px）→ Built with section 锚点可见 → Footer 原生 fragment scroll ✓；
- 「立即体验」→ loadSample → /app（197 段/191 停留 + 模拟数据角标）✓；
- Footer `/help` → 点击 → /#built-with-opc 跨页滚动 ✓（useEffect fallback，rect.top ≈ 0）；
- `/help`：Android 6 步 + iOS 6 步 + 4 格式 + FAQ 开/关 ✓（aria-expanded 动态、answer 隐藏/显示、caret −/+ 切换）→ 再点击关闭折叠 ✓；
- 水平溢出检查（/ 与 /help）无 ✅；
- console：0 error / 0 warning（仅 React DevTools info）✅。

**已知问题**：① OPC 3.0 链接为占位 `#`，T10 部署时换真 URL；② Landing 全页截图存 `docs/screenshots/` 待 T10 README 用；③ step-cards 第 6 步（最终产出）若需要全宽视觉，可加 `.step-continue` class（当前两列排列已足够清晰，未启用）。

## 2026-09-13 23:50 — Dev
完成 T9.1 隐私与瓦片源设置面板（PRD#功能5）。

**T9.1.1 store 扩展**（`src/store/timelineStore.ts`）：新增 `tileSource: { name, url, attribution }`（并入 timelineStore；单一全局 store，地图组件本就消费它，未另设 settingsStore）——初始值 = OSM 默认瓦片；`setTileSource(url, attribution?)`（name 标记为「自定义」）、`resetTileSource()`（回 OSM 默认）。**仅内存，不写 localStorage**（与产品 no-persistence 承诺一致：刷新重置是预期行为，写入文案）。

**T9.1.2 瓦片配置 + 校验**（`src/lib/tiles.ts`）：`OSM_TILE_SOURCE` 默认值（`https://tile.openstreetmap.org/{z}/{x}/{y}.png` + 官方 attribution，符合 OSM 使用政策——官方推荐不带 `{s}` 子域名的主 URL）；`tileUrlError(url)` 校验（空串→合法=恢复默认信号；必须 http/https 可解析；必须含 `{z}/{x}/{y}` 三 token，缺失列出具体缺失项）。新增 `tiles.test.ts` 7 用例。

**T9.1.3 地图接入**：TripMap / PlacesMap 从 store 读 `tileSource` 传 `<TileLayer url attribution>`；改变量 React 重建 layer，设置即时生效（含已打开地图）。

**T9.1.4 设置 UI**（`src/pages/SettingsPage.tsx` 重写）：瓦片源名称显示（OpenStreetMap / 自定义 + 徽标）；URL 输入（`{z}/{x}/{y}` 占位符校验，非法时红色警告 + 应用禁用；合法时绿色提示）；应用（空串=恢复默认）/ 恢复默认按钮；「自定义瓦片源 = 自担风险」明示文案（原样：瓦片请求会把你的 IP 与当前地图视野的坐标范围发送给瓦片服务器…）；「数据生命周期」说明卡（内存处理/不写 localStorage 与 IndexedDB/不上传/无分析遥测 SDK；唯一外发请求是瓦片）。CSS 追加 settings 段（~100 行）。

**验证**：`npm run test` **57 passed**（50 回归 + tiles 7 新增）✅ / `npm run build` 通过 ✅ / `npm run lint` 无 error ✅。Playwright 实测：/settings 面板可见；非法 URL（缺 token）→ 警告 + 应用禁用；应用开源变体 `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` → 返 /app Trips 与 /app/places 地图 network 均为 `a/b/c.tile.openstreetmap.org`（200，无 `tile.openstreetmap.org` 请求）→ 自定义源驱动确认；恢复默认 → 地图回 `tile.openstreetmap.org`（200）✓；刷新页面 → 设置重置为 OSM（预期）✓；空 URL 应用 → 恢复默认 ✓；全程 console 0 error / 0 warning；localStorage 无键、IndexedDB 无库 ✓。

**已知问题**：① 自定义源未提供 attribution 输入（存储默认为空串），Leaflet attribution 控件留空——如需要可后续加 attribution 输入框；② URL 校验是轻量的「tokens 齐全 + http(s)」检查，不做实际连通性探测（探测本身也会向第三方暴露请求，与隐私目标相悖）。

## 2026-09-13 20:30 — Dev
完成 T9.3 安全加固 + T10.1 GitHub Pages 部署 workflow + HashRouter + README 4 张截图。

## 2026-09-13 23:55 — Dev
完成 T12 产品改动（改名 + Theme + 半径档位 + marker 颜色 + 日期筛选）。

**T12.1 改名**：`src/lib/site.ts` `SITE_NAME` 从 "GT Viewer" → "Timeline Map"；`src/pages/Landing.tsx` 标题/描述/功能卡文案；`src/index.html` `<title>` 标签；`README.md` 标题 + 功能亮点半径说明；Places 功能卡从 "10–5000KM" 改为 "1–100KM"。

**T12.2 Theme**：`src/index.css` 新增 `@media (prefers-color-scheme: light)` + `[data-theme='dark/light']` CSS 变量覆盖；`src/store/timelineStore.ts` 新增 `ThemeMode` 类型 + `themeMode: 'system'` 初始值 + `setThemeMode()` action；`src/App.tsx` 添加 `useEffect` 同步 `data-theme` 到 `<html>`；`src/pages/SettingsPage.tsx` 新增主题切换按钮组（跟随系统/浅色/深色），CSS 新增 `.theme-selector` + `.theme-btn` 样式。默认跟随系统。

**T12.3 半径档位**：`src/lib/geo/places.ts` `PLACE_RADII_KM` 从 `[10, 100, 1000, 5000]` → `[1, 5, 10, 50, 100]`；`src/pages/PlacesPage.tsx` 按钮文案从 "{radius} km" 改为 "{radius}"（数值小不加单位更清晰）；新增 `.places-radii-label` 显示 "1–100 KM"；summary 行追加 "1–100 KM 可选"；`places.test.ts` 断言更新为 5 档。

**T12.4 Places marker 颜色**：`src/components/PlacesMap.tsx` 新增常量 `PLACES_CLICK_MARKER_COLOR='#3b82f6'`（accent 蓝）+ `PLACES_STOP_MARKER_COLOR='#94a3b8'`（默认灰）；点击处使用 `L.marker` + 自定义 HTML divIcon（蓝色实心圆 + 白边 + 阴影）；选中停留点仍用 `CircleMarker`（琥珀色）；CSS 新增 `.leaflet-marker-icon.places-click-marker` 清除 Leaflet 默认样式。

**T12.5 Places 日期筛选**：`src/pages/PlacesPage.tsx` 侧栏顶部插入 `<DateRangePicker />` 组件，复用 Trips 视图的全局日期筛选，与 Trips 共享 `dateRange` store。

**验证**：`npm run build` ✅ / `npm run test` **63 passed**（含 places.test.ts 更新）✅ / `npm run lint` 无 error ✅。

**已知问题**：① Places 视图的周围停留点列表尚未在地图上渲染为 circleMarker（仅高亮点击处 + 选中停留点），后续如需可加；② Theme 切换不持久化（刷新重置为 system），与产品 no-persistence 承诺一致。

## 2026-09-13 23:30 — Dev
完成 T12.6 Places 地图停留点 marker 批量渲染：点击地图后，范围内**所有停留点**均显示 amber CircleMarker，点击处用蓝色 divIcon 高亮，半径圈保持透明填充+描边；空态无 marker。

**修改文件**：`src/components/PlacesMap.tsx`（新增 `visits: Visit[]` prop，遍历渲染 `CircleMarker`，移除冗余的单独 selected marker，清理未用 import `Tooltip`/`fmtDateTime`/`fmtDuration`）；`src/pages/PlacesPage.tsx`（传 `results.map(r => r.record)` 给 `visits` prop）。

**验证**：`npm run build` ✅ / `npm run test` **63 passed**（无回归）✅ / `npm run lint` 无 error ✅。

## 2026-09-13 14:20 — Dev
完成 T9.3 安全加固 + T10.1 GitHub Pages 部署 workflow + HashRouter + README 4 张截图。

**T9.3 安全加固（Security 报告原样采纳）**：
- **G1 raw points 上限**：`src/lib/parse/common.ts` 新增 `MAX_RAW_POINTS = 2_000_000`；`addRawPoint` 累计达上限后丢弃后续点并只发**一次** warning（`"x.json": raw points 超过 200 万，已截断`，`rawTruncated` 防重）；`index.ts` `mergeTimelineData(list, warnings=true)` 对跨文件合并结果也截断 + `累计 raw points 超过 200 万，已截断`，worker（`parse.worker.ts`）把合并截断警告并入 `allWarnings` 透传给 UI。新增 2 单测（单文件截断告警一次 / 合并截断）。
- **S1 CSP meta**（`index.html`）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; worker-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`。**实测**：dev（vite 5173）与生产 preview（4173）均无资源被拦、无 ws 阻断（CSP 规范里 `connect-src 'self'` 对同源 `ws://` 是放行的，Vite HMR 正常）；唯一 console 消息是浏览器提示「`frame-ancestors` 在 `<meta>` 里被忽略」——此为规范行为，`frame-ancestors` 需 HTTP 响应头才生效，而 GitHub Pages 静态托管无法加自定义头，故保留在 meta 中（**取舍**：frame 防护生效不了，其余指令全部生效；将来若要严控可改换 Vercel/Cloudflare 或自托管并配置头，不阻塞当前部署）。
- **S2 http:// 明文警告**：`src/lib/tiles.ts` 新增 `tileUrlNotes(url)`，`http:` 协议 → 「⚠ 明文传输：数据可能被网络中间人篡改，建议使用 https 或内网瓦片源」（`kind: cleartext`）；SettingsPage 在输入下方按规则渲染（有校验错误时降级为红色错误条）。新 `.tile-note-warn` CSS（琥珀色粗体）。
- **S3 {s} 子域说明**：`tileUrlNotes` 对含 `{s}` 的 URL 追加「{s} 将向 a/b/c 多个主机发起请求」（`subdomains`）；若域名含 `openstreetmap.org` 再追加「OSM 公共服务器不支持 {s}，瓦片将加载失败」（`osm-subdomains`）；设置页静态说明段同步补了同文案。新增 `tileUrlNotes` 4 单测。
- **S5 示例数据命名**：`scripts/gen-sample-data.mjs` 把 `Home` → 「家（模拟）」、`Nexus Co., Ltd.` → 「公司（模拟）」（seed 不变 `20260913`，同 PRNG 重新生成则全部后续随机值序列改变，输出会整体变化，无妨——seed 确定即可复现）；已重跑生成 `src/lib/sample/sample-timeline.json`，python 校验全部 17 个地点名无旧英文名、UI 显示正常、无奇怪字符。

**T10.1 GitHub Pages 部署 + HashRouter**：
- `src/main.tsx`：**BrowserRouter → HashRouter**（静态托管无服务端重写，子路由刷新 404 的根治方案）。**锚点适配**：Footer「Created by OPC 3.0」从原生 `<a href="/#built-with-opc">` 改为路由 `<Link to={{ pathname:'/', hash:'#built-with-opc' }}>`，HashRouter 下 URL 变 `#/#built-with-opc`；Landing 现有 `useEffect` 读 `useLocation().hash` + `scrollIntoView` 逻辑保留即生效（无需 native fragment）。**实测**：preview 下从 `/help` 点 footer 链接 → 跳转 Landing 并滚到 `#built-with-opc` 顶部（落点差因页面高度不足 clamping，section 完整可见）。
- `vite.config.ts`：`base: './'` 相对 base（适配 GitHub Pages `/<repo>/` 子路径部署，所有资源路径可移植）。
- 新建 `.github/workflows/deploy.yml`：push main（+ workflow_dispatch）→ `actions/checkout` + `setup-node(22, cache:npm)` → `npm ci` → `lint` → `test` → `build` → `actions/configure-pages` + `upload-pages-artifact(path: dist)` → `deploy-pages`。permissions: pages:write / id-token:write；concurrency 组防堆叠。**未创建 remote/推送**（gh 未安装、无 remote，T10.3 由 CEO 协调）。

**README 截图补全**（`docs/screenshots/`，playwright 对 preview 实际流程截图，命名固定）：`trips.png`（Trips：载入示例 + 近 30 天 + 地图 + 侧栏，「模拟数据 · 非真实轨迹」角标）· `places.png`（Places：点击台北市中心 25.04,121.51 → 100km 半径圈 + 浮层「98 个停留点在此范围内」+ 结果列表）· `help.png`（教程页顶部）· `settings.png`（设置页：瓦片源 + 生命卡 + `{s}` 说明）。加已有 3 张 landing 图，README 引用齐全。

**验证**：`npm run test` **63 passed**（57 回归 + G1 2 + tileUrlNotes 4）✅ / `npm run build` ✅（tsc + vite）/ `npm run lint` 0 error ✅。**验收自查**（playwright，preview 4173 + dev 5173）：`#/`、`#/app`、`#/app/places`、`#/help`、`#/settings` 全部可达（HashRouter 单文档内路由）；Landing 锚点从 /help 跨页跳转滚动正常；CSP dev/preview 均无资源拦截（仅 frame-ancestors meta 忽略提示，见 S1 取舍）；设置页输入 `http://{s}.tile.openstreetmap.org/...` 实测同时出现明文警告 + {s} 说明 + OSM 不支持三条提示 ✅；canvas Trips 路线绘制（采样 alpha>0）、Trips 侧栏 115 停留、Places 半径圆 `leaflet-interactive` 可见 ✅。

**已知问题**：① S1 的 `frame-ancestors` 在 meta 下被忽略（需 HTTP 头，GitHub Pages 不支持），见取舍记录；② deploy.yml 首次启用时需在 GitHub repo 开 Pages 指向 Actions（`Settings → Pages → Source: GitHub Actions`），T10.3 协调；③ `vite preview` 对 SPA 刷新 `#/xxx` 天然可达（单文档），真站验证仍留 T10.3。

## 2026-09-14 09:30 — Dev
完成 T13.1 + T13.2（真实 livedata 支持修复，三轮迭代）。

**T13.1 细节修复**（df24db2）：① Trips marker tooltip 日期加年份：`trips.ts:fmtDateTime` 从 `fmtDay`（MM-DD）→ `toInputDate`（YYYY-MM-DD）；② Places popup 加 Google Maps 链接：`PlacesMap.tsx` CircleMarker 弹窗内 `<a href="https://www.google.com/maps?q=lat,lng">`，`onClick` 阻止冒泡；③ `common.ts:pathToPoints` 新增 `path` fallback key，`PATH_KEYS` 增加 `path`。

**T13.2 根因分析（CEO + Dev 联合）**：用户真实数据 `docs/livedata/Timeline-20260820.json`（129MB，新版 Google Timeline 设备导出）`semanticSegments` 中同一时间段同时存在两类重叠段：①`timelinePath` 段（2 小时粒度，`{point,time}` 完整 GPS 轨迹 8-11 点）；②`activity` 段（`{start:{latLng}, end:{latLng}, distanceMeters, topCandidate:{type:IN_BUS/WALKING/...}}`，**只有起终点无轨迹点**）。此前 `activity` 车辆行程渲染成退化直线 → 用户"汽车 GPS 没显示"。真实轨迹在同时间 `timelinePath` 段，未与 activity 关联。

**修复方案**（7674cb4 初版 → c2b28f3 审查加固 → 802ddf7 尾换行）：
- `common.ts`：`ParseState.timelinePathPool` 池化含 timelinePath 的段；`findStitchCandidate` 查候选（时间真重叠 + 起终点距 trace 首末点 ≤0.02°≈2km，取重叠最长）
- `stitchSegments` 终 pass：**唯一一次排序**后为所有 path<2 段匹配（S2 修复：删除即时借道分支，保证 `>best`）；左扫用 `maxEndUpTo` 前缀 max（S1 修复：endMs 非单调不漏配）；反向配对（A2）；`candidate.points.slice()` 防别名（A1）
- `formatTimelineArray.ts` / `formatRecords.ts` / `formatSemanticHistory.ts` 末尾调 `stitchSegments`（S3：format1/2/3 全覆盖；入池唯一条件=含 timelinePath 键且 path≥2，无误伤）
- `stitch.test.ts`：4 个合成单测（S1 短窗口跨越/多候选取最长/反向点序/端点拒绝）+ livedata 精确断言（2025-01-31 IN_BUS 5/5 全获得真实路径）

**验证**：`npm run test` 80 passed / `npm run build` ✅ / `npm run lint` 0 error ✅。livedata 实测 4s（含 JSON.parse）。129MB livedata 已 gitignore，未提交。Reviewer 两轮（S1 严重 + S2/S3 + A1/A2/A3/A5 建议）修复后**通过**。

## 2026-09-14 10:00 — CEO 验收
验收 T13.1 + T13.2：三个用户反馈全部闭环。
1. **marker 日期加年份** ✅ — Trips tooltip 显示 YYYY-MM-DD
2. **popup Google Maps 链接** ✅ — 点击停留点弹窗内可跳转 Google Maps
3. **汽车移动 GPS 显示** ✅ — 真实 livedata 的 IN_BUS / IN_PASSENGER_VEHICLE 行程已缝合 timelinePath 轨迹（2025-01-31 实测 5/5 车辆段获得真实路径，路径点 6-11 个）

部署：三个 commit 均通过 GitHub Actions 成功部署（最新 802ddf7 线上 200）。新增 Backlog 项：livedata 完整支持延伸（visit 段与 activity 段关联展示）。

## 2026-09-14 07:15 — Dev
format3（Semantic Location History）两个兼容性缺口补齐（依据 community 权威格式文档：https://locationhistoryformat.com/reference/semantic/ 与 github.com/CarlosBergillos/LocationHistoryFormat schemas/Semantic.schema.json，均确认字段存在）。

**缺口 1：`placeVisit.centerLatE7 / centerLngE7`**
- 旧版 Takeout format3 的 placeVisit 坐标可能直接是 `centerLatE7`/`centerLngE7`（整数 E7），不一定有 `location` 对象。
- `common.ts:getLatLng` 增加 `centerLatE7`/`centerLngE7` 分支（fallback，优先级低于 `latitudeE7/longitudeE7`，用 `e7ToLat/e7ToLng` 换算）；JSON schema 限定 E7 为整数。
- `common.ts:addVisit` 坐标解析改为 `(location ? getLatLng(location) : null) ?? getLatLng(record)`：无 `location` 对象时回退到 placeVisit 记录本身，否则 centerLatE7 永远读不到。

**缺口 2：`activitySegment.transitPath.transitStops[]`**
- transitPath 是 `{ transitStops: [{ latitudeE7, longitudeE7, placeId, address, name }...] }` 公交站列表，不是点数组。原 `PATH_KEYS` 已含 `transitPath`，但 `pathToPoints` 对 object 只查 `waypoints/points/path` → 返回空，段起终点全靠 startLocation/endLocation。
- `common.ts:pathToPoints` 在链中插入 `Array.isArray(record['transitStops']) ? record['transitStops'] : ...`；元素经 `pointFromPathElement → getLatLng` 直接解析 `latitudeE7/longitudeE7`。

**测试**（`src/lib/parse/__tests__/format3Compat.test.ts`，新增 7 个）：getLatLng centerE7 换算 + 优先级 + 缺字段返回 null；addVisit 解析仅含 centerLatE7 的 placeVisit；transitStops 多点提取；仅 transitPath 的 activitySegment 解析；完整 format3 文件混合两种 shape 的端到端解析。

**验证**：`npm run test` **87 passed**（80 回归 + 7 新增）✅ / `npm run build` ✅（tsc + vite）/ `npm run lint` 0 error ✅。livedata 未改未提交。

## 2026-09-14 11:30 — Dev + CEO
依据 community 权威格式文档（locationhistoryformat.com / CarlosBergillos/LocationHistoryFormat，含官方 JSON Schema）补齐 format3（Semantic Location History）两个兼容性缺口。

**价值评估**：该网站是 Google Location History 格式的权威参考（Records.json / Settings.json / Timeline Edits.json / Semantic Location History，附官方 JSON Schema）。对照后确认我们的核心覆盖正确，但发现 2 个 format3 缺口。用户 livedata（新版设备导出 semanticSegments）不受影响，此轮为公开项目 format3 兼容性加分。

**修复**（0a0d568）：
- `common.ts:getLatLng` 新增 `centerLatE7/centerLngE7` 分支（优先级低于 latitudeE7/longitudeE7）
- `common.ts:pathToPoints` 对象分支链补 `transitStops`（transitPath 是 {transitStops:[{latitudeE7,longitudeE7}...]} 公交站列表，原解析为空）
- `common.ts:addVisit` 坐标解析回退 `(location ? getLatLng(location) : null) ?? getLatLng(record)`，使无 location 但带 centerLatE7 的 placeVisit 能解析
- 新增 `format3Compat.test.ts`（7 测试）

**验证**：`npm run test` 87 passed（80 回归 + 7 新增）/ build ✅ / lint 0 error ✅。Reviewer 审查通过（3 条建议级遗留，不阻塞）。已部署 0a0d568，线上 200。

## 2026-09-14 07:56 — Dev
Reviewer 一般项 1：`budgetRoutePoints` 预算上限可被击穿（Math.max(1, round(len*ratio)) 逐段 floor 1，12000 段×2 点 → 12000 > ROUTE_POINT_CAP）。修复：展平所有 path 点后整体 strideTake（保两端），总点数保证 ≤ cap；更新 docstring。新增回归测试（3000 段×2 点，断言输出 ≤5000）。test 97 passed / build ✅ / lint 0 error。

## 2026-09-14 14:30 — CEO 验收 T13.3
用户反馈 2026-01-30 移动点不够 + 路线点要显示。

**根因（CEO 定位）**：Google timelinePath 是 2 小时窗口连续轨迹（平均 ~10 点），activity 是其中一段短途行程。旧 `findStitchCandidate` 要求 activity 端点≡trace 首末点 → 中途行程（约 64%，如 16:15-16:33 落在 16:00-18:00 trace 的第 0-4 点）缝合失败 path=0。另确认 2026-01-30 **无 rawSignals**（该导出仅 2026-07/08 有原始信号），轨迹只能靠 timelinePath。

**修复**（33b2e13 + 918a57a）：
- 改动 1：`findStitchCandidate` 改语义——trace 内找与 activity start/end 最近的点对（MAX_STITCH_DEG=0.02°），取子段 `slice(i,j+1)` 返回；i==j 拒绝单点退化；反向极端配对兼容；时间重叠闸门保留防跨时段误缝。16:15 实测 path=0 → **path=5**（精确 16:15→16:33），16:42 path=10（16:42→17:19），17:57 path=4。
- 改动 2：`trips.ts:budgetRoutePoints` 拍平 path 点 + ROUTE_POINT_CAP=5000 整体 strideTake 保两端（严格 ≤cap，修复逐段 floor 击穿）；`TripMap.tsx` Polyline 之上、停留 marker 之下渲染 CircleMarker（radius 3 同色系，选中降透明度）；`TripsPage` 顶栏「显示/隐藏轨迹点」toggle 默认开。

**验证**：97 tests（87 回归 + 9 缝合 + 1 预算）✅ / build ✅ / lint ✅。Reviewer 两轮：首轮通过（5 条一般/建议记录放行），预算上限一般项已由 918a57a 修复。已部署，线上 200。

## 2026-09-14 16:20 — CEO 数据格式研究（rawSignals 窗口 / 时区 / 双文件对齐）
用户提供第二份真实导出 `Timeline-20250213.json`（Takeout）。深入研究发现：

**① 两文件 schema 完全一致**（顶层 semanticSegments + rawSignals + userLocationProfile 及其子字段逐项相同）→ Android Timeline Export 与 Takeout 输出**同一种新版扁平格式**。

**② rawSignals = 滚动 ~29 天窗口，semanticSegments = 永久历史**：
- 20250213: rawSignals 2025-01-14→02-13；semanticSegments 2012-12-30→2025-02-13
- 20260820: rawSignals 2026-07-21→08-20；semanticSegments 2012-12-30→2026-08-20
- 同段原始信号（2025-01/02）在后期导出中消失 → Google 服务器滚动清除，任何方式拿不回
- 推论：定期 ≤30 天导出存档 rawSignals，天然互补可 merge

**③ 2025-01-30/31 双文件可精确对齐**：timelinePath 64=64 逐点相等；两文件仅「导出粒度/字段丰富度/activity 重分类」差异，语义不冲突。

**④ 时区陷阱（未修，KIV）**：`parseInputDate` 用本地(+08)日筛选，但 `startOfDayMs`/`dayKeyOf` 用 UTC 日分组 → 凌晨 00:00-07:59(+08) 段被归到「前一天」。实测 2025-01-30 有 3 段因此标错日。

**⑤ 解析器现状 bug（KIV T13.6）**：`parseFormat1` 只收 `semanticSegments`，**rawSignals 整段丢弃**（两文件各 5 万+条 position 全丢）；且 `getLatLng` 不认识大写 `LatLng`、`addRawPoint` 拿不到嵌套 `position.timestamp`。

**建档**：docs/DATA-FINDINGS.md（全部领域知识沉淀）。
## 2026-09-14 18:00 — Dev 收尾 T13.6 / T13.7
完成 format1 rawSignals 解析接入 + 本地时区分组修复，自测全绿后交 Reviewer。

**改动清单**：
- `src/lib/parse/common.ts`：`getLatLng` 坐标 key 增加大写 `LatLng`（`['latLng','LatLng','coordinates']`）；`addRawPoint` 优先从嵌套 `position` 包装解析坐标/时间/精度，回退扁平 record；`parseSemanticElement` 对 `timelineMemory` 静默跳过（文档化"忽略"类型，不再每条误报 `无法识别的语义段`）。
- `src/lib/parse/formatTimelineArray.ts`：支持对象根 `{semanticSegments, rawSignals}` 与 per-day 数组元素；`parseRawSignals`/`parseRawSignal` 路由：position→点、wifiScan/activityRecord→静默跳过、旧式扁平兜底；仅含 rawSignals 的元素也可解析；末尾仍 stitchSegments 缝合。
- `src/lib/parse/index.ts`：对象根改传整个 record 给 parseFormat1（原只传数组 → rawSignals 全丢）。
- `src/lib/trips.ts`：`startOfDayMs` 本地时区 `new Date(y,m,d)`、`dayKeyOf=toInputDate(ms)` 对齐日期筛选器；`RAW_POINT_CAP=20000`（超出抽稀 + `downsampled` 标记）、`filterRawPoints`、`PreparedTrips.points`、`prepareTrips(points=[])`。
- `src/components/TripMap.tsx`：`rawPoints` prop，Polyline 之下灰点 CircleMarker（r=2，#9ca3af，选中停留时降透明度），`showRoutePoints` 可关。
- `src/pages/TripsPage.tsx`：`prepareTrips(data.segments, data.visits, dateRange, data.points)` 第 4 参接入；两个 TripMap 实例传 `rawPoints`；summary 增 `· N 原始点`。
- 测试：`trips.test.ts`（旧 UTC 日测试改本地断言+理由注释；T13.7 三用例：22:00→前一日、00:30/04:00/06:00→当日且 startOfDayMs==parseInputDate、地图同日本地分组；raw 点四用例：筛选/携带/抽稀/范围外排除）、`parse/__tests__/rawSignals.test.ts`（新建：位置类目大写 LatLng+嵌套 timestamp+精度、扁平兼容、静默跳过类目、缺坐标告警、direct array、livedata 精确计数）、`parse.test.ts`（timelineMemory 静默）、`sample.test.ts`（样例 432 扁平点全进点流）。

**关键数据**（真实验证）：
- `docs/livedata/Timeline-20250213.json`：rawSignals=50662 → position 11773 / activityRecord 28028 / wifiScan 10861；解析出 **11773 个原始点**，0 warning。
- `docs/livedata/Timeline-20260820.json`：rawSignals=55509 → position 15479；解析出 **15479 个原始点**，0 warning。
- 时区核对：2025 文件全量 **17284** 段旧 UTC 分组错日（全部为本地凌晨 00:00–07:59 段）；2025-01-30 凌晨实测 04:00、06:00 两段此前标成 01-29，现归 01-30；22:00 段归属不变（合法属 01-29）。

**验证**：`npm run test` 97 → **111** passed（+rawSignals 6、+T13.7/raw 点 7、+timelineMemory 1）/ `npm run build`（tsc + vite）✅ / `npm run lint` 0 error。未 commit、未部署 —— 待 Reviewer 审查。

**额外发现（供评审参考）**：① 未被识别的语义段全部是 `timelineMemory`（记忆，无坐标），已修复为静默跳过；② trips.test.ts 保留的 `toInputDate(Date.UTC(...))`/`fmtRangeLabel(Date.UTC(...))` 断言在负时区 CI 会漂移（+08 通过）—— 现有遗留，未动。
## 2026-09-14 18:30 — Dev 修复 T13.6 S1（Reviewer 打回）
Reviewer 结论：T13.7 通过；T13.6 打回，S1 必须修。

**S1（必须修）**：`TripsPage.tsx:107` `prepareTrips(data.segments, data.visits, dateRange)` 漏传第 4 参 `data.points` → `prepared.points` 恒空 → 两个 TripMap 的 `rawPoints` 空、summary「· N 原始点」永不显示，UI 渲染链路为死代码。

**修复**：
- `src/lib/trips.ts` 新增 `prepareTripsForData(data, range)` —— 页面级唯一接线入口，内部 `prepareTrips(data.segments, data.visits, range, data.points)`，注释写明回归风险。
- `src/pages/TripsPage.tsx:107` 改用 `prepareTripsForData(data, dateRange)`（依赖数组 `[data, dateRange]` 已含 data，未动）。

**链路断言（防复发）**：`trips.test.ts` 新增 describe「TripsPage wiring (prepareTripsForData)」——构造带 points 的完整 `TimelineData`，断言页面消费的 payload：范围内 2 点穿透进 `prepared.points`（TripMap `rawPoints` 与 summary「原始点」的非空前提），范围外点不入。若今后接线再丢 `data.points`，此测试即失败。

**回归**：`npm run test` 111 → **112** passed / build（tsc+vite）✅ / lint 0 error。未 commit、未部署。

**归档（本轮不修，供后续参考）**：
- A1: `RAW_POINT_CAP=20000` 整量渲染 1.5 万+ marker 潜在卡顿 → 建议降 cap 或分层预算（raw 点与路线点共预算）。
- A2: `formatTimelineArray` 对象分支无 semanticSegments 但有 rawSignals 时丢弃 → 与 rawSignals 独立解析的行为不一致。
- N1: 既有 `toInputDate(Date.UTC(...))` / `fmtRangeLabel(Date.UTC(...))` 断言在负时区 CI 漂移（+08 通过）。
- N2: `endOfDayMs` 用 `startOfDayMs + DAY_MS - 1`，跨夏令时转换地区日长断言会有 ±1h 偏差。
- N3: `parseSemanticElement` 顶部 `timelineMemory` 提前 return，若未来需统计忽略段数要在此加计数。
- N4: 无组件级/DOM 测试（vitest node 环境、无 jsdom/RTL）——本轮以纯函数接线条目 `prepareTripsForData` + 链路断言替代；系统性补组件测试需新增测试依赖，另行评估。
- N5: 源文件末尾换行风格（`\n`结尾）保持一致。
## 2026-09-14 13:00 — Dev 实现 T14（Trips 时间线连续轨迹）
PRD 功能 3 v1.7：范围内所有段按时间连成无断口连续时间线，段间断口补诚实呈现的衔接线。

**改动文件**：
- `src/lib/trips.ts`：`prepareTrips` 过滤后按 `startMs` 升序排序（filter 返回新数组，不改调用方；时间线语义）；新增 `BridgeLine`（from/to/fromMs/toMs/gapMs/fromIndex/toIndex）、`BRIDGE_CAP=1000`、`BRIDGE_ANNOTATE_MIN_MS=60s`、`bridgeLines(segments)`（衔接连续段，负 gap/零 gap/端点重合几何跳过，超预算 strideTake 保两端）、`bridgeGapLabel(gapMs)`（≤60s →「衔接」；否则「衔接 +N 分钟/小时/天」）。
- `src/components/TripMap.tsx`：新增 `bridges?: readonly BridgeLine[]` prop，在 raw 灰点之上、实测段之下渲染浅灰细虚线（`#9ca3af` weight1.5 `dashArray '4 6'`，选中停留点降透明度），tooltip = gap 标签 + `fmtDateTime(fromMs) → fmtDateTime(toMs)`；实测段 activityColor 着色不动。
- `src/pages/TripsPage.tsx`：`bridges = bridgeLines(prepared.segments)` useMemo；MapPane 增加 bridges prop；两个 TripMap 实例传 `bridges`；summary 增「· N 处衔接」。
- `src/lib/trips.test.ts`：新增「timeline bridges (T14)」desc（7 用例）。

**实现要点**：
- 衔接线是「无记录时段」的诚实呈现——虚线/浅灰/细与实测段可辨识，tooltip 明确标注 gap 时长而非伪装轨迹。
- 排序跨零点按绝对 ms（23:50 → 次日 00:10 顺序正确）；重叠/相接段跳过衔接（已经连上），避免画零长度或反向线。
- 预算：每桥固定 2 顶点，`BRIDGE_CAP=1000` 上限 + stride 抽样，全量视图桥点 ≤ 2000；不新增 legend 项（amount 标签不加）。
- raw 灰点独立图层，不入轨迹线、不受桥影响（测试断言带 points 时桥数不变）。

**验证**：
- 单测 112 → **119**（+7：排序/跨零点、gap 元数据、重叠+相接跳过、退化几何、标签阈值+多单位、预算封顶+保两端、多段日连续+桥不并入点）。
- `npm run test` 119 passed / build（tsc+vite）✅ / lint 0 error。
- 真实验证（临时 livedata 脚本，跑完即删）：2025/2026 文件最忙日同为 2016-01-14，31 段按 startMs 排序，衔接线 4 处（gap 分别 4h、~1h、~1h 等真实无记录时段，坐标在吉隆坡一带）。
- 另：parse.test.ts G1 截断测试在并行下偶发 5s 超时（2M 点循环），已将该用例 timeout 提至 30s。
- 未 commit、未部署——待 Reviewer 审查。
## 2026-09-14 13:35 — Dev 收尾 T14（Reviewer 有条件通过 + CEO 拍板）
T14 Reviewer 通过（有条件），CEO 拍板，两处收尾：

**N1 消歧（代码语义更自然的一方）**：`bridgeGapLabel` 判定从 `gapMs <= BRIDGE_ANNOTATE_MIN_MS` 改为 `gapMs < 60_000` —— 按常量命名（`ANNOTATE_MIN_MS` = 标注下限）与 docstring 口径，恰好 60s 应含界正常标注。测试同步：`bridgeGapLabel(60_000)` 断言改为 `'衔接 +1 分钟'`（附注释说明含界语义），`30_000` → `'衔接'` 不变。

**A1 设计边界已落档**：`docs/DATA-FINDINGS.md` 新增 §7「Trips 时间线衔接线边界（CEO 拍板 2026-09-14）」——衔接线只在 `gapMs > 0`（纯时间口径）生成；时间重叠（gap ≤ 0）段不补线（并行记录如飞行段 vs 地面段，补线伪造连续移动）；地理远但时间顺序的段照常补桥；不引入距离闸门。

**验证**：`npm run test` 119 passed（不变） / build（tsc+vite）✅ / lint 0 error。`TASKS.md` T14 备注已更新为「Reviewer 通过（有条件）N1 已修，CEO 拍板边界已记 DATA-FINDINGS §7；待部署」。未 commit、未部署。
## 2026-09-14 14:05 — Dev 修复 T14.1（桥接线与轨迹线端点不一致）
CEO 定位的观感 bug：桥两端与轨迹 polyline 各留断口，视觉上"没有连接"。

**根因**：`bridgeLines` 用语义端点建桥（`from: prev.end` / `to: cur.start`），但渲染端 TripMap 的 segment polyline 用的是 `segment.path`（长度>=2 时；否则回退 `[start,end]`）。缝合（T13.2/T13.3）产出的 path 首末点与语义 start/end 不重合（容差 MAX_STITCH_DEG≈0.02°≈2km）→ 桥两端各留公里级断口。测试 fixture 均按语义端点构造，故逻辑测试通过、观感失败。

**修复**（`src/lib/trips.ts`）：
- 新增 `polylineEndpoints(s)`：`{ first: path[0] ?? start, last: path[path.length-1] ?? end }`（长度<2 回退语义端点，与 TripMap 渲染口径完全一致）。
- `bridgeLines` 的 `from` 改用上一段可视终点、`to` 改用下一段可视起点；重合跳过判断同步用可视两端（path 端点重合即视为已贴合，即使语义端点不同）；`gapMs` 仍按语义时间 `cur.startMs - prev.endMs`（纯时间口径，CEO 拍板不变）。
- 入参为 `prepareTrips` 处理后的 segments：DP 简化与预算 strideTake 均保端点，可视首末点即渲染首末点。

**测试**（`src/lib/trips.test.ts`，119 → 120）：
- 改：桥元数据用例改带 path 的 fixture（path≠start/end），断言 `from`/`to` 取 path 端点；退化重合用例改为「语义端点不同但 path 端点重合 → 跳过」，证明判定走可视端点。
- 新增：「hugs every drawn polyline endpoint when paths do not match start/end」——3 段链逐桥断言 from/to 精确等于相邻 path 首末顶点。
- 保留：排序/跨零点、gap 元数据、重叠+相接跳过、标签阈值、预算 cap 保两端、多段日集成。

**验证**：
- `npm run test` 120 passed（原 119 → 新增 1）/ build（tsc+vite）✅ / lint 0 error。
- livedata 流程（临时 spec 跑完即删）：2025/2026 两文件最忙日 2016-01-14 各 31 段、4 桥；逐桥断言 `from` 精确等于上一段 path 末顶点、`to` 精确等于下一段 path 首顶点（坐标相等断言全过）；并量化修复前断口「语义端 vs 可视端」最大 `1.30 km`（与 MAX_STITCH_DEG 同量级，CEO 判断正确）。
- 未 commit、未部署。

## 2026-09-15 13:26 — Dev：T30 UI/UX 精修批（PRD v1.20）
T30.1–T30.5 完工。5 项用户反馈（#1–#5）对应的 PRD v1.20 变更全部落地。

**T30.1 顶栏导航激活态精确匹配**（`components/Header.tsx`）：`NavLink` 一律 `end`（移除 `/app` 对 `/app/places` 的前缀匹配）。

**T30.2 日期范围控件改「紧凑按钮 + popover 双月历」**（`components/DateRangePicker.tsx` 重写 + `index.css`）：
- 常驻侧栏一行触发按钮：`.drp-trigger`（`drp.title` 标签 + `.drp-trigger-range` 範圍 + `.drp-trigger-caret ▾`），`aria-expanded` + `aria-haspopup="dialog"`；`<768px` 标签隐藏，只留「範圍 ▾」。
- 点击 toggle 打开 `.drp-popover`（`role="dialog"` `aria-label=drp.title`），内含**原有 presets/翻月/双月/range/clear/hint 逻辑不动**（含 existing `drp-*` classes）。
- **关闭时机**：Esc（keydown effect）、透明 fixed `.drp-backdrop`（`z-index:890`，点外部=关）、**完成双点选择**（`pick` 完成分支才 `setOpen(false)`）、preset 应用（`apply` → `close()`）、**更换数据強制關閉**（store `data` 引用变化 → `useEffect` 註冊的 zustand `subscribe` 关闭）。`drp.clear` **不关闭**（已实测）。popover `z-index:900`，`max-height:calc(100vh-140px)` 内滚；`<768px` 整行宽（`left/right:-14px` 拉满、`max-width:none`、`border-radius:0`、`max-height:70vh`）。
- **发现并修复一个联动 bug**：TripsPage 的 `MapPane` 原先以 `fitKey` 作 `key`，而 **DateRangePicker 在 MapPane 内部** → 点选起点日即触发 remount，popover 第一击后就被销毁（双点选法不可用）。修复：去掉 `key={fitKey}`（`TripMap` 內部 `FitController` 已按 `fitKey` prop 自我 re-fit，remount 本就多余），改在 `MapPane` 内用 zustand `subscribe` 在 `dateRange`/`data` 变化时清空选取三态（`selectedVisit`/`selectedSegmentIndex`/`flyTarget`）——**行为与旧 remount 一致**（换窗丢弃越界选中项，已实测选取行列 `.selected` 在换范围后清零），popover 状态得以跨两击存活。
- 选中 marker 为 canvas 圆（非 DOM），无法从 DOM 类观察；改以 timeline 行 `.selected` 验证选取/清空。

**T30.3 导入后默认「近 30 天」**（`lib/trips.ts` + `store/timelineStore.ts`）：
- 抽纯函数 `lastNDaysRange(maxMs, days)`：`!Number.isFinite(maxMs)` → `{startMs:null, endMs:null}`；否则 `end = endOfDayMs(maxMs)`、`startMs = end - days*DAY_MS + 1`。
- store 新增 `DEFAULT_RANGE_DAYS = 30`；`importFiles`/`loadSample` 成功分支 `dateRange = lastNDaysRange(data.meta.timeRange.maxMs, DEFAULT_RANGE_DAYS)`（保留 `maxMs` 非有限回退 `RESET_RANGE` 语义）；`clearData` 仍 `RESET_RANGE`。
- DateRangePicker「近 30 天 / 近一年」快捷档复用 `lastNDaysRange`（锚点 `endMs ?? data end`），保证 `active` 高亮与 store 一致。
- 单测 +4（`describe('lastNDaysRange')`）：1 天窗=`end - DAY + 1` 且等于 `startOfDayMs(maxMs)`；30 天窗宽 `30*DAY - 1` ms（含 narrowing throw）；与快捷档公式完全一致；非有限 maxMs 回退开放式。

**T30.4 Places 默认半径 5 KM**（`pages/PlacesPage.tsx` `useState(100)` → `useState(5)`）。

**验证**：
- `npm test` 206 passed（原 202 → +4 lastNDaysRange）/ `npm run build` ✅（仅既有 chunk-size 警告）/ `npm run lint` 0 error。
- 浏览器冒烟（sample，1280px + 390px）：nav 高亮 `/app`=Trips only、`/app/places`=Places only（均带 `aria-current="page"`）；导入后默认「近 30 天」= **Aug 14, 2026 ~ Sep 12**（锚定数据尾 Sep 12）、顶栏/统计/列表联動；popover 双点选 Sep 5→Sep 10 完成自动关 + 地图/统计/列表联动（189 route points / 26 stays）；单点起点日 popover **保持开启**（remount 修复）；Esc 关、backdrop 外部点击关（`elementFromPoint(1000,300)` 命中 `.drp-backdrop`）；presets（Last 30 days / All）应用即关、`drp.clear` 不关、trigger `aria-expanded` 正确翻转；390px：触发按钮只剩「範圍 ▾」、popover 整行宽（left -14/right 374 @390, max-height 590.8px = 70vh, border-radius 0, overflow-y auto）；换范围后选取清空（`.timeline-item.selected` 1 → 0）。console 仅既有（无关）CSP `frame-ancestors` meta 警告，0 pageerror。
- 单测一次偶发失败（stitch 真实设备导出的 ~6s I/O 测试在并行压力下超时），连跑两次 206 全绿，判定为 flaky 非回归。
- 未 push。
