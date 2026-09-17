# Release Runbook — 发布链清单

> 目的：发布是不可逆的外部事件，顺序锁死防「发布即考古」。本文为项目级发布清单（来源 `templates/project/docs/release-runbook.md`，按本仓库实际适配），**每次发布过一遍**，勾选结果附在发布 DECISIONS 记录。
> 发布链任务（发布前收尾/终批/发布验证）不论档位执行冒烟全集（SMOKE-CHECKLIST 三层义务 A13）。
> **执行角色默认**：①—④ 由 CEO；⑤ 由 Reviewer 确认；⑥—⑩ 由 CEO/Dev 协作（push 由 CEO 统一执行）；若实际执行者不同则勾选时注明。

## 顺序铁律

```
① CHANGELOG 切版(CEO)  →  ② 一致性核对(CEO)  →  ③ 上 tag 以来 Done 清查(CEO)
→ ④ grep 过时宣传语(CEO)  →  ⑤ git diff 声明内容(Reviewer)  →  ⑥ 打 tag(CEO)
→ ⑦ build(Dev)  →  ⑧ push(CEO，自动触发 deploy.yml)  →  ⑨ 线上验证(CEO/Dev)  →  ⑩ 线上冒烟(CEO/Dev)
```

> **切版必须先于打 tag**：tag 指向的 commit 必须已含发布段（否则 `git show vX.Y.Z:CHANGELOG.md` 是空档）。
> **CHANGELOG 绑定 Done 归档**：日常开发中，Dev 把任务移入 Done 的同一轮提交里追加以任务编号为引用的变更行；发布时只做「切版本号 + 日期」（本项目 CHANGELOG 为 Keep a Changelog 风格 + 任务编号引用）。
> **发布通道**：push main → 自动触发 GitHub Actions `deploy.yml`（lint → 单测 → build → upload → deploy-pages），无需手动 deploy。

## 清单（勾选时注明执行角色与日期）

- [ ] **CHANGELOG**：`[Unreleased]` → `vX.Y.Z (YYYY-MM-DD)`；本次所有 Done 卡都有条目
- [ ] **PRD 内部一致性**：功能清单 vs「不做」区无矛盾（发布前核对，防功能残留）
- [ ] **Done 清查**：上 tag 以来所有 Done 卡已归档/可追溯，无「Done 了但没进 CHANGELOG」的卡
- [ ] **过时宣传语 grep**：全 repo 扫旧功能名/旧数量/旧行为（README/i18n/Landing/Help/截图文案）
- [ ] **截图核对**：截图是 grep 盲区——按 `docs/COPY.md`「截图一致性核对」逐张人工打开看实物 vs 当前 UI；标注「疑似不一致」的必须重截后再发布
- [ ] **git diff**：只含声明内容，无杂物/无 debug 代码
- [ ] **凭据 grep**：`API_KEY` / `token=` / 硬编码密钥 为 0
- [ ] **端点资产核对**：无新增未登记网络端点；隐私白名单无漂移（`scripts/privacy-allowlist.json`，T42 落地后为单一源）
- [ ] **CSP diff**：`index.html` meta / 白名单无意外变更
- [ ] **隐私宣称↔行为对照**：Privacy 文案与 `docs/COPY.md` 登记逐条比对 + 实际数据流核对（T42 network-tap 门禁绿灯为硬条件）
- [ ] **npm audit**（若涉依赖变更）
- [ ] **外链标注**：新外链均带 rel/target 标注
- [ ] **打 tag**：`vX.Y.Z`（annotated），问「这个 commit 能不能对外负责？」
- [ ] **build**：`cd src && npm run lint && npm test && npm run build` 全绿（deploy.yml 也会跑一遍）
- [ ] **push + deploy**：push main 自动触发 workflow，build/privacy/deploy 各 job 全绿（记录 GitHub Actions run ID）
- [ ] **线上冒烟**：`scripts/out/gh-live-smoke.mjs` 全过 + 0 pageerror（已知噪音除外；T43 落地后改走 `scripts/smoke-release.mjs` live 模式）
- [ ] **归档**：发布结论 + run ID + 线上 URL 记入 `docs/DECISIONS.md`

## 回滚预案

- 线上冒烟 FAIL（致命）→ 回退发布（GitHub Pages：workflow 重跑上一发布 commit 的 deploy）
- 回滚后在本 runbook 附加「发布事故」一节：现象/影响/根因/防止复发（A11 三件套：同族清单 + 逐成员判别验证 + 结构性消除手段）