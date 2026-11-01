/**
 * Shared three-column console chrome for hub, docs, pricing, legal, feedback.
 * Page content always lives in the center column.
 */
import { resolveApiBase } from './api'
import { initBrandMarks } from './brand-mark'
import { icon } from './icons'
import { COPYRIGHT_HOLDER, SITE_URL, SOCIAL } from './config'
import { bootCommandPalette, mountCmdTrigger, openPalette } from './command-palette'
import type { CmdPaletteOptions } from './command-palette'
import {
  bootWallet,
  getWalletState,
  toggleWallet,
  type WalletState,
} from './wallet'
import {
  clearEntitlementsCache,
  mountSidebarAd,
  refreshSidebarAd,
} from './taffy-ads'
import {
  applyPrefsToDocument,
  bindOsReducedMotionListener,
  getReducedMotionPref,
} from './user-settings'

export type ShellPageId =
  | 'hub'
  | 'console'
  | 'pricing'
  | 'stats'
  | 'legal'
  | 'feedback'
  | 'settings' // account page — not in primary nav; open via wallet when connected

export type ShellOptions = {
  /** Active primary nav item */
  page: ShellPageId
  /**
   * Items under the Console section (e.g. Overview / Playground).
   * Defaults to a single Console link when omitted.
   */
  consoleNav?: string
  /** Extra blocks after Console (e.g. vertical switcher) */
  sidebarExtra?: string
  /** Center column HTML (main content) */
  centerHtml: string
  /**
   * Right rail mode:
   * - ambient (default for site pages): blank + portal particle canvas
   * - preview (console): functional preview pane
   */
  rightMode?: 'ambient' | 'preview'
  /** Right rail title (preview mode) */
  rightTitle?: string
  /** Right rail body HTML (preview mode) */
  rightHtml?: string
  /** Right rail header trailing HTML (e.g. credits) */
  rightHeadExtra?: string
  /** Show wallet button in sidebar foot */
  wallet?: boolean
  /** Command palette options */
  palette?: CmdPaletteOptions
  /** Skip mounting default cmd trigger (caller will) */
  skipCmdTrigger?: boolean
}

/** Site pages (no section label). Console is its own section. */
const SITE: {
  id: ShellPageId
  label: string
  href: string
  ico: string
}[] = [
  { id: 'hub', label: 'Hub', href: '/app', ico: 'home-3-line' },
  { id: 'pricing', label: 'Pricing', href: '/pricing', ico: 'lightning-line' },
  { id: 'stats', label: 'Stats', href: '/stats', ico: 'terminal-box-line' },
  // Legal + Feedback live in the right-rail footer (not primary nav)
]

/** Build full shell markup (caller sets #app.innerHTML). */
export function shellHtml(opts: ShellOptions): string {
  applyPrefsToDocument()
  bindOsReducedMotionListener()
  const rightMode =
    opts.rightMode ?? (opts.page === 'console' ? 'preview' : 'ambient')
  const rightTitle = opts.rightTitle ?? 'Preview'
  const rightBody = opts.rightHtml ?? ''

  const year = new Date().getFullYear()
  const socialLinks = [
    SOCIAL.x
      ? `<a class="rail-social-link" href="${escapeAttr(SOCIAL.x)}" target="_blank" rel="noreferrer" title="X">${icon('social-x-line', { size: 14, class: 'ico' })}</a>`
      : '',
    SOCIAL.discord
      ? `<a class="rail-social-link" href="${escapeAttr(SOCIAL.discord)}" target="_blank" rel="noreferrer" title="Discord">${icon('discord-line', { size: 14, class: 'ico' })}</a>`
      : '',
    `<a class="rail-social-link" href="${escapeAttr(SOCIAL.github)}" target="_blank" rel="noreferrer" title="Source">${icon('github-line', { size: 14, class: 'ico' })}</a>`,
    `<a class="rail-social-link" href="${escapeAttr(SITE_URL)}" target="_blank" rel="noreferrer" title="Website">${icon('world-2-line', { size: 14, class: 'ico' })}</a>`,
  ]
    .filter(Boolean)
    .join('')

  const footerLinks = `
            <nav class="rail-footer-links" aria-label="Site">
              <a class="rail-footer-link${opts.page === 'legal' ? ' is-active' : ''}" href="/legal"${opts.page === 'legal' ? ' aria-current="page"' : ''}>Legal</a>
              <a class="rail-footer-link${opts.page === 'feedback' ? ' is-active' : ''}" href="/feedback"${opts.page === 'feedback' ? ' aria-current="page"' : ''}>Feedback</a>
            </nav>`

  const ambientFooter = `
          <div class="rail-corner" aria-label="Footer">
            ${footerLinks}
            <div class="rail-footer-end">
              <p class="rail-copy">© ${year} ${escapeAttr(COPYRIGHT_HOLDER)}</p>
              <div class="rail-social">${socialLinks}</div>
            </div>
          </div>`

  const rightRail =
    rightMode === 'ambient'
      ? `<aside class="preview preview-ambient" id="portal-rail">
          <div class="preview-body preview-body-ambient" id="preview-body" aria-hidden="true"></div>
          ${ambientFooter}
        </aside>`
      : `<aside class="preview" aria-label="${escapeAttr(rightTitle)}">
          <div class="preview-head">
            <h2>${icon('pic-line', { size: 14, class: 'ico' })} ${escapeAttr(rightTitle)}</h2>
            ${opts.rightHeadExtra ? `<div class="preview-head-trail">${opts.rightHeadExtra}</div>` : ''}
          </div>
          <div class="preview-body" id="preview-body">
            ${rightBody}
          </div>
          ${ambientFooter}
        </aside>`

  return `
  <div class="shell" data-right="${rightMode}">
    <header class="mobile-topbar" aria-label="Mobile navigation">
      <button type="button" class="mobile-icon-btn" id="nav-open" aria-label="Open menu" aria-controls="app-sidebar" aria-expanded="false">
        ${icon('menu-line', { size: 20, class: 'ico' })}
      </button>
      <a class="mobile-brand" href="/">
        <span class="brand-mark" data-brand-mark><img class="brand-logo" src="/logo.svg" width="24" height="24" alt="" /></span>
        <span class="mobile-brand-text">
          <span class="brand-mark">Metadata</span>
        </span>
      </a>
      <div class="mobile-topbar-actions">
        <button type="button" class="mobile-icon-btn" id="mobile-cmd-btn" aria-label="Search and commands">
          ${icon('search-line', { size: 18, class: 'ico' })}
        </button>
        ${
          opts.wallet !== false
            ? `<button type="button" class="mobile-icon-btn mobile-wallet-btn" id="mobile-wallet-btn" aria-label="Login with wallet" title="Login">
          ${icon('wallet-4-line', { size: 18, class: 'ico' })}
        </button>`
            : ''
        }
      </div>
    </header>

    <div class="nav-backdrop" id="nav-backdrop" hidden></div>

    <aside class="sidebar" id="app-sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-row">
          <a class="sidebar-home" href="/" title="Metadata" id="sidebar-home">
            <span class="brand-lockup">
              <span class="brand-mark" data-brand-mark><img class="brand-logo" src="/logo.svg" width="28" height="28" alt="" /></span>
              <span class="brand-text">
                <span class="brand-mark">Metadata</span>
              </span>
            </span>
          </a>
          <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse" aria-label="Collapse sidebar" aria-controls="app-sidebar" title="Collapse sidebar">
            ${icon('layout-leftbar-close-line', { size: 16, class: 'ico' })}
          </button>
          <button type="button" class="mobile-icon-btn sidebar-close" id="nav-close" aria-label="Close menu">
            ${icon('close-line', { size: 18, class: 'ico' })}
          </button>
        </div>
        <div id="cmd-trigger-host"></div>
      </div>
      <nav class="sidebar-nav" aria-label="Primary">
        <div class="nav-block">
          ${SITE.map((p) => {
            const on = p.id === opts.page
            return `
            <a class="nav-link${on ? ' is-active' : ''}" href="${p.href}" title="${escapeAttr(p.label)}" ${on ? 'aria-current="page"' : ''}>
              <span class="nav-ico">${icon(p.ico, { size: 16, class: 'ico', active: on })}</span>
              <span class="nav-label">${p.label}</span>
            </a>`
          }).join('')}
        </div>
        <div class="nav-block">
          <p class="nav-block-label">Agents</p>
          <a
            class="nav-link"
            href="${escapeAttr(resolveApiBase().replace(/\/$/, ''))}/SKILL.md"
            target="_blank"
            rel="noreferrer"
            title="Open agent skill (GET /SKILL.md)"
          >
            <span class="nav-ico">${icon('code-line', { size: 16, class: 'ico' })}</span>
            <span class="nav-label">Agent skill</span>
            <span class="nav-ext" aria-hidden="true">${icon('external-link-line', { size: 12, class: 'ico' })}</span>
          </a>
          <a
            class="nav-link"
            href="${escapeAttr(resolveApiBase().replace(/\/$/, ''))}/llms.txt"
            target="_blank"
            rel="noreferrer"
            title="Open llms.txt for agents"
          >
            <span class="nav-ico">${icon('document-line', { size: 16, class: 'ico' })}</span>
            <span class="nav-label">llms.txt</span>
            <span class="nav-ext" aria-hidden="true">${icon('external-link-line', { size: 12, class: 'ico' })}</span>
          </a>
        </div>
        <div class="nav-block">
          <p class="nav-block-label">Console</p>
          ${
            opts.consoleNav ??
            (() => {
              const on = opts.page === 'console'
              return `<a class="nav-link${on ? ' is-active' : ''}" href="/console" title="Open console" ${on ? 'aria-current="page"' : ''}>
              <span class="nav-ico">${icon('play-circle-line', { size: 16, class: 'ico', active: on })}</span>
              <span class="nav-label">Open console</span>
            </a>`
            })()
          }
        </div>
        ${opts.sidebarExtra ?? ''}
      </nav>
      <div class="sidebar-ad" id="taffy-sidebar-ad" hidden aria-label="Sponsored"></div>
      <div class="sidebar-foot">
        ${
          opts.wallet !== false
            ? `<button type="button" class="btn btn-primary wallet-btn" id="wallet-btn" title="Login with wallet">
          ${icon('wallet-4-line', { size: 15, class: 'ico' })}
          <span id="wallet-label" class="nav-label">Login</span>
        </button>`
            : ''
        }
      </div>
    </aside>

    <div class="center">
      <div class="center-inner page-center">
        ${opts.centerHtml}
      </div>
    </div>

    ${rightRail}
  </div>
  <div class="toast" id="toast" hidden></div>
`
}

function setNavOpen(open: boolean) {
  document.body.classList.toggle('nav-open', open)
  const openBtn = document.getElementById('nav-open')
  const backdrop = document.getElementById('nav-backdrop')
  openBtn?.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (backdrop) backdrop.hidden = !open
}

/** Mount command palette + optional trigger after shell is in the DOM. */
export function bootShellChrome(
  opts?: CmdPaletteOptions & {
    skipCmdTrigger?: boolean
    /** Mount portal particle ambient in the right rail */
    ambient?: boolean
  },
) {
  initBrandMarks()
  bootCommandPalette(opts ?? {})
  if (!opts?.skipCmdTrigger) {
    mountCmdTrigger(document.getElementById('cmd-trigger-host'))
  }
  bindMobileNav()
  bindSidebarCollapse()
  void mountSidebarAd(document.getElementById('taffy-sidebar-ad'))

  const shell = document.querySelector('.shell')
  const wantAmbient =
    opts?.ambient !== false &&
    (opts?.ambient === true || shell?.getAttribute('data-right') === 'ambient')
  if (wantAmbient) {
    // Skip heavy ambient canvas on narrow viewports (no rail shown)
    const narrow =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 960px)').matches
    if (!narrow) {
      void import('./portal-ambient')
        .then(({ mountPortalAmbient, setPortalMotionEnabled }) => {
          const host =
            document.getElementById('preview-body') ||
            document.getElementById('portal-rail')
          if (host) {
            mountPortalAmbient(host, {
              animate: !getReducedMotionPref(),
            })
          }
          window.addEventListener('metadata:prefs', ((ev: CustomEvent) => {
            setPortalMotionEnabled(!Boolean(ev.detail?.reducedMotion))
          }) as EventListener)
        })
        .catch((e) => {
          console.warn('[Metadata] portal ambient failed', e)
        })
    }
  }
}

const SIDEBAR_COLLAPSE_KEY = 'metadata.sidebarCollapsed'

function isDesktopSidebar(): boolean {
  return window.matchMedia('(min-width: 961px)').matches
}

function applySidebarCollapsed(collapsed: boolean) {
  const shell = document.querySelector('.shell')
  const btn = document.getElementById('sidebar-collapse')
  const home = document.getElementById('sidebar-home') as HTMLAnchorElement | null
  shell?.classList.toggle('is-sidebar-collapsed', collapsed)
  // Ad strip needs full width; hide when rail is icon-only (no re-serve)
  refreshSidebarAd(false)
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    btn.setAttribute(
      'aria-label',
      collapsed ? 'Expand sidebar' : 'Collapse sidebar',
    )
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
    btn.innerHTML = collapsed
      ? icon('layout-leftbar-open-line', { size: 16, class: 'ico' })
      : icon('layout-leftbar-close-line', { size: 16, class: 'ico' })
  }
  if (home) {
    home.title = collapsed ? 'Expand sidebar' : 'Metadata'
  }
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function bindSidebarCollapse() {
  const btn = document.getElementById('sidebar-collapse')
  const home = document.querySelector('.sidebar-home') as HTMLAnchorElement | null

  let collapsed = false
  try {
    collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'
  } catch {
    collapsed = false
  }
  // Only apply minimized rail on desktop shell
  if (isDesktopSidebar()) applySidebarCollapsed(collapsed)
  else applySidebarCollapsed(false)

  btn?.addEventListener('click', () => {
    if (!isDesktopSidebar()) return
    const shell = document.querySelector('.shell')
    const next = !shell?.classList.contains('is-sidebar-collapsed')
    applySidebarCollapsed(next)
  })

  // Collapsed: logo expands rail (no separate toggle under logo)
  home?.addEventListener('click', (e) => {
    if (!isDesktopSidebar()) return
    const shell = document.querySelector('.shell')
    if (!shell?.classList.contains('is-sidebar-collapsed')) return
    e.preventDefault()
    applySidebarCollapsed(false)
  })
}

/** Off-canvas menu + mobile topbar actions. */
function bindMobileNav() {
  const openBtn = document.getElementById('nav-open')
  const closeBtn = document.getElementById('nav-close')
  const backdrop = document.getElementById('nav-backdrop')
  const cmdBtn = document.getElementById('mobile-cmd-btn')

  openBtn?.addEventListener('click', () => setNavOpen(true))
  closeBtn?.addEventListener('click', () => setNavOpen(false))
  backdrop?.addEventListener('click', () => setNavOpen(false))
  cmdBtn?.addEventListener('click', () => {
    setNavOpen(false)
    openPalette()
  })

  // Close drawer after in-app nav (same-origin links in sidebar)
  document.getElementById('app-sidebar')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    const a = t?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    if (a.target === '_blank') return
    setNavOpen(false)
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
      setNavOpen(false)
    }
  })

  // If resized to desktop, ensure drawer closed; restore collapse preference
  const mq = window.matchMedia('(min-width: 961px)')
  const onMq = () => {
    if (mq.matches) {
      setNavOpen(false)
      try {
        applySidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1')
      } catch {
        applySidebarCollapsed(false)
      }
    } else {
      // Mobile drawer is full-width; never keep minimized rail styles
      applySidebarCollapsed(false)
    }
  }
  mq.addEventListener?.('change', onMq)
}

/** Wire sidebar Login button if present. Connected → Settings; logged out → connect. */
export function bindShellWallet(onChange?: (s: WalletState) => void) {
  const walletBtn = document.querySelector('#wallet-btn') as HTMLButtonElement | null
  const walletLabel = document.querySelector('#wallet-label') as HTMLElement | null
  const mobileWalletBtn = document.querySelector(
    '#mobile-wallet-btn',
  ) as HTMLButtonElement | null
  if (!walletBtn && !mobileWalletBtn) return

  function render(s: WalletState) {
    if (walletBtn && walletLabel) {
      walletBtn.classList.toggle('is-connected', s.connected)
      walletLabel.textContent = s.connected ? s.short || 'Connected' : 'Login'
      walletBtn.title = s.connected
        ? `Account ${s.short} · open settings`
        : 'Login with wallet (Reown)'
      walletBtn.setAttribute(
        'aria-label',
        s.connected ? `Account settings ${s.short || ''}` : 'Login with wallet',
      )
    }
    if (mobileWalletBtn) {
      mobileWalletBtn.classList.toggle('is-connected', s.connected)
      mobileWalletBtn.title = s.connected
        ? `Account ${s.short} · open settings`
        : 'Login with wallet (Reown)'
      mobileWalletBtn.setAttribute(
        'aria-label',
        s.connected ? `Account settings ${s.short || ''}` : 'Login with wallet',
      )
    }
    // Power / ad-free may depend on wallet — re-check entitlements
    clearEntitlementsCache()
    refreshSidebarAd(true)
    onChange?.(s)
  }

  async function onWalletClick(btn: HTMLButtonElement) {
    const current = getWalletState()
    // Already signed in → account settings (not disconnect)
    if (current.connected && current.address) {
      setNavOpen(false)
      if (location.pathname.endsWith('/settings')) return
      location.href = '/settings'
      return
    }
    try {
      btn.disabled = true
      if (walletBtn) walletBtn.disabled = true
      if (mobileWalletBtn) mobileWalletBtn.disabled = true
      setNavOpen(false)
      const s = await toggleWallet()
      render(s)
      // Optional deep-link: /app?login=1&next=/settings
      const params = new URLSearchParams(location.search)
      const next = params.get('next')
      if (s.connected && next?.startsWith('/') && !next.startsWith('//')) {
        location.href = next
      }
    } catch (e) {
      const toast = document.getElementById('toast')
      if (toast) {
        toast.textContent = e instanceof Error ? e.message : String(e)
        toast.hidden = false
        window.setTimeout(() => {
          toast.hidden = true
        }, 1600)
      }
    } finally {
      if (walletBtn) walletBtn.disabled = false
      if (mobileWalletBtn) mobileWalletBtn.disabled = false
    }
  }

  walletBtn?.addEventListener('click', () => void onWalletClick(walletBtn))
  mobileWalletBtn?.addEventListener('click', () => void onWalletClick(mobileWalletBtn))

  bootWallet((s) => render(s))
}

function escapeAttr(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
