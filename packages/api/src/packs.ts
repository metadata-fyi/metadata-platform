import type { CreditPack, PackId } from './types.js'

/**
 * Configurable credit top-up with a scaled, capped bonus.
 *
 * Env (all optional):
 *   TOPUP_MIN_USD, TOPUP_MAX_USD, TOPUP_STEP_USD
 *   TOPUP_BASE_CREDITS_PER_USD
 *   TOPUP_MAX_BONUS_PCT          (e.g. 0.6 = +60% of base)
 *   TOPUP_BONUS_FULL_AT_USD      (USD where max bonus is reached)
 *   TOPUP_MAX_BONUS_CREDITS      (hard cap on bonus credits)
 *   TOPUP_SUGGESTED_USD          (comma list, e.g. "5,20,50,100")
 */
function envNum(key: string, fallback: number): number {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function envList(key: string, fallback: number[]): number[] {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  const parts = raw
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0)
  return parts.length ? parts : fallback
}

export type TopupConfig = {
  minUsd: number
  maxUsd: number
  stepUsd: number
  baseCreditsPerUsd: number
  /** Max bonus as fraction of base credits (0.6 = +60%). */
  maxBonusPct: number
  /** USD amount at which maxBonusPct is reached (linear from minUsd). */
  bonusFullAtUsd: number
  /** Hard cap on bonus credits (0 = no hard cap beyond pct). */
  maxBonusCredits: number
  suggestedUsd: number[]
}

export type TopupQuote = {
  usdg: number
  baseCredits: number
  bonusCredits: number
  bonusPct: number
  totalCredits: number
  effectiveCreditsPerUsd: number
}

export function getTopupConfig(): TopupConfig {
  const minUsd = Math.max(1, envNum('TOPUP_MIN_USD', 5))
  const maxUsd = Math.max(minUsd, envNum('TOPUP_MAX_USD', 500))
  const stepUsd = Math.max(0.5, envNum('TOPUP_STEP_USD', 1))
  const baseCreditsPerUsd = Math.max(1, Math.floor(envNum('TOPUP_BASE_CREDITS_PER_USD', 1000)))
  const maxBonusPct = Math.min(2, Math.max(0, envNum('TOPUP_MAX_BONUS_PCT', 0)))
  const bonusFullAtUsd = Math.max(minUsd, envNum('TOPUP_BONUS_FULL_AT_USD', 50))
  const maxBonusCredits = Math.max(0, Math.floor(envNum('TOPUP_MAX_BONUS_CREDITS', 100_000)))
  let suggestedUsd = envList('TOPUP_SUGGESTED_USD', [5, 20, 50, 100])
  suggestedUsd = suggestedUsd
    .map((n) => snapUsd(n, minUsd, maxUsd, stepUsd))
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b)
  if (!suggestedUsd.length) suggestedUsd = [minUsd]
  return {
    minUsd,
    maxUsd,
    stepUsd,
    baseCreditsPerUsd,
    maxBonusPct,
    bonusFullAtUsd,
    maxBonusCredits,
    suggestedUsd,
  }
}

export function snapUsd(
  usdg: number,
  minUsd = getTopupConfig().minUsd,
  maxUsd = getTopupConfig().maxUsd,
  stepUsd = getTopupConfig().stepUsd,
): number {
  if (!Number.isFinite(usdg)) return minUsd
  const clamped = Math.min(maxUsd, Math.max(minUsd, usdg))
  const steps = Math.round((clamped - minUsd) / stepUsd)
  const snapped = minUsd + steps * stepUsd
  // Avoid float junk (e.g. 20.0000001)
  const rounded = Math.round(snapped * 100) / 100
  return Math.min(maxUsd, Math.max(minUsd, rounded))
}

/**
 * Linear bonus from 0 at minUsd up to maxBonusPct at bonusFullAtUsd,
 * then hard-capped by maxBonusCredits.
 *
 * Defaults: $5 → 5k, $20 → 20k, $50 → 50k. Bonuses require an explicit, margin-tested configuration.
 */
export function quoteTopup(rawUsd: number, cfg = getTopupConfig()): TopupQuote | null {
  if (!Number.isFinite(rawUsd)) return null
  const usdg = snapUsd(rawUsd, cfg.minUsd, cfg.maxUsd, cfg.stepUsd)
  if (usdg < cfg.minUsd || usdg > cfg.maxUsd) return null

  const baseCredits = Math.floor(usdg * cfg.baseCreditsPerUsd)

  const span = Math.max(cfg.bonusFullAtUsd - cfg.minUsd, 0.0001)
  const t = Math.min(1, Math.max(0, (usdg - cfg.minUsd) / span))
  // basis points avoid float floor quirks (e.g. 20000 * 0.2 → 3999.999…)
  const bonusBps = Math.round(cfg.maxBonusPct * t * 10_000)
  const bonusPct = bonusBps / 10_000
  let bonusCredits = Math.floor((baseCredits * bonusBps) / 10_000)
  if (cfg.maxBonusCredits > 0) {
    bonusCredits = Math.min(bonusCredits, cfg.maxBonusCredits)
  }
  const totalCredits = baseCredits + bonusCredits
  return {
    usdg,
    baseCredits,
    bonusCredits,
    bonusPct,
    totalCredits,
    effectiveCreditsPerUsd: usdg > 0 ? Math.round((totalCredits / usdg) * 100) / 100 : 0,
  }
}

/** Suggested amounts as pack-shaped cards for API compat / UI chips. */
export function suggestedTopups(cfg = getTopupConfig()): CreditPack[] {
  const labels: Record<number, string> = {
    5: 'Starter',
    20: 'Builder',
    50: 'Scale',
    100: 'Bulk',
  }
  return cfg.suggestedUsd.map((usdg, i) => {
    const q = quoteTopup(usdg, cfg)!
    return {
      id: `topup-${usdg}` as PackId,
      name: labels[usdg] || `$${usdg}`,
      credits: q.totalCredits,
      usdg: q.usdg,
      highlight: usdg === 20 || i === 1,
    }
  })
}

/** @deprecated Prefer quoteTopup — kept for older clients / docs. */
export const CREDIT_PACKS: CreditPack[] = suggestedTopups()

export function getPack(id: string): CreditPack | undefined {
  // Dynamic topup-N ids
  const m = /^topup-(\d+(?:\.\d+)?)$/i.exec(id)
  if (m) {
    const q = quoteTopup(Number(m[1]))
    if (!q) return undefined
    return {
      id: id as PackId,
      name: `Top-up $${q.usdg}`,
      credits: q.totalCredits,
      usdg: q.usdg,
    }
  }
  // Legacy fixed ids
  const legacy: Record<string, number> = {
    starter: 5,
    builder: 20,
    scale: 50,
  }
  if (legacy[id] != null) {
    const q = quoteTopup(legacy[id])
    if (!q) return undefined
    return {
      id: id as PackId,
      name: id === 'starter' ? 'Starter' : id === 'builder' ? 'Builder' : 'Scale',
      credits: q.totalCredits,
      usdg: q.usdg,
      highlight: id === 'builder',
    }
  }
  return suggestedTopups().find((p) => p.id === id)
}

/**
 * Resolve a purchase amount from packId and/or usdg.
 * Always re-quotes server-side so clients cannot invent credit totals.
 */
export function resolveTopupPurchase(opts: { packId?: string; usdg?: number }): TopupQuote | null {
  if (opts.usdg != null && Number.isFinite(opts.usdg)) {
    return quoteTopup(opts.usdg)
  }
  if (opts.packId) {
    const pack = getPack(opts.packId)
    if (pack) return quoteTopup(pack.usdg)
  }
  return null
}

export type MetadataEnvironment = 'development' | 'staging' | 'production'

/**
 * Environment is explicit for staging and inferred for local/prod runtimes.
 * This keeps production on Robinhood mainnet and all non-production on the
 * testnet by default, even when a staging server runs with NODE_ENV=production.
 */
export function metadataEnvironment(): MetadataEnvironment {
  const configured = process.env.METADATA_ENV?.trim().toLowerCase()
  if (configured === 'development' || configured === 'staging' || configured === 'production') {
    return configured
  }
  if (configured) {
    throw new Error('METADATA_ENV must be development, staging, or production')
  }
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

const MAINNET_USDG = {
  chainId: 4663,
  network: 'eip155:4663',
  address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as const,
  decimals: 6,
  symbol: 'USDG',
  name: 'Global Dollar',
}

const TESTNET_USDG = {
  chainId: 46630,
  network: 'eip155:46630',
  // Paxos publishes this Robinhood testnet token address in its test-network docs.
  address: '0x7E955252E15c84f5768B83c41a71F9eba181802F' as const,
  decimals: 6,
  symbol: 'USDG',
  name: 'Global Dollar',
}

export function paymentAssetForEnvironment(environment: MetadataEnvironment) {
  return environment === 'production' ? MAINNET_USDG : TESTNET_USDG
}

// Resolved once at process start so the API cannot switch chains mid-payment.
export const ROBINHOOD_USDG = paymentAssetForEnvironment(metadataEnvironment())

export function usdgToAtomic(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** ROBINHOOD_USDG.decimals))
}

export function atomicToUsdg(atomic: bigint): number {
  return Number(atomic) / 10 ** ROBINHOOD_USDG.decimals
}

/** Checkout rails — crypto live; Stripe reserved for card/fiat. */
export type PaymentMethodId = 'reown' | 'stripe'

export type PaymentMethod = {
  id: PaymentMethodId
  name: string
  status: 'live' | 'coming_soon'
  description: string
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'reown',
    name: 'Reown Pay',
    status: 'live',
    description: 'USDG on Robinhood Chain · wallet checkout · auto-claim',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    status: 'coming_soon',
    description: 'Card / fiat checkout · credits credited to your wallet address',
  },
]

export type StripeMode = 'test' | 'live'

/**
 * Enable Stripe only when environment, declared mode, and key prefix agree.
 * STRIPE_ENABLED can disable the integration, but cannot bypass these checks.
 */
export function configuredStripeMode(): StripeMode | null {
  const enabled = process.env.STRIPE_ENABLED?.trim().toLowerCase()
  if (enabled && enabled !== '1' && enabled !== 'true') return null

  const configuredMode = process.env.STRIPE_MODE?.trim().toLowerCase()
  if (configuredMode !== 'test' && configuredMode !== 'live') return null
  const expectedMode: StripeMode = metadataEnvironment() === 'production' ? 'live' : 'test'
  if (configuredMode !== expectedMode) return null

  // A mode-correct key can still belong to the wrong Stripe account. Require
  // an explicit account pin so an accidentally selected CLI profile cannot
  // route checkout to another merchant.
  if (!/^acct_[A-Za-z0-9]+$/.test(process.env.STRIPE_ACCOUNT_ID?.trim() || '')) return null

  const key = process.env.STRIPE_SECRET_KEY?.trim() || ''
  const keyMode =
    key.startsWith('sk_test_') || key.startsWith('rk_test_') || key.startsWith('rkcs_test_')
      ? 'test'
      : key.startsWith('sk_live_') || key.startsWith('rk_live_')
        ? 'live'
        : null
  return keyMode === configuredMode ? configuredMode : null
}

/** Stripe is available only after the mode + key guard passes. */
export function isStripeEnabled(): boolean {
  return configuredStripeMode() !== null
}

export type { PackId }
