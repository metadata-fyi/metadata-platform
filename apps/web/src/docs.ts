import './style.css'
import { currentVertical, escapeHtml, getJson, resolveApiBase } from './api'
import type { CmdItem } from './command-palette'
import { ROOT_DOMAIN, verticalHref } from './config'
import { icon } from './icons'
import { feedbackPath } from './routes'
import { bindShellWallet, bootShellChrome, shellHtml } from './shell'
import { examplesForVertical, LANG_LABELS, LANGS, type SnipLang } from './snippets'
import { safeExternalUrl } from './url-safety'
import { getReducedMotionPref } from './user-settings'
import { getWalletState } from './wallet'

const apiBase = resolveApiBase()
const vertical = currentVertical()
const isDev = Boolean(import.meta.env.DEV)

type SearchHit = {
  kind: string
  id: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
}

type CharacterPayload = {
  character: {
    id: string
    name: string
    nameNative?: string | null
    nameRomaji?: string | null
    seriesTitle: string
    seriesId: string
    tags?: string[]
    imageUrl?: string | null
    archetype?: string | null
  }
  series: {
    id: string
    title: string
    type?: string
    coverUrl?: string | null
    logoUrl?: string | null
  } | null
  logos: { url: string; kind: string }[]
  copy?: { danbooruLine: string; tags: string; name: string; id: string }
}

const NAV = [
  { id: 'overview', label: 'Overview', ico: 'home-3-line' },
  { id: 'playground', label: 'Playground', ico: 'play-circle-line' },
  { id: 'api', label: 'Endpoints', ico: 'server-line' },
  { id: 'snippets', label: 'Code', ico: 'code-line' },
] as const

/** Sidebar vertical switcher — grouped so the rail stays short. */
const VERTICAL_GROUPS: {
  id: string
  label: string
  items: { id: string; ico: string; label: string }[]
}[] = [
  {
    id: 'media',
    label: 'Media',
    items: [
      { id: 'anime', ico: 'film-line', label: 'Anime' },
      { id: 'manga', ico: 'book-2-line', label: 'Manga' },
      { id: 'lightnovels', ico: 'book-2-line', label: 'Light novels' },
      { id: 'game', ico: 'game-2-line', label: 'Games' },
      { id: 'cartoons', ico: 'tv-2-line', label: 'Cartoons' },
      { id: 'comics', ico: 'book-2-line', label: 'Comics' },
    ],
  },
  {
    id: 'collect',
    label: 'Collectibles',
    items: [
      { id: 'tcg', ico: 'layers-line', label: 'TCG / cards' },
      { id: 'figures', ico: 'sparkles-line', label: 'Figures' },
      { id: 'modelkits', ico: 'package-2-line', label: 'Model kits' },
      { id: 'plush', ico: 'heart-line', label: 'Plush' },
      { id: 'fashion', ico: 'shopping-bag-2-line', label: 'Fashion' },
    ],
  },
  {
    id: 'make',
    label: 'Make & play',
    items: [
      { id: 'pod', ico: 't-shirt-line', label: 'Print on Demand' },
      { id: 'boardgames', ico: 'game-2-line', label: 'Board games' },
      { id: 'ost', ico: 'music-2-line', label: 'Soundtracks' },
      { id: 'consoles', ico: 'game-2-line', label: 'Consoles' },
      { id: 'esports', ico: 'trophy-line', label: 'Esports' },
    ],
  },
]

const ALL_VERTICALS = VERTICAL_GROUPS.flatMap((g) => g.items)

function verticalMeta(v: string) {
  return (
    ALL_VERTICALS.find((x) => x.id === v) || {
      id: v,
      ico: 'server-line',
      label: v,
    }
  )
}

function verticalTitle(v: string): string {
  const map: Record<string, string> = {
    pod: 'Print on Demand',
    tcg: 'TCG / cards',
    figures: 'Figures',
    modelkits: 'Model kits',
    plush: 'Plush',
    fashion: 'Fashion',
    boardgames: 'Board games',
    cartoons: 'Cartoons',
    ost: 'Soundtracks',
    consoles: 'Consoles',
    esports: 'Esports',
    comics: 'Comics',
    anime: 'Anime',
    manga: 'Manga',
    lightnovels: 'Light novels',
    game: 'Games',
  }
  return map[v] || v
}

function verticalLead(v: string): string {
  const map: Record<string, string> = {
    pod: 'Blank apparel — styles, sizes, print methods.',
    tcg: 'Trading cards — sets, rarities, art.',
    figures: 'Nendoroids, figma, scale figures.',
    modelkits: 'Gunpla, plamo, grades and makers.',
    plush: 'Fumo and character plush.',
    fashion:
      'Footwear, apparel, outerwear, accessories, watches — brands, lines, drops. Coverage varies; some images are placeholders.',
    boardgames: 'Tabletop games — players, weight, mechanics.',
    cartoons: 'Western shows and cast.',
    ost: 'Anime & game soundtracks.',
    consoles: 'Hardware and generations.',
    esports: 'Titles, teams, and players.',
    comics: 'Western comics series and cast.',
    manga: 'Manga series and characters.',
    lightnovels: 'Light novels — series, volumes, cast.',
    game: 'Game titles and cast.',
    anime: 'Series, characters, covers.',
  }
  return map[v] || 'Search and export with prepaid credits.'
}

/** Per-vertical playground seeds so Search / Get Entity previews resolve. */
type PlaygroundDefaults = {
  searchPlaceholder: string
  searchValue: string
  entityPlaceholder: string
  entityValue: string
  entityLabel: string
  entityIcon: string
}

const PLAYGROUND_DEFAULTS: Record<string, PlaygroundDefaults> = {
  anime: {
    searchPlaceholder: 'Search anime (e.g. Rem, Asuna, Emilia)…',
    searchValue: 'rem',
    entityPlaceholder: 'Character id (waifu_rem)',
    entityValue: 'waifu_rem',
    entityLabel: 'Get character',
    entityIcon: 'user-3-line',
  },
  manga: {
    searchPlaceholder: 'Search manga (e.g. Power, Makima, Levi)…',
    searchValue: 'power',
    entityPlaceholder: 'Character id (anilist_c_137079)',
    entityValue: 'anilist_c_137079',
    entityLabel: 'Get character',
    entityIcon: 'user-3-line',
  },
  lightnovels: {
    searchPlaceholder: 'Search light novels (e.g. Holo, Overlord, Bookworm)…',
    searchValue: 'holo',
    entityPlaceholder: 'Character id (holo, ainz-ooal-gown)',
    entityValue: 'holo',
    entityLabel: 'Get character',
    entityIcon: 'user-3-line',
  },
  game: {
    searchPlaceholder: 'Search games (e.g. Ada Wong, Cloud, 2B)…',
    searchValue: 'ada wong',
    entityPlaceholder: 'Character id (anilist_c_35551)',
    entityValue: 'anilist_c_35551',
    entityLabel: 'Get character',
    entityIcon: 'user-3-line',
  },
  cartoons: {
    searchPlaceholder: 'Search cartoons (e.g. SpongeBob, Aang, Finn)…',
    searchValue: 'spongebob',
    entityPlaceholder: 'Character id (spongebob-squarepants__spongebob-squarepants)',
    entityValue: 'spongebob-squarepants__spongebob-squarepants',
    entityLabel: 'Get character',
    entityIcon: 'tv-2-line',
  },
  comics: {
    searchPlaceholder: 'Search comics (e.g. Supergirl, Batman, Wonder Woman)…',
    searchValue: 'supergirl',
    entityPlaceholder: 'Character id (supergirl__kara-zor-el)',
    entityValue: 'supergirl__kara-zor-el',
    entityLabel: 'Get character',
    entityIcon: 'user-3-line',
  },
  pod: {
    searchPlaceholder: 'Search blanks (e.g. 3001, bella, dtg)…',
    searchValue: '3001',
    entityPlaceholder: 'Product id / style (bella-canvas-3001)',
    entityValue: 'bella-canvas-3001',
    entityLabel: 'Get product',
    entityIcon: 't-shirt-line',
  },
  tcg: {
    searchPlaceholder: 'Search cards (e.g. Pikachu, Blue-Eyes, Luffy)…',
    searchValue: 'pikachu',
    entityPlaceholder: 'Card id (pokemon-sv3pt5-25)',
    entityValue: 'pokemon-sv3pt5-25',
    entityLabel: 'Get card',
    entityIcon: 'layers-line',
  },
  figures: {
    searchPlaceholder: 'Search figures (e.g. nendoroid, rem, gojo)…',
    searchValue: 'nendoroid',
    entityPlaceholder: 'Item id (nendoroid-1272-rem)',
    entityValue: 'nendoroid-1272-rem',
    entityLabel: 'Get item',
    entityIcon: 'sparkles-line',
  },
  modelkits: {
    searchPlaceholder: 'Search kits (e.g. HG, Unicorn, Barbatos)…',
    searchValue: 'gundam',
    entityPlaceholder: 'Kit id (hg-rx-78-2-revive)',
    entityValue: 'hg-rx-78-2-revive',
    entityLabel: 'Get item',
    entityIcon: 'package-2-line',
  },
  plush: {
    searchPlaceholder: 'Search plush (e.g. fumo, reimu, pochita, miku)…',
    searchValue: 'fumo',
    entityPlaceholder: 'Item id (fumo-reimu, plush-pochita)',
    entityValue: 'fumo-reimu',
    entityLabel: 'Get item',
    entityIcon: 'heart-line',
  },
  fashion: {
    searchPlaceholder: 'Search fashion (dunk, supreme, nuptse, submariner)…',
    searchValue: 'dunk',
    entityPlaceholder: 'Item id (dunk-low-panda, supreme-box-logo-tee-fw24-black)',
    entityValue: 'dunk-low-panda',
    entityLabel: 'Get item',
    entityIcon: 'shopping-bag-2-line',
  },
  boardgames: {
    searchPlaceholder: 'Search board games (e.g. Wingspan, Gloomhaven)…',
    searchValue: 'wingspan',
    entityPlaceholder: 'Game id (wingspan, gloomhaven)',
    entityValue: 'wingspan',
    entityLabel: 'Get game',
    entityIcon: 'game-2-line',
  },
  ost: {
    searchPlaceholder: 'Search OST (e.g. Persona, Cowboy Bebop, Sawano)…',
    searchValue: 'persona',
    entityPlaceholder: 'Album id (persona-5-original-soundtrack)',
    entityValue: 'persona-5-original-soundtrack',
    entityLabel: 'Get album',
    entityIcon: 'music-2-line',
  },
  consoles: {
    searchPlaceholder: 'Search consoles (e.g. Switch, PlayStation, arcade)…',
    searchValue: 'switch',
    entityPlaceholder: 'Console id (nintendo-switch, playstation-5)',
    entityValue: 'nintendo-switch',
    entityLabel: 'Get console',
    entityIcon: 'game-2-line',
  },
  esports: {
    searchPlaceholder: 'Search players / teams (e.g. Faker, T1, Valorant)…',
    searchValue: 'faker',
    entityPlaceholder: 'Player id (faker, chovy, caps)',
    entityValue: 'faker',
    entityLabel: 'Get player',
    entityIcon: 'trophy-line',
  },
}

function playgroundDefaults(v: string): PlaygroundDefaults {
  return (
    PLAYGROUND_DEFAULTS[v] ?? {
      searchPlaceholder: 'Search…',
      searchValue: '',
      entityPlaceholder: 'Entity id',
      entityValue: '',
      entityLabel: 'Get entity',
      entityIcon: 'user-3-line',
    }
  )
}

const SNIPPETS = examplesForVertical(vertical, apiBase, ROOT_DOMAIN, isDev)
const currentVert = verticalMeta(vertical)
const pg = playgroundDefaults(vertical)

const consoleNav = NAV.map((n, i) => {
  const on = i === 0
  return `
  <button type="button" class="nav-link${on ? ' is-active' : ''}" data-nav="${n.id}" data-ico="${n.ico}" title="${escapeHtml(n.label)}">
    <span class="nav-ico">${icon(n.ico, { size: 16, class: 'ico', active: on })}</span>
    <span class="nav-label">${n.label}</span>
  </button>`
}).join('')

const sidebarExtra = `
  <div class="nav-block">
    <div class="vert-switcher" id="vert-switcher">
      <button type="button" class="vert-switcher-current" id="vert-switcher-btn" aria-expanded="false" aria-controls="vert-switcher-panel">
        <span class="nav-ico">${icon(currentVert.ico, { size: 16, class: 'ico', active: true })}</span>
        <span class="vert-switcher-text">
          <span class="vert-switcher-name">${escapeHtml(currentVert.label)}</span>
          <span class="vert-switcher-hint">Switch catalog</span>
        </span>
        <span class="vert-switcher-chev" aria-hidden="true">▾</span>
      </button>
      <div class="vert-switcher-panel" id="vert-switcher-panel" hidden role="listbox" aria-label="Vertical catalogs">
        <div class="vert-switcher-search">
          <span class="vert-switcher-search-ico" aria-hidden="true">${icon('search-line', { size: 12, class: 'ico' })}</span>
          <input
            type="search"
            id="vert-switcher-filter"
            class="vert-switcher-filter"
            placeholder="filter…"
            autocomplete="off"
            spellcheck="false"
            aria-label="Filter"
            aria-controls="vert-switcher-list"
          />
        </div>
        <div class="vert-switcher-list" id="vert-switcher-list">
          ${VERTICAL_GROUPS.map(
            (g) => `
            <div class="vert-group" data-vert-group="${escapeHtml(g.id)}" data-vert-group-label="${escapeHtml(g.label)}">
              <p class="vert-group-label">${escapeHtml(g.label)}</p>
              ${g.items
                .map(
                  (item) => `
                <a
                  class="nav-link nav-link-sm vert-option${item.id === vertical ? ' is-active' : ''}"
                  href="${verticalHref(item.id)}"
                  role="option"
                  title="${escapeHtml(item.label)}"
                  data-vert-id="${escapeHtml(item.id)}"
                  data-vert-label="${escapeHtml(item.label)}"
                  data-vert-search="${escapeHtml(`${item.id} ${item.label} ${g.label}`.toLowerCase())}"
                  ${item.id === vertical ? 'aria-current="page" aria-selected="true"' : 'aria-selected="false"'}
                >
                  <span class="nav-ico">${icon(item.ico, { size: 15, class: 'ico', active: item.id === vertical })}</span>
                  <span class="nav-label">${escapeHtml(item.label)}</span>
                </a>`,
                )
                .join('')}
            </div>`,
          ).join('')}
          <p class="vert-switcher-empty" id="vert-switcher-empty" hidden>No matches</p>
        </div>
        <a class="vert-hub-link" href="/app" title="All verticals on hub">
          <span class="nav-ico">${icon('compass-line', { size: 14, class: 'ico' })}</span>
          <span class="nav-label">All verticals on hub</span>
        </a>
      </div>
    </div>
  </div>
`

const centerHtml = `
        <section class="hero section section-stable" id="overview">
          <h1 class="hero-title">${escapeHtml(verticalTitle(vertical))}</h1>
          <p class="lead hero-lead">${escapeHtml(verticalLead(vertical))}</p>
        </section>

        <section class="section section-stable" id="playground">
          <div class="section-head"><h2>Playground</h2></div>
          <div class="card card-playground">
            <div class="card-body">
              <div class="field-row">
                <input id="q" type="search" placeholder="${escapeHtml(pg.searchPlaceholder)}" value="${escapeHtml(pg.searchValue)}" autocomplete="off" />
                <button class="btn btn-primary" id="search-btn" type="button">
                  ${icon('search-line', { size: 15, class: 'ico' })} Search
                </button>
              </div>
              ${
                vertical === 'fashion'
                  ? `<div class="fashion-cat-chips" id="fashion-cat-chips" role="group" aria-label="Fashion category">
                <button type="button" class="chip fashion-cat is-active" data-cat="">All</button>
                <button type="button" class="chip fashion-cat" data-cat="footwear">Footwear</button>
                <button type="button" class="chip fashion-cat" data-cat="apparel">Apparel</button>
                <button type="button" class="chip fashion-cat" data-cat="outerwear">Outerwear</button>
                <button type="button" class="chip fashion-cat" data-cat="accessories">Accessories</button>
                <button type="button" class="chip fashion-cat" data-cat="watches">Watches</button>
                <button type="button" class="chip fashion-cat" data-cat="__upcoming">Upcoming</button>
              </div>`
                  : ''
              }
              <div class="field-row">
                <input id="char-id" type="text" placeholder="${escapeHtml(pg.entityPlaceholder)}" value="${escapeHtml(pg.entityValue)}" autocomplete="off" spellcheck="false" />
                <button class="btn btn-ghost" id="char-btn" type="button">
                  ${icon(pg.entityIcon, { size: 15, class: 'ico' })}
                  ${escapeHtml(pg.entityLabel)}
                </button>
              </div>
              <p class="prose-muted playground-note">
                Try a free preview of this catalog, then
                <a href="/pricing">buy credits</a>
                for full access. Wrong data?
                <a href="${feedbackPath(vertical)}">Flag it</a>.
              </p>
              <p class="status" id="status">Results show on the right →</p>
            </div>
          </div>
        </section>

        <section class="section section-stable" id="api">
          <div class="section-head">
            <h2>Endpoints</h2>
            <p class="section-note">
              Base <code>${escapeHtml(apiBase)}</code>
              · set <code>X-Metadata-Vertical: ${escapeHtml(vertical)}</code>
              · free preview is limited · credits unlock full access.
              · <a href="${escapeHtml(`${apiBase}/openapi.json`)}" target="_blank" rel="noopener">OpenAPI 3.0.3</a>
            </p>
          </div>
          <div class="card table-wrap">
            <table>
              <thead><tr><th>Method</th><th>Path</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td><code>GET</code></td><td><code>/v1/health</code></td><td>counts for this vertical</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/search?q=</code></td><td>catalog search</td></tr>
                ${
                  vertical === 'pod'
                    ? `
                <tr><td><code>GET</code></td><td><code>/v1/products</code></td><td>list blanks (?method=dtg)</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/products/:id</code></td><td>colors, sizes, print methods, shop</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/print-methods</code></td><td>DTG, DTF, screen…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/brands</code></td><td>e.g. Bella+Canvas</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/providers</code></td><td>Printify, Printful…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/affiliates</code></td><td>affiliate URLs</td></tr>`
                    : vertical === 'tcg'
                      ? `
                <tr><td><code>GET</code></td><td><code>/v1/tcg/games</code></td><td>pokemon, yugioh, onepiece, mtg, lorcana, weiss, azuki</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/tcg/sets?game=</code></td><td>sets</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/tcg/cards?game=&q=</code></td><td>filter cards</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/tcg/cards/:id</code></td><td>card detail</td></tr>`
                      : vertical === 'figures'
                        ? `
                <tr><td><code>GET</code></td><td><code>/v1/figures/makers</code></td><td>Good Smile, Bandai…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/figures/lines</code></td><td>Nendoroid, figma…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/figures/items?kind=</code></td><td>filter items</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/figures/items/:id</code></td><td>item detail</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/affiliates?vertical=figures</code></td><td>shop partners</td></tr>`
                        : vertical === 'modelkits'
                          ? `
                <tr><td><code>GET</code></td><td><code>/v1/modelkits/makers</code></td><td>Bandai, Kotobukiya…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/modelkits/lines</code></td><td>HG, RG, MG, PG…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/modelkits/items?grade=HG</code></td><td>filter kits</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/modelkits/items/:id</code></td><td>kit detail</td></tr>`
                          : vertical === 'plush'
                            ? `
                <tr><td><code>GET</code></td><td><code>/v1/plush/makers</code></td><td>Gift, GSC, Sanrio…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/plush/lines</code></td><td>Fumo Fumo, prize plush…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/plush/items?kind=fumo</code></td><td>filter fumo / plush</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/plush/items/:id</code></td><td>item detail</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/affiliates?vertical=plush</code></td><td>shop partners</td></tr>`
                            : vertical === 'fashion'
                              ? `
                <tr><td><code>GET</code></td><td><code>/v1/fashion/categories</code></td><td>footwear · apparel · outerwear · accessories · watches</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/fashion/brands</code></td><td>Nike, Supreme, Rolex, Palace…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/fashion/lines?category=</code></td><td>silhouettes / collections</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/fashion/items?category=apparel</code></td><td>tees, hoodies, pants</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/fashion/items?category=accessories</code></td><td>caps, bags</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/fashion/items?category=watches</code></td><td>Submariner, G-Shock…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/fashion/items?release=upcoming</code></td><td>drop calendar</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/sneakers/models</code></td><td>legacy footwear alias</td></tr>`
                              : vertical === 'boardgames'
                                ? `
                <tr><td><code>GET</code></td><td><code>/v1/boardgames</code></td><td>?players=&category=&q=</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/boardgames/:id</code></td><td>detail + shop links</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/publishers</code></td><td>Stonemaier, FFG…</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/affiliates?vertical=boardgames</code></td><td>retail partners</td></tr>`
                                : vertical === 'ost'
                                  ? `
                <tr><td><code>GET</code></td><td><code>/v1/ost/albums</code></td><td>?media=anime|game&series=&q=</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/ost/albums/:id</code></td><td>album detail</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/ost/artists</code></td><td>composers</td></tr>`
                                  : vertical === 'consoles'
                                    ? `
                <tr><td><code>GET</code></td><td><code>/v1/consoles</code></td><td>?formFactor=&generation=&q=</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/consoles/:id</code></td><td>hardware detail</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/manufacturers</code></td><td>Sony, Nintendo…</td></tr>`
                                    : vertical === 'esports'
                                      ? `
                <tr><td><code>GET</code></td><td><code>/v1/esports/titles</code></td><td>competitive titles</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/esports/leagues</code></td><td>?title=</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/esports/teams</code></td><td>?q=</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/esports/players</code></td><td>?q=</td></tr>`
                                      : `
                <tr><td><code>GET</code></td><td><code>/v1/series</code></td><td>?q= list / filter</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/series/:id</code></td><td>seasons / volumes / soundtracks[]</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/characters</code></td><td>?q= list / filter</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/characters/:id</code></td><td>+ copy fields</td></tr>
                <tr><td><code>GET</code></td><td><code>/v1/export/character/:id</code></td><td>paid export / 402</td></tr>`
                }
              </tbody>
            </table>
          </div>
          <p class="prose-muted endpoints-global-note">
            <strong>Global</strong> (not tied to this vertical):
            agent skill <a href="${escapeHtml(apiBase)}/SKILL.md" target="_blank" rel="noreferrer"><code>GET /SKILL.md</code></a>,
            discovery <code>GET /v1/verticals</code>,
            metrics <code>GET /v1/stats</code>,
            billing on <a href="/pricing">Pricing</a>
            (<code>GET /v1/pay/packs</code>, <code>POST /v1/pay/claim</code>).
            Open <strong>Agent skill</strong> in the sidebar to fetch the skill file.
          </p>
        </section>

        <section class="section section-stable" id="snippets">
          <div class="section-head">
            <h2>Code</h2>
            <p class="section-note">One example at a time — pick a topic, then a language.</p>
          </div>
          <div class="snip-lang-bar snip-topic-bar" role="tablist" aria-label="Example">
            ${SNIPPETS.map(
              (ex, i) => `
              <button type="button" class="snip-lang snip-topic${i === 0 ? ' is-active' : ''}" data-snip-topic="${escapeHtml(ex.id)}" role="tab" aria-selected="${i === 0}" title="${escapeHtml(ex.description)}">
                ${escapeHtml(ex.title)}
              </button>`,
            ).join('')}
          </div>
          <div class="snip-lang-bar" role="tablist" aria-label="Language">
            ${LANGS.map(
              (lang, i) => `
              <button type="button" class="snip-lang" data-lang="${lang}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}">
                ${LANG_LABELS[lang]}
              </button>`,
            ).join('')}
          </div>
          <article class="snip-card" id="snip-active" aria-live="polite">
            <div class="snip-card-head">
              <div>
                <h3 id="snip-title"></h3>
                <p id="snip-desc"></p>
              </div>
              <button type="button" class="btn btn-ghost mkt-btn-sm" id="snip-copy">
                ${icon('copy-2-line', { size: 14, class: 'ico' })} Copy
              </button>
            </div>
            <pre class="snip-code" id="snip-code"></pre>
          </article>
        </section>
`

const rightHtml = `
        <div class="preview-portal-host" id="preview-portal-host" aria-hidden="true"></div>
        <div class="preview-stage" id="preview-stage" hidden>
          <div id="preview-entity" hidden></div>
          <ul class="hits" id="hits"></ul>
          <pre class="preview-json" id="raw" hidden></pre>
        </div>
`

const rightHeadExtra = `
        <span class="preview-meta" id="preview-meta"></span>
        <a class="preview-credits" id="preview-credits" href="/pricing" title="Buy credit packs">
          <span class="preview-credits-label">Credits</span>
          <span class="preview-credits-val" id="preview-credits-val">—</span>
        </a>
`

const app = document.querySelector('#app')!
app.innerHTML = shellHtml({
  page: 'console',

  consoleNav,
  sidebarExtra,
  centerHtml,
  rightMode: 'preview',
  rightTitle: 'Preview',
  rightHtml,
  rightHeadExtra,
  wallet: true,
})

const statusEl = document.querySelector('#status') as HTMLElement
const hitsEl = document.querySelector('#hits') as HTMLElement
const rawEl = document.querySelector('#raw') as HTMLElement
const previewPortalHost = document.querySelector('#preview-portal-host') as HTMLElement
const previewStage = document.querySelector('#preview-stage') as HTMLElement
const previewEntity = document.querySelector('#preview-entity') as HTMLElement
const previewMeta = document.querySelector('#preview-meta') as HTMLElement
const previewCredits = document.querySelector('#preview-credits') as HTMLAnchorElement
const previewCreditsVal = document.querySelector('#preview-credits-val') as HTMLElement

let setPortalMotion: ((on: boolean) => void) | null = null
const toastEl = document.querySelector('#toast') as HTMLElement

let activeLang: SnipLang = 'typescript'
let activeSnipId = SNIPPETS[0]?.id ?? 'health'
const snipMap = new Map(SNIPPETS.map((s) => [s.id, s]))

const snipTitleEl = document.querySelector('#snip-title') as HTMLElement
const snipDescEl = document.querySelector('#snip-desc') as HTMLElement
const snipCodeEl = document.querySelector('#snip-code') as HTMLElement
const snipCopyBtn = document.querySelector('#snip-copy') as HTMLButtonElement

type PreviewStatus = {
  mode?: 'fixed-sample' | 'development-quota'
  sample?: SearchHit[]
  remaining: number
  limit: number
  searchMax?: number
}

let lastPreview: PreviewStatus | null = null
let catalogCredits = 0

async function fetchPreviewStatus(): Promise<PreviewStatus | null> {
  try {
    const p = await getJson<PreviewStatus & { ok?: boolean }>(apiBase, '/v1/preview', { vertical })
    lastPreview = {
      mode: p.mode,
      sample: p.sample,
      remaining: Number(p.remaining) || 0,
      limit: Number(p.limit) || 0,
      searchMax: p.searchMax,
    }
    return lastPreview
  } catch {
    return null
  }
}

function showPreviewCreditsUi(p: PreviewStatus) {
  if (p.mode === 'fixed-sample') {
    previewCreditsVal.textContent = 'Free'
    previewCredits.classList.remove('has-balance', 'is-empty')
    const label = previewCredits.querySelector('.preview-credits-label')
    if (label) label.textContent = 'Sample'
    previewCredits.title = 'Fixed free sample · buy credits to search the full catalog'
    previewCredits.href = '#playground'
    return
  }
  previewCreditsVal.textContent = String(p.remaining)
  previewCredits.classList.toggle('has-balance', p.remaining > 0)
  previewCredits.classList.toggle('is-empty', p.remaining <= 0)
  const lab = previewCredits.querySelector('.preview-credits-label')
  if (lab) lab.textContent = 'Preview'
  previewCredits.title =
    p.remaining > 0
      ? `${p.remaining} free preview${p.remaining === 1 ? '' : 's'} left for ${vertical} · not a free plan`
      : `Free preview used up for ${vertical} · buy credits for full access`
  previewCredits.href = '/pricing'
}

async function refreshCredits() {
  catalogCredits = 0
  const s = getWalletState()
  const label = previewCredits.querySelector('.preview-credits-label')
  if (label) label.textContent = 'Credits'

  if (!s.address) {
    const p = await fetchPreviewStatus()
    if (p) {
      showPreviewCreditsUi(p)
      return
    }
    previewCreditsVal.textContent = '—'
    previewCredits.classList.remove('has-balance', 'is-empty')
    previewCredits.title = 'Free preview or connect a wallet · Pricing'
    return
  }
  try {
    const b = await getJson<{ credits: number }>(
      apiBase,
      `/v1/pay/balance?wallet=${encodeURIComponent(s.address)}`,
      { wallet: s.address },
    )
    const n = Number(b.credits) || 0
    catalogCredits = n
    if (n > 0) {
      previewCreditsVal.textContent = n.toLocaleString()
      previewCredits.classList.toggle('has-balance', true)
      previewCredits.classList.toggle('is-empty', false)
      previewCredits.title = `${n.toLocaleString()} credits · ${s.short}`
      return
    }
    // Wallet connected but empty — still show free preview remaining
    const p = await fetchPreviewStatus()
    if (p) {
      showPreviewCreditsUi(p)
      return
    }
    previewCreditsVal.textContent = '0'
    previewCredits.classList.add('is-empty')
    previewCredits.classList.remove('has-balance')
    previewCredits.title = `No credits — buy a pack · ${s.short}`
  } catch {
    const p = await fetchPreviewStatus()
    if (p) {
      showPreviewCreditsUi(p)
      return
    }
    previewCreditsVal.textContent = '—'
    previewCredits.classList.remove('has-balance', 'is-empty')
    previewCredits.title = 'Balance unavailable · Pricing'
  }
}

function renderActiveSnippet() {
  const ex = snipMap.get(activeSnipId) || SNIPPETS[0]
  if (!ex) return
  snipTitleEl.textContent = ex.title
  snipDescEl.textContent = ex.description
  snipCodeEl.textContent = ex.code[activeLang]

  document.querySelectorAll('[data-snip-topic]').forEach((el) => {
    const on = el.getAttribute('data-snip-topic') === activeSnipId
    el.classList.toggle('is-active', on)
    el.setAttribute('aria-selected', on ? 'true' : 'false')
  })
  document.querySelectorAll('[data-lang]').forEach((el) => {
    const on = el.getAttribute('data-lang') === activeLang
    el.classList.toggle('is-active', on)
    el.setAttribute('aria-selected', on ? 'true' : 'false')
  })
}

function setSnippetTopic(id: string) {
  if (!snipMap.has(id)) return
  activeSnipId = id
  renderActiveSnippet()
}

function setSnippetLang(lang: SnipLang) {
  if (!LANGS.includes(lang)) return
  activeLang = lang
  renderActiveSnippet()
}

document.querySelectorAll('[data-snip-topic]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-snip-topic') || ''
    setSnippetTopic(id)
  })
})

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const lang = btn.getAttribute('data-lang') as SnipLang
    setSnippetLang(lang)
  })
})

snipCopyBtn.addEventListener('click', () => {
  const ex = snipMap.get(activeSnipId)
  if (!ex) return
  void copyText(ex.title, ex.code[activeLang])
})

renderActiveSnippet()

bindShellWallet(() => {
  void refreshCredits()
})
void refreshCredits()

function refreshPreviewVisibility() {
  const hasEntity = !previewEntity.hidden && previewEntity.innerHTML.trim().length > 0
  const hasHits = hitsEl.children.length > 0
  const hasJson = !rawEl.hidden && !!rawEl.textContent?.trim()
  const has = hasEntity || hasHits || hasJson
  // Empty → portal ambient (same as hub/site rails). Content → stage on top.
  previewPortalHost.hidden = has
  previewPortalHost.classList.toggle('is-hidden', has)
  if (has) previewPortalHost.setAttribute('hidden', '')
  else previewPortalHost.removeAttribute('hidden')
  previewStage.hidden = !has
  if (has) previewStage.removeAttribute('hidden')
  else previewStage.setAttribute('hidden', '')
  document.querySelector('.preview')?.classList.toggle('is-preview-live', has)
  setPortalMotion?.(!has)
}

function toast(msg: string) {
  toastEl.textContent = msg
  toastEl.hidden = false
  clearTimeout((toastEl as unknown as { _t?: number })._t)
  ;(toastEl as unknown as { _t?: number })._t = window.setTimeout(() => {
    toastEl.hidden = true
  }, 1400)
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`Copied ${label}`)
  } catch {
    toast('Copy failed')
  }
}

function setStatus(msg: string, err = false) {
  statusEl.textContent = msg
  statusEl.classList.toggle('is-err', err)
}

type ShopRow = {
  providerName?: string
  name?: string
  shopUrl: string
  productUrl?: string
  isAffiliate?: boolean
}

/** Normalize links.shop from API (array or legacy string). */
function normalizeShops(links: unknown): ShopRow[] {
  if (!links || typeof links !== 'object') return []
  const shop = (links as { shop?: unknown }).shop
  if (Array.isArray(shop)) {
    return shop.map((s) => normalizeShopRow(s)).filter((s): s is ShopRow => Boolean(s))
  }
  if (typeof shop === 'string') {
    const shopUrl = safeExternalUrl(shop)
    if (shopUrl) return [{ name: 'Shop', shopUrl, isAffiliate: false }]
  }
  const shops = (links as { shops?: unknown }).shops
  if (Array.isArray(shops)) {
    return shops.map((s) => normalizeShopRow(s)).filter((s): s is ShopRow => Boolean(s))
  }
  return []
}

function normalizeShopRow(value: unknown): ShopRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<ShopRow>
  const shopUrl = safeExternalUrl(row.shopUrl)
  if (!shopUrl) return null
  const productUrl = row.productUrl ? safeExternalUrl(row.productUrl) : undefined
  return {
    providerName: row.providerName,
    name: row.name,
    shopUrl,
    ...(productUrl ? { productUrl } : {}),
    isAffiliate: row.isAffiliate,
  }
}

function shopPanelHtml(shops: ShopRow[], opts?: { title?: string }): string {
  const safeShops = shops
    .map((shop) => normalizeShopRow(shop))
    .filter((shop): shop is ShopRow => Boolean(shop))
  if (!safeShops.length) return ''
  const title = opts?.title || 'Shop & affiliate links'
  return `
    <div class="shop-panel">
      <div class="shop-head">${icon('shopping-bag-2-line', { size: 14, class: 'ico' })} ${escapeHtml(title)}</div>
      <p class="shop-disclosure muted">
        Some links may be affiliate / partner links. We may earn a commission at no extra cost to you.
      </p>
      <ul class="shop-list">
        ${safeShops
          .map((s) => {
            const name = s.providerName || s.name || 'Shop'
            const url = s.shopUrl
            const clean = s.productUrl && s.productUrl !== url ? s.productUrl : ''
            return `
          <li>
            <div class="shop-row">
              <strong>${escapeHtml(name)}</strong>
              ${s.isAffiliate ? '<span class="chip chip-aff">affiliate</span>' : '<span class="chip">direct</span>'}
            </div>
            <div class="shop-actions">
              <a class="btn btn-primary mkt-btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer sponsored">
                ${icon('external-link-line', { size: 12, class: 'ico' })}
                ${s.isAffiliate ? 'Shop (affiliate)' : 'Open listing'}
              </a>
              ${
                clean
                  ? `<a class="btn btn-ghost mkt-btn-sm" href="${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">Clean URL</a>`
                  : ''
              }
              <button type="button" class="btn btn-ghost mkt-btn-sm btn-copy-link" data-copy="${escapeHtml(url)}">
                ${icon('copy-2-line', { size: 12, class: 'ico' })} Copy link
              </button>
            </div>
          </li>`
          })
          .join('')}
      </ul>
    </div>`
}

function bindShopCopyButtons() {
  previewEntity.querySelectorAll('.btn-copy-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = (btn as HTMLElement).getAttribute('data-copy') || ''
      void copyText('link', url)
    })
  })
}

function renderEntityCard(opts: {
  kind: string
  title: string
  subtitle?: string
  imageUrl?: string | null
  tags?: string[]
  logos?: { url: string; kind: string }[]
  fields?: { label: string; value: string }[]
  danbooruLine?: string
  json?: unknown
  /** HTML below the JSON card (shop / affiliate panels, swatches, …) */
  belowJsonHtml?: string
}) {
  // Entity card owns the single JSON view — never also fill #raw
  hideJson()
  const tags = (opts.tags ?? []).slice(0, 12)
  const logos = opts.logos ?? []
  const jsonText =
    opts.json !== undefined
      ? JSON.stringify(opts.json, null, 2)
      : JSON.stringify(
          {
            kind: opts.kind,
            title: opts.title,
            subtitle: opts.subtitle,
            tags,
            fields: opts.fields,
          },
          null,
          2,
        )
  previewEntity.hidden = false
  previewEntity.innerHTML = `
    <div class="entity-card">
      ${
        opts.imageUrl
          ? `<img src="${escapeHtml(opts.imageUrl)}" alt="" />`
          : '<span class="entity-ph" aria-hidden="true"></span>'
      }
      <div class="entity-main">
        <div class="entity-kind">${escapeHtml(opts.kind)}</div>
        <h3 class="entity-title">${escapeHtml(opts.title)}</h3>
        ${opts.subtitle ? `<p class="entity-sub">${escapeHtml(opts.subtitle)}</p>` : ''}
        ${
          tags.length
            ? `<div class="entity-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>`
            : ''
        }
      </div>
    </div>
    <div class="result-json-panel">
      <div class="copy-actions copy-actions-compact">
        <button type="button" class="btn btn-ghost mkt-btn-sm" id="copy-json">${icon('copy-2-line', { size: 14, class: 'ico' })} Copy JSON</button>
      </div>
      <pre class="preview-json result-json-pre" id="entity-json">${escapeHtml(jsonText)}</pre>
    </div>
    ${opts.belowJsonHtml || ''}
    ${
      logos.length
        ? `<div class="logo-row">${logos
            .map(
              (l) =>
                `<img src="${escapeHtml(l.url)}" alt="${escapeHtml(l.kind)}" title="${escapeHtml(l.kind)}" loading="lazy" />`,
            )
            .join('')}</div>`
        : ''
    }
  `
  document.getElementById('copy-json')?.addEventListener('click', () => {
    void copyText('JSON', jsonText)
  })
  bindShopCopyButtons()
  refreshPreviewVisibility()
}

/** Raw JSON only (no entity card). Prefer renderEntityCard for detail views. */
function showJson(data: unknown) {
  clearEntity()
  rawEl.hidden = false
  rawEl.textContent = JSON.stringify(data, null, 2)
  refreshPreviewVisibility()
}

function hideJson() {
  rawEl.hidden = true
  rawEl.textContent = ''
  refreshPreviewVisibility()
}

function clearEntity() {
  previewEntity.hidden = true
  previewEntity.innerHTML = ''
  refreshPreviewVisibility()
}

function renderHits(hits: SearchHit[]) {
  hitsEl.innerHTML = hits
    .map(
      (h) => `
    <li data-kind="${escapeHtml(h.kind)}" data-id="${escapeHtml(h.id)}" role="button" tabindex="0">
      ${
        h.imageUrl
          ? `<img src="${escapeHtml(h.imageUrl)}" alt="" loading="lazy" />`
          : '<span class="hit-placeholder"></span>'
      }
      <div class="hit-body">
        <div class="hit-kind">${escapeHtml(h.kind)}</div>
        <div class="hit-title">${escapeHtml(h.title)}</div>
        <div class="hit-sub">${escapeHtml(h.subtitle ?? h.id)}</div>
      </div>
    </li>`,
    )
    .join('')
  hitsEl.querySelectorAll('li').forEach((li) => {
    const go = () => {
      void openHit(li.getAttribute('data-kind')!, li.getAttribute('data-id')!)
    }
    li.addEventListener('click', go)
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        go()
      }
    })
  })
  refreshPreviewVisibility()
}

async function openHit(kind: string, id: string) {
  if (lastPreview?.mode === 'fixed-sample' && catalogCredits <= 0) {
    const hit = lastPreview.sample?.find((row) => row.id === id && row.kind === kind)
    if (hit) showJson(hit)
    setStatus('Free sample · buy credits for full details and catalog search')
    return
  }
  if (
    kind === 'character' ||
    kind === 'product' ||
    kind === 'card' ||
    kind === 'item' ||
    kind === 'model' ||
    kind === 'game' ||
    kind === 'album' ||
    kind === 'console' ||
    kind === 'player'
  ) {
    charInput.value = id
    await runCharacter({ keepHits: true })
  } else if (kind === 'artist' && vertical === 'ost') {
    try {
      const r = await getJson<Record<string, unknown>>(
        apiBase,
        `/v1/ost/artists/${encodeURIComponent(id)}`,
        { vertical: 'ost' },
      )
      setStatus('OK')
      previewMeta.textContent = `artist · ${id}`
      clearEntity()
      showJson(r)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
    }
  } else if (kind === 'series' || kind === 'set') {
    if (vertical === 'tcg' && kind === 'set') {
      try {
        const r = await getJson<Record<string, unknown>>(
          apiBase,
          `/v1/tcg/sets/${encodeURIComponent(id)}`,
          { vertical: 'tcg' },
        )
        setStatus('OK')
        previewMeta.textContent = `set · ${id}`
        clearEntity()
        showJson(r)
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e), true)
      }
      return
    }
    await runSeries(id, { keepHits: true })
  } else if (kind === 'game' && vertical === 'tcg') {
    try {
      const r = await getJson<Record<string, unknown>>(
        apiBase,
        `/v1/tcg/games/${encodeURIComponent(id)}`,
        { vertical: 'tcg' },
      )
      setStatus('OK')
      previewMeta.textContent = `game · ${id}`
      clearEntity()
      showJson(r)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
    }
  } else if (kind === 'maker' || kind === 'line') {
    setStatus(`${kind}: ${id}`)
    previewMeta.textContent = `${kind} · ${id}`
    try {
      const path =
        kind === 'maker'
          ? `/v1/figures/makers/${encodeURIComponent(id)}`
          : `/v1/figures/lines/${encodeURIComponent(id)}`
      const r = await getJson<Record<string, unknown>>(apiBase, path, {
        vertical: 'figures',
      })
      clearEntity()
      showJson(r)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
    }
  } else if (kind === 'brand' || kind === 'provider') {
    setStatus(`${kind}: ${id}`)
    previewMeta.textContent = `${kind} · ${id}`
    try {
      const path =
        kind === 'brand'
          ? `/v1/brands/${encodeURIComponent(id)}`
          : `/v1/providers/${encodeURIComponent(id)}`
      const r = await getJson<Record<string, unknown>>(apiBase, path, {
        vertical,
      })
      const p = r.provider as
        | { name?: string; website?: string; affiliateUrl?: string | null }
        | undefined
      const b = r.brand as { name?: string; website?: string } | undefined
      if (p || b) {
        renderEntityCard({
          kind,
          title: (p?.name || b?.name || id) as string,
          subtitle: kind,
          fields: [
            { label: 'id', value: id },
            {
              label: 'website',
              value: (p?.website || b?.website || '') as string,
            },
            {
              label: 'affiliate',
              value: (p?.affiliateUrl || '') as string,
            },
          ],
          json: r,
        })
      } else {
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true)
    }
  }
}

const searchBtn = document.querySelector('#search-btn') as HTMLButtonElement
const charBtn = document.querySelector('#char-btn') as HTMLButtonElement
const qInput = document.querySelector('#q') as HTMLInputElement
const charInput = document.querySelector('#char-id') as HTMLInputElement
function formatApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/PREVIEW_EXHAUSTED|preview is used up|preview for this catalog/i.test(msg)) {
    return `${msg} · Buy credits for full access → /pricing`
  }
  if (/PAYMENT_REQUIRED|prepaid credits/i.test(msg)) {
    return `${msg} · View the free sample or buy credits at /pricing`
  }
  return msg
}

/** Fashion playground category chip (empty = all; __upcoming = release filter). */
let fashionCat = ''

async function runSearch() {
  const q = qInput.value.trim()
  setStatus('Searching…')
  searchBtn.disabled = true
  clearEntity()
  hideJson()
  try {
    await refreshCredits()
    if (lastPreview?.mode === 'fixed-sample' && catalogCredits <= 0) {
      const hits = lastPreview.sample ?? []
      renderHits(hits)
      showJson({ mode: 'fixed-sample', vertical, sample: hits })
      setStatus('Fixed free sample · buy credits to search the full catalog')
      previewMeta.textContent = `${vertical} · free sample`
      return
    }
    let hits: SearchHit[] = []
    let prevNote = ''
    if (vertical === 'fashion') {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('limit', '24')
      if (fashionCat === '__upcoming') {
        params.set('release', 'upcoming')
        params.set('sort', 'releaseDate')
      } else if (fashionCat) {
        params.set('category', fashionCat)
      }
      const r = await getJson<{
        items: {
          id: string
          title: string
          category?: string
          kind?: string
          colorway?: string | null
          releaseDate?: string | null
          imageUrl?: string | null
        }[]
        total: number
      }>(apiBase, `/v1/fashion/items?${params}`, { vertical: 'fashion' })
      hits = r.items.map((i) => ({
        kind: 'item',
        id: i.id,
        title: i.title,
        subtitle: [i.category, i.kind, i.colorway, i.releaseDate].filter(Boolean).join(' · '),
        imageUrl: i.imageUrl ?? null,
      }))
      const filterNote = fashionCat === '__upcoming' ? 'upcoming' : fashionCat || 'all'
      setStatus(
        hits.length ? `${hits.length} of ${r.total} · ${filterNote}` : `No results · ${filterNote}`,
      )
      previewMeta.textContent = hits.length ? `fashion · ${filterNote}${q ? ` · ${q}` : ''}` : ''
    } else {
      const r = await getJson<{ hits: SearchHit[]; preview?: boolean }>(
        apiBase,
        `/v1/search?q=${encodeURIComponent(q)}&limit=20`,
        { vertical },
      )
      hits = r.hits
      prevNote = r.preview ? ' · free preview' : ''
      const n = hits.length
      setStatus(n ? `${n} result(s)${prevNote}` : 'No results')
      previewMeta.textContent = n ? `search · ${q}${prevNote}` : ''
    }
    renderHits(hits)
    if (!hits.length) hitsEl.innerHTML = ''
    refreshPreviewVisibility()
    void refreshCredits()
  } catch (e) {
    setStatus(formatApiError(e), true)
    hitsEl.innerHTML = ''
    refreshPreviewVisibility()
    void refreshCredits()
  } finally {
    searchBtn.disabled = false
  }
}

// Fashion category chips
document.querySelectorAll<HTMLButtonElement>('.fashion-cat').forEach((btn) => {
  btn.addEventListener('click', () => {
    fashionCat = btn.getAttribute('data-cat') || ''
    document.querySelectorAll('.fashion-cat').forEach((el) => {
      el.classList.toggle('is-active', el === btn)
    })
    void runSearch()
  })
})

async function runCharacter(opts?: { keepHits?: boolean }) {
  await refreshCredits()
  if (lastPreview?.mode === 'fixed-sample' && catalogCredits <= 0) {
    setStatus('Full details require credits · view the free sample with Search')
    return
  }
  const id = charInput.value.trim()
  setStatus('Loading…')
  charBtn.disabled = true
  if (!opts?.keepHits) hitsEl.innerHTML = ''
  try {
    if (vertical === 'pod') {
      await runProduct(id)
      return
    }
    if (vertical === 'tcg') {
      await runTcgCard(id)
      return
    }
    if (vertical === 'figures') {
      await runFigureItem(id)
      return
    }
    if (vertical === 'modelkits') {
      await runModelkitItem(id)
      return
    }
    if (vertical === 'plush') {
      await runPlushItem(id)
      return
    }
    if (vertical === 'fashion') {
      await runFashionItem(id)
      return
    }
    if (vertical === 'boardgames') {
      await runBoardGame(id)
      return
    }
    if (vertical === 'ost') {
      await runOstAlbum(id)
      return
    }
    if (vertical === 'consoles') {
      await runConsole(id)
      return
    }
    if (vertical === 'esports') {
      await runEsportsPlayer(id)
      return
    }
    const r = await getJson<CharacterPayload>(apiBase, `/v1/characters/${encodeURIComponent(id)}`, {
      vertical,
    })
    setStatus('OK')
    previewMeta.textContent = `character · ${r.character.id}`
    const dan =
      r.copy?.danbooruLine ||
      [
        `character:${r.character.name.toLowerCase().replace(/\s+/g, '_')}`,
        `series:${r.character.seriesTitle.toLowerCase().replace(/\s+/g, '_')}`,
        ...(r.character.tags || []),
      ].join(' ')
    renderEntityCard({
      kind: 'character',
      title: r.character.name,
      subtitle: [r.character.nameNative || r.character.nameRomaji, r.character.seriesTitle]
        .filter(Boolean)
        .join(' · '),
      imageUrl: r.character.imageUrl,
      tags: r.character.tags,
      logos: r.logos,
      danbooruLine: dan,
      fields: [
        { label: 'id', value: r.character.id },
        { label: 'name', value: r.character.name },
        {
          label: 'romaji',
          value: r.character.nameRomaji || '',
        },
        { label: 'series', value: r.character.seriesTitle },
        { label: 'seriesId', value: r.character.seriesId },
      ],
      json: r,
      belowJsonHtml: shopPanelHtml(normalizeShops((r as { links?: unknown }).links)),
    })
    void refreshCredits()
  } catch (e) {
    setStatus(formatApiError(e), true)
    clearEntity()
    hideJson()
    void refreshCredits()
  } finally {
    charBtn.disabled = false
  }
}

type PodProductResponse = {
  product: {
    id: string
    styleCode: string
    title: string
    brandId: string
    category: string
    fabric?: string | null
    weightOz?: number | null
    fit?: string | null
    tags: string[]
    printMethodIds?: string[]
    colors: { id: string; name: string; hex?: string | null; code?: string | null }[]
    sizes: { code: string; label: string; chestIn?: number | null; lengthIn?: number | null }[]
    listings: {
      providerId: string
      productUrl: string
      affiliateUrl?: string | null
      shopUrl?: string
      title?: string | null
      provider?: {
        name: string
        website: string
        affiliateUrl?: string | null
        affiliatesPageUrl?: string | null
      } | null
    }[]
  }
  brand: { id: string; name: string; website?: string | null } | null
  printMethods?: { id: string; name: string; shortName: string }[]
  links: {
    shop: {
      providerId: string
      providerName: string
      productUrl: string
      affiliateUrl?: string | null
      shopUrl: string
      isAffiliate: boolean
    }[]
  }
  copy: {
    styleCode: string
    brandStyle: string
    colors: string
    sizes: string
    tags: string
    fabric: string
    printMethods?: string
  }
}

async function runTcgCard(id: string) {
  if (!id) {
    setStatus('Search first, then pick a card (or paste a card id)')
    return
  }
  const r = await getJson<{
    card: {
      id: string
      name: string
      gameId: string
      setCode?: string | null
      number?: string | null
      rarity?: string | null
      imageUrl?: string | null
      tags: string[]
      text?: string | null
      types?: string[]
      colors?: string[]
      hp?: string | null
      power?: string | null
    }
    game: { name: string } | null
    set: { name: string; code: string } | null
    copy: { line: string; tags: string }
  }>(apiBase, `/v1/tcg/cards/${encodeURIComponent(id)}`, { vertical: 'tcg' })
  setStatus('OK')
  previewMeta.textContent = `card · ${r.card.id}`
  const c = r.card
  renderEntityCard({
    kind: c.gameId,
    title: c.name,
    subtitle: [r.game?.name, c.setCode, c.number, c.rarity].filter(Boolean).join(' · '),
    imageUrl: c.imageUrl,
    tags: c.tags,
    fields: [
      { label: 'id', value: c.id },
      { label: 'game', value: c.gameId },
      { label: 'set', value: c.setCode || '' },
      { label: 'number', value: c.number || '' },
      { label: 'rarity', value: c.rarity || '' },
      { label: 'types', value: (c.types || c.colors || []).join(', ') },
      { label: 'hp/atk', value: c.hp || c.power || '' },
      { label: 'text', value: (c.text || '').slice(0, 200) },
    ],
    json: r,
  })
}

async function runConsole(id: string) {
  if (!id) {
    setStatus('Search first, then pick a console (or paste an id)')
    return
  }
  const r = await getJson<{
    console: {
      id: string
      name: string
      manufacturer?: string | null
      formFactor?: string | null
      generation?: number | null
      releaseDate?: string | null
      media?: string[]
      tags?: string[]
      description?: string | null
      imageUrl?: string | null
    }
    manufacturer: { id: string; name: string; website?: string | null } | null
    copy: { name: string; line: string; tags: string }
    links: { manufacturer?: string | null; shop?: { name: string; shopUrl: string }[] }
  }>(apiBase, `/v1/consoles/${encodeURIComponent(id)}`, { vertical: 'consoles' })
  setStatus('OK')
  previewMeta.textContent = `console · ${r.console.id}`
  const c = r.console
  renderEntityCard({
    kind: 'console',
    title: c.name,
    subtitle: r.copy.line,
    imageUrl: c.imageUrl,
    tags: c.tags,
    fields: [
      { label: 'id', value: c.id },
      { label: 'manufacturer', value: c.manufacturer || r.manufacturer?.name || '' },
      { label: 'form', value: c.formFactor || '' },
      { label: 'generation', value: c.generation != null ? String(c.generation) : '' },
      { label: 'released', value: c.releaseDate || '' },
      { label: 'media', value: (c.media || []).join(', ') },
      { label: 'description', value: (c.description || '').slice(0, 200) },
    ],
    json: r,
  })
}

async function runEsportsPlayer(id: string) {
  if (!id) {
    setStatus('Search first, then pick a player (or paste an id)')
    return
  }
  const r = await getJson<{
    player: {
      id: string
      handle: string
      nameReal?: string | null
      role?: string | null
      country?: string | null
      status?: string | null
      teamId?: string | null
      titleIds?: string[]
      tags?: string[]
      imageUrl?: string | null
    }
    team: { id: string; name: string; shortName?: string | null } | null
    titles: { id: string; name: string }[]
  }>(apiBase, `/v1/esports/players/${encodeURIComponent(id)}`, {
    vertical: 'esports',
  })
  setStatus('OK')
  previewMeta.textContent = `player · ${r.player.id}`
  const p = r.player
  renderEntityCard({
    kind: 'player',
    title: p.handle,
    subtitle: [p.nameReal, r.team?.name || r.team?.shortName, p.role, p.country]
      .filter(Boolean)
      .join(' · '),
    imageUrl: p.imageUrl,
    tags: p.tags,
    fields: [
      { label: 'id', value: p.id },
      { label: 'handle', value: p.handle },
      { label: 'name', value: p.nameReal || '' },
      { label: 'team', value: r.team?.name || p.teamId || '' },
      { label: 'role', value: p.role || '' },
      { label: 'country', value: p.country || '' },
      { label: 'status', value: p.status || '' },
      {
        label: 'titles',
        value: (r.titles || []).map((t) => t.name).join(', '),
      },
    ],
    json: r,
  })
}

async function runOstAlbum(id: string) {
  if (!id) {
    setStatus('Search first, then pick an album')
    return
  }
  const r = await getJson<{
    album: {
      id: string
      title: string
      mediaVertical: string
      seriesTitle?: string | null
      type: string
      year?: number | null
      catalogNumber?: string | null
      artists: string[]
      tags: string[]
    }
    copy: { line: string }
    links: { shop?: { name: string; shopUrl: string }[] }
  }>(apiBase, `/v1/ost/albums/${encodeURIComponent(id)}`, { vertical: 'ost' })
  setStatus('OK')
  previewMeta.textContent = `album · ${r.album.id}`
  const a = r.album
  renderEntityCard({
    kind: 'ost',
    title: a.title,
    subtitle: r.copy.line,
    tags: a.tags,
    fields: [
      { label: 'id', value: a.id },
      { label: 'media', value: a.mediaVertical },
      { label: 'series', value: a.seriesTitle || '' },
      { label: 'type', value: a.type },
      { label: 'year', value: a.year != null ? String(a.year) : '' },
      { label: 'catalog', value: a.catalogNumber || '' },
      { label: 'artists', value: (a.artists || []).join(', ') },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(normalizeShops(r.links)),
  })
}

async function runBoardGame(id: string) {
  if (!id) {
    setStatus('Search first, then pick a game (or paste an id)')
    return
  }
  const r = await getJson<{
    game: {
      id: string
      name: string
      yearPublished?: number | null
      minPlayers?: number | null
      maxPlayers?: number | null
      minPlaytimeMin?: number | null
      maxPlaytimeMin?: number | null
      weight?: number | null
      bggRank?: number | null
      categories: string[]
      mechanics: string[]
      designers: string[]
      tags: string[]
    }
    copy: { line: string; players: string; playtime: string }
    links: {
      bgg?: string | null
      shop?: { name: string; shopUrl: string; isAffiliate: boolean }[]
    }
  }>(apiBase, `/v1/boardgames/${encodeURIComponent(id)}`, {
    vertical: 'boardgames',
  })
  setStatus('OK')
  previewMeta.textContent = `game · ${r.game.id}`
  const g = r.game
  renderEntityCard({
    kind: 'boardgame',
    title: g.name,
    subtitle: r.copy.line,
    tags: g.tags,
    fields: [
      { label: 'id', value: g.id },
      { label: 'year', value: g.yearPublished != null ? String(g.yearPublished) : '' },
      { label: 'players', value: r.copy.players },
      { label: 'playtime', value: r.copy.playtime },
      { label: 'weight', value: g.weight != null ? String(g.weight) : '' },
      { label: 'bgg rank', value: g.bggRank != null ? String(g.bggRank) : '' },
      { label: 'categories', value: (g.categories || []).join(', ') },
      { label: 'mechanics', value: (g.mechanics || []).slice(0, 4).join(', ') },
      { label: 'designers', value: (g.designers || []).join(', ') },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(normalizeShops(r.links)),
  })
}

async function runFigureItem(id: string) {
  if (!id) {
    setStatus('Search first, then pick an item (or paste an item id)')
    return
  }
  const r = await getJson<{
    item: {
      id: string
      title: string
      characterName?: string | null
      seriesTitle?: string | null
      kind: string
      scale?: string | null
      productCode?: string | null
      tags: string[]
      imageUrl?: string | null
      shopUrl?: string | null
    }
    maker: { name: string; website?: string | null } | null
    line: { name: string; kind: string } | null
    copy: { lineLabel: string; tags: string }
    links: { shop?: string | null; maker?: string | null }
  }>(apiBase, `/v1/figures/items/${encodeURIComponent(id)}`, {
    vertical: 'figures',
  })
  setStatus('OK')
  previewMeta.textContent = `item · ${r.item.id}`
  const i = r.item
  const figShops = normalizeShops(r.links)
  renderEntityCard({
    kind: i.kind,
    title: i.title,
    subtitle: [r.line?.name || i.kind, r.maker?.name, i.seriesTitle].filter(Boolean).join(' · '),
    imageUrl: i.imageUrl,
    tags: i.tags,
    fields: [
      { label: 'id', value: i.id },
      { label: 'character', value: i.characterName || '' },
      { label: 'series', value: i.seriesTitle || '' },
      { label: 'maker', value: r.maker?.name || '' },
      { label: 'line', value: r.line?.name || '' },
      { label: 'code', value: i.productCode || '' },
      { label: 'scale', value: i.scale || '' },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(figShops),
  })
}

async function runModelkitItem(id: string) {
  if (!id) {
    setStatus('Search first, then pick a kit (or paste a kit id)')
    return
  }
  const r = await getJson<{
    item: {
      id: string
      title: string
      characterName?: string | null
      seriesTitle?: string | null
      kind: string
      grade?: string | null
      scale?: string | null
      productCode?: string | null
      tags: string[]
      imageUrl?: string | null
      shopUrl?: string | null
    }
    maker: { name: string; website?: string | null } | null
    line: { name: string; kind: string } | null
    copy: { lineLabel: string; tags: string }
    links: { shop?: string | null; maker?: string | null }
  }>(apiBase, `/v1/modelkits/items/${encodeURIComponent(id)}`, {
    vertical: 'modelkits',
  })
  setStatus('OK')
  previewMeta.textContent = `kit · ${r.item.id}`
  const i = r.item
  renderEntityCard({
    kind: i.kind,
    title: i.title,
    subtitle: [i.grade || r.line?.name || i.kind, r.maker?.name, i.seriesTitle]
      .filter(Boolean)
      .join(' · '),
    imageUrl: i.imageUrl,
    tags: i.tags,
    fields: [
      { label: 'id', value: i.id },
      { label: 'mecha', value: i.characterName || '' },
      { label: 'series', value: i.seriesTitle || '' },
      { label: 'maker', value: r.maker?.name || '' },
      { label: 'line', value: r.line?.name || '' },
      { label: 'grade', value: i.grade || '' },
      { label: 'scale', value: i.scale || '' },
      { label: 'code', value: i.productCode || '' },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(normalizeShops(r.links)),
  })
}

async function runPlushItem(id: string) {
  if (!id) {
    setStatus('Search first, then pick a plush (or paste an item id)')
    return
  }
  const r = await getJson<{
    item: {
      id: string
      title: string
      characterName?: string | null
      seriesTitle?: string | null
      kind: string
      scale?: string | null
      productCode?: string | null
      tags: string[]
      imageUrl?: string | null
      shopUrl?: string | null
    }
    maker: { name: string; website?: string | null } | null
    line: { name: string; kind: string } | null
    copy: { lineLabel: string; tags: string }
    links: { shop?: string | null; maker?: string | null }
  }>(apiBase, `/v1/plush/items/${encodeURIComponent(id)}`, {
    vertical: 'plush',
  })
  setStatus('OK')
  previewMeta.textContent = `plush · ${r.item.id}`
  const i = r.item
  renderEntityCard({
    kind: i.kind,
    title: i.title,
    subtitle: [r.line?.name || i.kind, r.maker?.name, i.seriesTitle].filter(Boolean).join(' · '),
    imageUrl: i.imageUrl,
    tags: i.tags,
    fields: [
      { label: 'id', value: i.id },
      { label: 'character', value: i.characterName || '' },
      { label: 'series', value: i.seriesTitle || '' },
      { label: 'maker', value: r.maker?.name || '' },
      { label: 'line', value: r.line?.name || '' },
      { label: 'kind', value: i.kind },
      { label: 'size', value: i.scale || '' },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(normalizeShops(r.links)),
  })
}

async function runFashionItem(id: string) {
  if (!id) {
    setStatus('Search first, then pick an item (or paste an item id)')
    return
  }
  const r = await getJson<{
    item: {
      id: string
      title: string
      colorway?: string | null
      styleCode?: string | null
      category?: string
      kind?: string
      season?: string | null
      releaseDate?: string | null
      msrpUsd?: number | null
      tags: string[]
      imageUrl?: string | null
      shopUrl?: string | null
    }
    brand: { name: string; website?: string | null } | null
    line: { name: string; category: string; kind: string } | null
    release: { date: string | null; season?: string | null; upcoming: boolean }
    copy: { lineLabel: string; tags: string }
    links: { shop?: unknown; brand?: string | null }
  }>(apiBase, `/v1/fashion/items/${encodeURIComponent(id)}`, {
    vertical: 'fashion',
  })
  setStatus('OK')
  previewMeta.textContent = `fashion · ${r.item.id}`
  const m = r.item
  renderEntityCard({
    kind: m.kind || m.category || 'fashion',
    title: m.title,
    subtitle: [r.brand?.name, r.line?.name, m.colorway].filter(Boolean).join(' · '),
    imageUrl: m.imageUrl,
    tags: m.tags,
    fields: [
      { label: 'id', value: m.id },
      { label: 'category', value: m.category || '' },
      { label: 'kind', value: m.kind || '' },
      { label: 'colorway', value: m.colorway || '' },
      { label: 'brand', value: r.brand?.name || '' },
      { label: 'line', value: r.line?.name || '' },
      { label: 'style code', value: m.styleCode || '' },
      { label: 'season', value: m.season || '' },
      { label: 'release', value: m.releaseDate || '' },
      {
        label: 'status',
        value: r.release?.upcoming ? 'upcoming' : m.releaseDate ? 'released' : 'unknown',
      },
      {
        label: 'msrp',
        value: m.msrpUsd != null ? `$${m.msrpUsd}` : '',
      },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(normalizeShops(r.links)),
  })
}

async function runProduct(id: string) {
  const r = await getJson<PodProductResponse>(apiBase, `/v1/products/${encodeURIComponent(id)}`, {
    vertical: 'pod',
  })
  setStatus('OK')
  previewMeta.textContent = `product · ${r.product.id}`
  const p = r.product
  const swatches = `
      <div class="color-swatches">
        ${p.colors
          .slice(0, 24)
          .map(
            (c) =>
              `<svg class="swatch" viewBox="0 0 16 16" role="img" aria-label="${escapeHtml(c.name)}"><rect width="16" height="16" rx="4" fill="${/^#[0-9a-f]{3,8}$/i.test(c.hex || '') ? escapeHtml(c.hex || '') : '#333'}"></rect></svg>`,
          )
          .join('')}
        ${p.colors.length > 24 ? `<span class="muted">+${p.colors.length - 24}</span>` : ''}
      </div>`
  renderEntityCard({
    kind: 'blank',
    title: `${p.styleCode} — ${p.title}`,
    subtitle: [r.brand?.name || p.brandId, p.category, p.fit].filter(Boolean).join(' · '),
    tags: p.tags,
    fields: [
      { label: 'id', value: p.id },
      { label: 'style', value: p.styleCode },
      { label: 'brand', value: r.brand?.name || p.brandId },
      { label: 'fabric', value: p.fabric || '' },
      {
        label: 'weight',
        value: p.weightOz != null ? `${p.weightOz} oz` : '',
      },
      { label: 'sizes', value: r.copy.sizes },
      { label: 'colors', value: r.copy.colors },
      { label: 'print', value: r.copy.printMethods || '' },
    ],
    json: r,
    belowJsonHtml: shopPanelHtml(normalizeShops(r.links)) + swatches,
  })
}

async function runSeries(id: string, opts?: { keepHits?: boolean }) {
  setStatus('Loading series…')
  if (!opts?.keepHits) hitsEl.innerHTML = ''
  try {
    const r = await getJson<{
      series: {
        id: string
        title: string
        type?: string
        description?: string
        tags?: string[]
        coverUrl?: string | null
        logoUrl?: string | null
      }
      logos: { url: string; kind: string }[]
    }>(apiBase, `/v1/series/${encodeURIComponent(id)}`, { vertical })
    setStatus('OK')
    previewMeta.textContent = `series · ${r.series.id}`
    renderEntityCard({
      kind: 'series',
      title: r.series.title,
      subtitle: r.series.type,
      imageUrl: r.series.coverUrl || r.series.logoUrl,
      tags: r.series.tags,
      logos: r.logos,
      fields: [
        { label: 'id', value: r.series.id },
        { label: 'title', value: r.series.title },
      ],
      json: r,
      belowJsonHtml: shopPanelHtml(normalizeShops((r as { links?: unknown }).links)),
    })
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), true)
    clearEntity()
    hideJson()
  }
}

function setConsoleNavActive(btn: Element | null) {
  document.querySelectorAll<HTMLButtonElement>('button.nav-link[data-nav]').forEach((el) => {
    const on = el === btn
    el.classList.toggle('is-active', on)
    const name = el.getAttribute('data-ico')
    const slot = el.querySelector('.nav-ico')
    if (name && slot) {
      slot.innerHTML = icon(name, { size: 16, class: 'ico', active: on })
    }
  })
}

document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-nav')!
    setConsoleNavActive(btn)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})

const vertBtn = document.getElementById('vert-switcher-btn') as HTMLButtonElement
const vertPanel = document.getElementById('vert-switcher-panel') as HTMLElement
const vertSwitcher = document.getElementById('vert-switcher') as HTMLElement
const vertFilter = document.getElementById('vert-switcher-filter') as HTMLInputElement
const vertEmpty = document.getElementById('vert-switcher-empty') as HTMLElement

function filterVerticals(query: string) {
  const q = query.trim().toLowerCase()
  let visible = 0
  vertPanel.querySelectorAll<HTMLElement>('.vert-group').forEach((group) => {
    let groupVisible = 0
    group.querySelectorAll<HTMLElement>('.vert-option').forEach((opt) => {
      const hay = opt.dataset.vertSearch || ''
      const show = !q || hay.includes(q)
      opt.hidden = !show
      if (show) {
        groupVisible++
        visible++
      }
    })
    group.hidden = groupVisible === 0
  })
  vertEmpty.hidden = visible > 0
}

function setVertOpen(open: boolean) {
  vertPanel.hidden = !open
  vertBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
  vertSwitcher.classList.toggle('is-open', open)
  if (open) {
    filterVerticals(vertFilter.value)
    requestAnimationFrame(() => {
      vertFilter.focus()
      vertFilter.select()
    })
  } else {
    vertFilter.value = ''
    filterVerticals('')
  }
}

vertBtn.addEventListener('click', () => {
  setVertOpen(vertPanel.hidden)
})

vertFilter.addEventListener('input', () => {
  filterVerticals(vertFilter.value)
})

vertFilter.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (vertFilter.value) {
      vertFilter.value = ''
      filterVerticals('')
      return
    }
    setVertOpen(false)
    vertBtn.focus()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const first = vertPanel.querySelector<HTMLElement>('.vert-option:not([hidden])')
    first?.focus()
  }
  if (e.key === 'Enter') {
    const first = vertPanel.querySelector<HTMLAnchorElement>('.vert-option:not([hidden])')
    if (first) {
      e.preventDefault()
      first.click()
    }
  }
})

// Keyboard: arrow through options while open
vertPanel.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const opts = [...vertPanel.querySelectorAll<HTMLElement>('.vert-option:not([hidden])')]
  if (!opts.length) return
  const i = opts.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (i < 0) opts[0]?.focus()
    else opts[Math.min(i + 1, opts.length - 1)]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (i <= 0) {
      vertFilter.focus()
    } else {
      opts[i - 1]?.focus()
    }
  }
})

// Close switcher when clicking outside (keep open while browsing the list)
document.addEventListener('click', (e) => {
  if (!vertSwitcher.contains(e.target as Node) && !vertPanel.hidden) {
    setVertOpen(false)
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !vertPanel.hidden) {
    // Input handler stops propagation when focused; this catches other focus
    if (document.activeElement === vertFilter) return
    setVertOpen(false)
    vertBtn.focus()
  }
})

searchBtn.addEventListener('click', () => void runSearch())
charBtn.addEventListener('click', () => void runCharacter())
qInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void runSearch()
})
charInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void runCharacter()
})

refreshPreviewVisibility()

function scrollToSection(id: string) {
  const btn = document.querySelector<HTMLButtonElement>(`button.nav-link[data-nav="${id}"]`)
  setConsoleNavActive(btn)
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const docsCmds: CmdItem[] = NAV.map((n) => ({
  id: `docs-sec-${n.id}`,
  title: n.label,
  subtitle: 'Jump to section',
  group: 'Docs',
  icon: n.ico,
  keywords: `section ${n.id}`,
  run: () => scrollToSection(n.id),
}))

docsCmds.push({
  id: 'docs-focus-search',
  title: 'Focus playground search',
  subtitle: 'Type a query',
  group: 'Docs',
  icon: 'search-line',
  keywords: 'playground input',
  run: () => {
    scrollToSection('playground')
    qInput.focus()
    qInput.select()
  },
})

bootShellChrome({ vertical, defaultLang: 'typescript', items: docsCmds })

// Empty preview rail uses the same portal ambient as site pages
{
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches
  if (!narrow && previewPortalHost) {
    void import('./portal-ambient')
      .then(({ mountPortalAmbient, setPortalMotionEnabled }) => {
        setPortalMotion = setPortalMotionEnabled
        mountPortalAmbient(previewPortalHost, {
          animate: !getReducedMotionPref(),
        })
        // Sync with current empty/full state
        refreshPreviewVisibility()
        window.addEventListener('metadata:prefs', ((ev: CustomEvent) => {
          const reduce = Boolean(ev.detail?.reducedMotion)
          // Only animate when portal is visible (no live preview)
          setPortalMotionEnabled(!reduce && previewPortalHost.hidden === false)
        }) as EventListener)
      })
      .catch((e) => {
        console.warn('[Metadata] preview portal ambient failed', e)
      })
  }
}
