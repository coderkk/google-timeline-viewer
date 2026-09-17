# DESIGN-T42 — 隐私断言机器化（network-tap）设计

> 设计者：Security Engineer（2026-09-17，CEO 唤起）｜实现依据：本文档即实现 spec
> 依据：WORKFLOW §10「对外承诺的四颗牙」、宣言原则 2（量具自检）/9（承诺可机器验证）、SMOKE-CHECKLIST 隐私/数据断言段
> 核心命题：**「默认配置下，本应用自身不发起任何未经白名单批准的出网请求」必须由 deploy.yml 中的机器强制，而非人肉勾选。**

## 0. 出网面盘点（牙①：验证范围覆盖全部出网路径）

| # | 出网路径 | 证据 | 处置 |
|---|---------|------|------|
| N1 | **OSM 瓦片**（唯一天然外部 host） | `tiles.ts` 默认 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`；TripMap/PlacesMap 各挂 TileLayer | 运行期捕获（断言范围） |
| N2 | **自定义瓦片源**（用户 opt-in，任意 host） | SettingsPage 输入 + `setTileSource`（store 内存态，刷新失效，不持久化） | **豁免于默认断言**（见 §1.1 裁决）；校准探针 B 覆盖 |
| N3 | **self 静态资源** | index.html / assets / worker chunk（`?worker` Vite 产物） | 运行期捕获（source == self origin） |
| N4 | **blob: 下载** | ExportButton / MergePage（createObjectURL + anchor.click） | 非网络；scheme 分类放行 |
| N5 | **worker 脚本** | parse/merge worker（self 源独立 chunk） | parse 触发（真实导入）；merge 懒加载不进 sweep（limitations 声明） |
| N6 | **外链锚点**（用户点击才出网） | `site.ts` OPC_3_LINK(coderkk.net)；`coords.ts` googleMapsUrl(google.com) | **sweep 禁点外链**（红线）；断言范围外 |
| N7 | **无 fetch/XHR/beacon/SSE/WS** | src/ 全量 grep 0 命中 | 静态证据；运行期断言兜底 |
| N8 | **sample 数据内置** | `sample/index.ts` `?raw` 内联 + 同一 parse 管线 | 非网络，确认 |

缺口确认：deploy.yml 现状 = lint → test → build → upload → deploy，零请求断言；CSP `connect-src 'self' https:` 只限 scheme 不限 host → **运行期 tap 是唯一 host 级机器防线**。

## 1. 权限设计裁决（牙②默认拒绝 + 牙③不可豁免）

1. **静态白名单管「默认配置」**：`tileSource` 不持久化，CI 新 context → 默认恒为 OSM。默认配置下「白名单之外即违例」= 充分约束。
2. **自定义瓦片源不进动态白名单**：动态放行 = 用户输入即合法 = 默认拒绝形同虚设。自定义瓦片是**用户显式、已明示的 opt-in**（tiles.ts 头注释 / SettingsPage tile-warn / README 隐私声明均已披露），属产品承诺之外的例外面，不构成「应用偷偷联网」。
3. 该例外的机器义务由**校准探针 B**（走真实设置 UI 注入任意 host，断言 tap 必红）承担——机制对任意 host 敏感。
4. **不可豁免**：白名单 `exceptions` 默认空；任何豁免条目必须带 `date/owner/reason` 三字段，`reason` 缺失即违例；执行层不可豁免，改白名单走 CEO 留痕。

## 2. `scripts/privacy-allowlist.json`（schema + 初始内容）

schema：`meta`（repo/app/updated/scope/surfaces/limitations）+ `localSchemes`（blob:/data:/about:/file:）+ `network`（self: origin-equals-page-base；tile: [{name, origin, pathPattern, note}]）+ `policy`（networkRequestsNoQuery / networkRequestsNoPayload / cspConnectSrcHostTokens / customTileSource）+ `exceptions`（date/owner/reason）。

初始内容（Dev 原样落地）：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "meta": {
    "repo": "coderkk/google-timeline-viewer",
    "app": "Timeline Map",
    "updated": "2026-09-17",
    "scope": "Default configuration only (tile source = OpenStreetMap, no persisted user settings). Assertion: every network request initiated by the app runtime is allowed by this allowlist or the run FAILS.",
    "surfaces": [
      "README.md \"## 隐私声明\"",
      "COPY.md claim: privacy-default-config-no-egress",
      "index.html CSP meta",
      "SMOKE-CHECKLIST.md 隐私/数据断言段",
      "SettingsPage tile-warn / Landing privacy card"
    ],
    "limitations": [
      "External anchor navigation (OPC link, Google Maps links) is user opt-in; the sweep never clicks external anchors (hard rule).",
      "The merge worker chunk is lazy-loaded only when merging; covered by static audit (no XHR/fetch; grep-enforced), not by runtime tap.",
      "Requests from windows/popups opened by external navigation are not observed (opt-in)."
    ]
  },
  "localSchemes": ["blob:", "data:", "about:", "file:"],
  "network": {
    "self": { "match": "origin-equals-page-base" },
    "tile": [
      {
        "name": "OpenStreetMap",
        "origin": "https://tile.openstreetmap.org",
        "pathPattern": "^\\/[0-9]+\\/[0-9]+\\/[0-9]+\\.png$",
        "note": "Default TileLayer host (TripMap + PlacesMap). Sends viewer IP + visible bbox to OSM — disclosed opt-in per README/Privacy UI."
      }
    ]
  },
  "policy": {
    "networkRequestsNoQuery": true,
    "networkRequestsNoPayload": true,
    "cspConnectSrcHostTokens": true,
    "customTileSource": {
      "status": "user-explicit-opt-in-outside-default-scope",
      "surfaces": ["SettingsPage tile-warn", "README.md 隐私声明 → 地图瓦片", "COPY.md claim: privacy-custom-tile-opt-in", "tiles.ts module head comment"],
      "decisionRecord": "DESIGN-T42.md §1 (2026-09-17, Security Engineer ruling; CEO 追认)",
      "enforcement": "Calibration probe B drives Settings UI to set an arbitrary https:// tile host and asserts the tap flags it red."
    }
  },
  "exceptions": []
}
```

## 3. `scripts/smoke-network-tap.mjs` 行为 spec

- 单文件 ESM、零新依赖（仅 playwright + node 内置）；`--base <url>`（self origin 运行期推导）、`--allowed <path>`（默认 scripts/privacy-allowlist.json，相对 import.meta.url）、`--json report.json`、`--calibrate-only`。
- **退出码**：`0` = assert 0 违例且校准全探针被标记；`1` = assert 违例（门禁红）；`2` = 校准失败（量具坏，红）；`3` = 运行错误（base 连不上 / 白名单读不了或 schema 非法）。
- **Assert 阶段**（默认配置）：健康轮询 base ≤30s；桌面 1440×900 + 移动 390×844 双视口，捕获集并集；路由遍历：S1 landing（.hero-cta .btn-primary）→ S2 点「立即体验」等 `.trip-map`（sample 内置 + OSM 瓦片爆发，**必达信号：捕获 ≥1 OSM 瓦片请求**）→ S3 等 map settle（waitForTimeout 1500，不赌 networkidle）→ S4 `setInputFiles` 真实导入最小 fixture（等 data ready；**必达信号：data 统计渲染**，证明 worker 路径真跑）→ S5 `#/app/places` 等 `.leaflet-container` → S6 `#/app/merge`（静态）→ S7 回 app 开 Export 下载（blob 路径，acceptDownloads）→ S8 `#/settings` → `#/help` → landing 收尾。
- **捕获**：`page.on('request')`（发起即捕，不过滤 status）。
- **违例判据**（逐请求按序裁决）：①scheme ∈ localSchemes → ALLOW-LOCAL；scheme ∉ {http,https}∪local → VIOLATION-SCHEME；②origin == self → ALLOW-SELF；origin ∈ tile + pathPattern 匹配 → ALLOW-TILE（path 不匹配 → VIOLATION-PATH）；其余 → VIOLATION-HOST；③**载荷硬化**：对 ALLOW-SELF/ALLOW-TILE 仍检查 query string 或 postData 非空 → VIOLATION-QUERY / VIOLATION-PAYLOAD（把「无任何网络请求携带原始坐标」落到网络层）；④exceptions 不参与自动放行。
- **空转守卫（防假绿）**：S2 结束捕获集 ∩ tile origins = ∅ → 退出码 1（「tile path not exercised — sweep is vacuous」）；S4 后无 data 就绪 → 退出码 1。
- **校准阶段（阴性/阳性对照，WORKFLOW §8 门禁型必做负向校准）**：独立 context，两探针全部必须被标记违例，任一未标记 → 退出码 2：
  - 探针 A（fetch 注入）：`page.route('https://example.com/t42-calibration-probe', r => r.abort())`（CI 卫生，不发真实外网）+ `page.evaluate(fetch(...))` → 期待 VIOLATION-HOST。
  - 探针 B（自定义瓦片走真实 UI）：设置页填 `https://tiles.example.com/{z}/{x}/{y}.png` → apply → 回 app 强制 reload tile → 期待 VIOLATION-HOST。
- **输出**：`PRIVACY-TAP v1 allowlist=… base=… scope=default-config` + 逐条 ALLOW/VIOLATION 行 + `verdict: PASS/FAIL` + 校准结果 + exit code；`--json` 输出结构体供 CI annotation。
- **红线（脚本头写死）**：sweep 与探针**不得点击任何外部锚点**（google.com / coderkk.net）——opt-in 面，点出去 = CI 里把用户坐标送 Google。
- **testing fixture**：`fs.mkdtempSync(os.tmpdir()+'/t42-')` 就地生成最小合法 format-1 Timeline.json（1 visit + 1 raw point），结束 rmSync，不入库。
- **CSP 静态复核（第三层）**：读 base 下 index.html，断言 `connect-src` 存在、含 `'self'`、不含 `*`、不含任何 `https://host` 具体 token（policy.cspConnectSrcHostTokens）→ 违例退出码 1（CSP 与 allowlist 强制同步）。

## 4. deploy.yml 门禁拓扑（dist artifact 传递，单一事实源）

- build job：现有 lint/test/build + `actions/upload-artifact@v4`（name: dist, path: src/dist, if-no-files-found: error）；原 upload-pages-artifact 移入 deploy job。
- **privacy job**（`needs: build`）：checkout + setup-node → `cd scripts && npm ci` → `npx playwright install --with-deps chromium` → `download-artifact`（name: dist）→ `python3 -m http.server 4173 -d dist &`（CI 用 python 静态服务，零安装；本地复现用 `vite preview`）→ `node scripts/smoke-network-tap.mjs --base http://127.0.0.1:4173`（退出码 0/1/2 即门禁红绿）。
- **deploy job**：`needs: [build, privacy]`（**牙③结构性硬门禁**）→ download-artifact → configure-pages → upload-pages-artifact（path: dist）→ deploy-pages。
- 禁止 privacy 自己 build（产物漂移 + CI 翻倍）；禁止复用 upload-pages-artifact 产物（特殊封装需二次解包）。

## 5. 验收判据（CEO 验收 + Security 评审共用）

- **A1** allowlist schema 合法、network.tile.length===1、exceptions 空 → `node -e` 断言 exit 0
- **A2** 默认配置 0 违例：build + preview + tap → exit 0 且 tile-requests>0（空转守卫满足）
- **A3** **必红（阳性对照）**：注入违例（query 或 fetch 外部 host）重建再跑 → exit 1 且列出 VIOLATION-* 与 URL；还原回绿（三态：干净=0 / 注入=1 / 还原=0）
- **A4** 校准探针：`--calibrate-only` exit 0 = 双探针被标记；破坏捕获逻辑 → exit 2
- **A5** 空转守卫：去掉 map 或 import 等待步骤 → exit 1 报 vacuous
- **A6** 退出码可区分：违例/坏探针/死 base → 1/2/3
- **B1** privacy job 存在且 needs build；deploy.needs 含 privacy
- **B2** privacy/deploy 消费同一 artifact
- **B3** workflow_dispatch 触发一次，日志含 `[calibrate] probe A/B FLAGGED`
- **B4**（可选）分支实测注入违例 → CI 红 deploy 跳过，还原 → 绿
- **C1** SMOKE-CHECKLIST 隐私段指向 tap 脚本 + allowlist 路径
- **C2** COPY.md 登记两条隐私主张（privacy-default-config-no-egress / privacy-custom-tile-opt-in）；与 T41 合流
- **C3** README 隐私声明核对一致（OSM + opt-in 例外 = 白名单两个非空面），NOTES 记录对照通过
- **C4** 零新依赖；无外链点击路径；fixture 不入库
- **D** Security 评审按四颗牙逐条打勾（①全路径入断言或显式声明 ②默认拒绝 ③不可豁免（exceptions 不参与放行 + deploy 硬门禁 + 红线）④默认配置承诺 + limitations 声明）

## 6. 建议（P2，非阻塞，待 CEO 另立卡）

- 收紧 CSP：`connect-src 'self' https://tile.openstreetmap.org`（当前 scheme 级 CSP 使 tap 为唯一 host 防线；收紧后双防线）
- 未来新增网络端点必须三处同步：privacy-allowlist.json + index.html CSP + COPY.md 主张；runbook CSP diff 项旁注「同步 allowlist」