// Best-effort English rendering of parser warnings.
//
// The Web Worker emits human-readable warning strings (mostly Chinese) from
// many parse sites. Rather than thread a language through the worker, the only
// place a warning is ever surfaced (the empty-data import error) localizes it
// here by matching the known templates. Unknown templates fall through
// unchanged — diagnostics only.
import type { Lang } from './index'

type Rule = { re: RegExp; en: (m: RegExpMatchArray) => string }

/** 万 (10k) → millions, e.g. 200万 → 2. */
function wanToMillions(wan: string): string {
  const millions = Number(wan) / 100
  return Number.isInteger(millions) ? String(millions) : millions.toFixed(2).replace(/\.?0+$/, '')
}

const RULES: Rule[] = [
  { re: /^(.+): raw points 超过 ([\d.]+) 万，已截断$/, en: (m) => `${m[1]}: raw points exceeded ${wanToMillions(m[2])}M, truncated` },
  { re: /^累计 raw points 超过 ([\d.]+) 万，已截断$/, en: (m) => `Cumulative raw points exceeded ${wanToMillions(m[1])}M, truncated` },
  { re: /^(.+): 缺少坐标字段$/, en: (m) => `${m[1]}: missing coordinate fields` },
  { re: /^(.+): 缺少时间戳$/, en: (m) => `${m[1]}: missing timestamp` },
  { re: /^(.+): placeVisit 结构无效$/, en: (m) => `${m[1]}: invalid placeVisit structure` },
  { re: /^(.+): placeVisit 缺少坐标或时间范围$/, en: (m) => `${m[1]}: placeVisit missing coordinates or time range` },
  { re: /^(.+): 行程段结构无效$/, en: (m) => `${m[1]}: invalid activity segment structure` },
  { re: /^(.+): 行程段缺少起终点坐标$/, en: (m) => `${m[1]}: activity segment missing start/end coordinates` },
  { re: /^(.+): 行程段缺少时间范围$/, en: (m) => `${m[1]}: activity segment missing time range` },
  { re: /^(.+): 语义段结构无效$/, en: (m) => `${m[1]}: invalid semantic segment structure` },
  { re: /^(.+): 无法识别的语义段$/, en: (m) => `${m[1]}: unrecognized semantic segment` },
  { re: /^(.+): Location History\.json 顶层应为对象$/, en: (m) => `${m[1]}: Location History.json top level should be an object` },
  { re: /^(.+): 缺少 locations 数组$/, en: (m) => `${m[1]}: missing locations array` },
  { re: /^(.+): Records\.json 顶层应为对象$/, en: (m) => `${m[1]}: Records.json top level should be an object` },
  { re: /^(.+): savedPlaces 无时间戳，已忽略 (\d+) 处$/, en: (m) => `${m[1]}: savedPlaces has no timestamp; ignored ${m[2]} place(s)` },
  { re: /^(.+): Semantic Location History 顶层应为对象$/, en: (m) => `${m[1]}: Semantic Location History top level should be an object` },
  { re: /^(.+): 缺少 timelineObjects 数组$/, en: (m) => `${m[1]}: missing timelineObjects array` },
  { re: /^(.+): 顶层应为数组或对象$/, en: (m) => `${m[1]}: top level should be an array or object` },
  { re: /^(.+): 顶层对象缺少 semanticSegments 数组$/, en: (m) => `${m[1]}: top-level object missing semanticSegments array` },
  { re: /^(.+): 数据为空或不可识别$/, en: (m) => `${m[1]}: data is empty or unrecognizable` },
  { re: /^(.+): 无法识别的导出格式$/, en: (m) => `${m[1]}: unrecognized export format` },
  { re: /^(.+): "(.+)" 不是有效的 JSON（(.+)）$/, en: (m) => `${m[1]}: "${m[2]}" is not valid JSON (${m[3]})` },
]

export function localizeWarning(lang: Lang, warning: string): string {
  if (lang === 'zh') return warning
  // Context prefixes embed Chinese (e.g. `条目[3]`); normalize them first so
  // the English output carries no residual CJK.
  const normalized = warning.replace(/ ?条目\[/g, ' entry[')
  for (const rule of RULES) {
    const match = normalized.match(rule.re)
    if (match) return rule.en(match)
  }
  return normalized
}
