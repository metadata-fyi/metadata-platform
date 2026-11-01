/** Persistent bounded admission. Unknown legacy expiry is retained conservatively. */
import { getRuntimeDb } from './runtime-db.js'
type Kind = 'rate' | 'preview'
const table = (kind: Kind) => kind === 'rate' ? 'rate_limit_hits' : 'preview_hits'
export function reserveQuotaBucket(kind: Kind, bucket: string, now: number, windowMs: number, max: number, empty: boolean): boolean {
  const db = getRuntimeDb()
  return db.transaction(() => {
    const expired = db.prepare('SELECT bucket FROM quota_buckets WHERE kind = ? AND expires_at <= ? LIMIT 128').all(kind, now) as Array<{ bucket: string }>
    for (const row of expired) {
      db.prepare(`DELETE FROM ${table(kind)} WHERE bucket = ?`).run(row.bucket)
      db.prepare('DELETE FROM quota_buckets WHERE kind = ? AND bucket = ?').run(kind, row.bucket)
    }
    const existing = db.prepare('SELECT expires_at FROM quota_buckets WHERE kind = ? AND bucket = ?').get(kind, bucket)
    if (existing) {
      db.prepare('UPDATE quota_buckets SET expires_at = CASE WHEN expires_at IS NULL AND ? THEN ? ELSE MAX(expires_at, ?) END WHERE kind = ? AND bucket = ?').run(empty ? 1 : 0, now + windowMs, now + windowMs, kind, bucket)
      return true
    }
    const count = db.prepare('SELECT n FROM quota_counts WHERE kind = ?').get(kind) as { n: number }
    if (count.n >= max) return false
    db.prepare('INSERT INTO quota_buckets(kind, bucket, expires_at) VALUES (?, ?, ?)').run(kind, bucket, now + windowMs)
    return true
  })()
}
export function clearQuotaBuckets(kind: Kind) {
  getRuntimeDb().prepare('DELETE FROM quota_buckets WHERE kind = ?').run(kind)
}
