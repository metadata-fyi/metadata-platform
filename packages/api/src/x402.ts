/**
 * x402 pay-per-request via Marian (Robinhood Chain + USDG).
 *
 * Default: $0.01 USDG per catalog request (X402_PER_REQUEST_USD).
 * Not $0.001 — on-chain settle needs headroom for facilitator gas.
 */
import { ROBINHOOD_USDG, usdgToAtomic } from './packs.js'
import { readFinanceControls } from './finance-controls.js'
import { createHash } from 'node:crypto'
import { metadataEnvironment } from './packs.js'
import { getRuntimeDb, runtimeDbTransaction } from './runtime-db.js'
import { recordFinanceEvent } from './finance.js'

export type X402PaymentRequirements = {
  scheme: 'exact'
  network: string
  maxAmountRequired: string
  resource: string
  description?: string
  mimeType?: string
  payTo: string
  maxTimeoutSeconds?: number
  asset: string
  extra?: Record<string, unknown>
}

export type X402PaymentPayload = {
  x402Version: number
  scheme: 'exact'
  network: string
  payload: {
    signature?: string
    authorization?: unknown
    transaction?: string
  }
}

export function x402Enabled(): boolean {
  return (
    !readFinanceControls()?.disableX402 &&
    (process.env.X402_ENABLED === '1' || process.env.X402_ENABLED === 'true')
  )
}

export function x402FacilitatorUrl(): string {
  return process.env.X402_FACILITATOR_URL?.replace(/\/$/, '') || 'https://marian.maid.fyi'
}

/** USDG charged per catalog request via x402 (default $0.01). */
export function x402PerRequestUsd(): number {
  const n = Number(process.env.X402_PER_REQUEST_USD ?? process.env.X402_MIN_USD ?? 0.01)
  if (!Number.isFinite(n) || n <= 0) return 0.01
  // Keep a floor so we don't underprice gas
  return Math.max(0.01, Math.round(n * 10000) / 10000)
}

/** @deprecated use x402PerRequestUsd — alias for older imports */
export function x402MinUsd(): number {
  return x402PerRequestUsd()
}

function treasuryAddress(): string | null {
  const a = process.env.TREASURY_ADDRESS
  return a?.startsWith('0x') ? a : null
}

function facilitatorKey(): string | undefined {
  return (
    process.env.X402_FACILITATOR_API_KEY ||
    process.env.X402_API_KEY ||
    process.env.MARIAN_API_KEY ||
    undefined
  )
}

/** Build Marian-compatible payment requirements for one catalog request. */
export function buildRequestRequirements(
  resource: string,
  usdg: number = x402PerRequestUsd(),
): X402PaymentRequirements[] | null {
  const payTo = treasuryAddress()
  if (!payTo) return null
  const amount = Math.max(0.01, usdg)
  const atomic = usdgToAtomic(amount).toString()
  return [
    {
      scheme: 'exact',
      network: ROBINHOOD_USDG.network,
      maxAmountRequired: atomic,
      resource,
      description: `Metadata API · 1 request · $${amount.toFixed(2)} USDG`,
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 120,
      asset: ROBINHOOD_USDG.address,
      extra: {
        name: ROBINHOOD_USDG.name,
        version: '2',
        usdg: amount,
        unit: 'request',
      },
    },
  ]
}

/** @deprecated alias — same as per-request requirements */
export function buildTopupRequirements(
  resource: string,
  usdg?: number,
): X402PaymentRequirements[] | null {
  return buildRequestRequirements(resource, usdg)
}

export function decodePaymentHeader(header: string): X402PaymentPayload | null {
  try {
    const raw = header.trim()
    let json: string
    try {
      json = Buffer.from(raw, 'base64').toString('utf8')
    } catch {
      json = raw
    }
    const payload = JSON.parse(json) as X402PaymentPayload
    if (payload.x402Version !== 1 && payload.x402Version !== 2) return null
    if (payload.scheme !== 'exact') return null
    if (!payload.network || !payload.payload) return null
    return payload
  } catch {
    return null
  }
}

export function extractPaymentHeader(headers: Headers): string | null {
  return (
    headers.get('x-payment') ||
    headers.get('X-PAYMENT') ||
    headers.get('payment-signature') ||
    headers.get('PAYMENT-SIGNATURE') ||
    null
  )
}

async function facilitatorPost(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const base = x402FacilitatorUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const key = facilitatorKey()
  if (key) {
    headers.Authorization = `Bearer ${key}`
    headers['X-Api-Key'] = key
  }
  const timeoutMs = (() => {
    const configured = Number(process.env.X402_FACILITATOR_TIMEOUT_MS ?? 8_000)
    return Number.isFinite(configured) ? Math.min(30_000, Math.max(1_000, configured)) : 8_000
  })()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let data: Record<string, unknown> = {}
    const text = await res.text()
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      data = { raw: text.slice(0, 400) }
    }
    return { ok: res.ok, status: res.status, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed'
    return {
      ok: false,
      status: 599,
      data: { error: `Facilitator request failed: ${message.slice(0, 160)}` },
    }
  } finally {
    clearTimeout(timer)
  }
}

export type X402VerifiedPayment = {
  payload: X402PaymentPayload
  requirements: X402PaymentRequirements
  wallet: string
  usdg: number
}

/** Verify an x402 payment without settling it. The caller owns settlement timing. */
export async function verifyX402PayPerRequest(opts: {
  headers: Headers
  resource: string
}): Promise<{ ok: true; payment: X402VerifiedPayment } | { ok: false; reason: string } | null> {
  if (!x402Enabled()) return null
  const header = extractPaymentHeader(opts.headers)
  if (!header) return null

  const payload = decodePaymentHeader(header)
  if (!payload) {
    return { ok: false, reason: 'Invalid X-PAYMENT payload' }
  }

  const usdg = x402PerRequestUsd()
  const requirementsList = buildRequestRequirements(opts.resource, usdg)
  if (!requirementsList?.length) {
    return { ok: false, reason: 'TREASURY_ADDRESS not configured for x402' }
  }
  const requirements =
    requirementsList.find((r) => r.network === payload.network) || requirementsList[0]

  const verified = await verifyWithMarian(payload, requirements)
  if (!verified.isValid) {
    return {
      ok: false,
      reason: verified.invalidReason || 'Payment verification failed',
    }
  }

  const wallet = (verified.payer || '').toLowerCase()
  if (!wallet.startsWith('0x')) {
    return { ok: false, reason: 'Missing payer wallet after verification' }
  }

  return {
    ok: true,
    payment: { payload, requirements, wallet, usdg },
  }
}

/** Settle a payment that was previously verified for the current request. */
export async function settleVerifiedX402(
  payment: X402VerifiedPayment,
): Promise<{ ok: true; txHash: string } | { ok: false; reason: string }> {
  // Reserve before the external side effect. An ambiguous provider timeout or
  // process crash must never trigger a second settlement on blind retry.
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonical(child)]),
      )
    return value
  }
  const id = createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          network: payment.payload.network,
          scheme: payment.payload.scheme,
          payload: payment.payload.payload,
        }),
      ),
    )
    .digest('hex')
  const environment = metadataEnvironment()
  const db = getRuntimeDb()
  const reserved =
    db
      .prepare(`INSERT OR IGNORE INTO x402_settlement_attempts
    (environment, id, status, wallet, at) VALUES (?, ?, 'pending', ?, ?)`)
      .run(environment, id, payment.wallet, new Date().toISOString()).changes > 0
  if (!reserved) {
    const prior = db
      .prepare('SELECT status FROM x402_settlement_attempts WHERE environment = ? AND id = ?')
      .get(environment, id) as { status: string }
    return {
      ok: false,
      reason: prior.status === 'completed' ? 'PAYMENT_ALREADY_USED' : 'PAYMENT_STATUS_UNKNOWN',
    }
  }
  const settled = await settleWithMarian(payment.payload, payment.requirements)
  if (!settled.success) {
    return {
      ok: false,
      reason: 'PAYMENT_STATUS_UNKNOWN',
    }
  }
  const txHash = settled.transaction || `authorization:${id}`
  const recorded = runtimeDbTransaction(() => {
    const applied = recordFinanceEvent({
      id: `x402:${txHash}`,
      kind: 'x402_cash',
      wallet: payment.wallet,
      reference: txHash,
      cashMicros: Math.round(payment.usdg * 1_000_000),
      detail: { feeReconciled: false, authorizationId: id },
    })
    db.prepare(
      "UPDATE x402_settlement_attempts SET status = 'completed', transaction_ref = ? WHERE environment = ? AND id = ?",
    ).run(txHash, environment, id)
    return applied
  })
  return recorded ? { ok: true, txHash } : { ok: false, reason: 'PAYMENT_ALREADY_USED' }
}

export async function verifyWithMarian(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
): Promise<{ isValid: boolean; payer?: string; invalidReason?: string }> {
  const { ok, status, data } = await facilitatorPost('/verify', {
    x402Version: payload.x402Version ?? 1,
    scheme: payload.scheme,
    network: payload.network,
    payload: payload.payload,
    requirements,
  })
  if (!ok) {
    console.error('[metadata] facilitator verify failed', status)
    return {
      isValid: false,
      invalidReason: 'FACILITATOR_UNAVAILABLE',
    }
  }
  const isValid = Boolean(data.isValid ?? data.valid ?? data.success)
  if (!isValid) {
    console.error('[metadata] facilitator verify rejected payment')
  }
  return {
    isValid,
    payer:
      typeof data.payer === 'string'
        ? data.payer
        : typeof data.wallet === 'string'
          ? data.wallet
          : undefined,
    invalidReason: isValid ? undefined : 'PAYMENT_INVALID',
  }
}

export async function settleWithMarian(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
): Promise<{ success: boolean; transaction?: string; errorReason?: string }> {
  const { ok, status, data } = await facilitatorPost('/settle', {
    x402Version: payload.x402Version ?? 1,
    scheme: payload.scheme,
    network: payload.network,
    payload: payload.payload,
    requirements,
  })
  if (!ok) {
    console.error('[metadata] facilitator settle failed', status)
    return {
      success: false,
      errorReason: 'FACILITATOR_UNAVAILABLE',
    }
  }
  const success = Boolean(data.success ?? data.ok)
  if (!success) console.error('[metadata] facilitator settle rejected payment')
  return {
    success,
    transaction:
      typeof data.transaction === 'string'
        ? data.transaction
        : typeof data.txHash === 'string'
          ? data.txHash
          : undefined,
    errorReason: success ? undefined : 'PAYMENT_INVALID',
  }
}

/**
 * Pay-per-request: settle $0.01 (default) via Marian and unlock this request only.
 * Does not mint a large prepaid balance (that remains Reown/Stripe claim).
 */
export async function tryX402PayPerRequest(opts: {
  headers: Headers
  resource: string
}): Promise<
  { ok: true; wallet: string; txHash: string; usdg: number } | { ok: false; reason: string } | null
> {
  const verified = await verifyX402PayPerRequest(opts)
  if (verified === null || verified.ok === false) return verified
  const settled = await settleVerifiedX402(verified.payment)
  if (!settled.ok) return settled
  return {
    ok: true,
    wallet: verified.payment.wallet,
    txHash: settled.txHash,
    usdg: verified.payment.usdg,
  }
}

/** @deprecated use tryX402PayPerRequest */
export async function tryX402Topup(opts: { headers: Headers; resource: string }) {
  const r = await tryX402PayPerRequest(opts)
  if (r === null) return null
  if (!r.ok) return r
  return {
    ok: true as const,
    wallet: r.wallet,
    credits: 0,
    quote: {
      usdg: r.usdg,
      baseCredits: 0,
      bonusCredits: 0,
      bonusPct: 0,
      totalCredits: 0,
      effectiveCreditsPerUsd: 0,
    },
    txHash: r.txHash,
  }
}
