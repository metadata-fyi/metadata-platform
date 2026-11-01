/**
 * Stripe Checkout for Metadata credit top-ups.
 * Credits mint to the buyer wallet via ledger (idempotent on session id).
 */

import { randomBytes } from 'node:crypto'
import Stripe from 'stripe'
import { claimPack, reverseStripeCredits, setStripeDisputeHold } from './ledger.js'
import {
  configuredStripeMode,
  getPack,
  metadataEnvironment,
  quoteTopup,
  resolveTopupPurchase,
  type StripeMode,
  type TopupQuote,
} from './packs.js'

export function stripeSecretKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim()
  return k || null
}

export function isStripeLive(): boolean {
  return configuredStripeMode() !== null
}

export function getStripe(): Stripe {
  const key = stripeSecretKey()
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  return new Stripe(key, {
    apiVersion: '2026-07-29.dahlia',
    typescript: true,
    timeout: 5000,
    maxNetworkRetries: 0,
  })
}

/** Fail closed when a valid key is attached to the wrong Stripe account. */
export async function assertStripeAccount(stripe: Stripe = getStripe()): Promise<void> {
  const expectedAccountId = process.env.STRIPE_ACCOUNT_ID?.trim()
  if (!expectedAccountId) {
    throw new Error('STRIPE_ACCOUNT_ID is not set')
  }
  const account = await stripe.accounts.retrieve()
  if (account.id !== expectedAccountId) {
    throw new Error('Stripe account does not match STRIPE_ACCOUNT_ID')
  }
}

function checkoutIntegrationIdentifier(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let suffix = ''
  while (suffix.length < 8) {
    for (const value of randomBytes(16)) {
      // 234 is the largest multiple of 26 below 256, avoiding modulo bias.
      if (value < 234) suffix += letters[value % letters.length]
      if (suffix.length === 8) break
    }
  }
  return `metadata-credit-topup-${suffix}`
}

function siteBaseUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    process.env.METADATA_PUBLIC_URL?.replace(/\/$/, '') ||
    'http://127.0.0.1:5177'
  )
}

function apiBaseUrl(): string {
  return (
    process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
    process.env.METADATA_API_PUBLIC_URL?.replace(/\/$/, '') ||
    `http://127.0.0.1:${process.env.PORT ?? 8787}`
  )
}

/**
 * Keep Stripe's browser return paths on the configured Metadata site. The
 * client may choose a page/query string on that origin, but never a different
 * origin (including javascript:, data:, or an attacker-controlled redirect).
 */
export function safeStripeReturnUrl(candidate: string | undefined, fallback: string): string {
  const site = siteBaseUrl()
  try {
    const siteUrl = new URL(site)
    const url = new URL(candidate?.trim() || fallback, siteUrl)
    if (url.origin !== siteUrl.origin || !url.pathname.startsWith('/')) {
      return fallback
    }
    return url.toString()
  } catch {
    return fallback
  }
}

export type CreateCheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; error: string; message: string; status: 400 | 500 | 503 }

export async function createStripeCheckout(opts: {
  packId?: string
  usdg?: number
  wallet: string
  successUrl?: string
  cancelUrl?: string
}): Promise<CreateCheckoutResult> {
  if (!isStripeLive()) {
    return {
      ok: false,
      error: 'STRIPE_DISABLED',
      message:
        'Stripe is not configured for this environment. Set STRIPE_MODE and a matching STRIPE_SECRET_KEY.',
      status: 503,
    }
  }
  if (!opts.wallet?.startsWith('0x') || opts.wallet.length < 10) {
    return {
      ok: false,
      error: 'WALLET_REQUIRED',
      message: 'A connected wallet address is required so credits can be bound after payment.',
      status: 400,
    }
  }

  const quote = resolveTopupPurchase({ packId: opts.packId, usdg: opts.usdg })
  if (!quote) {
    return {
      ok: false,
      error: 'INVALID_AMOUNT',
      message: 'Top-up amount out of range or unknown pack',
      status: 400,
    }
  }

  const unitAmount = Math.round(quote.usdg * 100)
  if (unitAmount < 50) {
    return {
      ok: false,
      error: 'AMOUNT_TOO_SMALL',
      message: 'Top-up must be at least $0.50 for Stripe Checkout',
      status: 400,
    }
  }

  const packId = opts.packId || `topup-${quote.usdg}`
  const site = siteBaseUrl()
  const defaultSuccess = `${site}/pricing.html?stripe=success&session_id={CHECKOUT_SESSION_ID}`
  const defaultCancel = `${site}/pricing.html?stripe=cancel`
  const success = safeStripeReturnUrl(opts.successUrl, defaultSuccess)
  const cancel = safeStripeReturnUrl(opts.cancelUrl, defaultCancel)

  try {
    const stripe = getStripe()
    await assertStripeAccount(stripe)
    const session = await stripe.checkout.sessions.create({
      adaptive_pricing: { enabled: false },
      mode: 'payment',
      integration_identifier: checkoutIntegrationIdentifier(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: `Metadata · $${quote.usdg} credits`,
              description: `${quote.totalCredits.toLocaleString()} API credits (${quote.baseCredits.toLocaleString()} base + ${quote.bonusCredits.toLocaleString()} bonus)`,
              metadata: {
                packId,
                usdg: String(quote.usdg),
              },
            },
          },
        },
      ],
      success_url: success,
      cancel_url: cancel,
      client_reference_id: opts.wallet.toLowerCase(),
      metadata: {
        wallet: opts.wallet.toLowerCase(),
        packId,
        usdg: String(quote.usdg),
        credits: String(quote.totalCredits),
        baseCredits: String(quote.baseCredits),
        bonusCredits: String(quote.bonusCredits),
      },
      payment_intent_data: {
        metadata: {
          wallet: opts.wallet.toLowerCase(),
          packId,
          usdg: String(quote.usdg),
          credits: String(quote.totalCredits),
        },
      },
    })

    if (!session.url) {
      return {
        ok: false,
        error: 'NO_CHECKOUT_URL',
        message: 'Stripe did not return a checkout URL',
        status: 500,
      }
    }

    return { ok: true, url: session.url, sessionId: session.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[metadata] stripe checkout create failed', msg)
    return {
      ok: false,
      error: 'STRIPE_CHECKOUT_FAILED',
      message: 'Checkout could not be created',
      status: 500,
    }
  }
}

function quoteFromSessionMetadata(session: {
  metadata?: Stripe.Metadata | null
}): TopupQuote | null {
  const usdg = Number(session.metadata?.usdg)
  if (Number.isFinite(usdg) && usdg > 0) {
    return quoteTopup(usdg)
  }
  const packId = session.metadata?.packId || ''
  if (packId) {
    const pack = getPack(packId)
    if (pack) return quoteTopup(pack.usdg)
  }
  return null
}

/** Mint ledger credits for a paid Stripe session (idempotent). */
export async function creditFromStripeSession(session: {
  id: string
  payment_status?: string | null
  status?: string | null
  metadata?: Stripe.Metadata | null
  client_reference_id?: string | null
  amount_total?: number | null
  currency?: string | null
  livemode?: boolean
  payment_intent?: string | Stripe.PaymentIntent | null
}): Promise<{
  ok: boolean
  credits?: number
  alreadyClaimed?: boolean
  error?: string
}> {
  const paid = session.payment_status === 'paid'
  if (!paid) {
    return { ok: false, error: 'NOT_PAID' }
  }

  const wallet = (session.metadata?.wallet || session.client_reference_id || '').toLowerCase()
  const quote = quoteFromSessionMetadata(session)
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !quote) {
    return { ok: false, error: 'BAD_METADATA' }
  }

  if (
    session.currency !== 'usd' ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total !== Math.round(quote.usdg * 100)
  ) {
    return { ok: false, error: 'AMOUNT_MISMATCH' }
  }
  if (session.livemode !== (metadataEnvironment() === 'production'))
    return { ok: false, error: 'MODE_MISMATCH' }

  // Always re-quote server-side; ignore client-written credit totals in metadata.
  const packId = session.metadata?.packId || `topup-${quote.usdg}`
  const result = await claimPack({
    wallet,
    packId,
    credits: quote.totalCredits,
    txHash: `stripe:${session.id}`,
    finance: {
      kind: 'cash_topup',
      reference:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || session.id,
      cashMicros: session.amount_total! * 10_000,
      detail: { rail: 'stripe', session: session.id, feeReconciled: false },
    },
  })
  return {
    ok: true,
    credits: result.credits,
    alreadyClaimed: result.alreadyClaimed,
  }
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | undefined,
): Promise<{ ok: true; type: string } | { ok: false; error: string; status: number }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return {
      ok: false,
      error: 'STRIPE_WEBHOOK_SECRET is not set',
      status: 503,
    }
  }
  if (!isStripeLive()) {
    return {
      ok: false,
      error: 'Stripe is not configured for this environment',
      status: 503,
    }
  }
  if (!signature) {
    return { ok: false, error: 'Missing stripe-signature header', status: 400 }
  }

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[metadata] stripe webhook signature failed', msg)
    return { ok: false, error: 'Webhook signature failed', status: 400 }
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const eventSession = event.data.object as Stripe.Checkout.Session
    let session: Stripe.Checkout.Session
    try {
      const stripe = getStripe()
      await assertStripeAccount(stripe)
      // The event payload is signed, but can still come from the wrong Stripe
      // account if webhook configuration is crossed. Retrieve the session
      // with the pinned account key and credit only that account's object.
      session = await stripe.checkout.sessions.retrieve(eventSession.id)
    } catch {
      return {
        ok: false,
        error: 'Stripe event session does not belong to the configured account',
        status: 500,
      }
    }
    const result = await creditFromStripeSession(session)
    if (!result.ok && result.error !== 'NOT_PAID') {
      console.error('[metadata] stripe credit failed', result.error, session.id)
      // A non-2xx response makes Stripe retry the event. Returning 2xx here
      // would permanently acknowledge a paid event that failed to mint.
      return {
        ok: false,
        error: result.error || 'STRIPE_CREDIT_FAILED',
        status: 500,
      }
    } else {
      console.log(
        '[metadata] stripe credited',
        session.id,
        result.alreadyClaimed ? 'already' : 'new',
        result.credits,
      )
    }
  }

  // Re-fetch account-pinned provider objects before changing entitlements.
  if (event.type === 'charge.refunded') {
    try {
      const stripe = getStripe()
      await assertStripeAccount(stripe)
      const charge = await stripe.charges.retrieve((event.data.object as Stripe.Charge).id)
      const paymentIntent =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id
      if (charge.currency !== 'usd' || !paymentIntent)
        return { ok: false, error: 'REFUND_UNMATCHED', status: 500 }
      await reverseStripeCredits({
        paymentIntent,
        cashMicros: charge.amount_refunded * 10_000,
        reference: `${charge.id}:${charge.amount_refunded}`,
      })
    } catch {
      return { ok: false, error: 'REFUND_RECONCILIATION_FAILED', status: 500 }
    }
  }
  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
    try {
      const stripe = getStripe()
      await assertStripeAccount(stripe)
      const dispute = await stripe.disputes.retrieve((event.data.object as Stripe.Dispute).id)
      const intent =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id
      if (!intent) return { ok: false, error: 'DISPUTE_UNMATCHED', status: 500 }
      const won = dispute.status === 'won' || dispute.status === 'warning_closed'
      await setStripeDisputeHold(intent, dispute.id, !won)
      if (dispute.status === 'lost' && dispute.currency === 'usd')
        await reverseStripeCredits({
          paymentIntent: intent,
          cashMicros: dispute.amount * 10_000,
          reference: `dispute:${dispute.id}`,
        })
    } catch {
      return { ok: false, error: 'DISPUTE_RECONCILIATION_FAILED', status: 500 }
    }
  }

  return { ok: true, type: event.type }
}

/** Client return-path helper when webhook is delayed (local dev). */
export async function syncStripeCheckoutSession(sessionId: string): Promise<{
  ok: boolean
  credits?: number
  alreadyClaimed?: boolean
  wallet?: string
  packId?: string
  usdg?: number
  error?: string
  message?: string
}> {
  if (!sessionId.startsWith('cs_')) {
    return { ok: false, error: 'INVALID_SESSION', message: 'Invalid session id' }
  }
  if (!isStripeLive()) {
    return {
      ok: false,
      error: 'STRIPE_DISABLED',
      message: 'Stripe is not configured',
    }
  }
  try {
    const stripe = getStripe()
    await assertStripeAccount(stripe)
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const result = await creditFromStripeSession(session)
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        message:
          result.error === 'NOT_PAID'
            ? 'Payment not completed yet'
            : 'Could not credit top-up from session',
      }
    }
    return {
      ok: true,
      credits: result.credits,
      alreadyClaimed: result.alreadyClaimed,
      wallet: session.metadata?.wallet || session.client_reference_id || undefined,
      packId: session.metadata?.packId || undefined,
      usdg: Number(session.metadata?.usdg) || undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[metadata] stripe sync failed', msg)
    return { ok: false, error: 'STRIPE_SYNC_FAILED', message: 'Could not sync checkout session' }
  }
}

export function stripePublicConfig() {
  const mode: StripeMode | null = configuredStripeMode()
  return {
    enabled: mode !== null,
    mode,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null,
    siteBaseUrl: siteBaseUrl(),
    apiBaseUrl: apiBaseUrl(),
  }
}
