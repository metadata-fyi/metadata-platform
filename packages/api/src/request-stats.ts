/**
 * Lightweight request metrics for the public stats page.
 * Split into platform (API traffic) vs users (wallets / credits).
 * In-memory counters for the current hour; rollups flushed to DATA_DIR/stats.json
 * about once per hour so disk I/O stays cheap.
 *
 * Wallet addresses are never persisted — only unique counts for the hour.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getLedgerPublicStats } from './ledger.js'

export type HourBucket = {
  /** UTC hour key: YYYY-MM-DDTHH */
  hour: string
  /** Platform */
  total: number
  byStatus: Record<string, number>
  byPath: Record<string, number>
  byVertical: Record<string, number>
  byMethod: Record<string, number>
  /** Bounded response-duration histogram; never includes request identities. */
  responseMsBuckets: Record<string, number>
  /** Users / identity on requests */
  paid: number
  unpaid: number
  withWallet: number
  withoutWallet: number
  /** Unique wallets seen this hour (count only; set is memory-only) */
  uniqueWallets: number
  uniquePaidWallets: number
}

type StatsFile = {
  version: 1
  /** Oldest → newest hour keys retained (max KEEP_HOURS) */
  hours: Record<string, HourBucket>
  updatedAt: string
}

const KEEP_HOURS = 168 // 7 days
const FLUSH_MS = 60 * 60 * 1000 // at most once per hour (also on hour rollover)
const MAX_METRIC_KEYS = 512

let current: HourBucket = emptyHour(hourKey(Date.now()))
/** Memory-only uniqueness for the in-progress hour — never written to disk */
let walletSet = new Set<string>()
let paidWalletSet = new Set<string>()
let lastFlushAt = 0
let loaded = false
let disk: StatsFile = { version: 1, hours: {}, updatedAt: new Date().toISOString() }

function dataDir() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
}

function statsPath() {
  return path.join(dataDir(), 'stats.json')
}

export function hourKey(ts = Date.now()): string {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}`
}

function emptyHour(hour: string): HourBucket {
  return {
    hour,
    total: 0,
    byStatus: {},
    byPath: {},
    byVertical: {},
    byMethod: {},
    responseMsBuckets: {},
    paid: 0,
    unpaid: 0,
    withWallet: 0,
    withoutWallet: 0,
    uniqueWallets: 0,
    uniquePaidWallets: 0,
  }
}

/** Coerce older on-disk buckets missing newer fields. */
function normalizeBucket(raw: Partial<HourBucket> & { hour?: string }, hour: string): HourBucket {
  const base = emptyHour(hour)
  return {
    ...base,
    ...raw,
    hour: raw.hour || hour,
    total: Number(raw.total) || 0,
    paid: Number(raw.paid) || 0,
    unpaid: Number(raw.unpaid) || 0,
    withWallet: Number(raw.withWallet) || 0,
    withoutWallet: Number(raw.withoutWallet) || 0,
    uniqueWallets: Number(raw.uniqueWallets) || 0,
    uniquePaidWallets: Number(raw.uniquePaidWallets) || 0,
    byStatus: raw.byStatus && typeof raw.byStatus === 'object' ? raw.byStatus : {},
    byPath: raw.byPath && typeof raw.byPath === 'object' ? raw.byPath : {},
    byVertical: raw.byVertical && typeof raw.byVertical === 'object' ? raw.byVertical : {},
    byMethod: raw.byMethod && typeof raw.byMethod === 'object' ? raw.byMethod : {},
    responseMsBuckets:
      raw.responseMsBuckets && typeof raw.responseMsBuckets === 'object'
        ? raw.responseMsBuckets
        : {},
  }
}

function ensureLoaded() {
  if (loaded) return
  loaded = true
  try {
    const p = statsPath()
    if (!fs.existsSync(p)) return
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as StatsFile
    if (j?.version === 1 && j.hours && typeof j.hours === 'object') {
      const hours: Record<string, HourBucket> = {}
      for (const [k, v] of Object.entries(j.hours)) {
        hours[k] = normalizeBucket(v as Partial<HourBucket>, k)
      }
      disk = { version: 1, hours, updatedAt: j.updatedAt || new Date().toISOString() }
      const key = hourKey()
      if (disk.hours[key]) {
        // Resume counts; uniqueness set is empty after restart (counts climb from here)
        current = structuredClone(disk.hours[key])
        walletSet = new Set()
        paidWalletSet = new Set()
      }
    }
  } catch (e) {
    console.warn('[metadata] stats load failed', e)
  }
}

function bump(map: Record<string, number>, key: string, n = 1) {
  const boundedKey =
    map[key] !== undefined || Object.keys(map).length < MAX_METRIC_KEYS
      ? key
      : '__other__'
  map[boundedKey] = (map[boundedKey] ?? 0) + n
}

/** Fixed route words — never collapse to :id. Includes verticals + common host aliases. */
const KNOWN_SEGMENTS = new Set([
  'v1',
  'api',
  'health',
  'search',
  'verticals',
  'series',
  'characters',
  'products',
  'brands',
  'providers',
  'print-methods',
  'affiliates',
  'pay',
  'preview',
  // verticals
  'anime',
  'game',
  'manga',
  'lightnovels',
  'tcg',
  'figures',
  'modelkits',
  'plush',
  'boardgames',
  'cartoons',
  'ost',
  'consoles',
  'esports',
  'comics',
  'pod',
  'fashion',
  'sneakers',
  'brands',
  'silhouettes',
  'models',
  'lines',
  // host / query aliases (clients sometimes put these in path)
  'ln',
  'kicks',
  'footwear',
  'streetwear',
  'watches',
  'blanks',
  'cards',
  'nendoroid',
  'gunpla',
  'fumo',
  'bgg',
  'tabletop',
  'soundtrack',
  'soundtracks',
  'platforms',
  'export',
  'contribute',
  'feedback',
  'report',
  'stats',
  'games',
  'sets',
  'items',
  'makers',
  'lines',
  'albums',
  'artists',
  'titles',
  'leagues',
  'teams',
  'players',
  'manufacturers',
  'publishers',
  'packs',
  'claim',
  'balance',
  'methods',
  'stripe',
  'checkout',
  'webhook',
  'sync',
  'quote',
  'account',
  'colors',
  'SKILL.md',
  'llms.txt',
  'llms-full.txt',
  'openapi.json',
  '.well-known',
  'ai-plugin.json',
])

const STATIC_PREFIXES = [
  'assets',
  'brand',
  'favicon',
  'icons',
  'static',
  'docs.html',
  'pricing.html',
  'stats.html',
  'settings.html',
  'legal.html',
  'feedback.html',
  'index.html',
]

/**
 * Whether this path is worth recording on the public stats Paths table.
 * Drops SPA assets, bots, and random probes that previously flooded as `/:id`.
 */
export function shouldRecordPath(pathname: string): boolean {
  const raw = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  if (raw === '/') return true
  const segs = raw.split('/').filter(Boolean)
  if (segs.length === 0) return true
  const first = segs[0].toLowerCase()
  if (STATIC_PREFIXES.some((p) => first === p || first.startsWith(p))) return false
  if (/\.(js|css|map|png|jpe?g|webp|gif|ico|svg|woff2?|ttf|txt|html)$/i.test(first)) {
    return false
  }
  // API + agent discovery only
  if (
    first === 'v1' ||
    first === 'api' ||
    first === 'feedback' ||
    first === 'report' ||
    first === 'SKILL.md' ||
    first === 'llms.txt' ||
    first === 'llms-full.txt' ||
    first === 'openapi.json' ||
    first === '.well-known'
  ) {
    return true
  }
  return false
}

/**
 * Collapse entity ids so the path map stays small and readable.
 * Keeps vertical names and route words (e.g. /v1/anime/series/:id).
 */
export function normalizePath(pathname: string): string {
  const raw = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  const segs = raw.split('/').filter(Boolean)
  if (segs.length === 0) return '/'

  const out: string[] = []
  for (const s of segs) {
    const lower = s.toLowerCase()
    if (KNOWN_SEGMENTS.has(lower)) {
      out.push(lower)
      continue
    }
    out.push(':id')
  }

  const capped = out.slice(0, 6)
  return '/' + capped.join('/')
}

function syncUniqueCounts() {
  current.uniqueWallets = walletSet.size
  current.uniquePaidWallets = paidWalletSet.size
}

function rollHourIfNeeded(now: number) {
  const key = hourKey(now)
  if (current.hour === key) return
  ensureLoaded()
  syncUniqueCounts()
  disk.hours[current.hour] = structuredClone(current)
  pruneHours()
  current = emptyHour(key)
  walletSet = new Set()
  paidWalletSet = new Set()
  flushToDisk(true)
}

function pruneHours() {
  const keys = Object.keys(disk.hours).sort()
  while (keys.length > KEEP_HOURS) {
    const drop = keys.shift()
    if (drop) delete disk.hours[drop]
  }
}

function flushToDisk(force = false) {
  const now = Date.now()
  if (!force && now - lastFlushAt < FLUSH_MS) return
  ensureLoaded()
  syncUniqueCounts()
  disk.hours[current.hour] = structuredClone(current)
  pruneHours()
  disk.updatedAt = new Date().toISOString()
  try {
    const dir = dataDir()
    fs.mkdirSync(dir, { recursive: true })
    const p = statsPath()
    const tmp = `${p}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(disk, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, p)
    lastFlushAt = now
  } catch (e) {
    console.warn('[metadata] stats flush failed', e)
  }
}

export function recordRequest(opts: {
  method: string
  path: string
  status: number
  vertical?: string | null
  paid?: boolean
  /** Lowercased 0x… when present — used only for unique counts, never stored */
  wallet?: string | null
  durationMs?: number
}) {
  ensureLoaded()
  const now = Date.now()
  rollHourIfNeeded(now)

  current.total++
  if (opts.paid) current.paid++
  else current.unpaid++

  bump(current.byStatus, String(opts.status))
  bump(current.byMethod, opts.method.toUpperCase())
  const durationMs = Number.isFinite(opts.durationMs) ? Math.max(0, opts.durationMs ?? 0) : 0
  const latencyBucket = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000].find(
    (upperBound) => durationMs <= upperBound,
  )
  bump(current.responseMsBuckets, latencyBucket === undefined ? '5000+' : String(latencyBucket))
  // Paths table: API/agent only — skip SPA assets and scanner junk (was flooding as /:id)
  if (shouldRecordPath(opts.path)) {
    bump(current.byPath, normalizePath(opts.path))
  }
  if (opts.vertical) bump(current.byVertical, opts.vertical)

  const w = opts.wallet?.startsWith('0x') ? opts.wallet.toLowerCase() : null
  if (w) {
    current.withWallet++
    const configuredMaxUnique = Number(process.env.STATS_MAX_UNIQUE_WALLETS ?? 100_000)
    const maxUnique =
      Number.isFinite(configuredMaxUnique) && configuredMaxUnique >= 100
        ? Math.floor(configuredMaxUnique)
        : 100_000
    if (walletSet.has(w) || walletSet.size < maxUnique) walletSet.add(w)
    if (opts.paid && (paidWalletSet.has(w) || paidWalletSet.size < maxUnique)) {
      paidWalletSet.add(w)
    }
  } else {
    current.withoutWallet++
  }
  syncUniqueCounts()

  if (now - lastFlushAt >= FLUSH_MS) flushToDisk()
}

function sumBuckets(buckets: HourBucket[]): HourBucket {
  const out = emptyHour('range')
  for (const b of buckets) {
    out.total += b.total
    out.paid += b.paid
    out.unpaid += b.unpaid
    out.withWallet += b.withWallet
    out.withoutWallet += b.withoutWallet
    // Unique across hours is not additive; expose sum as approx separately
    out.uniqueWallets += b.uniqueWallets
    out.uniquePaidWallets += b.uniquePaidWallets
    for (const [k, v] of Object.entries(b.byStatus)) bump(out.byStatus, k, v)
    for (const [k, v] of Object.entries(b.byPath)) bump(out.byPath, k, v)
    for (const [k, v] of Object.entries(b.byVertical)) bump(out.byVertical, k, v)
    for (const [k, v] of Object.entries(b.byMethod)) bump(out.byMethod, k, v)
    for (const [k, v] of Object.entries(b.responseMsBuckets)) bump(out.responseMsBuckets, k, v)
  }
  return out
}

function topN(map: Record<string, number>, n = 12): { key: string; count: number }[] {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

function errorCount(byStatus: Record<string, number>) {
  let n = 0
  for (const [code, c] of Object.entries(byStatus)) {
    const s = Number(code)
    if (s >= 500) n += c
  }
  return n
}

function clientErrorCount(byStatus: Record<string, number>) {
  let n = 0
  for (const [code, c] of Object.entries(byStatus)) {
    const s = Number(code)
    if (s >= 400 && s < 500) n += c
  }
  return n
}

export async function getStatsPublic() {
  ensureLoaded()
  rollHourIfNeeded(Date.now())
  syncUniqueCounts()

  const hoursMap = { ...disk.hours, [current.hour]: structuredClone(current) }
  const keys = Object.keys(hoursMap).sort()
  const last24Keys = keys.slice(-24)
  const last24 = sumBuckets(last24Keys.map((k) => hoursMap[k]!))
  const allTime = sumBuckets(keys.map((k) => hoursMap[k]!))

  const series24 = last24Keys.map((k) => {
    const b = hoursMap[k]!
    return {
      hour: k,
      total: b.total,
      paid: b.paid,
      unpaid: b.unpaid,
      uniqueWallets: b.uniqueWallets,
    }
  })

  const ledger = await getLedgerPublicStats()

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    note:
      'Public platform traffic across all API clients. Per-wallet account stats live on GET /v1/pay/account (signed-in). Rollups ~hourly; wallet addresses never stored in stats.',
    /** API traffic across all users / clients */
    platform: {
      currentHour: {
        hour: current.hour,
        total: current.total,
        paid: current.paid,
        unpaid: current.unpaid,
        errors5xx: errorCount(current.byStatus),
        client4xx: clientErrorCount(current.byStatus),
        byStatus: current.byStatus,
        byMethod: current.byMethod,
        topPaths: topN(current.byPath),
        topVerticals: topN(current.byVertical),
        uniqueWallets: current.uniqueWallets,
        withWallet: current.withWallet,
        withoutWallet: current.withoutWallet,
      },
      last24h: {
        hours: last24Keys.length,
        total: last24.total,
        paid: last24.paid,
        unpaid: last24.unpaid,
        errors5xx: errorCount(last24.byStatus),
        client4xx: clientErrorCount(last24.byStatus),
        byStatus: last24.byStatus,
        byMethod: last24.byMethod,
        topPaths: topN(last24.byPath),
        topVerticals: topN(last24.byVertical),
        series: series24,
        /** Sum of per-hour uniques — may double-count wallets active across hours */
        uniqueWalletsApprox: last24.uniqueWallets,
      },
      retained: {
        hours: keys.length,
        total: allTime.total,
        topPaths: topN(allTime.byPath, 20),
        topVerticals: topN(allTime.byVertical, 20),
      },
      /** Optional marketplace snapshot (no addresses) */
      credits: {
        ...ledger,
        note: 'Ledger snapshot — not hourly. No wallet addresses exposed.',
      },
    },
  }
}

/** Call on process shutdown if desired */
export function flushStatsNow() {
  flushToDisk(true)
}
