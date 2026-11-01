/**
 * First-party service accounts — no-credit-spend catalog tier for server apps.
 * Tier name is 'unlimited' (no wallet/preview/credit debit); requests are still
 * rate-limited per account (rateLimitPerMin, default 6000).
 * Secrets are never stored; only sha256 hashes live in DATA_DIR or packages/api/data.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { metadataEnvironment } from './packs.js'

export type ServiceAccountRecord = {
  id: string
  name: string
  /** sha256 hex of the raw secret (msk_…) */
  secretHash: string
  tier: 'unlimited'
  /** ["*"] or list of vertical ids */
  verticals: string[]
  rateLimitPerMin: number
  createdAt: string
  /** optional disable without deleting */
  disabled?: boolean
  /** Steward flag: required for /v1/ops/contributions accept|reject. Default false. */
  ops?: boolean
  dailyUnits?: number
  expiresAt?: string
  catalog?: boolean
}

export type ServiceAccountsFile = {
  version: 1
  keys: ServiceAccountRecord[]
}

export type ResolvedServiceAccount = {
  id: string
  name: string
  rateLimitPerMin: number
  verticals: string[]
  /** True only when the stored record has ops: true. Catalog keys stay false. */
  ops: boolean
  dailyUnits: number
  catalog: boolean
}

const PREFIX = 'msk_live_'

function dataDir() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
}

function candidates(): string[] {
  return [path.join(dataDir(), 'service-accounts.json')]
}

function empty(): ServiceAccountsFile {
  return { version: 1, keys: [] }
}

let cache: { mtimeMs: number; path: string; file: ServiceAccountsFile } | null = null

function loadFile(): ServiceAccountsFile {
  for (const p of candidates()) {
    try {
      if (!fs.existsSync(p)) continue
      const st = fs.statSync(p)
      if (cache && cache.path === p && cache.mtimeMs === st.mtimeMs) {
        return cache.file
      }
      const j = JSON.parse(fs.readFileSync(p, 'utf8')) as ServiceAccountsFile
      if (!j || j.version !== 1 || !Array.isArray(j.keys)) return empty()
      cache = { mtimeMs: st.mtimeMs, path: p, file: j }
      return j
    } catch {
      return empty()
    }
  }
  return empty()
}

export function hashServiceSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function generateServiceSecret(): string {
  return `${PREFIX}${randomBytes(24).toString('base64url')}`
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/** Extract raw key from X-Metadata-Service-Key or Authorization: Bearer msk_… */
export function extractServiceKeyHeader(headers: Headers): string | null {
  const direct = headers.get('x-metadata-service-key') || headers.get('x-service-key') || null
  if (direct?.startsWith('msk_')) return direct.trim()
  const auth = headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const tok = auth.slice(7).trim()
    if (tok.startsWith('msk_')) return tok
  }
  return null
}

export function resolveServiceAccount(
  secret: string | null | undefined,
): ResolvedServiceAccount | null {
  if (!secret || !secret.startsWith('msk_')) return null
  const hash = hashServiceSecret(secret)
  const file = loadFile()
  for (const k of file.keys) {
    if (k.disabled || (metadataEnvironment() === 'production' && !k.expiresAt)) continue
    if (
      k.expiresAt &&
      (!Number.isFinite(Date.parse(k.expiresAt)) || Date.parse(k.expiresAt) <= Date.now())
    )
      continue
    if (k.tier !== 'unlimited') continue
    if (!safeEqualHex(k.secretHash, hash)) continue
    return {
      id: k.id,
      name: k.name,
      rateLimitPerMin:
        Number.isSafeInteger(k.rateLimitPerMin) && k.rateLimitPerMin > 0
          ? Math.min(k.rateLimitPerMin, 6000)
          : 300,
      dailyUnits:
        Number.isSafeInteger(k.dailyUnits) && k.dailyUnits! > 0
          ? Math.min(k.dailyUnits!, 1_000_000)
          : 50_000,
      catalog: k.catalog !== false,
      verticals: k.verticals?.length ? k.verticals : ['*'],
      ops: k.ops === true,
    }
  }
  return null
}

export function serviceAllowsVertical(account: ResolvedServiceAccount, vertical: string): boolean {
  if (!account.catalog) return false
  if (account.verticals.includes('*')) return true
  return account.verticals.includes(vertical)
}

/** Write path for mint script / ops (DATA_DIR preferred). */
export function serviceAccountsWritePath(): string {
  const p = path.join(dataDir(), 'service-accounts.json')
  return p
}
