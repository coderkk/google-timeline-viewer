# SMOKE-CHECKLIST — 瀏覽器冒煙清單（按任務類型）

> 目的: 避免每次「從腦中隨機抽驗」造成遺漏（教訓: T30 冒煙漏 popover 焦點陷阱、T27 白屏回歸）。
> 用法: Dev 提交審查前按任務類型勾選必驗項做瀏覽器實測，**把勾選結果附在提交說明**（缺則 Reviewer 可打回）。
> 位置: 每個項目複製一份到 `docs/SMOKE-CHECKLIST.md`（模板在 `templates/project/docs/`），Dev 複製當前任務對應的類型段落到提交說明即可。

## 通用必驗（所有類型）

- [ ] 0 pageerror（console errors = 0；既有已知告警除外並註明來源）
- [ ] 主流程單測 + build（tsc / vite build）綠
- [ ] 桌面視口 1280px 過一遍主流程

## A 導入/資料處理任務（import、parse、merge、統計…）

- [ ] sample 與真資料各過一遍導入
- [ ] 大檔案（若涉及）壓測載入時間 / long task
- [ ] 空資料 / 畸形資料：有錯誤提示，不白畫面
- [ ] 摘要統計與資料一致（抽一筆人工比對）

## B UI/交互重寫（組件、狀態機、popover、日期控件、模式切換…）

- [ ] 雙視口: 1280px + 390px（行動端）
- [ ] 開關 / 展開收起來回切換 ≥3 次（狀態不殘留）
- [ ] 模式 / 語言 / 資料切換後回到原場景正常（re-render 不崩、無 remount 打斷）
- [ ] 鍵盤: Esc 可關、focus 不丟失（或標註為已知一般級限制）
- [ ] aria: 觸發按鈕 `expanded` / `haspopup` 等屬性正確

## C 性能 / 渲染

- [ ] 大樣本（或真檔）拖拽 / 縮放不掉幀到不可用
- [ ] 曾優化過的 long task 復測（Performance 記錄）
- [ ] LOD / 點數門檻行爲正常（超預算時兩端保留、downsample 生效）

## D 文檔 / 配置 / 部署

- [ ] 文件模板 / gitignore 一致
- [ ] build 產物可部署；部署後 hash 比對 live 是否更新

## 提交說明附註格式

```markdown
自測: tsc ✓ / tests 206 ✓ / build ✓
冒煙: A+B 型（SMOKE-CHECKLIST）
  - 0 pageerror ✓（唯一告警 = 既有 CSP meta，非回歸）
  - 1280+390 雙視口 ✓
  - 開闔 3 次狀態不殘留 ✓
  - Esc 關閉 ✓（焦點陷阱: 一般級已知限制，見 NOTES）
```