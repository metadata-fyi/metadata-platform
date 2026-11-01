import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getTopupConfig, metadataEnvironment } from './packs.js'
import { catalogPolicy, catalogUsageReport } from './catalog-policy.js'
import { getRuntimeDb } from './runtime-db.js'

export type FinanceEvent = {
  id?: string
  kind: string
  wallet?: string | null
  reference?: string | null
  cashMicros?: number
  creditDelta?: number
  environment?: string
  detail?: Record<string, string | number | boolean | null>
}

/** Append inside the caller's money transaction. Corrections use new events. */
export function recordFinanceEvent(event: FinanceEvent): boolean {
  const cash = event.cashMicros ?? 0
  const credits = event.creditDelta ?? 0
  if (!Number.isSafeInteger(cash) || !Number.isSafeInteger(credits))
    throw new Error('Invalid finance amount')
  return (
    getRuntimeDb()
      .prepare(`INSERT OR IGNORE INTO finance_events
    (id, at, kind, environment, wallet, reference, cash_micros, credit_delta, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        event.id ?? randomUUID(),
        new Date().toISOString(),
        event.kind,
        event.environment ?? metadataEnvironment(),
        event.wallet ?? null,
        event.reference ?? null,
        cash,
        credits,
        JSON.stringify(event.detail ?? {}),
      ).changes > 0
  )
}

export function walletHeld(wallet: string): boolean {
  return Boolean(
    getRuntimeDb()
      .prepare('SELECT 1 FROM wallet_holds WHERE wallet = ? LIMIT 1')
      .get(wallet.toLowerCase()),
  )
}

export type FinanceConfig = {
  version: 1
  currency: 'USD'
  checkedAt: string
  costs: Array<{ id: string; monthlyUsd: number; status: 'estimate' | 'confirmed'; source: string }>
  payment: {
    stripePercent: number
    stripeFixedUsd: number
    averageTopupUsd: number
    refundReservePct: number
  }
  variable: {
    perUnitUsd: number | null
    egressPerGbUsd: number
    includedEgressGb: number
    x402PerRequestUsd: number | null
  }
  targetMargin: number
  monthlyPaidUnits: number
  monthlyServiceUnits: number
}

export function loadFinanceConfig(): FinanceConfig {
  const file = process.env.FINANCE_CONFIG_FILE || path.resolve(process.cwd(), 'finance/config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as FinanceConfig
  if (
    config.version !== 1 ||
    config.currency !== 'USD' ||
    !Array.isArray(config.costs) ||
    !config.costs.length
  )
    throw new Error('Invalid finance config')
  for (const item of config.costs) {
    if (
      !item.id ||
      !Number.isFinite(item.monthlyUsd) ||
      item.monthlyUsd < 0 ||
      !['estimate', 'confirmed'].includes(item.status) ||
      !item.source
    )
      throw new Error('Invalid cost entry')
  }
  const nonnegative = [
    config.payment.stripePercent,
    config.payment.stripeFixedUsd,
    config.payment.refundReservePct,
    config.variable.egressPerGbUsd,
    config.variable.includedEgressGb,
    config.monthlyPaidUnits,
    config.monthlyServiceUnits,
  ]
  if (
    nonnegative.some((value) => !Number.isFinite(value) || value < 0) ||
    !Number.isFinite(config.payment.averageTopupUsd) ||
    config.payment.averageTopupUsd < getTopupConfig().minUsd ||
    !Number.isFinite(config.targetMargin) ||
    config.targetMargin <= 0 ||
    config.targetMargin >= 1 ||
    config.payment.stripePercent + config.payment.refundReservePct >= 1
  )
    throw new Error('Invalid finance assumptions')
  for (const value of [config.variable.perUnitUsd, config.variable.x402PerRequestUsd]) {
    if (value !== null && (!Number.isFinite(value) || value < 0))
      throw new Error('Invalid variable cost')
  }
  return config
}

export function economics(config: FinanceConfig) {
  const topup = getTopupConfig()
  const policy = catalogPolicy()
  const fixed = config.costs.reduce((sum, row) => sum + row.monthlyUsd, 0)
  // Use the maximum configured bonus, and charge egress from the first byte
  // for a conservative floor instead of assuming shared allowances remain.
  const grossPerUnit = policy.creditsPerUnit / (topup.baseCreditsPerUsd * (1 + topup.maxBonusPct))
  const fees =
    config.payment.stripePercent +
    config.payment.stripeFixedUsd / config.payment.averageTopupUsd +
    config.payment.refundReservePct
  const bytesPerUnit = policy.bytesPerUnit
  const bandwidthPerUnit = (bytesPerUnit / 1_000_000_000) * config.variable.egressPerGbUsd
  const variableKnown = config.variable.perUnitUsd !== null
  const variablePerUnit = (config.variable.perUnitUsd ?? 0) + bandwidthPerUnit
  const contribution = grossPerUnit * (1 - fees) - variablePerUnit
  const serviceCost = config.monthlyServiceUnits * variablePerUnit
  const breakEvenUnits = contribution > 0 ? Math.ceil((fixed + serviceCost) / contribution) : null
  const projectedGross = config.monthlyPaidUnits * grossPerUnit
  const projectedProfit = config.monthlyPaidUnits * contribution - fixed - serviceCost
  const targetGrossPerUnit =
    config.monthlyPaidUnits > 0 && 1 - fees - config.targetMargin > 0
      ? ((fixed + serviceCost) / config.monthlyPaidUnits + variablePerUnit) /
        (1 - fees - config.targetMargin)
      : null
  const targetCreditsPerUnit =
    targetGrossPerUnit !== null && targetGrossPerUnit > 0
      ? Math.ceil(targetGrossPerUnit * topup.baseCreditsPerUsd * (1 + topup.maxBonusPct))
      : null
  return {
    fixedMonthlyUsd: fixed,
    grossPerUnitUsd: grossPerUnit,
    feeAndReserveFraction: fees,
    variablePerUnitUsd: variablePerUnit,
    variableCostMeasured: variableKnown,
    breakEvenUnits,
    projectedGrossUsd: projectedGross,
    projectedOperatingProfitUsd: projectedProfit,
    targetCreditsPerUnit,
    caveats: [
      'Forecast assumes credits are consumed; top-up cash is tracked separately.',
      'Support, taxes, domain renewal, and agent/API spending must be entered when known.',
      ...(variableKnown
        ? []
        : ['Origin compute/data refresh unit cost is unmeasured; profit is provisional.']),
    ],
  }
}

export function financeReport(config = loadFinanceConfig()) {
  const db = getRuntimeDb()
  const environment = metadataEnvironment()
  const journalCredits = (
    db.prepare('SELECT COALESCE(SUM(credit_delta), 0) AS n FROM finance_events').get() as {
      n: number
    }
  ).n
  const walletCredits = (
    db.prepare('SELECT COALESCE(SUM(credits), 0) AS n FROM wallets').get() as { n: number }
  ).n
  const months = db
    .prepare(`SELECT substr(at, 1, 7) AS month, kind,
    SUM(cash_micros) / 1000000.0 AS cashUsd, SUM(credit_delta) AS credits, COUNT(*) AS events
    FROM finance_events WHERE environment = ? GROUP BY month, kind ORDER BY month DESC, kind`)
    .all(environment)
  const debt = (
    db.prepare('SELECT COALESCE(-SUM(credits), 0) AS n FROM wallets WHERE credits < 0').get() as {
      n: number
    }
  ).n
  const holdings = (
    db.prepare('SELECT COALESCE(SUM(credits), 0) AS n FROM wallets WHERE credits > 0').get() as {
      n: number
    }
  ).n
  return {
    at: new Date().toISOString(),
    environment,
    config,
    economics: economics(config),
    months,
    reconciliation: {
      journalCredits,
      walletCredits,
      difference: walletCredits - journalCredits,
      ok: walletCredits === journalCredits,
    },
    outstandingCredits: holdings,
    debtCredits: debt,
    unpricedLegacyCredits: (
      db
        .prepare(
          "SELECT COALESCE(SUM(credit_delta), 0) AS n FROM finance_events WHERE kind = 'opening_balance'",
        )
        .get() as { n: number }
    ).n,
    heldWallets: (
      db.prepare('SELECT COUNT(DISTINCT wallet) AS n FROM wallet_holds').get() as { n: number }
    ).n,
    usage: catalogUsageReport(),
    accountingNote:
      'Cash movements and credit movements are exact journal entries. Usage value and profit are estimates, not tax accounts or bank reconciliation.',
  }
}
