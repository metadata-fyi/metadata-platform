/**
 * Prepaid credit ledger in SQLite (DATA_DIR/runtime.sqlite).
 * Single-process origin. JSON ledger.json is imported once if present.
 */
import { recordFinanceEvent, walletHeld, type FinanceEvent } from './finance.js'
import { metadataEnvironment } from './packs.js'
import { getRuntimeDb, runtimeDbTransaction } from './runtime-db.js'
import { commitCatalogUsage, type CatalogUsage } from './catalog-policy.js'

export type LedgerFile = {
  version: 1
  claimedTx: Record<string, { wallet: string; packId: string; at: string }>
  wallets: Record<string, { credits: number }>
}

let mutex: Promise<void> = Promise.resolve()

function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn)
  mutex = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function creditsOf(wallet: string): number {
  const row = getRuntimeDb().prepare('SELECT credits FROM wallets WHERE wallet = ?').get(wallet) as
    | { credits: number }
    | undefined
  return row?.credits ?? 0
}

function setCredits(
  wallet: string,
  credits: number,
  kind = 'credit_adjustment',
  reference?: string,
) {
  if (!Number.isSafeInteger(credits)) throw new Error('Invalid credit balance')
  const delta = credits - creditsOf(wallet)
  if (delta !== 0) recordFinanceEvent({ kind, wallet, creditDelta: delta, reference })
  getRuntimeDb()
    .prepare('INSERT OR REPLACE INTO wallets(wallet, credits) VALUES (?, ?)')
    .run(wallet, credits)
}

function claimRow(tx: string) {
  return getRuntimeDb()
    .prepare('SELECT wallet, pack_id, at FROM claimed_tx WHERE tx = ?')
    .get(tx) as { wallet: string; pack_id: string; at: string } | undefined
}

function insertClaim(tx: string, wallet: string, packId: string) {
  getRuntimeDb()
    .prepare('INSERT INTO claimed_tx(tx, wallet, pack_id, at) VALUES (?, ?, ?, ?)')
    .run(tx, wallet, packId, new Date().toISOString())
}

export async function getBalance(wallet: string): Promise<number> {
  return withLock(() => creditsOf(wallet.toLowerCase()))
}

export async function claimPack(opts: {
  wallet: string
  packId: string
  credits: number
  txHash: string
  finance?: Omit<FinanceEvent, 'id' | 'creditDelta' | 'wallet'>
}): Promise<{ credits: number; alreadyClaimed: boolean }> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      const w = opts.wallet.toLowerCase()
      const tx = opts.txHash.toLowerCase()
      if (claimRow(tx)) return { credits: 0, alreadyClaimed: true }
      if (!Number.isSafeInteger(opts.credits) || opts.credits < 0)
        throw new Error('Invalid credit mint')
      insertClaim(tx, w, opts.packId)
      if (opts.finance)
        recordFinanceEvent({
          ...opts.finance,
          id: `cash:${tx}`,
          wallet: w,
          detail: { ...opts.finance.detail, creditsGranted: opts.credits },
        })
      const next = creditsOf(w) + opts.credits
      setCredits(w, next, 'credit_mint', tx)
      if (opts.finance?.kind === 'cash_topup' && opts.finance.reference)
        reconcilePendingStripeEntitlements(opts.finance.reference)
      return { credits: creditsOf(w), alreadyClaimed: false }
    }),
  )
}

export async function spendCredits(
  wallet: string,
  amount: number,
): Promise<{ ok: true; credits: number } | { ok: false; credits: number }> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid credit spend')
      const w = wallet.toLowerCase()
      const cur = creditsOf(w)
      if (walletHeld(w) || cur < amount) return { ok: false as const, credits: cur }
      const next = cur - amount
      setCredits(w, next, 'credit_spend')
      return { ok: true as const, credits: next }
    }),
  )
}

/** Debit returned data and its daily quota atomically before releasing it. */
export async function settleCatalogAccess(opts: {
  usage: CatalogUsage
  wallet?: string | null
  cost: number
  publisher?: { wallet: string | null; share: number; payoutKey: string }
}): Promise<
  { ok: true; credits: number | null } | { ok: false; reason: 'INSUFFICIENT' | 'DAILY_QUOTA' }
> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      if (!Number.isSafeInteger(opts.cost) || opts.cost < 0) throw new Error('Invalid catalog cost')
      const wallet = opts.wallet?.toLowerCase() || null
      const balance = wallet ? creditsOf(wallet) : 0
      if (opts.cost > 0 && (!wallet || walletHeld(wallet) || balance < opts.cost))
        return { ok: false as const, reason: 'INSUFFICIENT' as const }
      if (!commitCatalogUsage(opts.usage, opts.cost))
        return { ok: false as const, reason: 'DAILY_QUOTA' as const }
      if (wallet && opts.cost > 0) setCredits(wallet, balance - opts.cost, 'catalog_spend')
      const publisher = opts.publisher
      if (
        wallet &&
        opts.cost > 0 &&
        publisher?.wallet &&
        publisher.share > 0 &&
        !claimRow(publisher.payoutKey)
      ) {
        const recipient = publisher.wallet.toLowerCase()
        if (!Number.isSafeInteger(publisher.share) || publisher.share > opts.cost)
          throw new Error('Invalid publisher share')
        setCredits(
          recipient,
          creditsOf(recipient) + publisher.share,
          'publisher_credit',
          publisher.payoutKey,
        )
        insertClaim(publisher.payoutKey, recipient, 'dataset-export')
      }
      return { ok: true as const, credits: wallet ? creditsOf(wallet) : null }
    }),
  )
}

/** A verified cumulative refund reclaims proportional credits, including
 * already spent credits as debt. Older/replayed provider events are no-ops. */
export async function reverseStripeCredits(opts: {
  paymentIntent: string
  cashMicros: number
  reference: string
}): Promise<{ applied: boolean; matched: boolean }> {
  return withLock(() => runtimeDbTransaction(() => reverseStripeCreditsNow(opts)))
}

function reverseStripeCreditsNow(opts: {
  paymentIntent: string
  cashMicros: number
  reference: string
}): { applied: boolean; matched: boolean } {
  if (!Number.isSafeInteger(opts.cashMicros) || opts.cashMicros <= 0)
    throw new Error('Invalid refund')
  const db = getRuntimeDb()
  const original = db
    .prepare(
      "SELECT wallet, cash_micros, detail_json FROM finance_events WHERE kind = 'cash_topup' AND reference = ? AND environment = ? LIMIT 1",
    )
    .get(opts.paymentIntent, metadataEnvironment()) as
    | { wallet: string; cash_micros: number; detail_json: string }
    | undefined
  if (!original) {
    queueStripeEntitlement(opts.paymentIntent, `refund:${opts.reference}`, 'refund', opts)
    const applied = recordFinanceEvent({
      id: `unmatched:${opts.reference}`,
      kind: 'unmatched_refund',
      reference: opts.paymentIntent,
      detail: { cumulativeCashMicros: opts.cashMicros },
    })
    return { applied, matched: false }
  }
  const reversed = (
    db
      .prepare(
        "SELECT COALESCE(-SUM(cash_micros), 0) AS n FROM finance_events WHERE kind = 'cash_refund' AND reference = ? AND environment = ?",
      )
      .get(opts.paymentIntent, metadataEnvironment()) as { n: number }
  ).n
  const cumulative = Math.min(opts.cashMicros, original.cash_micros)
  if (cumulative <= reversed) return { applied: false, matched: true }
  const minted = Number(JSON.parse(original.detail_json).creditsGranted)
  if (!Number.isSafeInteger(minted) || minted < 0) throw new Error('Missing original credit grant')
  const before = Math.ceil((minted * reversed) / original.cash_micros)
  const after = Math.ceil((minted * cumulative) / original.cash_micros)
  recordFinanceEvent({
    id: `refund:${opts.reference}`,
    kind: 'cash_refund',
    wallet: original.wallet,
    reference: opts.paymentIntent,
    cashMicros: -(cumulative - reversed),
  })
  setCredits(
    original.wallet,
    creditsOf(original.wallet) - (after - before),
    'refund_credit_reversal',
    opts.paymentIntent,
  )
  return { applied: true, matched: true }
}

export async function setStripeDisputeHold(
  paymentIntent: string,
  disputeId: string,
  held: boolean,
): Promise<boolean> {
  return withLock(() =>
    runtimeDbTransaction(() => setStripeDisputeHoldNow(paymentIntent, disputeId, held)),
  )
}

function setStripeDisputeHoldNow(paymentIntent: string, disputeId: string, held: boolean): boolean {
  const db = getRuntimeDb()
  const row = db
    .prepare(
      "SELECT wallet FROM finance_events WHERE kind = 'cash_topup' AND reference = ? AND environment = ? LIMIT 1",
    )
    .get(paymentIntent, metadataEnvironment()) as { wallet: string } | undefined
  recordFinanceEvent({
    id: `dispute:${disputeId}:${held}`,
    kind: held ? 'dispute_opened' : 'dispute_released',
    wallet: row?.wallet,
    reference: paymentIntent,
  })
  if (!row) {
    queueStripeEntitlement(paymentIntent, `dispute:${disputeId}`, 'dispute', {
      paymentIntent,
      disputeId,
      held,
    })
    return false
  }
  if (held)
    db.prepare('INSERT OR IGNORE INTO wallet_holds(wallet, reason) VALUES (?, ?)').run(
      row.wallet,
      disputeId,
    )
  else
    db.prepare('DELETE FROM wallet_holds WHERE wallet = ? AND reason = ?').run(
      row.wallet,
      disputeId,
    )
  return true
}

function queueStripeEntitlement(
  paymentIntent: string,
  key: string,
  kind: string,
  payload: unknown,
) {
  getRuntimeDb()
    .prepare(`INSERT INTO stripe_pending_entitlements
    (environment, payment_intent, event_key, kind, payload_json) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(environment, event_key) DO UPDATE SET payload_json = excluded.payload_json`)
    .run(metadataEnvironment(), paymentIntent, key, kind, JSON.stringify(payload))
}

/** Runs in the topup transaction, so a late grant cannot expose reversed funds. */
function reconcilePendingStripeEntitlements(paymentIntent: string) {
  const db = getRuntimeDb()
  const environment = metadataEnvironment()
  const rows = db
    .prepare(`SELECT event_key, kind, payload_json FROM stripe_pending_entitlements
    WHERE environment = ? AND payment_intent = ?`)
    .all(environment, paymentIntent) as Array<{
    event_key: string
    kind: string
    payload_json: string
  }>
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json)
    const matched =
      row.kind === 'refund'
        ? reverseStripeCreditsNow(payload).matched
        : setStripeDisputeHoldNow(payload.paymentIntent, payload.disputeId, payload.held)
    if (matched)
      db.prepare(
        'DELETE FROM stripe_pending_entitlements WHERE environment = ? AND event_key = ?',
      ).run(environment, row.event_key)
  }
}

export async function settleDatasetExport(opts: {
  consumerWallet: string
  publisherWallet?: string | null
  cost: number
  publisherShare: number
  payoutKey: string
}): Promise<
  | {
      ok: true
      consumerCredits: number
      publisherCredits: number | null
      publisherApplied: boolean
    }
  | { ok: false; reason: 'INSUFFICIENT' }
> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      const consumer = opts.consumerWallet.toLowerCase()
      const publisher = opts.publisherWallet?.toLowerCase() || null
      const cost = Math.floor(opts.cost)
      const share = Math.floor(opts.publisherShare)
      const payoutKey = opts.payoutKey.toLowerCase()
      if (!consumer || !Number.isFinite(cost) || cost <= 0) {
        throw new Error('dataset export cost must be a positive integer')
      }
      if (!Number.isFinite(share) || share < 0 || !payoutKey) {
        throw new Error('dataset export settlement inputs are invalid')
      }
      const consumerCredits = creditsOf(consumer)
      if (consumerCredits < cost) return { ok: false as const, reason: 'INSUFFICIENT' as const }
      const publisherApplied = Boolean(publisher && share > 0 && !claimRow(payoutKey))
      const nextConsumerCredits = consumerCredits - cost
      let publisherCredits: number | null = null
      if (publisherApplied && publisher === consumer) {
        publisherCredits = nextConsumerCredits + share
        setCredits(consumer, publisherCredits)
        insertClaim(payoutKey, publisher, 'dataset-export')
      } else {
        setCredits(consumer, nextConsumerCredits)
        if (publisher) publisherCredits = creditsOf(publisher)
        if (publisherApplied && publisher) {
          publisherCredits = (publisherCredits ?? 0) + share
          setCredits(publisher, publisherCredits)
          insertClaim(payoutKey, publisher, 'dataset-export')
        }
      }
      return {
        ok: true as const,
        consumerCredits: creditsOf(consumer),
        publisherCredits,
        publisherApplied,
      }
    }),
  )
}

export async function creditWallet(opts: {
  wallet: string
  credits: number
  idempotencyKey: string
}): Promise<{ credits: number; alreadyApplied: boolean }> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      const w = opts.wallet.toLowerCase()
      const key = opts.idempotencyKey.toLowerCase()
      const amount = Math.floor(opts.credits)
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('credits must be a non-negative integer')
      }
      if (claimRow(key)) return { credits: 0, alreadyApplied: true }
      insertClaim(key, w, 'credit')
      const next = creditsOf(w) + amount
      setCredits(w, next, 'credit_grant', key)
      return { credits: next, alreadyApplied: false }
    }),
  )
}

export async function transferCredits(opts: {
  from: string
  to: string
  amount: number
  idempotencyKey: string
}): Promise<
  | { ok: true; fromCredits: number; toCredits: number }
  | { ok: false; reason: 'INSUFFICIENT' | 'ALREADY_APPLIED' }
> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      const from = opts.from.toLowerCase()
      const to = opts.to.toLowerCase()
      const key = opts.idempotencyKey.toLowerCase()
      const amount = Math.floor(opts.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false as const, reason: 'INSUFFICIENT' as const }
      }
      if (claimRow(key)) return { ok: false as const, reason: 'ALREADY_APPLIED' as const }
      const fromCur = creditsOf(from)
      if (from === to) return { ok: false as const, reason: 'ALREADY_APPLIED' as const }
      if (walletHeld(from) || fromCur < amount)
        return { ok: false as const, reason: 'INSUFFICIENT' as const }
      const toCur = creditsOf(to)
      setCredits(from, fromCur - amount, 'credit_transfer_out', key)
      setCredits(to, toCur + amount, 'credit_transfer_in', key)
      insertClaim(key, from, 'transfer')
      return {
        ok: true as const,
        fromCredits: creditsOf(from),
        toCredits: creditsOf(to),
      }
    }),
  )
}

export async function deleteWalletAccount(wallet: string): Promise<{
  ok: true
  removedCredits: number
  removedClaims: number
}> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      const w = wallet.toLowerCase()
      const removedCredits = creditsOf(w)
      if (removedCredits < 0 || walletHeld(w))
        throw new Error('Account has unresolved payment risk')
      const database = getRuntimeDb()
      setCredits(w, 0, 'account_credit_forfeit')
      database.prepare('DELETE FROM wallets WHERE wallet = ?').run(w)
      database.prepare('DELETE FROM wallet_sessions WHERE wallet = ?').run(w)
      database.prepare('DELETE FROM wallet_nonces WHERE wallet = ?').run(w)
      return { ok: true as const, removedCredits, removedClaims: 0 }
    }),
  )
}

export async function getLedgerPublicStats(): Promise<{
  walletsWithCredits: number
  walletsTracked: number
  totalCredits: number
  totalClaims: number
  claimsByPack: { key: string; count: number }[]
}> {
  return withLock(() => {
    const database = getRuntimeDb()
    const wallets = database.prepare('SELECT credits FROM wallets').all() as Array<{
      credits: number
    }>
    let walletsWithCredits = 0
    let totalCredits = 0
    for (const row of wallets) {
      if (row.credits > 0) {
        walletsWithCredits++
        totalCredits += row.credits
      }
    }
    const packs = database
      .prepare(
        'SELECT pack_id AS key, COUNT(*) AS count FROM claimed_tx GROUP BY pack_id ORDER BY count DESC LIMIT 12',
      )
      .all() as Array<{ key: string; count: number }>
    const totalClaims = (
      database.prepare('SELECT COUNT(*) AS n FROM claimed_tx').get() as { n: number }
    ).n
    return {
      walletsWithCredits,
      walletsTracked: wallets.length,
      totalCredits,
      totalClaims,
      claimsByPack: packs,
    }
  })
}

export async function getWalletAccountSummary(wallet: string): Promise<{
  wallet: string
  credits: number
  claimCount: number
  claims: { txHash: string; packId: string; at: string }[]
}> {
  return withLock(() => {
    const w = wallet.toLowerCase()
    const credits = creditsOf(w)
    const claims = getRuntimeDb()
      .prepare(
        'SELECT tx AS txHash, pack_id AS packId, at FROM claimed_tx WHERE wallet = ? ORDER BY at DESC LIMIT 40',
      )
      .all(w) as Array<{ txHash: string; packId: string; at: string }>
    return { wallet: w, credits, claimCount: claims.length, claims }
  })
}
