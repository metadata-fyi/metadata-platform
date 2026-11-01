import { createHash, timingSafeEqual } from 'node:crypto'
import { metadataEnvironment } from './packs.js'
import { getRuntimeDb } from './runtime-db.js'
import { readFinanceControls } from './finance-controls.js'

export type CatalogTier = 'paid' | 'service' | 'preview'
export type CatalogUsage = {
  subject: string
  tier: CatalogTier
  units: number
  bytes: number
  limit: number
  day?: string
}

export function policyNumber(name: string, fallback: number, maximum = 1_000_000): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback
}

export function catalogPolicy() {
  return {
    creditsPerUnit: Math.max(
      policyNumber('CATALOG_CREDITS_PER_UNIT', 1, 1000),
      readFinanceControls()?.creditsPerUnit ?? 1,
    ),
    bytesPerUnit: policyNumber('CATALOG_BYTES_PER_UNIT', 16_384),
    maxResponseBytes: policyNumber('CATALOG_MAX_RESPONSE_BYTES', 2_097_152, 8_388_608),
    paidDailyUnits: policyNumber('PAID_DAILY_CATALOG_UNITS', 10_000),
    // Development previews can include large provider/card facets. Production
    // uses a fixed sample and never enters the arbitrary preview path.
    previewDailyUnits: policyNumber('PREVIEW_DAILY_CATALOG_UNITS', 10_000),
    serviceDailyUnits: policyNumber('SERVICE_DAILY_CATALOG_UNITS', 50_000),
    ipPerMinute: policyNumber('CATALOG_IP_RATE_PER_MIN', 600),
    concurrency: policyNumber('CATALOG_CONCURRENCY_PER_ACCOUNT', 4, 32),
    globalConcurrency: policyNumber('CATALOG_GLOBAL_CONCURRENCY', 32, 256),
    x402MaxUnits: policyNumber('X402_MAX_CATALOG_UNITS', 10, 100),
    fixedPreview: metadataEnvironment() === 'production',
  }
}

export function trustedEdge(headers: Headers): boolean {
  const secret = process.env.METADATA_EDGE_SHARED_SECRET || process.env.EDGE_SHARED_SECRET
  const supplied = headers.get('x-metadata-edge-token') || ''
  if (!secret) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(supplied)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function requiresEdgeProof(): boolean {
  return metadataEnvironment() === 'production' || process.env.REQUIRE_EDGE_PROOF === '1'
}

export function usageSubject(identity: string): string {
  return createHash('sha256').update(identity.toLowerCase()).digest('hex')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}
export function dayRetryAfter(): number {
  const now = Date.now()
  return Math.max(1, Math.ceil((Date.parse(`${today()}T00:00:00Z`) + 86_400_000 - now) / 1000))
}

export function dailyUsage(subject: string, day = today()): number {
  return (
    (
      getRuntimeDb()
        .prepare('SELECT units FROM catalog_usage WHERE day = ? AND subject = ?')
        .get(day, subject) as { units: number } | undefined
    )?.units ?? 0
  )
}

/** Caller must hold the ledger transaction; quota and debit commit together. */
export function commitCatalogUsage(usage: CatalogUsage, credits: number): boolean {
  const day = usage.day ?? today()
  if (dailyUsage(usage.subject, day) + usage.units > usage.limit) return false
  const db = getRuntimeDb()
  db.prepare(`INSERT INTO catalog_usage(day, subject, tier, requests, units, bytes, credits)
    VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(day, subject) DO UPDATE SET
    requests = requests + 1, units = units + excluded.units,
    bytes = bytes + excluded.bytes, credits = credits + excluded.credits`).run(
    day,
    usage.subject,
    usage.tier,
    usage.units,
    usage.bytes,
    credits,
  )
  return true
}

/** Failed x402 settlement releases its zero-credit quota reservation. */
export function releaseCatalogUsage(usage: CatalogUsage) {
  getRuntimeDb()
    .prepare(`UPDATE catalog_usage SET requests = requests - 1,
    units = units - ?, bytes = bytes - ? WHERE day = ? AND subject = ?
    AND requests > 0 AND units >= ? AND bytes >= ?`)
    .run(usage.units, usage.bytes, usage.day ?? today(), usage.subject, usage.units, usage.bytes)
}

export function recordCatalogDenial(reason: string) {
  getRuntimeDb()
    .prepare(`INSERT INTO catalog_denials(day, reason, count) VALUES (?, ?, 1)
    ON CONFLICT(day, reason) DO UPDATE SET count = count + 1`)
    .run(today(), reason)
}

export function catalogUsageReport() {
  const db = getRuntimeDb()
  const cutoff = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10)
  db.prepare('DELETE FROM catalog_usage WHERE day < ?').run(cutoff)
  db.prepare('DELETE FROM catalog_denials WHERE day < ?').run(cutoff)
  return {
    policy: catalogPolicy(),
    daily: db
      .prepare(`SELECT day, tier, SUM(requests) AS requests, SUM(units) AS units,
      SUM(bytes) AS bytes, SUM(credits) AS credits FROM catalog_usage GROUP BY day, tier ORDER BY day DESC`)
      .all(),
    denials: db.prepare('SELECT day, reason, count FROM catalog_denials ORDER BY day DESC').all(),
    busiestToday: db
      .prepare(
        'SELECT subject, tier, requests, units, bytes FROM catalog_usage WHERE day = ? ORDER BY units DESC LIMIT 20',
      )
      .all(today()),
  }
}

/** Count returned entity occurrences, including embedded records and batches.
 * Array entries without identifiers also count. Primitive arrays are covered
 * by the byte floor. MCP text envelopes are decoded to apply the same rules.
 */
export function responseUnits(body: unknown, bytes: number): number {
  let records = 0
  function visit(value: unknown, arrayEntry = false): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, true)
      return
    }
    if (!value || typeof value !== 'object') return
    const row = value as Record<string, unknown>
    if (arrayEntry || ['id', 'itemId'].some((key) => typeof row[key] === 'string')) records++
    for (const child of Object.values(row)) visit(child)
  }
  const rpc = body as { result?: { content?: Array<{ text?: string }> } } | null
  const content = rpc?.result?.content
  if (content) {
    for (const item of content) {
      if (item.text) visit(JSON.parse(item.text))
    }
  } else visit(body)
  return Math.max(1, records, Math.ceil(bytes / catalogPolicy().bytesPerUnit))
}

let inFlight = 0
const subjects = new Map<string, number>()
export function acquireCatalogSlot(subject: string): (() => void) | null {
  const policy = catalogPolicy()
  const count = subjects.get(subject) ?? 0
  if (inFlight >= policy.globalConcurrency || count >= policy.concurrency) return null
  inFlight++
  subjects.set(subject, count + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    inFlight--
    const left = (subjects.get(subject) ?? 1) - 1
    if (left > 0) subjects.set(subject, left)
    else subjects.delete(subject)
  }
}
