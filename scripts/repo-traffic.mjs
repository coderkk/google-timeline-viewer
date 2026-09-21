#!/usr/bin/env node
// repo-traffic.mjs — T47 数据源采集：GitHub repo traffic（views/clones）
// 通过 GitHub API 获取仓库流量数据，作为移动端适配决策依据。
//
// API 端点：
//   GET /repos/{owner}/{repo}/traffic/views    — 点击量（过去 14 天）
//   GET /repos/{owner}/{repo}/traffic/clones   — 克隆量（过去 14 天）
//   GET /repos/{owner}/{repo}                  — 仓库元数据（stars/forks 等）
//
// 注意：traffic API 需要 auth token（否则 rate limit 10 req/h）
// 无 token 时返回仓库元数据 + 标记 "未授权"
//
// Usage:
//   node scripts/repo-traffic.mjs [--token <gh-token>]
//
// Output: docs/records/repo-traffic/YYYY-MM-DD.md

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_OWNER = 'coderkk'
const REPO_NAME = 'google-timeline-viewer'
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`

// ── CLI ─────────────────────────────────────────────────────────────────────
let token = null
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--token' || process.argv[i].startsWith('--token=')) {
    token = process.argv[i].replace('--token=', '') || process.argv[i + 1]
  }
}

// ── Fetch helpers ───────────────────────────────────────────────────────────
async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...headers,
    },
  })
  if (res.status === 404) return { _404: true }
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const reset = res.headers.get('x-ratelimit-reset')
    return { _403: true, remaining, reset }
  }
  if (res.status === 401) return { _401: true } // anonymous traffic endpoints return 401 (expected)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`REPO-TRAFFIC — ${REPO_URL}`)
  console.log(`Token: ${token ? 'yes' : 'no (unauthenticated)'}`)
  console.log('')

  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {}
  const data = {}
  const issues = []

  // 1. Repo metadata
  try {
    console.log('Fetching repo metadata...')
    data.repo = await fetchJSON(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, authHeaders)
    if (data.repo._404) {
      issues.push('Repo not found (404)')
    } else if (data.repo._403) {
      issues.push(`Rate limited (remaining: ${data.repo.remaining})`)
    } else {
      console.log(`  stars: ${data.repo.stargazers_count}`)
      console.log(`  forks: ${data.repo.forks_count}`)
      console.log(`  open issues: ${data.repo.open_issues_count}`)
      console.log(`  created: ${data.repo.created_at}`)
      console.log(`  pushed: ${data.repo.pushed_at}`)
      console.log(`  size: ${data.repo.size} KB`)
      console.log(`  license: ${data.repo.license?.spdx_id ?? 'N/A'}`)
      console.log(`  default branch: ${data.repo.default_branch}`)
    }
  } catch (err) {
    issues.push(`repo metadata: ${err.message}`)
  }

  // 2. Traffic views (past 14 days)
  try {
    console.log('Fetching traffic views...')
    data.views = await fetchJSON(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/traffic/views`,
      authHeaders,
    )
    if (data.views._404) {
      issues.push('Traffic views: 404 (repo may be private)')
    } else if (data.views._403) {
      issues.push(`Traffic views: rate limited (remaining: ${data.views.remaining})`)
    } else if (data.views._401) {
      issues.push('Traffic views: 401 (anonymous request, requires auth token)')
    } else {
      const { count, views } = data.views
      console.log(`  total clicks: ${count}`)
      if (views) {
        console.log(`  unique visitors: ${views.length}`)
        for (const v of views.slice(-7)) {
          console.log(`    ${v.timestamp.slice(0, 10)}: ${v.count} clicks, ${v.uniques} unique`)
        }
      }
    }
  } catch (err) {
    issues.push(`traffic views: ${err.message}`)
  }

  // 3. Traffic clones (past 14 days)
  try {
    console.log('Fetching traffic clones...')
    data.clones = await fetchJSON(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/traffic/clones`,
      authHeaders,
    )
    if (data.clones._404) {
      issues.push('Traffic clones: 404 (repo may be private)')
    } else if (data.clones._403) {
      issues.push(`Traffic clones: rate limited (remaining: ${data.clones.remaining})`)
    } else if (data.clones._401) {
      issues.push('Traffic clones: 401 (anonymous request, requires auth token)')
    } else {
      const { count, clones } = data.clones
      console.log(`  total clones: ${count}`)
      if (clones) {
        for (const c of clones.slice(-7)) {
          console.log(`    ${c.timestamp.slice(0, 10)}: ${c.count} clones, ${c.uniques} unique`)
        }
      }
    }
  } catch (err) {
    issues.push(`traffic clones: ${err.message}`)
  }

  // 4. Top referrers (for traffic source analysis)
  try {
    console.log('Fetching top referrers...')
    data.referrers = await fetchJSON(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/traffic/popular/referrers`,
      authHeaders,
    )
    if (data.referrers._404 || data.referrers._403) {
      // Not critical
    } else if (data.referrers) {
      console.log(`  top referrers:`)
      for (const r of (data.referrers.slice?.(0, 5) || data.referrers)) {
        console.log(`    ${r.referrer}: ${r.count} clicks, ${r.uniques} unique`)
      }
    }
  } catch (err) {
    // Not critical, skip
  }

  // ── Write report ────────────────────────────────────────────────────────
  const reportDir = join(fileURLToPath(new URL('../docs/records/', import.meta.url)), 'repo-traffic')
  mkdirSync(reportDir, { recursive: true })

  const today = new Date().toISOString().slice(0, 10)
  const reportPath = join(reportDir, `${today}.md`)

  let report = `# Repo Traffic Report\n\n`
  report += `> T47 — GitHub repo traffic 数据采集\n`
  report += `> 仓库: ${REPO_URL}\n`
  report += `> 采集时间: ${new Date().toISOString()}\n`
  report += `> 认证: ${token ? '已认证' : '未认证（匿名请求，速率限制 10 req/h）'}\n\n`

  // Repo metadata
  if (data.repo && !data.repo._404 && !data.repo._403) {
    report += `## 仓库元数据\n\n`
    report += `| 字段 | 值 |\n`
    report += `|------|-----|\n`
    report += `| Stars | ${data.repo.stargazers_count} |\n`
    report += `| Forks | ${data.repo.forks_count} |\n`
    report += `| Open Issues | ${data.repo.open_issues_count} |\n`
    report += `| Created | ${data.repo.created_at} |\n`
    report += `| Last Push | ${data.repo.pushed_at} |\n`
    report += `| Size | ${data.repo.size} KB |\n`
    report += `| License | ${data.repo.license?.spdx_id ?? 'N/A'} |\n`
    report += `| Default Branch | ${data.repo.default_branch} |\n`
    report += `| Language | ${data.repo.language ?? 'N/A'} |\n\n`
  }

  // Traffic views
  if (data.views && !data.views._404 && !data.views._403) {
    report += `## 点击量（过去 14 天）\n\n`
    report += `| 指标 | 值 |\n`
    report += `|------|-----|\n`
    report += `| 总点击量 | ${data.views.count} |\n`
    report += `| 独立访客 | ${data.views.views?.length ?? 0} 天 |\n\n`
    if (data.views.views?.length) {
      report += `### 每日明细\n\n`
      report += `| 日期 | 点击量 | 独立访客 |\n`
      report += `|------|--------|----------|\n`
      for (const v of data.views.views) {
        report += `| ${v.timestamp.slice(0, 10)} | ${v.count} | ${v.uniques} |\n`
      }
      report += `\n`
    }
  } else if (data.views?._403) {
    report += `## 点击量\n\n> ⚠️ 速率限制（剩余: ${data.views.remaining} 请求）\n\n`
  }

  // Traffic clones
  if (data.clones && !data.clones._404 && !data.clones._403) {
    report += `## 克隆量（过去 14 天）\n\n`
    report += `| 指标 | 值 |\n`
    report += `|------|-----|\n`
    report += `| 总克隆量 | ${data.clones.count} |\n`
    report += `| 独立克隆者 | ${data.clones.clones?.length ?? 0} 天 |\n\n`
    if (data.clones.clones?.length) {
      report += `### 每日明细\n\n`
      report += `| 日期 | 克隆量 | 独立克隆者 |\n`
      report += `|------|--------|------------|\n`
      for (const c of data.clones.clones) {
        report += `| ${c.timestamp.slice(0, 10)} | ${c.count} | ${c.uniques} |\n`
      }
      report += `\n`
    }
  } else if (data.clones?._403) {
    report += `## 克隆量\n\n> ⚠️ 速率限制（剩余: ${data.clones.remaining} 请求）\n\n`
  }

  // Top referrers
  if (data.referrers && !data.referrers._404 && !data.referrers._403 && data.referrers.length) {
    report += `## 来源分析\n\n`
    report += `| 来源 | 点击量 | 独立访客 |\n`
    report += `|------|--------|----------|\n`
    for (const r of data.referrers.slice(0, 10)) {
      report += `| ${r.referrer} | ${r.count} | ${r.uniques} |\n`
    }
    report += `\n`
  }

  // Issues / warnings
  if (issues.length > 0) {
    report += `## 问题\n\n`
    for (const issue of issues) {
      report += `- ${issue}\n`
    }
    report += `\n`
  }

  // Mobile adaptation relevance
  report += `## 移动端适配决策参考\n\n`
  report += `### 分析\n\n`
  if (data.repo && !data.repo._404 && !data.repo._403) {
    const stars = data.repo.stargazers_count
    const forks = data.repo.forks_count
    const views = data.views?.count ?? 0
    const clones = data.clones?.count ?? 0

    report += `- **Stars**: ${stars} — 项目有一定关注度\n`
    report += `- **Forks**: ${forks} — 有贡献者\n`
    report += `- **总点击量**: ${views} — 公开访问面\n`
    report += `- **总克隆量**: ${ clones} — 开发者/工具访问\n\n`

    // Mobile adaptation priority based on traffic
    if (views > 100) {
      report += `> **结论**: 点击量较高，移动端适配优先级应提升。\n`
      report += `> 公开分享后，移动端访问占比通常 50-70%，适配是必要的。\n`
    } else if (views > 0) {
      report += `> **结论**: 有一定访问量但尚低。移动端适配作为 P1 推进，\n`
      report += `> 因为公开产品必然面临移动端访问，越早修复成本越低。\n`
    } else {
      report += `> **结论**: 暂无流量数据（可能刚发布）。移动端适配作为 P1 推进，\n`
      report += `> 因为公开产品必然面临移动端访问，越早修复成本越低。\n`
    }
  } else {
    report += `> 无法获取流量数据（速率限制或私有仓库），\n`
    report += `> 移动端适配仍建议作为 P1 推进（公开产品必然面临移动端访问）。\n`
  }

  report += `\n---\n`
  report += `> 报告由 \`scripts/repo-traffic.mjs\` 自动生成\n`

  writeFileSync(reportPath, report, 'utf-8')
  console.log(`\nReport written to ${reportPath}`)

  // Also output JSON for machine consumption
  const jsonPath = join(reportDir, `${today}.json`)
  writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`JSON written to ${jsonPath}`)
}

main().catch((err) => {
  console.error('repo-traffic crashed:', err)
  process.exit(1)
})