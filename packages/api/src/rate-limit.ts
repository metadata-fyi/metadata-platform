/** Sliding-window rate limiter in SQLite so a restart does not reset buckets. */
import { getRuntimeDb } from './runtime-db.js'
import { reserveQuotaBucket, clearQuotaBuckets } from './quota-buckets.js'

const DEFAULT_MAX_BUCKETS = 50_000

function maxBuckets(): number {
  const configured = Number(process.env.RATE_LIMIT_MAX_KEYS ?? DEFAULT_MAX_BUCKETS)
  return Number.isFinite(configured) && configured >= 100
    ? Math.floor(configured)
    : DEFAULT_MAX_BUCKETS
}

export function rateLimit(opts: {
  key: string
  limit: number
  windowMs: number
}): { ok: true; remaining: number } | { ok: false; retryAfterSec: number; remaining: 0 } {
  const now = Date.now()
  const windowStart = now - opts.windowMs
  const database = getRuntimeDb()
  database
    .prepare('DELETE FROM rate_limit_hits WHERE bucket = ? AND ts <= ?')
    .run(opts.key, windowStart)
  const rows = database
    .prepare('SELECT ts FROM rate_limit_hits WHERE bucket = ? ORDER BY ts ASC')
    .all(opts.key) as Array<{ ts: number }>
  if (rows.length >= opts.limit) {
    const oldest = rows[0]?.ts ?? now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000))
    return { ok: false, retryAfterSec, remaining: 0 }
  }
  if (!reserveQuotaBucket('rate', opts.key, now, opts.windowMs, maxBuckets(), rows.length === 0)) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(opts.windowMs / 1000)), remaining: 0 }
  }
  database.prepare('INSERT INTO rate_limit_hits(bucket, ts) VALUES (?, ?)').run(opts.key, now)
  return { ok: true, remaining: opts.limit - rows.length - 1 }
}

export function clientIp(headers: Headers, fallback = '0.0.0.0'): string {
  // The edge-provided address is trusted only when paired with a secret that
  // the client cannot manufacture. Never trust a raw CF-Connecting-IP header.
  const edgeSecret = process.env.METADATA_EDGE_SHARED_SECRET || process.env.EDGE_SHARED_SECRET
  const edgeToken = headers.get('x-metadata-edge-token')?.trim()
  const edgeIp = headers.get('x-metadata-client-ip')?.trim()
  if (edgeSecret && edgeToken === edgeSecret && edgeIp) return edgeIp

  // Only trust X-Real-IP when the origin proxy (e.g. Caddy) overwrites it.
  if (process.env.TRUST_X_REAL_IP === '1') {
    const real = headers.get('x-real-ip')?.trim()
    if (real) return real
  }

  // Only trust XFF when the deployment explicitly controls the proxy chain.
  if (process.env.TRUST_X_FORWARDED_FOR === '1') {
    const xff = headers.get('x-forwarded-for')
    if (xff) return xff.split(',')[0]?.trim() || fallback
  }

  return fallback
}

/** Internal test/maintenance hook; production code does not call this. */
export function clearRateLimitState() {
  getRuntimeDb().exec('DELETE FROM rate_limit_hits')
  clearQuotaBuckets('rate')
}
