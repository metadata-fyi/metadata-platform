import './style.css'
import { escapeHtml, getJson, postJson, resolveApiBase } from './api'
import { icon } from './icons'
import { bindShellWallet, bootShellChrome, shellHtml } from './shell'
import {
  applyPrefsToDocument,
  bindOsReducedMotionListener,
  clearLocalUserData,
  getReducedMotionPref,
  hasReducedMotionOverride,
  osPrefersReducedMotion,
  setReducedMotionPref,
} from './user-settings'
import { bootWallet, disconnectWallet, getWalletState, hasWalletSession } from './wallet'

const apiBase = resolveApiBase()

applyPrefsToDocument()
bindOsReducedMotionListener()

/** Gate: settings is account-only. Soft-restore session, then redirect if logged out. */
function requireLogin(): boolean {
  bootWallet()
  const s = getWalletState()
  if (s.connected && s.address && hasWalletSession()) return true
  // Not signed in — send to hub with return hint
  const ret = encodeURIComponent('/settings')
  location.replace(`/app?login=1&next=${ret}`)
  return false
}

if (!requireLogin()) {
  // Stop further init while navigating away
  document.querySelector('#app')!.innerHTML = `
    <div class="page-center page-center-padded">
      <p class="prose-muted">Login required…</p>
    </div>
  `
} else {
  const osHint = osPrefersReducedMotion()
    ? 'Your system prefers reduced motion'
    : 'Your system allows motion'
  const overrideHint = hasReducedMotionOverride() ? ' · custom' : ' · following system'

  const centerHtml = `
  <section class="section section-stable settings-page">
    <div class="section-head">
      <h2>Settings</h2>
      <p class="section-note">Account · preferences</p>
    </div>

    <div class="settings-block">
      <h3 class="settings-block-title">Account</h3>
      <div class="settings-row">
        <span class="settings-row-text">
          <span class="settings-row-label">Wallet</span>
          <span class="settings-row-hint" id="settings-wallet">—</span>
        </span>
        <button type="button" class="btn btn-ghost mkt-btn-sm" id="settings-disconnect">
          ${icon('wallet-4-line', { size: 14, class: 'ico' })} Disconnect
        </button>
      </div>
      <p class="settings-row-hint settings-balance" id="settings-balance"></p>
      <div class="settings-danger">
        <p class="settings-row-label settings-danger-label">Delete account data</p>
        <p class="settings-row-hint settings-danger-hint">
          Zeros prepaid credits for this wallet and clears local session.
          On-chain payments cannot be reversed.
        </p>
        <button type="button" class="btn btn-ghost mkt-btn-sm settings-danger-btn" id="settings-delete">
          ${icon('delete-2-line', { size: 14, class: 'ico' })} Delete account data
        </button>
        <p class="status settings-status" id="settings-status"></p>
      </div>
    </div>

    <div class="settings-block" id="account-stats">
      <h3 class="settings-block-title">Your stats</h3>
      <p class="settings-row-hint settings-stats-hint">
        This wallet only — not public platform traffic.
        <a href="/stats">Platform stats →</a>
      </p>
      <div class="stats-grid settings-stats-grid" id="settings-stats-kpis">
        <p class="prose-muted settings-zero">Loading…</p>
      </div>
      <div class="settings-row settings-row-start">
        <span class="settings-row-text">
          <span class="settings-row-label">Power / ad-free</span>
          <span class="settings-row-hint" id="settings-power">—</span>
        </span>
      </div>
      <div class="section-head settings-claims-head">
        <h3 class="settings-block-title settings-claims-title">Claims</h3>
      </div>
      <div class="card settings-claims-card">
        <div class="card-body settings-claims-body" id="settings-claims">
          <p class="prose-muted settings-zero">…</p>
        </div>
      </div>
    </div>

    <div class="settings-block">
      <h3 class="settings-block-title">Display</h3>
      <label class="settings-row settings-toggle">
        <span class="settings-row-text">
          <span class="settings-row-label">Reduced motion</span>
          <span class="settings-row-hint" id="settings-motion-hint">${osHint}${overrideHint}. Freezes the right-rail portal.</span>
        </span>
        <input type="checkbox" id="pref-reduced-motion" />
      </label>
    </div>
  </section>
`

  const app = document.querySelector('#app')!
  app.innerHTML = shellHtml({
    page: 'settings',
    centerHtml,
    wallet: true,
  })

  const motionEl = document.querySelector('#pref-reduced-motion') as HTMLInputElement
  const walletEl = document.querySelector('#settings-wallet') as HTMLElement
  const balanceEl = document.querySelector('#settings-balance') as HTMLElement
  const motionHint = document.querySelector('#settings-motion-hint') as HTMLElement
  const disconnectBtn = document.querySelector('#settings-disconnect') as HTMLButtonElement
  const deleteBtn = document.querySelector('#settings-delete') as HTMLButtonElement
  const statusEl = document.querySelector('#settings-status') as HTMLElement

  function setStatus(msg: string, err = false) {
    statusEl.textContent = msg
    statusEl.classList.toggle('is-err', err)
  }

  function syncMotionHint() {
    const os = osPrefersReducedMotion()
    const custom = hasReducedMotionOverride()
    motionHint.textContent = custom
      ? `Custom setting · system ${os ? 'prefers reduced motion' : 'allows motion'}. Freezes the right-rail portal.`
      : `${os ? 'Following system: reduced motion on' : 'Following system: motion allowed'}. Freezes the right-rail portal.`
  }

  function syncWalletUi() {
    const s = getWalletState()
    if (!s.connected || !s.address) {
      location.replace('/app?login=1&next=' + encodeURIComponent('/settings'))
      return
    }
    walletEl.textContent = s.address
    disconnectBtn.disabled = false
    deleteBtn.disabled = false
  }

  motionEl.checked = getReducedMotionPref()
  syncMotionHint()
  motionEl.addEventListener('change', () => {
    setReducedMotionPref(motionEl.checked)
    syncMotionHint()
  })

  disconnectBtn.addEventListener('click', () => {
    void (async () => {
      setStatus('')
      try {
        await disconnectWallet()
        location.replace('/')
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e), true)
      }
    })()
  })

  deleteBtn.addEventListener('click', () => {
    void (async () => {
      setStatus('')
      const s = getWalletState()
      if (!s.address) {
        setStatus('Connect a wallet first.', true)
        return
      }
      const ok = window.confirm(
        `Delete account data for ${s.short}?\n\nThis zeros prepaid credits on this API and clears local session data. Crypto payments already settled cannot be refunded.`,
      )
      if (!ok) return
      const typed = window.prompt('Type DELETE to confirm:')
      if (typed !== 'DELETE') {
        setStatus('Cancelled.', true)
        return
      }
      deleteBtn.disabled = true
      try {
        setStatus('Deleting…')
        await postJson(
          apiBase,
          '/v1/pay/account/delete',
          { wallet: s.address, confirm: 'DELETE' },
          { wallet: s.address },
        )
        await disconnectWallet()
        clearLocalUserData()
        location.replace('/')
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e), true)
        deleteBtn.disabled = false
      }
    })()
  })

  type AccountPayload = {
    wallet: string
    credits: number
    claimCount: number
    claims: { txHash: string; packId: string; at: string }[]
    entitlements?: {
      adFree?: boolean
      power?: { active?: boolean; renewsAt?: string | null }
    }
  }

  function shortTx(tx: string) {
    if (!tx || tx.length < 12) return tx
    return `${tx.slice(0, 8)}…${tx.slice(-6)}`
  }

  async function loadAccountStats() {
    const s = getWalletState()
    const kpis = document.getElementById('settings-stats-kpis') as HTMLElement
    const claimsEl = document.getElementById('settings-claims') as HTMLElement
    const powerEl = document.getElementById('settings-power') as HTMLElement
    if (!s.address) return
    try {
      const a = await getJson<AccountPayload>(
        apiBase,
        `/v1/pay/account?wallet=${encodeURIComponent(s.address)}`,
        { wallet: s.address },
      )
      balanceEl.textContent = `${a.credits.toLocaleString()} prepaid credits`
      kpis.innerHTML = [
        `<article class="stats-kpi"><p class="stats-kpi-label">Credits</p><p class="stats-kpi-value">${a.credits.toLocaleString()}</p><p class="stats-kpi-sub">prepaid balance</p></article>`,
        `<article class="stats-kpi"><p class="stats-kpi-label">Claims</p><p class="stats-kpi-value">${a.claimCount.toLocaleString()}</p><p class="stats-kpi-sub">packs credited</p></article>`,
        `<article class="stats-kpi"><p class="stats-kpi-label">Ad-free</p><p class="stats-kpi-value">${a.entitlements?.adFree ? 'On' : 'Off'}</p><p class="stats-kpi-sub">Power subscription</p></article>`,
      ].join('')
      const power = a.entitlements?.power
      powerEl.textContent = power?.active
        ? `Active${power.renewsAt ? ` · renews ${new Date(power.renewsAt).toLocaleDateString()}` : ''}`
        : 'Not active · see Pricing for Power'
      if (!a.claims.length) {
        claimsEl.innerHTML = `<p class="prose-muted settings-zero">No pack claims yet. <a href="/pricing">Buy credits</a></p>`
      } else {
        claimsEl.innerHTML = `
          <table class="stats-table">
            <thead><tr><th>Pack</th><th>When</th><th>Tx</th></tr></thead>
            <tbody>
              ${a.claims
                .map(
                  (c) => `
                <tr>
                  <td class="stats-key"><code>${escapeHtml(c.packId)}</code></td>
                  <td class="stats-num">${c.at ? escapeHtml(new Date(c.at).toLocaleString()) : '—'}</td>
                  <td class="stats-key"><code title="${escapeHtml(c.txHash)}">${escapeHtml(shortTx(c.txHash))}</code></td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
      }
    } catch {
      balanceEl.textContent = ''
      kpis.innerHTML = `<p class="prose-muted settings-zero">Could not load account stats.</p>`
      claimsEl.innerHTML = `<p class="prose-muted settings-zero">—</p>`
      powerEl.textContent = '—'
    }
  }

  bootShellChrome({ defaultLang: 'curl' })
  bindShellWallet(() => {
    syncWalletUi()
    void loadAccountStats()
  })
  syncWalletUi()
  void loadAccountStats()

  // Deep-link from platform stats
  if (location.hash === '#account-stats') {
    requestAnimationFrame(() => {
      document.getElementById('account-stats')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }
}
