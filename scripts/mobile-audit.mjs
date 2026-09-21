#!/usr/bin/env node
// mobile-audit.mjs — T47 移动端适配盘查
// 在 390px 视口遍历所有路由，记录断点行为：
//   A. overflowX
//   B. 布局错位（page 几何 / 居中 / 容器语义）
//   C. 字体大小（关键文本的 font-size）
//   D. 按钮点击区域（tappable 元素 min-height / min-width）
//   E. 侧栏/抽屉行为（trips-side / visit-history-panel）
//   F. 地图容器行为（map 尺寸 / 溢出）
//
// 预设 A17 绝对锚点纪律：所有断言含「与视口/祖先的绝对关系」
// （如 width == vw、块横跨满宽），不得只用同族互等。
//
// 输出：结构化报告写入 docs/records/mobile-audit/YYYY-MM-DD.md
//
// Usage:
//   node scripts/mobile-audit.mjs [--base <url>]
//
// Requires scripts/node_modules (playwright) and a production build.
// Exit: 0 all collected / 1 assertion / 2 runtime.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../src/', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../src/node_modules/vite/bin/vite.js', import.meta.url))

// ── Routes to audit ─────────────────────────────────────────────────────────
const ROUTES = [
  { name: 'Landing', route: '/', pageClass: '.page-landing' },
  { name: 'Trips (empty)', route: '/#/app', pageClass: '.empty-state' },
  { name: 'Places (empty)', route: '/#/app/places', pageClass: '.leaflet-container' },
  { name: 'Merge', route: '/#/app/merge', pageClass: '.merge-page' },
  { name: 'Help', route: '/#/help', pageClass: '.page-help' },
  { name: 'Settings', route: '/#/settings', pageClass: '.settings-page' },
]

// ── CLI ─────────────────────────────────────────────────────────────────────
const USAGE = `Usage: node scripts/mobile-audit.mjs [--base <url>]
  --base <url>   app origin to audit (default: local preview)`

let BASE = null
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--base' || process.argv[i].startsWith('--base=')) {
    BASE = process.argv[i].replace('--base=', '') || process.argv[i + 1]
  }
}
if (!BASE) {
  // Auto-start local preview
  BASE = null // will be set by startPreview
}

// ── Server ──────────────────────────────────────────────────────────────────
function startPreview() {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [VITE_BIN, 'preview', '--port', '0', '--host', '127.0.0.1'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    )
    let out = ''
    const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '')
    const parse = () => stripAnsi(out).match(/Local:\s+(http:\/\/[^\s]+)/)
    const onData = (d) => {
      out += d.toString()
      const m = parse()
      if (m) {
        cleanup()
        resolve({ proc, base: m[1].replace(/\/+$/, '') })
      }
    }
    const onExit = () => {
      cleanup()
      const m = parse()
      if (m) resolve({ proc, base: m[1].replace(/\/+$/, '') })
      else reject(new Error(`vite preview exited (exit=${proc.exitCode})`))
    }
    const timer = setTimeout(async () => {
      cleanup()
      await killProcessTree(proc.pid)
      reject(new Error(`timed out waiting for vite preview`))
    }, 15000)
    function cleanup() {
      clearTimeout(timer)
      proc.stdout?.off('data', onData)
      proc.stderr?.off('data', onData)
      proc.off('exit', onExit)
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', onExit)
  })
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

function killProcessTree(pid) {
  if (typeof pid !== 'number') return Promise.resolve()
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true, stdio: 'ignore',
      })
      tk.on('error', resolve)
      tk.on('exit', resolve)
    })
  }
  try { process.kill(-pid, 'SIGKILL') } catch {}
  return Promise.resolve()
}

async function stopPreview(server) {
  if (!server?.proc?.pid) return
  const pid = server.proc.pid
  if (process.platform !== 'win32') {
    try { process.kill(-pid, 'SIGTERM') } catch {}
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100))
      try { process.kill(-pid, 0) } catch { return }
    }
    try { process.kill(-pid, 'SIGKILL') } catch {}
    return
  }
  if (!isAlive(pid)) return
  await killProcessTree(pid)
  try { process.kill(pid, 'SIGKILL') } catch {}
}

async function waitReady(base) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      const res = await fetch(base)
      if (res.ok) return
    } catch {}
  }
  throw new Error(`preview server not ready at ${base}`)
}

// ── Measurement helpers ─────────────────────────────────────────────────────
// Each check returns { pass: bool, value: string, severity: 'P1'|'P2'|'P3'|'info' }

async function auditRoute(page, route, pageClass, viewport) {
  const findings = []
  const tag = `390 ${route}`

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForSelector(pageClass, { timeout: 10000 }).catch(() => {})

    // A. overflowX
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    findings.push({
      category: 'overflowX',
      tag,
      value: `${overflowX}px`,
      pass: overflowX === 0,
      severity: overflowX > 0 ? 'P1' : 'info',
    })

    // B. Layout geometry — page box relative to viewport
    const geo = await page.evaluate(() => {
      const page = document.querySelector('.page, .page-help, .settings-page, .merge-page, .page-landing')
      if (!page) return null
      const r = page.getBoundingClientRect()
      const main = document.querySelector('main')
      const mainR = main ? main.getBoundingClientRect() : null
      const footer = document.querySelector('footer')
      const header = document.querySelector('.site-header')
      const headerR = header ? header.getBoundingClientRect() : null
      return {
        pageLeft: Math.round(r.left),
        pageTop: Math.round(r.top),
        pageWidth: Math.round(r.width),
        mainClass: main?.className ?? null,
        hasFooter: footer !== null,
        headerHeight: headerR ? Math.round(headerR.height) : null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        // A17: absolute anchor — page left relative to main padding
        mainPaddingLeft: mainR ? Math.round(mainR.left) : null,
        // Is page spanning full viewport width?
        pageFullWidth: Math.round(r.width) >= Math.round(window.innerWidth) - 2,
      }
    })

    if (geo) {
      // B1. Page centered? (|center - vpCenter| <= 1)
      const pageCenter = geo.pageLeft + geo.pageWidth / 2
      const vpCenter = geo.viewportWidth / 2
      const centerOffset = Math.abs(pageCenter - vpCenter)
      findings.push({
        category: 'pageCenter',
        tag,
        value: `${geo.pageLeft} + ${geo.pageWidth}/2 = ${pageCenter}px, vpCenter=${vpCenter}px, offset=${centerOffset}px`,
        pass: centerOffset <= 1,
        severity: centerOffset > 1 ? 'P1' : 'info',
      })

      // B2. Page width vs viewport width (A17 absolute anchor)
      findings.push({
        category: 'pageWidth',
        tag,
        value: `page ${geo.pageWidth}px vs viewport ${geo.viewportWidth}px`,
        pass: geo.pageWidth <= geo.viewportWidth + 2,
        severity: geo.pageWidth > geo.viewportWidth + 2 ? 'P1' : 'info',
      })

      // B3. Shell: map pages should NOT have footer; content pages SHOULD
      const isMapPage = route === '/#/app' || route === '/#/app/places'
      const hasFooter = geo.hasFooter
      findings.push({
        category: 'footerSemantic',
        tag,
        value: `${isMapPage ? 'map' : 'content'} page, hasFooter=${hasFooter}`,
        pass: isMapPage ? !hasFooter : hasFooter,
        severity: (isMapPage ? hasFooter : !hasFooter) ? 'P1' : 'info',
      })

      // B4. Main container class
      findings.push({
        category: 'mainClass',
        tag,
        value: geo.mainClass,
        pass: true,
        severity: 'info',
      })

      // B5. Header height (sticky header should be visible)
      findings.push({
        category: 'headerHeight',
        tag,
        value: `${geo.headerHeight}px`,
        pass: geo.headerHeight > 0,
        severity: !geo.headerHeight ? 'P1' : 'info',
      })

      // B6. Page top offset (should be below header)
      if (geo.headerHeight !== null && !isMapPage) {
        const expectedMinTop = geo.headerHeight
        findings.push({
          category: 'pageTopBelowHeader',
          tag,
          value: `pageTop=${geo.pageTop}px, headerH=${geo.headerHeight}px`,
          pass: geo.pageTop >= expectedMinTop - 5,
          severity: geo.pageTop < expectedMinTop - 5 ? 'P2' : 'info',
        })
      }
    }

    // C. Font sizes — key text elements
    const fontSizes = await page.evaluate(() => {
      const targets = [
        { sel: '.site-brand', label: 'brand' },
        { sel: '.site-nav-link', label: 'nav-link' },
        { sel: '.page-landing h1, .page h1', label: 'page-h1' },
        { sel: '.page h2, .page-help h2, .settings-page h2', label: 'page-h2' },
        { sel: '.trips-title', label: 'trips-title' },
        { sel: '.trips-summary', label: 'trips-summary' },
        { sel: '.trips-mode-btn', label: 'mode-btn' },
        { sel: '.drp-trigger', label: 'drp-trigger' },
        { sel: '.drp-day', label: 'calendar-day' },
        { sel: '.timeline-item', label: 'timeline-item' },
        { sel: '.stop-item', label: 'stop-item' },
        { sel: '.chain-stay', label: 'chain-stay' },
        { sel: '.chain-move', label: 'chain-move' },
        { sel: '.places-radius', label: 'radius-btn' },
        { sel: '.btn', label: 'btn' },
        { sel: '.feature-card h3', label: 'feature-card-title' },
        { sel: '.feature-card p', label: 'feature-card-text' },
        { sel: '.help-section h2', label: 'help-h2' },
        { sel: '.faq-q', label: 'faq-question' },
        { sel: '.settings-section h2', label: 'settings-h2' },
      ]
      return targets
        .map(({ sel, label }) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const cs = getComputedStyle(el)
          return { label, fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight }
        })
        .filter(Boolean)
    })
    for (const fs of fontSizes || []) {
      const tooSmall = fs.fontSize < 10
      findings.push({
        category: 'fontSize',
        tag,
        value: `${fs.label}: ${fs.fontSize}px (fw=${fs.fontWeight})`,
        pass: !tooSmall,
        severity: tooSmall ? 'P2' : 'info',
      })
    }

    // D. Touch target sizes (min-height / min-width on tappable elements)
    const touchTargets = await page.evaluate(() => {
      const targets = [
        { sel: '.site-nav-link', label: 'nav-link' },
        { sel: '.drp-trigger', label: 'drp-trigger' },
        { sel: '.drp-preset', label: 'drp-preset' },
        { sel: '.drp-day', label: 'calendar-day' },
        { sel: '.drp-cal-nav', label: 'cal-nav' },
        { sel: '.places-radius', label: 'radius-btn' },
        { sel: '.chain-stay', label: 'chain-stay' },
        { sel: '.chain-move', label: 'chain-move' },
        { sel: '.stop-item', label: 'stop-item' },
        { sel: '.timeline-item', label: 'timeline-item' },
        { sel: '.export-radio', label: 'export-radio' },
        { sel: '.btn', label: 'btn-primary' },
        { sel: '.theme-btn', label: 'theme-btn' },
        { sel: '.data-bar-btn', label: 'data-bar-btn' },
        { sel: '.trips-toggle', label: 'trips-toggle' },
        { sel: '.trips-mode-btn', label: 'mode-btn' },
      ]
      return targets
        .map(({ sel, label }) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return {
            label,
            height: Math.round(r.height),
            width: Math.round(r.width),
            minHeight: parseFloat(cs.minHeight) || 0,
            padding: cs.padding,
          }
        })
        .filter(Boolean)
    })
    for (const tt of touchTargets || []) {
      const tooSmall = tt.height < 44 && tt.minHeight < 44
      findings.push({
        category: 'touchTarget',
        tag,
        value: `${tt.label}: h=${tt.height}px w=${tt.width}px minH=${tt.minHeight}px pad=${tt.padding}`,
        pass: !tooSmall,
        severity: tooSmall ? 'P1' : 'info',
      })
    }

    // E. Sidebar/drawer behavior (Trips/Places)
    if (route === '/#/app' || route === '/#/app/places') {
      const sidePanel = await page.evaluate(() => {
        const side = document.querySelector('.trips-side')
        if (!side) return null
        const r = side.getBoundingClientRect()
        const cs = getComputedStyle(side)
        return {
          exists: true,
          width: Math.round(r.width),
          height: Math.round(r.height),
          position: cs.position,
          maxHeight: cs.maxHeight,
          overflow: cs.overflow,
          zIndex: cs.zIndex,
          borderRadius: cs.borderRadius,
        }
      })
      if (sidePanel) {
        findings.push({
          category: 'sidePanel',
          tag,
          value: `w=${sidePanel.width} h=${sidePanel.height} pos=${sidePanel.position} maxH=${sidePanel.maxHeight} z=${sidePanel.zIndex}`,
          pass: true,
          severity: 'info',
        })
        // A17: side panel should NOT exceed viewport width
        findings.push({
          category: 'sidePanelWidth',
          tag,
          value: `${sidePanel.width}px <= viewport 390px`,
          pass: sidePanel.width <= 392,
          severity: sidePanel.width > 392 ? 'P1' : 'info',
        })
      }
    }

    // F. Map container behavior
    if (route === '/#/app' || route === '/#/app/places') {
      const mapWrap = await page.evaluate(() => {
        const wrap = document.querySelector('.trips-map-wrap, .places-map-wrap')
        if (!wrap) return null
        const r = wrap.getBoundingClientRect()
        const cs = getComputedStyle(wrap)
        return {
          width: Math.round(r.width),
          height: Math.round(r.height),
          minWidth: cs.minWidth,
          flex: cs.flex,
          position: cs.position,
        }
      })
      if (mapWrap) {
        findings.push({
          category: 'mapWrap',
          tag,
          value: `w=${mapWrap.width} h=${mapWrap.height} minW=${mapWrap.minWidth} flex=${mapWrap.flex}`,
          pass: true,
          severity: 'info',
        })
        // A17: map should fill remaining viewport height (after header)
        const headerH = 56 // --header-height
        const expectedMinH = 390 - headerH - 50 // minus some margin
        findings.push({
          category: 'mapHeight',
          tag,
          value: `${mapWrap.height}px >= expected ~${expectedMinH}px`,
          pass: mapWrap.height >= expectedMinH - 10,
          severity: mapWrap.height < expectedMinH - 10 ? 'P2' : 'info',
        })
      }
    }

    // G. Popover / dropdown behavior
    if (route === '/#/app' || route === '/#/app/places') {
      // Check if the date range picker popover would fit
      const popoverCheck = await page.evaluate(() => {
        const trigger = document.querySelector('.drp-trigger')
        if (!trigger) return null
        const r = trigger.getBoundingClientRect()
        const remainingBottom = window.innerHeight - r.bottom
        return {
          triggerBottom: Math.round(r.bottom),
          remainingBottom,
          triggerTop: Math.round(r.top),
        }
      })
      if (popoverCheck) {
        findings.push({
          category: 'popoverSpace',
          tag,
          value: `trigger bottom=${popoverCheck.triggerBottom}px, remaining=${popoverCheck.remainingBottom}px`,
          pass: true,
          severity: 'info',
        })
      }
    }

    // H. Visit history panel (Places)
    if (route === '/#/app/places') {
      const panel = await page.evaluate(() => {
        const p = document.querySelector('.visit-history-panel')
        if (!p) return null
        const r = p.getBoundingClientRect()
        const cs = getComputedStyle(p)
        return {
          exists: true,
          width: Math.round(r.width),
          height: Math.round(r.height),
          position: cs.position,
          right: cs.right,
          bottom: cs.bottom,
          maxWidth: cs.maxWidth,
          maxHeight: cs.maxHeight,
        }
      })
      if (panel) {
        findings.push({
          category: 'visitHistoryPanel',
          tag,
          value: `w=${panel.width} h=${panel.height} pos=${panel.position} maxW=${panel.maxWidth} maxH=${panel.maxHeight}`,
          pass: true,
          severity: 'info',
        })
        // A17: panel should not exceed viewport
        findings.push({
          category: 'visitHistoryPanelViewport',
          tag,
          value: `${panel.width}px <= 390px viewport`,
          pass: panel.width <= 392,
          severity: panel.width > 392 ? 'P1' : 'info',
        })
      }
    }

    // I. Landing page specific
    if (route === '/') {
      const features = await page.evaluate(() => {
        const cards = document.querySelectorAll('.feature-card')
        const grid = document.querySelector('.feature-cards')
        if (!grid) return null
        const cs = getComputedStyle(grid)
        return {
          cardCount: cards.length,
          gridColumns: cs.gridTemplateColumns,
        }
      })
      if (features) {
        findings.push({
          category: 'featureCards',
          tag,
          value: `${features.cardCount} cards, grid=${features.gridColumns}`,
          pass: features.cardCount === 4,
          severity: features.cardCount !== 4 ? 'P1' : 'info',
        })
      }
    }

  } catch (err) {
    findings.push({
      category: 'error',
      tag,
      value: String(err?.message ?? err).split('\n')[0],
      pass: false,
      severity: 'P1',
    })
  }

  return findings
}

// ── Main ────────────────────────────────────────────────────────────────────
let browser
let server = null
let exitCode = 2
const allFindings = []

try {
  console.log('MOBILE-AUDIT v1.0 — T47')

  // Start local preview if no --base given
  if (!BASE) {
    console.log('Starting local preview...')
    server = await startPreview()
    BASE = server.base
    await waitReady(BASE)
    console.log(`Preview ready at ${BASE}`)
  }

  browser = await chromium.launch({ headless: true })
  const viewport = { width: 390, height: 844 }

  for (const routeDef of ROUTES) {
    console.log(`\n--- Auditing ${routeDef.name} (${routeDef.route}) ---`)
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)

    const findings = await auditRoute(page, routeDef.route, routeDef.pageClass, viewport)
    allFindings.push(...findings)

    // Print summary
    const p1 = findings.filter((f) => f.severity === 'P1' && !f.pass)
    const p2 = findings.filter((f) => f.severity === 'P2' && !f.pass)
    if (p1.length > 0) {
      console.log(`  ** P1 issues: ${p1.length} **`)
      for (const f of p1) console.log(`    [P1] ${f.category}: ${f.value}`)
    }
    if (p2.length > 0) {
      console.log(`  ** P2 issues: ${p2.length} **`)
      for (const f of p2) console.log(`    [P2] ${f.category}: ${f.value}`)
    }
    const info = findings.filter((f) => f.severity === 'info')
    for (const f of info) {
      console.log(`    [${f.pass ? 'OK' : 'FAIL'}] ${f.category}: ${f.value}`)
    }

    await context.close().catch(() => {})
  }

  exitCode = 0

} catch (err) {
  console.error('mobile-audit crashed:', err)
  exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server) await stopPreview(server)
}

// ── Write report ────────────────────────────────────────────────────────────
const reportDir = join(fileURLToPath(new URL('../docs/records/', import.meta.url)), 'mobile-audit')
mkdirSync(reportDir, { recursive: true })

const today = new Date().toISOString().slice(0, 10)
const reportPath = join(reportDir, `${today}.md`)

// Aggregate findings by category
const byCategory = {}
for (const f of allFindings) {
  if (!byCategory[f.category]) byCategory[f.category] = []
  byCategory[f.category].push(f)
}

// Count by severity
const p1Count = allFindings.filter((f) => f.severity === 'P1' && !f.pass).length
const p2Count = allFindings.filter((f) => f.severity === 'P2' && !f.pass).length
const p3Count = allFindings.filter((f) => f.severity === 'P3' && !f.pass).length
const infoCount = allFindings.filter((f) => f.severity === 'info').length
const totalIssues = p1Count + p2Count + p3Count

let report = `# Mobile Adaptation Audit Report\n\n`
report += `> T47 — 移动端适配立项盘查\n`
report += `> 视口: 390×844 (mobile)\n`
report += `> 日期: ${today}\n`
report += `> 基准: PRD v1.24 / TASKS T47\n\n`

report += `## 摘要\n\n`
report += `- **P1 问题**: ${p1Count}（阻塞级：overflowX、布局错位、点击区域过小、容器语义错误）\n`
report += `- **P2 问题**: ${p2Count}（重要级：字体过小、页面偏移）\n`
report += `- **P3 问题**: ${p3Count}（建议级）\n`
report += `- **信息项**: ${infoCount}（正常行为记录）\n`
report += `- **总测量点**: ${allFindings.length}\n\n`

report += `## 按路由汇总\n\n`
for (const routeDef of ROUTES) {
  const routeFindings = allFindings.filter((f) => f.tag.includes(routeDef.route))
  const routeP1 = routeFindings.filter((f) => f.severity === 'P1' && !f.pass).length
  const routeP2 = routeFindings.filter((f) => f.severity === 'P2' && !f.pass).length
  report += `### ${routeDef.name} (${routeDef.route})\n\n`
  report += `- P1: ${routeP1} | P2: ${routeP2} | 总测量: ${routeFindings.length}\n\n`
}

report += `## 详细发现（按类别）\n\n`
for (const [cat, findings] of Object.entries(byCategory)) {
  const issues = findings.filter((f) => !f.pass && f.severity !== 'info')
  if (issues.length === 0) continue

  report += `### ${cat}\n\n`
  for (const f of issues) {
    report += `- [${f.severity}] ${f.tag}: ${f.value}\n`
  }
  report += `\n`
}

report += `## 断点行为清单\n\n`
report += `| 类别 | 断点 | 行为 | 影响路由 |\n`
report += `|------|------|------|----------|\n`

// Build behavior summary
const behaviors = []
for (const f of allFindings) {
  if (f.category === 'overflowX') {
    const val = parseInt(f.value)
    if (val > 0) {
      behaviors.push({
        category: 'overflowX',
        breakpoint: '390px',
        behavior: `水平溢出 ${val}px`,
        routes: f.tag,
      })
    }
  } else if (f.category === 'touchTarget') {
    const val = f.value
    if (val.includes('h=<44')) {
      behaviors.push({
        category: 'touchTarget',
        breakpoint: '390px',
        behavior: `点击区域 <44px: ${val}`,
        routes: f.tag,
      })
    }
  } else if (f.category === 'pageCenter') {
    const val = f.value
    if (val.includes('offset=')) {
      const offset = val.match(/offset=(\d+)px/)
      if (offset && parseInt(offset[1]) > 1) {
        behaviors.push({
          category: 'pageCenter',
          breakpoint: '390px',
          behavior: `页面偏移 ${offset[1]}px`,
          routes: f.tag,
        })
      }
    }
  }
}

for (const b of behaviors) {
  report += `| ${b.category} | ${b.breakpoint} | ${b.behavior} | ${b.routes} |\n`
}

if (behaviors.length === 0) {
  report += `| — | — | 无已知断点行为问题（见详细发现） | — |\n`
}

report += `\n---\n`
report += `> 报告由 \`scripts/mobile-audit.mjs\` 自动生成\n`
report += `> A17 绝对锚点纪律：所有断言含与视口/祖先的绝对关系\n`

writeFileSync(reportPath, report, 'utf-8')
console.log(`\nReport written to ${reportPath}`)

process.exit(exitCode)