import './style.css'
import './catalog-transition.css'
import { escapeHtml, getJson, resolveApiBase } from './api'
import { verticalHref } from './config'
import { bindShellWallet, bootShellChrome, shellHtml } from './shell'

const apiBase = resolveApiBase()

type VerticalRow = {
  id: string
  title: string
  blurb: string
  live: boolean
  host: string
  counts: Record<string, unknown> | null
}

/** One original Metty scene per registered vertical; copy stays live HTML. */
const HERO_IDS = new Set([
  'anime', 'game', 'manga', 'lightnovels', 'pod', 'tcg', 'figures', 'modelkits',
  'plush', 'boardgames', 'cartoons', 'ost', 'consoles', 'esports', 'comics', 'fashion',
])

function formatCounts(v: VerticalRow): string {
  const c = v.counts
  if (!c) return 'Catalog'
  if (v.id === 'pod')
    return `${(c.products as number) ?? c.series} items · ${(c.printMethods as number) ?? '—'} methods`
  if (v.id === 'tcg')
    return `${(c.cards as number) ?? c.characters} cards · ${(c.sets as number) ?? c.series} sets`
  if (v.id === 'figures')
    return `${(c.items as number) ?? c.characters} items · ${(c.makers as number) ?? '—'} makers`
  if (v.id === 'modelkits')
    return `${(c.items as number) ?? c.characters} kits · ${(c.makers as number) ?? '—'} makers`
  if (v.id === 'lightnovels') return `${c.series} series · ${c.characters} chars`
  if (v.id === 'plush') {
    const by = (c.byKind as Record<string, number>) || {}
    const fumo = by.fumo ?? 0
    return `${(c.items as number) ?? c.characters} plush · ${fumo} fumo`
  }
  if (v.id === 'fashion') {
    const up = (c.upcoming as number) ?? 0
    const by = (c.byCategory as Record<string, number>) || {}
    const parts = ['footwear', 'apparel', 'outerwear', 'accessories', 'watches']
      .map((k) => (by[k] ? `${by[k]} ${k}` : null))
      .filter(Boolean)
    return parts.length
      ? `${parts.slice(0, 3).join(' · ')}${up ? ` · ${up} upcoming` : ''}`
      : `${(c.items as number) ?? c.characters} items · ${up} upcoming`
  }
  if (v.id === 'boardgames')
    return `${(c.games as number) ?? c.series} games · ${(c.publishers as number) ?? '—'} pubs`
  if (v.id === 'cartoons') return `${c.series} shows · ${c.characters} chars`
  if (v.id === 'ost')
    return `${(c.albums as number) ?? c.series} albums · ${(c.artists as number) ?? '—'} artists`
  if (v.id === 'consoles')
    return `${(c.consoles as number) ?? c.series} consoles · ${(c.manufacturers as number) ?? '—'} makers`
  if (v.id === 'esports')
    return `${(c.titles as number) ?? c.series} titles · ${(c.players as number) ?? c.characters} players`
  return `${c.series} series · ${c.characters} chars`
}

/** Marketing defaults (overridden when /v1/verticals loads). */
const HUB_DEFAULTS = {
  verticals: 16,
  freePreviews: 8,
  /** x402 / agent pay-per-request (USDG on Robinhood) — only when treasury + facilitator configured */
  perRequestUsd: 0.01,
}

const centerHtml = `
  <section class="section section-stable mkt-hero-copy">
    <h1 class="hero-title hero-title-lg">Public metadata API for apps &amp; agents</h1>
    <div class="mkt-stats mkt-stats-hero" id="hub-stats" aria-label="Platform stats">
      <div class="mkt-stat">
        <span class="mkt-stat-val" id="stat-verticals">${HUB_DEFAULTS.verticals}</span>
        <span class="mkt-stat-label">Verticals</span>
      </div>
      <div class="mkt-stat">
        <span class="mkt-stat-val" id="stat-previews">${HUB_DEFAULTS.freePreviews}</span>
        <span class="mkt-stat-label">Preview / catalog · 24h (limited, not a free plan)</span>
      </div>
      <div class="mkt-stat">
        <span class="mkt-stat-val" id="stat-credits">${Math.round(1 / HUB_DEFAULTS.perRequestUsd)}</span>
        <span class="mkt-stat-label">x402 reads / $1 (when enabled; prepaid: credits per data unit)</span>
      </div>
      <div class="mkt-stat">
        <span class="mkt-stat-val" id="stat-price">$${HUB_DEFAULTS.perRequestUsd.toFixed(2)}</span>
        <span class="mkt-stat-label">Per x402 read (when enabled)</span>
      </div>
    </div>
  </section>

  <section class="section section-stable" id="verticals">
    <div class="mkt-grid mkt-grid-verticals mkt-grid-in-center" id="vgrid">
      <p class="prose-muted">Loading…</p>
    </div>
  </section>
`

const app = document.querySelector('#app')!
app.innerHTML = shellHtml({
  page: 'hub',
  centerHtml,
  wallet: true,
})

const grid = document.querySelector('#vgrid') as HTMLElement

/** Feature / roadmap destination for “Request more” card */
const ROADMAP_URL =
  (import.meta.env.VITE_ROADMAP_URL as string | undefined)?.trim() ||
  'https://forgejo.thomasjvu.com/metadata/metadata/issues'

function requestMoreCard(): string {
  return `
        <a class="mkt-vhero mkt-vhero-compact mkt-vhero-request" href="${escapeHtml(ROADMAP_URL)}" target="_blank" rel="noreferrer">
          <div class="mkt-vhero-media" aria-hidden="true"></div>
          <div class="mkt-vhero-body">
            <h3>Request more</h3>
            <p class="mkt-vhero-blurb">Need another catalog? Tell us on the roadmap.</p>
            <p class="mkt-vhero-meta">Feature requests</p>
            <p class="mkt-vhero-host"><code>roadmap</code></p>
          </div>
        </a>`
}

function setHubStat(id: string, value: string) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

async function loadVerticals() {
  try {
    const data = await getJson<{ all: VerticalRow[] }>(apiBase, '/v1/verticals')
    const rows = data.all.filter((v) => v.live)
    setHubStat('stat-verticals', String(rows.length || HUB_DEFAULTS.verticals))
    // Optional live preview / pricing hints from discovery if present later
    try {
      const prev = await getJson<{ searchMax?: number; limit?: number }>(apiBase, '/v1/preview')
      if (typeof prev.limit === 'number' && prev.limit > 0) {
        setHubStat('stat-previews', String(prev.limit))
      }
    } catch {
      /* preview endpoint optional */
    }
    grid.innerHTML =
      rows
        .map((v) => {
          const href = verticalHref(v.id)
          const counts = formatCounts(v)
          const art = HERO_IDS.has(v.id)
            ? `<img class="mkt-vhero-art" src="/brand/verticals/metty-v1/${escapeHtml(v.id)}.webp" alt="" aria-hidden="true" width="1536" height="1024" loading="lazy" decoding="async" />`
            : ''
          return `
        <a class="mkt-vhero mkt-vhero-compact mkt-vhero-metty" data-vertical="${escapeHtml(v.id)}" href="${href}">
          <div class="mkt-vhero-media" aria-hidden="true"></div>
          ${art}
          <div class="mkt-vhero-body">
            <h3>${escapeHtml(v.title)}</h3>
            <p class="mkt-vhero-blurb">${escapeHtml(v.blurb)}</p>
            <p class="mkt-vhero-meta">${escapeHtml(counts)}</p>
            <p class="mkt-vhero-host"><code>${escapeHtml(v.host)}</code></p>
          </div>
        </a>`
        })
        .join('') + requestMoreCard()
  } catch (e) {
    grid.innerHTML = `<p class="status is-err">${escapeHtml(e instanceof Error ? e.message : String(e))}. Is the API running on :8787 or https://api.metadata.localhost?</p>`
  }
}

void loadVerticals()
bootShellChrome({ vertical: 'anime', defaultLang: 'curl' })
bindShellWallet()

// Deep-link from settings gate: /app?login=1&next=/settings
void (async () => {
  const params = new URLSearchParams(location.search)
  if (params.get('login') !== '1') return
  const next = params.get('next')
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null
  const { getWalletState, connectWallet, bootWallet, onWalletChange } = await import('./wallet')
  bootWallet()

  const finish = () => {
    if (safeNext) {
      location.replace(safeNext)
      return
    }
    const u = new URL(location.href)
    u.searchParams.delete('login')
    u.searchParams.delete('next')
    history.replaceState({}, '', u.pathname + u.search + u.hash)
  }

  if (getWalletState().connected) {
    finish()
    return
  }

  const unsub = onWalletChange((s) => {
    if (s.connected) {
      unsub()
      finish()
    }
  })
  try {
    await connectWallet()
    if (getWalletState().connected) {
      unsub()
      finish()
    }
  } catch {
    unsub()
    /* user closed modal */
  }
})()
