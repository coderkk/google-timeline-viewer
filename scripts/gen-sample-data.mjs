#!/usr/bin/env node
// Deterministically generate the bundled sample timeline export in the new
// Timeline.json direct-array shape (top-level array of elements each carrying
// a `semanticSegments` array). The itinerary belongs to a fictional person;
// every coordinate is a public landmark or well-known city coordinate. Run
// from the project root:  node scripts/gen-sample-data.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'lib',
  'sample',
  'sample-timeline.json',
)

const MS_PER_DAY = 24 * 60 * 60 * 1000
const START = Date.UTC(2026, 6, 20) // 2026-07-20 (Mon)
const END_DAY = Date.UTC(2026, 8, 11) // through 2026-09-11 (Fri)

// Trip windows keyed by UTC date (always trip-shaped, even on weekdays).
const TRIP = {
  taichung: ['2026-08-07', '2026-08-08', '2026-08-09'],
  sinKl: ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'],
}

/** Small deterministic PRNG (mulberry32) so regeneration is reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = mulberry32(20260913)

// Places are public, well-known coordinates (no private data involved).
const P = {
  // Taipei
  home: { name: 'Home', address: '萬華區成都路 27 巷, 台北市', placeId: 'home-tpe', lat: 25.024, lng: 121.549 },
  work: { name: 'Nexus Co., Ltd.', address: '內湖區瑞光路 333 號, 台北市', placeId: 'work-tpe', lat: 25.051, lng: 121.6168 },
  cafe: { name: 'Bella 咖啡館', address: '大安區忠孝東路四段, 台北市', placeId: 'cafe-tpe', lat: 25.0357, lng: 121.5687 },
  park: { name: '大安森林公園', address: '大安區新生南路二段, 台北市', placeId: 'park-tpe', lat: 25.028, lng: 121.541 },
  market: { name: '南門市場', address: '中正區南昌路一段, 台北市', placeId: 'market-tpe', lat: 25.021, lng: 121.543 },
  // Taoyuan / airport (domestic transit hub)
  taoyuanAirport: { name: '桃園國際機場 T1', address: '桃園市大園區航站南路, 台灣', placeId: 'tpe-airport', lat: 25.0777, lng: 121.229 },
  // Taichung
  family: { name: '家人住所', address: '西屯區臺灣大道三段, 台中市', placeId: 'family-tcg', lat: 24.1479, lng: 120.6737 },
  tcgOldTown: { name: '台中舊城區', address: '中區中山路, 台中市', placeId: 'oldtown-tcg', lat: 24.139, lng: 120.685 },
  // Singapore
  changiAirport: { name: '新加坡樟宜機場 T1', address: 'Airport Blvd, Singapore', placeId: 'sin-airport', lat: 1.3644, lng: 103.9915 },
  marinaBay: { name: '濱海灣金沙酒店', address: '10 Bayfront Ave, Singapore', placeId: 'mbs-sin', lat: 1.284, lng: 103.8607 },
  gardensBay: { name: '濱海灣花園', address: '18 Marina Gardens Dr, Singapore', placeId: 'gb-sin', lat: 1.2816, lng: 103.8636 },
  orchard: { name: '烏節路 ION Orchard', address: '2 Orchard Turn, Singapore', placeId: 'orchard-sin', lat: 1.3036, lng: 103.8317 },
  // Kuala Lumpur
  klHotel: { name: '雙子星塔酒店', address: 'Jalan Ampang, Kuala Lumpur', placeId: 'kl-hotel', lat: 3.1549, lng: 101.7131 },
  petronas: { name: '雙子星塔', address: "Kuala Lumpur City Centre, Malaysia", placeId: 'petronas-kl', lat: 3.1579, lng: 101.7125 },
  klFood: { name: '亞羅街夜市', address: 'Jalan Alor, Kuala Lumpur', placeId: 'kl-food', lat: 3.1463, lng: 101.7095 },
  bukitBintang: { name: '武吉免登購物區', address: 'Bukit Bintang, Kuala Lumpur', placeId: 'bb-kl', lat: 3.1459, lng: 101.711 },
  klia: { name: '吉隆坡國際機場 KLIA1', address: 'Sepang, Selangor, Malaysia', placeId: 'klia', lat: 2.7456, lng: 101.7099 },
}

const toE7 = (v) => Math.round(v * 1e7)
const iso = (ms) => new Date(ms).toISOString()

/** ms for hour/minute (even combining multiple days via the base day ms). */
function at(dayMs, h = 0, m = 0) {
  return dayMs + (h * 60 + m) * 60 * 1000
}

function locationRec(place) {
  return {
    name: place.name,
    address: place.address,
    placeId: place.placeId,
    latitudeE7: toE7(place.lat),
    longitudeE7: toE7(place.lng),
  }
}

/** Interpolated waypoint list with small deterministically-scaled jitter. */
function makeWaypoints(from, to, n, jitterDeg = 0.002) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1)
    const lat = from.lat + (to.lat - from.lat) * t + (rnd() - 0.5) * jitterDeg * 2
    const lng = from.lng + (to.lng - from.lng) * t + (rnd() - 0.5) * jitterDeg * 4
    pts.push({ latitudeE7: toE7(lat), longitudeE7: toE7(lng) })
  }
  return pts
}

/** Sparse great-circle-ish polyline for long-haul flights. */
function makeFlightPath(from, to, n) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1)
    const lat = from.lat + (to.lat - from.lat) * t
    const lng = from.lng + (to.lng - from.lng) * t + Math.sin(i) * 0.5
    pts.push({ latitudeE7: toE7(lat), longitudeE7: toE7(lng) })
  }
  return pts
}

/**
 * Build a sparse hourly `rawSignals` stream for a day by sampling whatever
 * semantic segment covers each hour (visit anchor for stays, a path point for
 * movements). Mirrors the rawSignals arrays found in real direct-array exports.
 */
function makeRawSignals(dayMs, segs) {
  const spans = segs.map((seg) => {
    if (seg.placeVisit) {
      const loc = seg.placeVisit.location
      return {
        startMs: Date.parse(seg.placeVisit.duration.startTimestampMs),
        endMs: Date.parse(seg.placeVisit.duration.endTimestampMs),
        point: { lat: loc.latitudeE7 / 1e7, lng: loc.longitudeE7 / 1e7 },
      }
    }
    const path = seg.waypointPath ? seg.waypointPath.waypoints : seg.transitPath
    const points = path.map((w) => ({ lat: w.latitudeE7 / 1e7, lng: w.longitudeE7 / 1e7 }))
    return {
      startMs: Date.parse(seg.startTime),
      endMs: Date.parse(seg.endTime),
      path: points,
    }
  })
  const signals = []
  for (let h = 8; h <= 22; h += 2) {
    const t = at(dayMs, h)
    let anchor = null
    for (const span of spans) {
      if (t >= span.startMs && t <= span.endMs) {
        anchor = span
        break
      }
    }
    if (!anchor) {
      anchor = spans[spans.length - 1]
    }
    if (anchor.path) {
      const frac = Math.min(1, Math.max(0, (t - anchor.startMs) / Math.max(1, anchor.endMs - anchor.startMs)))
      const i = Math.min(anchor.path.length - 1, Math.floor(frac * anchor.path.length))
      anchor = { point: anchor.path[Math.max(0, i)] }
    }
    signals.push({
      timestampMs: t,
      latitudeE7: toE7(anchor.point.lat),
      longitudeE7: toE7(anchor.point.lng),
      accuracyMeters: 16 + Math.round(rnd() * 24),
    })
  }
  return signals
}

function driveSeg(startMs, endMs, from, to, waypoints, activityType = 'IN_PASSENGER_VEHICLE') {
  return {
    startTime: iso(startMs),
    endTime: iso(endMs),
    activityType,
    startLocation: locationRec(from),
    endLocation: locationRec(to),
    waypointPath: { waypoints },
  }
}

function walkSeg(startMs, endMs, from, to, waypoints) {
  return { ...driveSeg(startMs, endMs, from, to, waypoints, 'WALKING') }
}

function flightSeg(startMs, endMs, from, to) {
  return {
    startTime: iso(startMs),
    endTime: iso(endMs),
    activityType: 'IN_FLIGHT',
    startLocation: locationRec(from),
    endLocation: locationRec(to),
    transitPath: makeFlightPath(from, to, 10),
  }
}

function visitSeg(startMs, endMs, place) {
  return {
    startTime: iso(startMs),
    endTime: iso(endMs),
    placeVisit: {
      location: locationRec(place),
      duration: { startTimestampMs: iso(startMs), endTimestampMs: iso(endMs) },
    },
  }
}

function genWorkday(dayMs) {
  const segs = [
    driveSeg(at(dayMs, 7, 45), at(dayMs, 8, 5), P.home, P.work, makeWaypoints(P.home, P.work, 8)),
    visitSeg(at(dayMs, 8, 5), at(dayMs, 18, 15), P.work),
  ]
  if (rnd() < 0.5) {
    segs.push(
      walkSeg(at(dayMs, 12, 5), at(dayMs, 12, 20), P.work, P.cafe, makeWaypoints(P.work, P.cafe, 6)),
      visitSeg(at(dayMs, 12, 20), at(dayMs, 13, 25), P.cafe),
      walkSeg(at(dayMs, 13, 25), at(dayMs, 13, 40), P.cafe, P.work, makeWaypoints(P.cafe, P.work, 6)),
    )
  }
  segs.push(
    driveSeg(at(dayMs, 18, 15), at(dayMs, 18, 35), P.work, P.home, makeWaypoints(P.work, P.home, 8)),
    visitSeg(at(dayMs, 18, 35), at(dayMs, 22, 30), P.home),
  )
  return segs
}

function genLeisureDay(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 30), at(dayMs, 9, 20), P.home),
    walkSeg(at(dayMs, 9, 20), at(dayMs, 9, 35), P.home, P.park, makeWaypoints(P.home, P.park, 5)),
    visitSeg(at(dayMs, 9, 35), at(dayMs, 11, 5), P.park),
    walkSeg(at(dayMs, 11, 5), at(dayMs, 11, 20), P.park, P.home, makeWaypoints(P.park, P.home, 5)),
    visitSeg(at(dayMs, 11, 20), at(dayMs, 14, 30), P.home),
    walkSeg(at(dayMs, 14, 30), at(dayMs, 14, 45), P.home, P.market, makeWaypoints(P.home, P.market, 5)),
    visitSeg(at(dayMs, 14, 45), at(dayMs, 15, 30), P.market),
    walkSeg(at(dayMs, 15, 30), at(dayMs, 15, 45), P.market, P.home, makeWaypoints(P.market, P.home, 5)),
    visitSeg(at(dayMs, 15, 45), at(dayMs, 18, 40), P.home),
    walkSeg(at(dayMs, 18, 40), at(dayMs, 18, 55), P.home, P.cafe, makeWaypoints(P.home, P.cafe, 5)),
    visitSeg(at(dayMs, 18, 55), at(dayMs, 20, 10), P.cafe),
    walkSeg(at(dayMs, 20, 10), at(dayMs, 20, 25), P.cafe, P.home, makeWaypoints(P.cafe, P.home, 5)),
    visitSeg(at(dayMs, 20, 25), at(dayMs, 23, 50), P.home),
  ]
}

function genTaichungDay1(dayMs) {
  return [
    driveSeg(at(dayMs, 7, 45), at(dayMs, 8, 5), P.home, P.work, makeWaypoints(P.home, P.work, 8)),
    visitSeg(at(dayMs, 8, 5), at(dayMs, 17, 30), P.work),
    driveSeg(at(dayMs, 18, 0), at(dayMs, 19, 15), P.work, P.family, makeWaypoints(P.work, P.family, 30)),
    visitSeg(at(dayMs, 19, 15), at(dayMs, 23, 0), P.family),
  ]
}

function genTaichungDay2(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 0), at(dayMs, 12, 0), P.family),
    walkSeg(at(dayMs, 12, 0), at(dayMs, 12, 20), P.family, P.tcgOldTown, makeWaypoints(P.family, P.tcgOldTown, 6)),
    visitSeg(at(dayMs, 12, 20), at(dayMs, 14, 30), P.tcgOldTown),
    walkSeg(at(dayMs, 14, 30), at(dayMs, 14, 45), P.tcgOldTown, P.family, makeWaypoints(P.tcgOldTown, P.family, 6)),
    visitSeg(at(dayMs, 14, 45), at(dayMs, 22, 30), P.family),
  ]
}

function genTaichungDay3(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 0), at(dayMs, 10, 0), P.family),
    driveSeg(at(dayMs, 10, 0), at(dayMs, 11, 15), P.family, P.home, makeWaypoints(P.family, P.home, 30)),
    visitSeg(at(dayMs, 11, 15), at(dayMs, 23, 0), P.home),
  ]
}

function genTripBDay1(dayMs) {
  return [
    driveSeg(at(dayMs, 6, 10), at(dayMs, 7, 0), P.home, P.taoyuanAirport, makeWaypoints(P.home, P.taoyuanAirport, 14)),
    visitSeg(at(dayMs, 7, 0), at(dayMs, 8, 50), P.taoyuanAirport),
    flightSeg(at(dayMs, 9, 0), at(dayMs, 11, 0), P.taoyuanAirport, P.changiAirport),
    visitSeg(at(dayMs, 11, 0), at(dayMs, 12, 30), P.changiAirport),
    driveSeg(at(dayMs, 12, 30), at(dayMs, 13, 10), P.changiAirport, P.marinaBay, makeWaypoints(P.changiAirport, P.marinaBay, 8)),
    visitSeg(at(dayMs, 13, 10), at(dayMs, 21, 30), P.marinaBay),
  ]
}

function genTripBDay2(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 0), at(dayMs, 9, 20), P.marinaBay),
    walkSeg(at(dayMs, 9, 20), at(dayMs, 9, 35), P.marinaBay, P.gardensBay, makeWaypoints(P.marinaBay, P.gardensBay, 5)),
    visitSeg(at(dayMs, 9, 35), at(dayMs, 12, 0), P.gardensBay),
    walkSeg(at(dayMs, 12, 0), at(dayMs, 12, 15), P.gardensBay, P.marinaBay, makeWaypoints(P.gardensBay, P.marinaBay, 5)),
    visitSeg(at(dayMs, 12, 15), at(dayMs, 13, 30), P.marinaBay),
    walkSeg(at(dayMs, 14, 0), at(dayMs, 14, 30), P.marinaBay, P.orchard, makeWaypoints(P.marinaBay, P.orchard, 6)),
    visitSeg(at(dayMs, 14, 30), at(dayMs, 18, 0), P.orchard),
    walkSeg(at(dayMs, 18, 0), at(dayMs, 18, 30), P.orchard, P.marinaBay, makeWaypoints(P.orchard, P.marinaBay, 6)),
    visitSeg(at(dayMs, 18, 30), at(dayMs, 22, 0), P.marinaBay),
  ]
}

function genTripBDay3(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 0), at(dayMs, 9, 0), P.marinaBay),
    driveSeg(at(dayMs, 9, 15), at(dayMs, 13, 45), P.marinaBay, P.klHotel, makeWaypoints(P.marinaBay, P.klHotel, 55)),
    visitSeg(at(dayMs, 13, 45), at(dayMs, 18, 30), P.klHotel),
    walkSeg(at(dayMs, 18, 30), at(dayMs, 18, 50), P.klHotel, P.petronas, makeWaypoints(P.klHotel, P.petronas, 4)),
    visitSeg(at(dayMs, 18, 50), at(dayMs, 21, 0), P.petronas),
  ]
}

function genTripBDay4(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 0), at(dayMs, 9, 30), P.klHotel),
    walkSeg(at(dayMs, 9, 30), at(dayMs, 9, 50), P.klHotel, P.petronas, makeWaypoints(P.klHotel, P.petronas, 4)),
    visitSeg(at(dayMs, 9, 50), at(dayMs, 12, 0), P.petronas),
    walkSeg(at(dayMs, 12, 0), at(dayMs, 12, 20), P.petronas, P.klFood, makeWaypoints(P.petronas, P.klFood, 4)),
    visitSeg(at(dayMs, 12, 20), at(dayMs, 13, 45), P.klFood),
    walkSeg(at(dayMs, 13, 45), at(dayMs, 15, 0), P.klFood, P.bukitBintang, makeWaypoints(P.klFood, P.bukitBintang, 5)),
    visitSeg(at(dayMs, 15, 0), at(dayMs, 18, 0), P.bukitBintang),
    walkSeg(at(dayMs, 18, 0), at(dayMs, 18, 20), P.bukitBintang, P.klHotel, makeWaypoints(P.bukitBintang, P.klHotel, 4)),
    visitSeg(at(dayMs, 18, 20), at(dayMs, 22, 0), P.klHotel),
  ]
}

function genTripBDay5(dayMs) {
  return [
    visitSeg(at(dayMs, 0, 0), at(dayMs, 10, 0), P.klHotel),
    driveSeg(at(dayMs, 10, 0), at(dayMs, 10, 50), P.klHotel, P.klia, makeWaypoints(P.klHotel, P.klia, 15)),
    visitSeg(at(dayMs, 10, 50), at(dayMs, 13, 30), P.klia),
    flightSeg(at(dayMs, 13, 30), at(dayMs, 17, 45), P.klia, P.taoyuanAirport),
    visitSeg(at(dayMs, 17, 45), at(dayMs, 18, 15), P.taoyuanAirport),
    driveSeg(at(dayMs, 18, 15), at(dayMs, 19, 5), P.taoyuanAirport, P.home, makeWaypoints(P.taoyuanAirport, P.home, 12)),
    visitSeg(at(dayMs, 19, 5), at(dayMs, 22, 30), P.home),
  ]
}

function pickDayGen(dateIso, dow) {
  if (TRIP.taichung.includes(dateIso)) return ['taichung-1', 'taichung-2', 'taichung-3'][TRIP.taichung.indexOf(dateIso)]
  if (TRIP.sinKl.includes(dateIso)) return ['sin-kl-1', 'sin-kl-2', 'sin-kl-3', 'sin-kl-4', 'sin-kl-5'][TRIP.sinKl.indexOf(dateIso)]
  if (dow === 0 || dow === 6) return 'leisure'
  return 'workday'
}

const GENERATORS = {
  'workday': genWorkday,
  'leisure': genLeisureDay,
  'taichung-1': genTaichungDay1,
  'taichung-2': genTaichungDay2,
  'taichung-3': genTaichungDay3,
  'sin-kl-1': genTripBDay1,
  'sin-kl-2': genTripBDay2,
  'sin-kl-3': genTripBDay3,
  'sin-kl-4': genTripBDay4,
  'sin-kl-5': genTripBDay5,
}

const elements = []
let pointCount = 0
let segmentCount = 0
let visitCount = 0
let rawCount = 0
let dayCount = 0

for (let day = START; day <= END_DAY; day += MS_PER_DAY) {
  const date = new Date(day)
  const dateIso = date.toISOString().slice(0, 10)
  const gen = GENERATORS[pickDayGen(dateIso, date.getUTCDay())]
  const segs = gen(day)
  const rawSignals = makeRawSignals(day, segs)
  elements.push({ semanticSegments: segs, rawSignals })
  dayCount += 1
  rawCount += rawSignals.length
  for (const s of segs) {
    if (s.placeVisit) {
      visitCount += 1
    } else {
      segmentCount += 1
      const path = s.waypointPath ? s.waypointPath.waypoints : s.transitPath
      pointCount += path.length
    }
  }
}

mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(elements))

const bytes = Buffer.byteLength(JSON.stringify(elements))
console.log(`sample timeline written: ${OUT_FILE}`)
console.log(
  `days: ${dayCount}, path points: ${pointCount}, rawSignals: ${rawCount}, ` +
    `visits: ${visitCount}, segments: ${segmentCount}, size: ${(bytes / 1024).toFixed(1)} KB`,
)