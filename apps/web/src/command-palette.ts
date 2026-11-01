/**
 * Global command palette (⌘K / Ctrl+K) — navigate pages/verticals, copy snippets.
 * Snippets use a short drill-down (list → language) instead of a flat lang×example dump.
 */
import { escapeHtml, resolveApiBase } from './api'
import { ROOT_DOMAIN, SOURCE_URL, verticalHref } from './config'
import { icon } from './icons'
import {
  examplesForVertical,
  LANG_LABELS,
  LANGS,
  type SnipExample,
  type SnipLang,
} from './snippets'
import { getWalletState } from './wallet'

export type CmdItem = {
  id: string
  title: string
  subtitle?: string
  group: string
  keywords?: string
  icon?: string
  /** Chevron hint for drill-down rows */
  drill?: boolean
  run: () => void | Promise<void>
}

export type CmdPaletteOptions = {
  items?: CmdItem[] | (() => CmdItem[])
  vertical?: string
  defaultLang?: SnipLang
}

const VERTICALS: { id: string; label: string; icon: string }[] = [
  { id: 'anime', label: 'Anime', icon: 'film-line' },
  { id: 'game', label: 'Games', icon: 'game-2-line' },
  { id: 'manga', label: 'Manga', icon: 'book-2-line' },
  { id: 'lightnovels', label: 'Light novels', icon: 'book-2-line' },
  { id: 'cartoons', label: 'Cartoons', icon: 'tv-2-line' },
  { id: 'comics', label: 'Comics', icon: 'book-2-line' },
  { id: 'pod', label: 'Print on Demand', icon: 't-shirt-line' },
  { id: 'tcg', label: 'TCG / cards', icon: 'layers-line' },
  { id: 'figures', label: 'Figures', icon: 'sparkles-line' },
  { id: 'modelkits', label: 'Model kits', icon: 'package-2-line' },
  { id: 'plush', label: 'Plush', icon: 'heart-line' },
  { id: 'fashion', label: 'Fashion', icon: 'shopping-bag-2-line' },
  { id: 'boardgames', label: 'Board games', icon: 'game-2-line' },
  { id: 'ost', label: 'Soundtracks', icon: 'music-2-line' },
  { id: 'consoles', label: 'Consoles', icon: 'game-2-line' },
  { id: 'esports', label: 'Esports', icon: 'trophy-line' },
]

type View =
  | { kind: 'root' }
  | { kind: 'snippets' }
  | { kind: 'snippet-lang'; snip: SnipExample }
  | { kind: 'verticals' }

let booted = false
let open = false
let active = 0
let filtered: CmdItem[] = []
let view: View = { kind: 'root' }
let opts: CmdPaletteOptions = {}
let root: HTMLElement | null = null
let inputEl: HTMLInputElement | null = null
let listEl: HTMLElement | null = null
let crumbEl: HTMLElement | null = null
let toastEl: HTMLElement | null = null

function isMac() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

function modLabel() {
  return isMac() ? '⌘' : 'Ctrl'
}

function defaultLang(): SnipLang {
  return opts.defaultLang ?? 'typescript'
}

function detectVertical(): string {
  if (opts.vertical) return opts.vertical
  try {
    const q = new URLSearchParams(location.search).get('vertical')
    if (q) return q
  } catch {
    /* ignore */
  }
  const host = location.hostname.toLowerCase()
  const first = host.split('.')[0]
  if (VERTICALS.some((v) => v.id === first)) return first
  return 'anime'
}

function currentSnippets(): SnipExample[] {
  return examplesForVertical(
    detectVertical(),
    resolveApiBase(),
    ROOT_DOMAIN,
    Boolean(import.meta.env.DEV),
  )
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast(`Copied ${label}`)
  } catch {
    showToast('Copy failed')
  }
}

function showToast(msg: string) {
  ensureToast()
  if (!toastEl) return
  toastEl.textContent = msg
  toastEl.hidden = false
  clearTimeout((toastEl as unknown as { _t?: number })._t)
  ;(toastEl as unknown as { _t?: number })._t = window.setTimeout(() => {
    if (toastEl) toastEl.hidden = true
  }, 1600)
}

function ensureToast() {
  const existing = document.getElementById('toast')
  if (existing) {
    toastEl = existing
    return
  }
  if (toastEl) return
  toastEl = document.createElement('div')
  toastEl.id = 'toast'
  toastEl.className = 'toast'
  toastEl.hidden = true
  document.body.appendChild(toastEl)
}

function scoreMatch(query: string, item: CmdItem): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const hay = [item.title, item.subtitle, item.group, item.keywords, item.id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (hay.includes(q)) {
    let s = 20
    if (item.title.toLowerCase().startsWith(q)) s += 15
    if (item.title.toLowerCase().includes(q)) s += 8
    return s
  }
  let qi = 0
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) qi++
  }
  if (qi === q.length) return 5
  return 0
}

function setView(next: View) {
  view = next
  active = 0
  if (inputEl) inputEl.value = ''
  updateChrome()
  renderList()
  requestAnimationFrame(() => inputEl?.focus())
}

function goBack() {
  if (view.kind === 'snippet-lang') {
    setView({ kind: 'snippets' })
    return true
  }
  if (view.kind === 'snippets' || view.kind === 'verticals') {
    setView({ kind: 'root' })
    return true
  }
  return false
}

function updateChrome() {
  if (!inputEl || !crumbEl) return
  const vertical = detectVertical()
  if (view.kind === 'root') {
    crumbEl.hidden = true
    crumbEl.textContent = ''
    inputEl.placeholder = 'Navigate, open vertical, copy…'
  } else if (view.kind === 'snippets') {
    crumbEl.hidden = false
    crumbEl.innerHTML = `<button type="button" class="cmd-crumb-back" data-cmd-back>← Back</button><span>Code snippets · ${escapeHtml(vertical)}</span>`
    inputEl.placeholder = 'Filter examples…'
  } else if (view.kind === 'snippet-lang') {
    crumbEl.hidden = false
    crumbEl.innerHTML = `<button type="button" class="cmd-crumb-back" data-cmd-back>← Back</button><span>${escapeHtml(view.snip.title)}</span>`
    inputEl.placeholder = 'Filter languages…'
  } else if (view.kind === 'verticals') {
    crumbEl.hidden = false
    crumbEl.innerHTML = `<button type="button" class="cmd-crumb-back" data-cmd-back>← Back</button><span>Verticals</span>`
    inputEl.placeholder = 'Filter verticals…'
  }
  crumbEl.querySelector('[data-cmd-back]')?.addEventListener('click', () => {
    goBack()
  })
}

function buildRootItems(): CmdItem[] {
  const apiBase = resolveApiBase()
  const vertical = detectVertical()
  const def = defaultLang()
  const items: CmdItem[] = []

  const extra =
    typeof opts.items === 'function' ? opts.items() : opts.items ?? []
  items.push(...extra)

  items.push(
    {
      id: 'nav-landing',
      title: 'Landing',
      subtitle: 'Marketing teaser',
      group: 'Navigate',
      icon: 'sparkles-line',
      keywords: 'home landing marketing',
      run: () => {
        location.href = '/'
      },
    },
    {
      id: 'nav-hub',
      title: 'Hub',
      subtitle: 'Vertical selector',
      group: 'Navigate',
      icon: 'home-3-line',
      keywords: 'home app marketing verticals',
      run: () => {
        location.href = '/app'
      },
    },
    {
      id: 'nav-docs',
      title: 'Docs / playground',
      subtitle: `${vertical} vertical`,
      group: 'Navigate',
      icon: 'play-circle-line',
      keywords: 'console api',
      run: () => {
        location.href = verticalHref(vertical)
      },
    },
    {
      id: 'nav-pricing',
      title: 'Pricing',
      subtitle: 'Credit packs · Reown Pay',
      group: 'Navigate',
      icon: 'lightning-line',
      keywords: 'buy credits usdg pay',
      run: () => {
        location.href = '/pricing'
      },
    },
    {
      id: 'nav-stats',
      title: 'Platform stats',
      subtitle: 'Public API traffic · all clients',
      group: 'Navigate',
      icon: 'terminal-box-line',
      keywords: 'metrics requests volume nerd analytics platform',
      run: () => {
        location.href = '/stats'
      },
    },

    {
      id: 'nav-skill',
      title: 'Agent skill',
      subtitle: 'GET /SKILL.md · open externally',
      group: 'Navigate',
      icon: 'code-line',
      keywords: 'skill agent llm llms cursor claude',
      run: () => {
        window.open(`${apiBase.replace(/\/$/, '')}/SKILL.md`, '_blank', 'noopener,noreferrer')
      },
    },
    {
      id: 'nav-llms',
      title: 'llms.txt',
      subtitle: 'Agent discovery index',
      group: 'Navigate',
      icon: 'document-line',
      keywords: 'llms agents discovery',
      run: () => {
        window.open(`${apiBase.replace(/\/$/, '')}/llms.txt`, '_blank', 'noopener,noreferrer')
      },
    },
    {
      id: 'nav-feedback',
      title: 'Feedback',
      subtitle: 'Flag bad data',
      group: 'Navigate',
      icon: 'mail-line',
      keywords: 'report correction',
      run: () => {
        location.href = `/feedback?vertical=${encodeURIComponent(vertical)}` // context only
      },
    },
    {
      id: 'nav-legal',
      title: 'Legal',
      subtitle: 'Terms, privacy, fair use',
      group: 'Navigate',
      icon: 'document-line',
      run: () => {
        location.href = '/legal'
      },
    },
    {
      id: 'nav-source',
      title: 'Source',
      subtitle: 'Open repository',
      group: 'Navigate',
      icon: 'github-line',
      keywords: 'github git',
      run: () => {
        window.open(SOURCE_URL, '_blank', 'noopener,noreferrer')
      },
    },
  )

  // Account settings only when signed in (same gate as /settings)
  const wallet = getWalletState()
  if (wallet.connected && wallet.address) {
    items.push({
      id: 'nav-settings',
      title: 'Settings',
      subtitle: wallet.short || wallet.address,
      group: 'Account',
      icon: 'settings-3-line',
      keywords: 'account wallet preferences reduced motion profile',
      run: () => {
        location.href = '/settings'
      },
    })
  }

  items.push(
    {
      id: 'browse-verticals',
      title: 'Open vertical…',
      subtitle: `${VERTICALS.length} catalogs`,
      group: 'Browse',
      icon: 'compass-line',
      keywords: 'vertical anime manga tcg plush',
      drill: true,
      run: () => setView({ kind: 'verticals' }),
    },
    {
      id: 'browse-snippets',
      title: 'Code snippets…',
      subtitle: `${currentSnippets().length} examples · pick language after`,
      group: 'Browse',
      icon: 'code-line',
      keywords: 'snippet copy paste curl typescript python javascript example sdk',
      drill: true,
      run: () => setView({ kind: 'snippets' }),
    },
    {
      id: 'copy-api-base',
      title: 'Copy API base URL',
      subtitle: apiBase,
      group: 'Copy',
      icon: 'link-line',
      keywords: 'endpoint host baseurl',
      run: () => void copyText('API base', apiBase),
    },
    {
      id: 'copy-vertical-header',
      title: 'Copy vertical header',
      subtitle: `X-Metadata-Vertical: ${vertical}`,
      group: 'Copy',
      icon: 'copy-2-line',
      keywords: 'header auth',
      run: () => void copyText('header', `X-Metadata-Vertical: ${vertical}`),
    },
    {
      id: 'copy-quick-health',
      title: 'Copy health curl',
      subtitle: vertical,
      group: 'Copy',
      icon: 'terminal-box-line',
      keywords: 'curl health check quick',
      run: () => {
        const curl = `curl ${apiBase}/v1/health \\\n  -H 'X-Metadata-Vertical: ${vertical}'`
        return copyText('health curl', curl)
      },
    },
  )

  // Deep-link from search: if user types a snippet id/lang, surface a few shortcuts
  // without dumping the full matrix on the root empty list.
  void def
  return items
}

function buildSnippetListItems(): CmdItem[] {
  const vertical = detectVertical()
  const def = defaultLang()
  const defLabel = LANG_LABELS[def]
  return currentSnippets().map((snip) => ({
    id: `snip-${snip.id}`,
    title: snip.title,
    subtitle: snip.description,
    group: 'Examples',
    icon: 'code-line',
    keywords: `${snip.id} copy ${def} ${defLabel} ${vertical}`,
    drill: true,
    run: () => setView({ kind: 'snippet-lang', snip }),
  }))
}

function buildSnippetLangItems(snip: SnipExample): CmdItem[] {
  const def = defaultLang()
  return LANGS.map((lang) => {
    const label = LANG_LABELS[lang]
    const isDefault = lang === def
    return {
      id: `snip-lang-${snip.id}-${lang}`,
      title: label,
      subtitle: isDefault ? 'Default · Enter to copy' : `Copy ${snip.title}`,
      group: 'Language',
      icon: isDefault ? 'check-circle-line' : 'copy-2-line',
      keywords: `${lang} ${label} copy`,
      run: () => void copyText(`${snip.title} (${label})`, snip.code[lang]),
    }
  })
}

function buildVerticalItems(): CmdItem[] {
  return VERTICALS.map((v) => ({
    id: `vert-${v.id}`,
    title: v.label,
    subtitle: `Open ${v.id} docs`,
    group: 'Verticals',
    icon: v.icon,
    keywords: `${v.id} catalog api`,
    run: () => {
      location.href = verticalHref(v.id, '/console')
    },
  }))
}

function itemsForView(): CmdItem[] {
  if (view.kind === 'snippets') return buildSnippetListItems()
  if (view.kind === 'snippet-lang') return buildSnippetLangItems(view.snip)
  if (view.kind === 'verticals') return buildVerticalItems()
  return buildRootItems()
}

function filterItems(query: string): CmdItem[] {
  const scored = itemsForView()
    .map((item) => ({ item, score: scoreMatch(query, item) }))
    .filter((x) => x.score > 0)

  const groupOrder = (g: string) =>
    (
      {
        Docs: 0,
        Navigate: 1,
        Account: 2,
        Browse: 3,
        Copy: 4,
        Examples: 5,
        Language: 6,
        Verticals: 7,
        Actions: 8,
      } as Record<string, number>
    )[g] ?? 9

  const def = defaultLang()
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Default language first in language picker
    const aDef = a.item.id.endsWith(`-${def}`) ? 1 : 0
    const bDef = b.item.id.endsWith(`-${def}`) ? 1 : 0
    if (bDef !== aDef) return bDef - aDef
    const go = groupOrder(a.item.group) - groupOrder(b.item.group)
    if (go !== 0) return go
    return a.item.title.localeCompare(b.item.title)
  })

  return scored.map((x) => x.item)
}

function ensureDom() {
  if (root) return
  root = document.createElement('div')
  root.id = 'cmd-palette'
  root.className = 'cmd-palette'
  root.hidden = true
  root.innerHTML = `
    <div class="cmd-palette-backdrop" data-cmd-close></div>
    <div class="cmd-palette-panel" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="cmd-palette-crumb" id="cmd-palette-crumb" hidden></div>
      <div class="cmd-palette-search">
        <span class="cmd-palette-search-ico">${icon('search-line', { size: 16, class: 'ico' })}</span>
        <input type="search" id="cmd-palette-input" placeholder="Navigate, open vertical, copy…" autocomplete="off" spellcheck="false" enterkeyhint="go" />
        <kbd class="cmd-kbd">esc</kbd>
      </div>
      <div class="cmd-palette-list" id="cmd-palette-list" role="listbox"></div>
      <div class="cmd-palette-foot">
        <span><kbd class="cmd-kbd">↑↓</kbd> move</span>
        <span><kbd class="cmd-kbd">↵</kbd> run</span>
        <span><kbd class="cmd-kbd">esc</kbd> back</span>
        <span><kbd class="cmd-kbd">${modLabel()}K</kbd> close</span>
      </div>
    </div>
  `
  document.body.appendChild(root)
  inputEl = root.querySelector('#cmd-palette-input')
  listEl = root.querySelector('#cmd-palette-list')
  crumbEl = root.querySelector('#cmd-palette-crumb')

  root.querySelector('[data-cmd-close]')?.addEventListener('click', () => closePalette())
  inputEl?.addEventListener('input', () => {
    active = 0
    renderList()
  })
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      active = Math.min(active + 1, Math.max(filtered.length - 1, 0))
      renderList(true)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      active = Math.max(active - 1, 0)
      renderList(true)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void runActive()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (goBack()) return
      closePalette()
    } else if (e.key === 'Backspace' && inputEl && inputEl.value === '') {
      if (view.kind !== 'root') {
        e.preventDefault()
        goBack()
      }
    }
  })
}

function renderList(scroll = false) {
  if (!listEl || !inputEl) return
  filtered = filterItems(inputEl.value)
  if (active >= filtered.length) active = Math.max(0, filtered.length - 1)

  if (!filtered.length) {
    listEl.innerHTML = `<div class="cmd-palette-empty">No matches</div>`
    return
  }

  let lastGroup = ''
  const html: string[] = []
  filtered.forEach((item, i) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group
      html.push(
        `<div class="cmd-palette-group" role="presentation">${escapeHtml(item.group)}</div>`,
      )
    }
    const ico = item.icon
      ? icon(item.icon, { size: 15, class: 'ico' })
      : icon('sparkles-line', { size: 15, class: 'ico' })
    const hint = item.drill ? '→' : i === active ? '↵' : ''
    html.push(`
      <button type="button" class="cmd-palette-item${i === active ? ' is-active' : ''}" role="option" aria-selected="${i === active}" data-cmd-idx="${i}">
        <span class="cmd-palette-item-ico">${ico}</span>
        <span class="cmd-palette-item-body">
          <span class="cmd-palette-item-title">${escapeHtml(item.title)}</span>
          ${item.subtitle ? `<span class="cmd-palette-item-sub">${escapeHtml(item.subtitle)}</span>` : ''}
        </span>
        <span class="cmd-palette-item-hint">${hint}</span>
      </button>`)
  })
  listEl.innerHTML = html.join('')

  listEl.querySelectorAll<HTMLButtonElement>('[data-cmd-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.cmdIdx)
      active = idx
      void runActive()
    })
    btn.addEventListener('mouseenter', () => {
      active = Number(btn.dataset.cmdIdx)
      listEl
        ?.querySelectorAll('.cmd-palette-item')
        .forEach((el, i) => el.classList.toggle('is-active', i === active))
    })
  })

  if (scroll) {
    listEl
      .querySelector('.cmd-palette-item.is-active')
      ?.scrollIntoView({ block: 'nearest' })
  }
}

async function runActive() {
  const item = filtered[active]
  if (!item) return
  // Drill-down rows keep the palette open; leaf actions (copy / navigate) close it.
  try {
    if (!item.drill) closePalette()
    await item.run()
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e))
  }
}

export function openPalette() {
  ensureDom()
  ensureToast()
  if (!root || !inputEl) return
  open = true
  view = { kind: 'root' }
  root.hidden = false
  document.body.classList.add('cmd-palette-open')
  inputEl.value = ''
  active = 0
  updateChrome()
  renderList()
  requestAnimationFrame(() => inputEl?.focus())
}

export function closePalette() {
  if (!root) return
  open = false
  view = { kind: 'root' }
  root.hidden = true
  document.body.classList.remove('cmd-palette-open')
}

export function togglePalette() {
  if (open) closePalette()
  else openPalette()
}

export function mountCmdTrigger(host: HTMLElement | null) {
  if (!host || host.querySelector('.cmd-trigger')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'cmd-trigger'
  btn.title = `Command palette (${modLabel()}+K)`
  btn.innerHTML = `${icon('search-line', { size: 14, class: 'ico' })} <span class="cmd-trigger-label">Search</span> <kbd class="cmd-kbd">${modLabel()}K</kbd>`
  btn.addEventListener('click', () => openPalette())
  host.appendChild(btn)
}

export function bootCommandPalette(options: CmdPaletteOptions = {}) {
  opts = options
  if (booted) return
  booted = true

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      togglePalette()
      return
    }

    if (
      e.key === '/' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !typing &&
      !open
    ) {
      e.preventDefault()
      openPalette()
    }
  })
}
