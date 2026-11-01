import './style.css'
import { escapeHtml, getJson, resolveApiBase } from './api'
import { icon } from './icons'
import { bindShellWallet, bootShellChrome, shellHtml } from './shell'
import { getWalletState } from './wallet'

const apiBase = resolveApiBase()

type Top = { key: string; count: number }
type SeriesPt = {
  hour: string
  total: number
  paid: number
  unpaid: number
  uniqueWallets?: number
}

type StatsPayload = {
  ok: boolean
  generatedAt: string
  note?: string
  platform: {
    currentHour: {
      hour: string
      total: number
      paid?: number
      unpaid?: number
      errors5xx: number
      client4xx: number
      byStatus: Record<string, number>
      byMethod: Record<string, number>
      topPaths: Top[]
      topVerticals: Top[]
      uniqueWallets?: number
      withWallet?: number
      withoutWallet?: number
    }
    last24h: {
      hours: number
      total: number
      paid?: number
      unpaid?: number
      errors5xx: number
      client4xx: number
      byStatus: Record<string, number>
      byMethod: Record<string, number>
      topPaths: Top[]
      topVerticals: Top[]
      series: SeriesPt[]
      uniqueWalletsApprox?: number
    }
    retained: {
      hours: number
      total: number
      topPaths: Top[]
      topVerticals: Top[]
    }
    credits?: {
      walletsWithCredits: number
      walletsTracked: number
      totalCredits: number
      totalClaims: number
      claimsByPack: Top[]
      note?: string
    }
  }
}

const centerHtml = `
  <section class="section section-stable">
    <div class="section-head">
      <h2>Platform stats</h2>
      <p class="section-note">API traffic · all clients · <code>GET /v1/stats</code></p>
    </div>
    <p class="prose-muted stats-meta" id="stats-meta"></p>
    <p class="stats-account-link" id="stats-account-link">
      <a href="/settings" id="stats-account-cta">
        ${icon('user-3-line', { size: 14, class: 'ico' })}
        <span id="stats-account-cta-label">Your account stats</span>
      </a>
      <span class="prose-muted stats-account-note"> · credits &amp; claims for your wallet</span>
    </p>
  </section>

  <section class="section section-stable">
    <div class="section-head">
      <h2>Traffic</h2>
    </div>
    <div class="stats-grid" id="platform-kpis">
      <p class="prose-muted">Loading…</p>
    </div>
  </section>

  <section class="section section-stable">
    <div class="section-head">
      <h2>24h volume</h2>
      <p class="section-note">Paid vs unpaid request tier</p>
    </div>
    <div class="stats-bars" id="stats-bars" aria-label="Hourly volume"></div>
  </section>

  <section class="section section-stable">
    <div class="stats-split">
      <div>
        <div class="section-head">
          <h2>Paths</h2>
        </div>
        <div class="card"><div class="card-body" id="stats-paths"><p class="prose-muted">…</p></div></div>
      </div>
      <div>
        <div class="section-head">
          <h2>Verticals</h2>
        </div>
        <div class="card"><div class="card-body" id="stats-verticals"><p class="prose-muted">…</p></div></div>
      </div>
    </div>
  </section>

  <section class="section section-stable">
    <div class="stats-split">
      <div>
        <div class="section-head">
          <h2>Status</h2>
        </div>
        <div class="card"><div class="card-body" id="stats-status"><p class="prose-muted">…</p></div></div>
      </div>
      <div>
        <div class="section-head">
          <h2>Methods</h2>
        </div>
        <div class="card"><div class="card-body" id="stats-methods"><p class="prose-muted">…</p></div></div>
      </div>
    </div>
  </section>
`

const app = document.querySelector('#app')!
app.innerHTML = shellHtml({
  page: 'stats',
  centerHtml,
  wallet: true,
})

function fmt(n: number) {
  return n.toLocaleString()
}

function pct(part: number, whole: number) {
  if (!whole) return '0%'
  return `${Math.round((part / whole) * 1000) / 10}%`
}

function kpi(label: string, value: string, sub?: string) {
  return `
    <article class="stats-kpi">
      <p class="stats-kpi-label">${escapeHtml(label)}</p>
      <p class="stats-kpi-value">${escapeHtml(value)}</p>
      ${sub ? `<p class="stats-kpi-sub">${escapeHtml(sub)}</p>` : ''}
    </article>`
}

function rankTable(rows: Top[]) {
  if (!rows.length) return `<p class="prose-muted stats-empty">No data yet — hit the API.</p>`
  return `
    <table class="stats-table">
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td class="stats-key"><code>${escapeHtml(r.key)}</code></td>
            <td class="stats-num">${fmt(r.count)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
}

function statusMix(cur: Record<string, number>, d24: Record<string, number>) {
  const keys = Array.from(new Set([...Object.keys(cur), ...Object.keys(d24)])).sort()
  if (!keys.length) return `<p class="prose-muted stats-empty">No responses recorded yet.</p>`
  return `
    <table class="stats-table">
      <thead><tr><th>Status</th><th>This hour</th><th>24h</th></tr></thead>
      <tbody>
        ${keys
          .map(
            (k) => `
          <tr>
            <td class="stats-key"><code>${escapeHtml(k)}</code></td>
            <td class="stats-num">${fmt(cur[k] ?? 0)}</td>
            <td class="stats-num">${fmt(d24[k] ?? 0)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
}

function methodTable(byMethod: Record<string, number>) {
  const rows = Object.entries(byMethod)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
  return rankTable(rows)
}

function renderBars(el: HTMLElement, series: SeriesPt[]) {
  if (!series.length) {
    el.innerHTML = `<p class="prose-muted">No hourly history yet.</p>`
    return
  }
  const max = Math.max(1, ...series.map((s) => s.total))
  el.innerHTML = `
    <div class="stats-bar-row">
      ${series
        .map((s) => {
          const h = Math.max(2, Math.round((s.total / max) * 100))
          const paidPct = s.total ? Math.round((s.paid / s.total) * 100) : 0
          const heightBucket = Math.max(10, Math.min(100, Math.ceil(h / 10) * 10))
          const paidBucket = Math.max(0, Math.min(100, Math.round(paidPct / 10) * 10))
          const label = s.hour.slice(11)
          return `
            <div class="stats-bar" title="${escapeHtml(s.hour)} UTC · ${fmt(s.total)} req · paid ${fmt(s.paid)} / unpaid ${fmt(s.unpaid)}">
              <div class="stats-bar-stack stats-bar-h-${heightBucket}">
                <div class="stats-bar-paid stats-flex-${paidBucket}"></div>
                <div class="stats-bar-unpaid stats-flex-${100 - paidBucket}"></div>
              </div>
              <span class="stats-bar-label">${escapeHtml(label)}</span>
            </div>`
        })
        .join('')}
    </div>
    <p class="stats-legend">
      <span class="stats-legend-swatch is-paid"></span> Paid tier
      <span class="stats-legend-swatch is-unpaid"></span> Unpaid
    </p>`
}

function syncAccountLink() {
  const cta = document.getElementById('stats-account-cta') as HTMLAnchorElement
  const label = document.getElementById('stats-account-cta-label') as HTMLElement
  const s = getWalletState()
  if (s.connected && s.address) {
    cta.href = '/settings#account-stats'
    label.textContent = `Your stats · ${s.short || 'wallet'}`
  } else {
    cta.href = '/app?login=1&next=' + encodeURIComponent('/settings#account-stats')
    label.textContent = 'Sign in for your account stats'
  }
}

async function load() {
  const meta = document.getElementById('stats-meta') as HTMLElement
  const platformKpis = document.getElementById('platform-kpis') as HTMLElement
  try {
    const data = await getJson<StatsPayload>(apiBase, '/v1/stats')
    meta.textContent = `As of ${new Date(data.generatedAt).toLocaleString()}`

    const p = data.platform
    const ch = p.currentHour
    const d24 = p.last24h
    const paid24 = d24.paid ?? 0
    const unpaid24 = d24.unpaid ?? 0
    const total24 = d24.total || paid24 + unpaid24

    platformKpis.innerHTML = [
      kpi('This hour', fmt(ch.total), ch.hour + ' UTC'),
      kpi('Last 24h', fmt(d24.total), `${d24.hours} hour buckets`),
      kpi('Paid traffic (24h)', pct(paid24, total24), `${fmt(paid24)} / ${fmt(total24)} req`),
      kpi('4xx / 5xx (24h)', `${fmt(d24.client4xx)} / ${fmt(d24.errors5xx)}`, 'client · server'),
      kpi('Active wallets (hour)', fmt(ch.uniqueWallets ?? 0), 'unique · addresses not stored'),
      kpi('Retained total', fmt(p.retained.total), `${p.retained.hours} hours kept`),
    ].join('')

    renderBars(document.getElementById('stats-bars') as HTMLElement, d24.series ?? [])
    ;(document.getElementById('stats-paths') as HTMLElement).innerHTML = rankTable(
      d24.topPaths ?? [],
    )
    ;(document.getElementById('stats-verticals') as HTMLElement).innerHTML = rankTable(
      d24.topVerticals ?? [],
    )
    ;(document.getElementById('stats-status') as HTMLElement).innerHTML = statusMix(
      ch.byStatus ?? {},
      d24.byStatus ?? {},
    )
    ;(document.getElementById('stats-methods') as HTMLElement).innerHTML = methodTable(
      d24.byMethod ?? {},
    )
  } catch (e) {
    meta.textContent = e instanceof Error ? e.message : String(e)
    meta.classList.add('is-err')
    platformKpis.innerHTML = `<p class="status is-err">Could not load /v1/stats. Is the API running?</p>`
  }
}

bootShellChrome()
bindShellWallet(() => syncAccountLink())
syncAccountLink()
void load()
