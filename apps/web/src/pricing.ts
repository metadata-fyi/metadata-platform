import './style.css'
import type { PaymentAsset } from '@reown/appkit-pay'
import { escapeHtml, getJson, postJson, resolveApiBase } from './api'
import { icon } from './icons'
import { metadataEnvironment, paymentNetwork, robinhoodRpcUrl } from './payment-env'
import { type PaymentApiState, paymentActionEnabled } from './payment-readiness'
import { bindShellWallet, bootShellChrome, shellHtml } from './shell'
import {
  connectWallet,
  ensureAppKitReady,
  ensureWalletSession,
  getWalletHeader,
  getWalletState,
  hasReownProjectId,
  toggleWallet,
} from './wallet'

const apiBase = resolveApiBase()

/** Subtle shake on the right rail only (not the whole page) */
function shakeScreen() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const rail =
    document.getElementById('portal-rail') ??
    document.querySelector<HTMLElement>('.shell > .preview')
  if (!rail) return
  rail.classList.remove('is-shaking')
  void rail.offsetWidth
  rail.classList.add('is-shaking')
  window.setTimeout(() => rail.classList.remove('is-shaking'), 400)
}

type TopupConfig = {
  minUsd: number
  maxUsd: number
  stepUsd: number
  baseCreditsPerUsd: number
  maxBonusPct: number
  bonusFullAtUsd: number
  maxBonusCredits: number
  suggestedUsd: number[]
}

type TopupQuote = {
  usdg: number
  baseCredits: number
  bonusCredits: number
  bonusPct: number
  totalCredits: number
  effectiveCreditsPerUsd: number
}

type Pack = {
  id: string
  name: string
  credits: number
  usdg: number
  highlight?: boolean
}

type PayMethod = {
  id: string
  name: string
  status: 'live' | 'coming_soon'
  description: string
}

type PacksResponse = {
  environment?: string
  packs: Pack[]
  topup?: TopupConfig
  treasury: string | null
  asset?: {
    chainId?: number
    network?: string
    address?: string
    decimals?: number
    symbol?: string
    name?: string
  }
  methods?: PayMethod[]
  stripe?: { enabled?: boolean; mode?: 'test' | 'live' | null; publishableKey?: string | null }
  subscription?: { status?: string; note?: string }
}

function isPacksResponse(value: unknown): value is PacksResponse {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<PacksResponse>
  return Array.isArray(data.packs) && (data.treasury === null || typeof data.treasury === 'string')
}

function extractTxHash(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  if (typeof r.result === 'string' && r.result.startsWith('0x')) return r.result
  if (typeof r.txHash === 'string') return r.txHash
  if (typeof r.hash === 'string') return r.hash
  if (r.result && typeof r.result === 'object') {
    const inner = r.result as Record<string, unknown>
    if (typeof inner.txHash === 'string') return inner.txHash
    if (typeof inner.hash === 'string') return inner.hash
  }
  return null
}

/** Client-side quote mirror of packages/api packs.quoteTopup (server always re-quotes). */
function quoteLocal(usdg: number, cfg: TopupConfig): TopupQuote | null {
  if (!Number.isFinite(usdg)) return null
  const clamped = Math.min(cfg.maxUsd, Math.max(cfg.minUsd, usdg))
  const steps = Math.round((clamped - cfg.minUsd) / cfg.stepUsd)
  const amount = Math.round((cfg.minUsd + steps * cfg.stepUsd) * 100) / 100
  if (amount < cfg.minUsd || amount > cfg.maxUsd) return null
  const baseCredits = Math.floor(amount * cfg.baseCreditsPerUsd)
  const span = Math.max(cfg.bonusFullAtUsd - cfg.minUsd, 0.0001)
  const t = Math.min(1, Math.max(0, (amount - cfg.minUsd) / span))
  const bonusBps = Math.round(cfg.maxBonusPct * t * 10_000)
  const bonusPct = bonusBps / 10_000
  let bonusCredits = Math.floor((baseCredits * bonusBps) / 10_000)
  if (cfg.maxBonusCredits > 0) {
    bonusCredits = Math.min(bonusCredits, cfg.maxBonusCredits)
  }
  const totalCredits = baseCredits + bonusCredits
  return {
    usdg: amount,
    baseCredits,
    bonusCredits,
    bonusPct,
    totalCredits,
    effectiveCreditsPerUsd: amount > 0 ? Math.round((totalCredits / amount) * 100) / 100 : 0,
  }
}

const DEFAULT_TOPUP: TopupConfig = {
  minUsd: 5,
  maxUsd: 500,
  stepUsd: 1,
  baseCreditsPerUsd: 1000,
  maxBonusPct: 0,
  bonusFullAtUsd: 50,
  maxBonusCredits: 100_000,
  suggestedUsd: [5, 20, 50, 100],
}

const centerHtml = `
  <section class="section section-stable">
    <div class="section-head">
      <h2>Pricing</h2>
      <p class="section-note">Preview free · credits for full API access</p>
    </div>

    <div class="mkt-grid mkt-grid-tiers mkt-grid-in-center" id="tiers">
      <article class="mkt-card mkt-tier mkt-card-hi">
        <div class="mkt-card-ico">${icon('lightning-line', { size: 20, class: 'ico' })}</div>
        <div class="mkt-tier-top">
          <h3>Cloud API</h3>
          <span class="chip chip-soon" id="cloud-api-status" aria-live="polite">Checking</span>
        </div>
        <p class="mkt-tier-price"><strong>Credits</strong></p>
        <ul class="mkt-tier-list">
          <li>Fixed free sample per catalog</li>
          <li>Top up from $5 · pay for returned data</li>
        </ul>
      </article>
      <article class="mkt-card mkt-tier mkt-tier-soon" aria-disabled="true">
        <div class="mkt-card-ico">${icon('user-3-line', { size: 20, class: 'ico' })}</div>
        <div class="mkt-tier-top">
          <h3>Power</h3>
          <span class="chip chip-soon">Soon</span>
        </div>
        <p class="mkt-tier-price"><strong>Subscription</strong></p>
        <ul class="mkt-tier-list">
          <li>Monthly credits · ad-free</li>
        </ul>
      </article>
      <article class="mkt-card mkt-tier mkt-tier-soon" aria-disabled="true">
        <div class="mkt-card-ico">${icon('server-line', { size: 20, class: 'ico' })}</div>
        <div class="mkt-tier-top">
          <h3>Self-hosted</h3>
          <span class="chip chip-soon">Soon</span>
        </div>
        <p class="mkt-tier-price"><strong>Your infra</strong></p>
        <ul class="mkt-tier-list">
          <li>Same catalogs, your stack</li>
        </ul>
      </article>
    </div>
  </section>

  <section class="section section-stable">
    <div class="section-head">
      <h2>Pay</h2>
      <p class="section-note">Crypto + card when configured — live status below</p>
    </div>
    <div class="pay-methods" id="pay-methods" aria-live="polite">
      <p class="prose-muted">Checking payment options…</p>
    </div>
  </section>

  <section class="section section-stable">
    <div class="section-head">
      <h2>Top up</h2>
      <p class="section-note">Wallet credits · usage is metered</p>
    </div>
    <div class="field-row pricing-wallet-row">
      <button type="button" class="btn btn-ghost" id="reown-connect">${icon('wallet-4-line', { size: 15, class: 'ico' })} Login</button>
      <span class="prose-muted" id="wallet-status">Not connected</span>
    </div>
    <p class="prose-muted pricing-balance" id="balance"></p>

    <div class="card topup-card">
      <div class="card-body topup-body">
        <div class="topup-presets" id="topup-presets" role="group" aria-label="Suggested amounts"></div>

        <label class="topup-label" for="topup-amount">USD</label>
        <div class="topup-amount-row">
          <span class="topup-currency" aria-hidden="true">$</span>
          <input
            type="number"
            id="topup-amount"
            class="topup-amount-input"
            min="5"
            max="500"
            step="1"
            value="20"
            inputmode="decimal"
          />
          <input
            type="range"
            id="topup-range"
            class="topup-range"
            min="5"
            max="500"
            step="1"
            value="20"
            aria-label="Top-up amount slider"
          />
        </div>

        <div class="topup-quote" id="topup-quote" aria-live="polite"></div>

        <div class="pack-actions topup-actions">
          <button type="button" class="btn btn-primary" id="topup-reown" disabled title="Checking payment availability">
            ${icon('wallet-4-line', { size: 14, class: 'ico' })} Pay with crypto
          </button>
          <button type="button" class="btn btn-ghost" id="topup-stripe" disabled title="Set STRIPE_SECRET_KEY on the API">
            ${icon('lock-line', { size: 14, class: 'ico' })} Pay with card
          </button>
        </div>
      </div>
    </div>
    <p class="status pricing-status" id="status"></p>
    <p class="prose-muted pricing-treasury" id="treasury"></p>
    <p class="prose-muted pricing-note">
      Send <code>X-Wallet-Address</code> on requests. Empty balance → <code>402</code>.
      Agents: <code>GET /v1/pay/quote</code> · <code>POST /v1/pay/claim</code>.
    </p>
  </section>
`

const app = document.querySelector('#app')!
app.innerHTML = shellHtml({
  page: 'pricing',
  centerHtml,
  wallet: true,
})

const methodsEl = document.querySelector('#pay-methods') as HTMLElement
const cloudApiStatus = document.querySelector('#cloud-api-status') as HTMLElement
const statusEl = document.querySelector('#status') as HTMLElement
const balanceEl = document.querySelector('#balance') as HTMLElement
const treasuryEl = document.querySelector('#treasury') as HTMLElement
const walletStatus = document.querySelector('#wallet-status') as HTMLElement
const reownBtn = document.querySelector('#reown-connect') as HTMLButtonElement
const amountInput = document.querySelector('#topup-amount') as HTMLInputElement
const rangeInput = document.querySelector('#topup-range') as HTMLInputElement
const quoteEl = document.querySelector('#topup-quote') as HTMLElement
const presetsEl = document.querySelector('#topup-presets') as HTMLElement
const reownBuyBtn = document.querySelector('#topup-reown') as HTMLButtonElement
const stripeBuyBtn = document.querySelector('#topup-stripe') as HTMLButtonElement

let topupCfg: TopupConfig = { ...DEFAULT_TOPUP }
let treasury: string | null = null
let busy = false
let stripeBusy = false
let stripeLive = false
let stripeMode: 'test' | 'live' | null = null
let robinhoodUSDG: PaymentAsset | null = null
let paymentApiState: PaymentApiState = 'checking'
let currentQuote: TopupQuote | null = quoteLocal(20, topupCfg)

function setStatus(msg: string, err = false) {
  statusEl.textContent = msg
  statusEl.classList.toggle('is-err', err)
}

function renderMethods(methods: PayMethod[]) {
  const list =
    methods.length > 0
      ? methods
      : ([
          {
            id: 'reown',
            name: 'Reown Pay',
            status: treasury ? 'live' : 'coming_soon',
            description: treasury ? 'USDG' : 'USDG (needs TREASURY_ADDRESS)',
          },
          {
            id: 'stripe',
            name: 'Stripe',
            status: stripeLive ? 'live' : 'coming_soon',
            description: 'Card',
          },
        ] as PayMethod[])

  methodsEl.innerHTML = list
    .map((m) => {
      const live = m.status === 'live'
      const ico = m.id === 'stripe' ? 'lock-line' : 'wallet-4-line'
      const status =
        m.id === 'stripe' && stripeMode === 'test' ? 'Test mode' : live ? 'Live' : 'Soon'
      return `
      <article class="pay-method ${live ? 'is-live' : 'is-soon'}" ${live ? '' : 'aria-disabled="true"'}>
        <div class="pay-method-top">
          <span class="pay-method-ico">${icon(ico, { size: 18, class: 'ico' })}</span>
          <div>
            <h3>${escapeHtml(m.name)}</h3>
            <p>${escapeHtml(m.description)}</p>
          </div>
          <span class="chip ${live && stripeMode !== 'test' ? 'chip-live' : 'chip-soon'}">${status}</span>
        </div>
      </article>`
    })
    .join('')
}

function applyTopupConfig(cfg: TopupConfig) {
  topupCfg = cfg
  amountInput.min = String(cfg.minUsd)
  amountInput.max = String(cfg.maxUsd)
  amountInput.step = String(cfg.stepUsd)
  rangeInput.min = String(cfg.minUsd)
  rangeInput.max = String(cfg.maxUsd)
  rangeInput.step = String(cfg.stepUsd)
  const defaultAmt = cfg.suggestedUsd.includes(20) ? 20 : (cfg.suggestedUsd[0] ?? cfg.minUsd)
  setAmount(defaultAmt, false)
  renderPresets()
}

function renderPresets() {
  presetsEl.innerHTML = topupCfg.suggestedUsd
    .map((usd) => {
      const q = quoteLocal(usd, topupCfg)
      const on = currentQuote?.usdg === q?.usdg
      return `
      <button type="button" class="topup-preset${on ? ' is-active' : ''}" data-usd="${usd}">
        <span class="topup-preset-amt">$${usd}</span>
        <span class="topup-preset-cr">${q ? q.totalCredits.toLocaleString() : '—'} cr</span>
      </button>`
    })
    .join('')

  presetsEl.querySelectorAll<HTMLButtonElement>('.topup-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      setAmount(Number(btn.dataset.usd), true)
    })
  })
}

function setAmount(raw: number, syncInputs: boolean) {
  const q = quoteLocal(raw, topupCfg)
  if (!q) return
  currentQuote = q
  if (syncInputs || amountInput.valueAsNumber !== q.usdg) {
    amountInput.value = String(q.usdg)
  }
  if (syncInputs || rangeInput.valueAsNumber !== q.usdg) {
    rangeInput.value = String(q.usdg)
  }
  renderQuote()
  renderPresets()
  updateBuyButtons()
}

function renderQuote() {
  const q = currentQuote
  if (!q) {
    quoteEl.innerHTML = `<p class="prose-muted">Enter an amount between $${topupCfg.minUsd} and $${topupCfg.maxUsd}.</p>`
    return
  }
  const bonusLabel =
    q.bonusCredits > 0
      ? `+${q.bonusCredits.toLocaleString()} bonus (${Math.round(q.bonusPct * 100)}%)`
      : 'No bonus at this size'
  quoteEl.innerHTML = `
    <div class="topup-quote-grid">
      <div>
        <p class="topup-quote-label">Pay</p>
        <p class="topup-quote-val">$${q.usdg}</p>
      </div>
      <div>
        <p class="topup-quote-label">Base</p>
        <p class="topup-quote-val">${q.baseCredits.toLocaleString()}</p>
      </div>
      <div>
        <p class="topup-quote-label">Bonus</p>
        <p class="topup-quote-val topup-bonus">${bonusLabel}</p>
      </div>
      <div>
        <p class="topup-quote-label">Total</p>
        <p class="topup-quote-val topup-total">${q.totalCredits.toLocaleString()}</p>
      </div>
    </div>
    <p class="prose-muted topup-eff">${q.effectiveCreditsPerUsd.toLocaleString()} cr / $</p>
  `
}

function updateBuyButtons() {
  const canBuyReown = paymentActionEnabled(
    paymentApiState,
    Boolean(treasury) && Boolean(robinhoodUSDG) && hasReownProjectId(),
    busy || stripeBusy,
  )
  const reownLabel = busy
    ? 'Processing…'
    : paymentApiState === 'checking'
      ? 'Checking…'
      : paymentApiState === 'unavailable'
        ? 'Service unavailable'
        : !treasury
          ? 'Unavailable'
          : !hasReownProjectId()
            ? 'Configure Reown'
            : 'Pay with crypto'
  reownBuyBtn.disabled = !canBuyReown
  reownBuyBtn.innerHTML = `${icon('wallet-4-line', { size: 14, class: 'ico' })} ${reownLabel}`
  reownBuyBtn.title =
    paymentApiState === 'checking'
      ? 'Checking payment availability'
      : paymentApiState === 'unavailable'
        ? 'Purchases are paused until payment availability can be confirmed'
        : !treasury
          ? 'Set TREASURY_ADDRESS on the API'
          : !hasReownProjectId()
            ? 'Set VITE_REOWN_PROJECT_ID for the web app'
            : 'Pay with USDG using Reown Pay'

  const stripeLabel = stripeBusy
    ? 'Redirecting…'
    : paymentApiState === 'checking'
      ? 'Checking…'
      : paymentApiState === 'unavailable'
        ? 'Service unavailable'
        : !stripeLive
          ? 'Stripe · not configured'
          : stripeMode === 'test'
            ? 'Pay with card · test'
            : 'Pay with card'
  stripeBuyBtn.disabled = !paymentActionEnabled(paymentApiState, stripeLive, busy || stripeBusy)
  stripeBuyBtn.title =
    paymentApiState === 'checking'
      ? 'Checking payment availability'
      : paymentApiState === 'unavailable'
        ? 'Purchases are paused until payment availability can be confirmed'
        : stripeLive
          ? stripeMode === 'test'
            ? 'Stripe test mode — no real charge'
            : 'Checkout with Stripe'
          : 'Configure a matching STRIPE_MODE and key on the API'
  stripeBuyBtn.innerHTML = `${icon('lock-line', { size: 14, class: 'ico' })} ${stripeLabel}`
}

amountInput.addEventListener('input', () => {
  const n = amountInput.valueAsNumber
  if (Number.isFinite(n)) setAmount(n, false)
  rangeInput.value = String(currentQuote?.usdg ?? amountInput.value)
})
amountInput.addEventListener('change', () => {
  const n = amountInput.valueAsNumber
  if (Number.isFinite(n)) setAmount(n, true)
})
rangeInput.addEventListener('input', () => {
  setAmount(rangeInput.valueAsNumber, true)
})

reownBuyBtn.addEventListener('click', () => {
  if (currentQuote) void buyTopup(currentQuote)
})
stripeBuyBtn.addEventListener('click', () => {
  if (currentQuote) void buyWithStripe(currentQuote)
})

async function buyWithStripe(quote: TopupQuote) {
  setStatus('')
  if (!stripeLive) {
    setStatus('Stripe is not configured on this API (set STRIPE_SECRET_KEY).', true)
    return
  }

  let wallet = getWalletState().address
  if (!wallet) {
    try {
      wallet = await ensureConnectedWallet()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
      return
    }
  } else {
    try {
      if (!(await ensureWalletSession(wallet))) {
        throw new Error('Sign the wallet login message to buy credits')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
      return
    }
  }

  stripeBusy = true
  updateBuyButtons()
  try {
    setStatus('Opening Stripe Checkout…')
    const origin = window.location.origin
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/v1/pay/stripe/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWalletHeader(),
      },
      body: JSON.stringify({
        usdg: quote.usdg,
        wallet,
        successUrl: `${origin}/pricing?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/pricing?stripe=cancel`,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      error?: string
      url?: string
      sessionId?: string
    }
    if (!res.ok) {
      throw new Error(body.message || body.error || `HTTP ${res.status}`)
    }
    if (!body.url) throw new Error('No Stripe checkout URL returned')
    setStatus('Redirecting to Stripe…')
    window.location.href = body.url
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), true)
  } finally {
    stripeBusy = false
    updateBuyButtons()
  }
}

async function syncStripeReturn() {
  const params = new URLSearchParams(location.search)
  const flag = params.get('stripe')
  if (!flag) return

  if (flag === 'cancel') {
    setStatus('Stripe checkout cancelled.')
    history.replaceState(null, '', '/pricing')
    return
  }

  if (flag === 'success') {
    const sessionId = params.get('session_id')
    if (!sessionId) {
      setStatus('Stripe payment returned without session id.', true)
      return
    }
    setStatus('Confirming Stripe payment…')
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, '')}/v1/pay/stripe/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        credits?: number
        alreadyClaimed?: boolean
        message?: string
        error?: string
      }
      if (!res.ok) {
        throw new Error(body.message || body.error || `HTTP ${res.status}`)
      }
      setStatus(
        body.alreadyClaimed
          ? `Already credited — balance ${body.credits?.toLocaleString() ?? '—'} credits`
          : `Stripe payment confirmed — balance ${body.credits?.toLocaleString() ?? '—'} credits`,
      )
      await refreshBalance()
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : 'Payment may still be processing — refresh balance in a moment.',
        true,
      )
    }
    history.replaceState(null, '', '/pricing')
  }
}

async function claimTopup(usdg: number, txHash: string, wallet: string) {
  return postJson<{
    ok: boolean
    credits: number
    alreadyClaimed?: boolean
    granted?: number
    usdg?: number
    bonusCredits?: number
  }>(apiBase, '/v1/pay/claim', { wallet, usdg, txHash }, { wallet })
}

async function ensureConnectedWallet(): Promise<string> {
  let s = getWalletState()
  if (!s.address) {
    await connectWallet()
    for (let i = 0; i < 40; i++) {
      s = getWalletState()
      if (s.address) break
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  s = getWalletState()
  if (!s.address) {
    throw new Error('Connect a wallet to buy credits')
  }
  if (!(await ensureWalletSession(s.address))) {
    throw new Error('Sign the wallet login message to buy credits')
  }
  return s.address
}

async function buyTopup(quote: TopupQuote) {
  setStatus('')
  if (!treasury) {
    setStatus('Treasury not configured on this deployment (TREASURY_ADDRESS).', true)
    return
  }
  busy = true
  updateBuyButtons()
  try {
    const { pay } = await import('@reown/appkit-pay')
    await ensureAppKitReady()
    const wallet = await ensureConnectedWallet()
    setStatus(`Opening Reown Pay for $${quote.usdg}…`)

    if (!robinhoodUSDG) throw new Error('The API payment asset does not match this deployment')
    const result = await pay({
      recipient: treasury,
      amount: quote.usdg,
      paymentAsset: robinhoodUSDG,
    })

    if (!result.success) {
      throw new Error(
        typeof result.error === 'string' ? result.error : 'Payment failed or cancelled',
      )
    }

    const txHash = extractTxHash(result)
    if (!txHash) {
      throw new Error(
        'Payment succeeded but no tx hash was returned. Retry claim from the API with the explorer tx hash.',
      )
    }

    setStatus('Payment settled — claiming credits…')
    const claimed = await claimTopup(quote.usdg, txHash, wallet)
    setStatus(
      claimed.alreadyClaimed
        ? `Already claimed — balance ${claimed.credits.toLocaleString()} credits`
        : `Topped up $${quote.usdg} · +${(claimed.granted ?? quote.totalCredits).toLocaleString()} credits. Balance: ${claimed.credits.toLocaleString()}`,
    )
    await refreshBalance()
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), true)
  } finally {
    busy = false
    updateBuyButtons()
  }
}

async function load() {
  paymentApiState = 'checking'
  setCloudApiState('checking')
  methodsEl.innerHTML = '<p class="prose-muted">Checking payment options…</p>'
  setStatus('')
  updateBuyButtons()

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  const [healthResult, packsResult] = await Promise.allSettled([
    getJson<{ ready?: boolean }>(apiBase, '/v1/health', { signal: controller.signal }),
    getJson<unknown>(apiBase, '/v1/pay/packs', { signal: controller.signal }),
  ])
  window.clearTimeout(timeout)
  const health = healthResult.status === 'fulfilled' ? healthResult.value : null
  const serviceReady = health !== null && typeof health === 'object' && health.ready === true
  const data =
    packsResult.status === 'fulfilled' && isPacksResponse(packsResult.value)
      ? packsResult.value
      : null
  setCloudApiState(serviceReady ? 'ready' : 'unavailable')

  if (!data || !serviceReady) {
    paymentApiState = 'unavailable'
    treasury = null
    stripeLive = false
    stripeMode = null
    robinhoodUSDG = null
    applyTopupConfig(DEFAULT_TOPUP)
    renderUnavailableMethods()
    treasuryEl.textContent = 'Payment setup could not be verified.'
    setStatus(
      'Purchases are paused because payment availability could not be confirmed. Retry the status check.',
      true,
    )
    updateBuyButtons()
    return
  }

  const expectedEnvironment = metadataEnvironment
  const asset = data.asset
  const validAsset =
    asset?.network === paymentNetwork &&
    typeof asset.address === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(asset.address) &&
    asset.chainId === (expectedEnvironment === 'production' ? 4663 : 46630) &&
    asset.symbol === 'USDG' &&
    asset.decimals === 6
  if (data.environment !== expectedEnvironment || !validAsset) {
    paymentApiState = 'unavailable'
    treasury = null
    stripeLive = false
    stripeMode = null
    robinhoodUSDG = null
    applyTopupConfig(DEFAULT_TOPUP)
    renderUnavailableMethods()
    treasuryEl.textContent = 'Payment setup does not match this deployment environment.'
    setStatus(
      `Checkout is paused: web expects ${expectedEnvironment} (${paymentNetwork}; ${robinhoodRpcUrl}) but the API environment or USDG asset differs.`,
      true,
    )
    updateBuyButtons()
    return
  }

  paymentApiState = 'ready'
  treasury = data.treasury
  robinhoodUSDG = {
    network: asset.network,
    asset: asset.address,
    metadata: {
      name: asset.name || 'Global Dollar',
      symbol: asset.symbol,
      decimals: asset.decimals,
    },
  } as PaymentAsset
  stripeMode = data.stripe?.mode ?? null
  stripeLive = Boolean(
    data.stripe?.enabled && stripeMode === (expectedEnvironment === 'production' ? 'live' : 'test'),
  )
  if (data.topup) applyTopupConfig(data.topup)
  else applyTopupConfig(DEFAULT_TOPUP)
  renderMethods(data.methods ?? [])
  updateBuyButtons()
  if (data.treasury) {
    const networkLabel =
      expectedEnvironment === 'production' ? 'Mainnet' : 'TESTNET · no real value'
    treasuryEl.innerHTML = `${networkLabel} treasury <code>${escapeHtml(data.treasury)}</code> · USDG`
  } else {
    treasuryEl.textContent = 'No treasury — crypto off until TREASURY_ADDRESS is set.'
  }
  if (!hasReownProjectId() && !stripeLive) {
    setStatus('Checkout needs Reown and/or Stripe config.', true)
  } else if (!hasReownProjectId()) {
    setStatus('Crypto needs VITE_REOWN_PROJECT_ID. Card checkout available.')
  }
}

function setCloudApiState(state: PaymentApiState) {
  cloudApiStatus.classList.remove('chip-live', 'chip-soon')
  cloudApiStatus.classList.add(state === 'ready' ? 'chip-live' : 'chip-soon')
  cloudApiStatus.textContent =
    state === 'ready' ? 'Available' : state === 'checking' ? 'Checking' : 'Unavailable'
}

function renderUnavailableMethods() {
  methodsEl.innerHTML = `
    <div class="pay-method-outage" role="status">
      <p>Payment options could not be confirmed. Purchases are paused; retry the status check.</p>
      <button type="button" class="btn btn-ghost" id="retry-payment-status">Retry status check</button>
    </div>`
}

methodsEl.addEventListener('click', (event) => {
  const target = event.target
  if (target instanceof Element && target.closest('#retry-payment-status')) {
    void load()
  }
})

async function refreshBalance() {
  const s = getWalletState()
  if (!s.address) {
    balanceEl.textContent = ''
    return
  }
  try {
    const b = await getJson<{ credits: number }>(
      apiBase,
      `/v1/pay/balance?wallet=${encodeURIComponent(s.address)}`,
    )
    balanceEl.textContent = `Paid balance for ${s.short}: ${b.credits.toLocaleString()} credits`
  } catch {
    balanceEl.textContent = `Connected ${s.short} · balance unavailable`
  }
}

function syncWalletUi() {
  const s = getWalletState()
  reownBtn.innerHTML = `${icon('wallet-4-line', { size: 15, class: 'ico' })} ${
    s.connected ? 'Disconnect' : 'Login'
  }`
  walletStatus.textContent = s.connected ? s.short || 'Connected' : 'Not connected'
  void refreshBalance()
}

reownBtn.addEventListener('click', () => {
  void (async () => {
    try {
      setStatus('')
      await toggleWallet()
      syncWalletUi()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
    }
  })()
})

/** Shake on coming-soon / disabled controls */
function bindDisabledShake() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const soft = t.closest('[aria-disabled="true"], .mkt-tier-soon, .pay-method.is-soon')
      if (soft) {
        e.preventDefault()
        shakeScreen()
        return
      }
      if (t instanceof HTMLButtonElement && t.disabled) {
        shakeScreen()
      }
    },
    true,
  )
}

void load().then(() => void syncStripeReturn())
bootShellChrome({ defaultLang: 'curl' })
bindShellWallet(() => syncWalletUi())
syncWalletUi()
bindDisabledShake()
