/**
 * Free catalog preview quota. Hits persist in SQLite so a restart does not
 * reset the 8/day teaser.
 */
import { clientIp } from './rate-limit.js'
import { getRuntimeDb } from './runtime-db.js'
import { reserveQuotaBucket, clearQuotaBuckets } from './quota-buckets.js'

export type PreviewTake =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; remaining: 0; limit: number; retryAfterSec: number }

const DEFAULT_MAX_BUCKETS = 50_000

function maxBuckets(): number {
  const configured = Number(process.env.PREVIEW_MAX_KEYS ?? DEFAULT_MAX_BUCKETS)
  return Number.isFinite(configured) && configured >= 100
    ? Math.floor(configured)
    : DEFAULT_MAX_BUCKETS
}

export function previewLimit(): number {
  const n = Number(process.env.PREVIEW_LIMIT ?? 8)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 8
}

export function previewWindowMs(): number {
  const n = Number(process.env.PREVIEW_WINDOW_MS ?? 86_400_000) // 24h
  return Number.isFinite(n) && n > 0 ? n : 86_400_000
}

/** Max hits returned on free preview search (encourage full access). */
export function previewSearchMax(): number {
  const n = Number(process.env.PREVIEW_SEARCH_MAX ?? 5)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5
}

function key(ip: string, vertical: string): string {
  return `preview:${ip}:${vertical}`
}

function hits(bucket: string, windowStart: number): number[] {
  const database = getRuntimeDb()
  database.prepare('DELETE FROM preview_hits WHERE bucket = ? AND ts <= ?').run(bucket, windowStart)
  const rows = database
    .prepare('SELECT ts FROM preview_hits WHERE bucket = ? ORDER BY ts ASC')
    .all(bucket) as Array<{ ts: number }>
  return rows.map((row) => row.ts)
}

/** Peek remaining without consuming. */
export function peekPreview(opts: { ip: string; vertical: string }): {
  remaining: number
  limit: number
  used: number
  windowMs: number
  retryAfterSec?: number
} {
  const limit = previewLimit()
  const windowMs = previewWindowMs()
  if (limit <= 0) {
    return { remaining: 0, limit: 0, used: 0, windowMs, retryAfterSec: 3600 }
  }
  const now = Date.now()
  const stamps = hits(key(opts.ip, opts.vertical), now - windowMs)
  const used = stamps.length
  if (used >= limit) {
    const oldest = stamps[0] ?? now
    return {
      remaining: 0,
      limit,
      used,
      windowMs,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }
  return {
    remaining: limit - used,
    limit,
    used,
    windowMs,
  }
}

/** Consume one free preview slot for this IP + vertical. */
export function takePreview(opts: { ip: string; vertical: string }): PreviewTake {
  const limit = previewLimit()
  const windowMs = previewWindowMs()
  if (limit <= 0) {
    return { ok: false, remaining: 0, limit: 0, retryAfterSec: 3600 }
  }
  const now = Date.now()
  const k = key(opts.ip, opts.vertical)
  const stamps = hits(k, now - windowMs)
  if (stamps.length >= limit) {
    const oldest = stamps[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { ok: false, remaining: 0, limit, retryAfterSec }
  }
  if (!reserveQuotaBucket('preview', k, now, windowMs, maxBuckets(), stamps.length === 0)) {
    return { ok: false, remaining: 0, limit, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) }
  }
  getRuntimeDb().prepare('INSERT INTO preview_hits(bucket, ts) VALUES (?, ?)').run(k, now)
  return {
    ok: true,
    remaining: limit - stamps.length - 1,
    limit,
  }
}

export function previewIpFromHeaders(headers: Headers): string {
  return clientIp(headers)
}

/** Internal test/maintenance hook; production code does not call this. */
export function clearPreviewState() {
  getRuntimeDb().exec('DELETE FROM preview_hits')
  clearQuotaBuckets('preview')
}
