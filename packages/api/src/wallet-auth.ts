/**
 * Wallet ownership sessions. Stored in SQLite so they survive origin restart.
 */
import { randomBytes } from 'node:crypto'
import { type Address, type Hex, isAddress, verifyMessage } from 'viem'
import { getRuntimeDb } from './runtime-db.js'

export type WalletNonce = {
  nonce: string
  message: string
  expiresAt: string
}

export type WalletSession = {
  token: string
  wallet: string
  expiresAt: string
}

function maxRecords(name: string, fallback: number): number {
  const configured = Number(process.env[name] ?? fallback)
  return Number.isFinite(configured) && configured >= 100 ? Math.floor(configured) : fallback
}

function ttl(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function nonceTtlMs() {
  return ttl('WALLET_AUTH_NONCE_TTL_MS', 10 * 60_000)
}

function sessionTtlMs() {
  return ttl('WALLET_AUTH_SESSION_TTL_MS', 24 * 60 * 60_000)
}

function now() {
  return Date.now()
}

function iso(ms: number) {
  return new Date(ms).toISOString()
}

function token() {
  return `mds_${randomBytes(32).toString('hex')}`
}

function nonce() {
  return `0x${randomBytes(16).toString('hex')}`
}

export function normalizeWallet(value: unknown): string | null {
  if (typeof value !== 'string' || !isAddress(value)) return null
  return value.toLowerCase()
}

function cleanupExpired() {
  const timestamp = now()
  const database = getRuntimeDb()
  database.prepare('DELETE FROM wallet_nonces WHERE expires_at <= ?').run(timestamp)
  database.prepare('DELETE FROM wallet_sessions WHERE expires_at <= ?').run(timestamp)
}

export function createWalletNonce(value: unknown): WalletNonce {
  cleanupExpired()
  const wallet = normalizeWallet(value)
  if (!wallet) throw new Error('Invalid wallet address')
  const database = getRuntimeDb()
  const existing = database
    .prepare('SELECT nonce, message, expires_at AS expiresAt FROM wallet_nonces WHERE wallet = ?')
    .get(wallet) as { nonce: string; message: string; expiresAt: number } | undefined
  if (existing && existing.expiresAt > now()) {
    return { nonce: existing.nonce, message: existing.message, expiresAt: iso(existing.expiresAt) }
  }
  const nonceCount = (
    database.prepare('SELECT COUNT(*) AS n FROM wallet_nonces').get() as { n: number }
  ).n
  if (!existing && nonceCount >= maxRecords('WALLET_AUTH_MAX_NONCES', 50_000)) {
    throw new Error('Wallet login capacity reached; retry shortly')
  }

  const expiresAt = now() + nonceTtlMs()
  const valueNonce = nonce()
  const message = [
    'Metadata API login',
    `Wallet: ${wallet}`,
    `Nonce: ${valueNonce}`,
    `Expires: ${iso(expiresAt)}`,
  ].join('\n')
  database
    .prepare(
      'INSERT OR REPLACE INTO wallet_nonces(wallet, nonce, message, expires_at) VALUES (?, ?, ?, ?)',
    )
    .run(wallet, valueNonce, message, expiresAt)
  return { nonce: valueNonce, message, expiresAt: iso(expiresAt) }
}

export async function verifyWalletSignature(opts: {
  wallet: unknown
  message: unknown
  signature: unknown
}): Promise<WalletSession> {
  cleanupExpired()
  const wallet = normalizeWallet(opts.wallet)
  if (!wallet || typeof opts.message !== 'string' || typeof opts.signature !== 'string') {
    throw new Error('Wallet, message, and signature are required')
  }

  const database = getRuntimeDb()
  const record = database
    .prepare('SELECT nonce, message, expires_at AS expiresAt FROM wallet_nonces WHERE wallet = ?')
    .get(wallet) as { nonce: string; message: string; expiresAt: number } | undefined
  if (!record || record.expiresAt <= now()) {
    database.prepare('DELETE FROM wallet_nonces WHERE wallet = ?').run(wallet)
    throw new Error('Wallet login nonce is missing or expired')
  }
  if (record.message !== opts.message) {
    throw new Error('Wallet login message does not match the issued nonce')
  }

  let valid = false
  try {
    valid = await verifyMessage({
      address: wallet as Address,
      message: record.message,
      signature: opts.signature as Hex,
    })
  } catch {
    valid = false
  }
  if (!valid) throw new Error('Wallet signature could not be verified')

  const sessionCount = (
    database.prepare('SELECT COUNT(*) AS n FROM wallet_sessions').get() as { n: number }
  ).n
  if (sessionCount >= maxRecords('WALLET_AUTH_MAX_SESSIONS', 100_000)) {
    throw new Error('Wallet session capacity reached; retry shortly')
  }
  database.prepare('DELETE FROM wallet_nonces WHERE wallet = ?').run(wallet)
  const expiresAt = now() + sessionTtlMs()
  const sessionToken = token()
  database
    .prepare('INSERT INTO wallet_sessions(token, wallet, expires_at) VALUES (?, ?, ?)')
    .run(sessionToken, wallet, expiresAt)
  return { token: sessionToken, wallet, expiresAt: iso(expiresAt) }
}

/** Return a session token from the supported request headers. */
export function extractSessionToken(headers: Headers): string | null {
  const explicit = headers.get('x-metadata-session')?.trim()
  if (explicit) return explicit
  const auth = headers.get('authorization')?.trim()
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/** Resolve a non-expired session. */
export function getWalletSession(value: string | null | undefined): WalletSession | null {
  cleanupExpired()
  const key = value?.trim()
  if (!key) return null
  const record = getRuntimeDb()
    .prepare('SELECT wallet, expires_at AS expiresAt FROM wallet_sessions WHERE token = ?')
    .get(key) as { wallet: string; expiresAt: number } | undefined
  if (!record || record.expiresAt <= now()) {
    if (record) getRuntimeDb().prepare('DELETE FROM wallet_sessions WHERE token = ?').run(key)
    return null
  }
  return { token: key, wallet: record.wallet, expiresAt: iso(record.expiresAt) }
}

/** Revoke a session on disconnect when the client has one. */
export function revokeWalletSession(value: string | null | undefined): boolean {
  const key = value?.trim()
  if (!key) return false
  const result = getRuntimeDb().prepare('DELETE FROM wallet_sessions WHERE token = ?').run(key)
  return result.changes > 0
}

/** Internal test hook; not used by production routes. */
export function clearWalletAuthState() {
  const database = getRuntimeDb()
  database.exec('DELETE FROM wallet_nonces; DELETE FROM wallet_sessions;')
}
