/**
 * Vanilla Taffy sidebar ad strip (mirrors @taffy/ads/react AdSlot strip).
 * Cross-origin serve/click use credentials: 'omit'.
 */
import { getJson, resolveApiBase } from './api'
import { TAFFY_ADS_BASE, TAFFY_ADS_ENABLED, TAFFY_APP_ID } from './config'
import { safeNavigationUrl } from './url-safety'
import { getWalletState } from './wallet'

export type TaffyCreative = {
  id: string
  href: string
  title: string
  body?: string
  imageUrl?: string
}

type ServePayload = {
  creative: TaffyCreative | null
  impressionId?: string
  rateLimited?: boolean
  error?: string
}

export type Entitlements = {
  adFree: boolean
  power?: { active: boolean; renewsAt?: string | null }
}

const ENTITLEMENTS_CACHE_KEY = 'metadata.entitlements'
const ENTITLEMENTS_TTL_MS = 60_000

function adsFetchInit(baseUrl: string, init?: RequestInit): RequestInit {
  const absolute = /^https?:\/\//i.test(baseUrl)
  return {
    ...init,
    credentials: absolute ? 'omit' : 'include',
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isCollapsed(): boolean {
  return Boolean(document.querySelector('.shell.is-sidebar-collapsed'))
}

/** Fetch Power / ad-free entitlements (stub returns adFree: false until Power ships). */
export async function fetchEntitlements(
  wallet?: string | null,
): Promise<Entitlements> {
  const addr = wallet || getWalletState().address
  if (!addr?.startsWith('0x')) {
    return { adFree: false }
  }

  try {
    const raw = sessionStorage.getItem(ENTITLEMENTS_CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw) as {
        wallet: string
        at: number
        data: Entitlements
      }
      if (
        cached.wallet === addr.toLowerCase() &&
        Date.now() - cached.at < ENTITLEMENTS_TTL_MS
      ) {
        return cached.data
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const data = await getJson<Entitlements>(
      resolveApiBase(),
      `/v1/pay/entitlements?wallet=${encodeURIComponent(addr)}`,
      { wallet: addr },
    )
    const normalized: Entitlements = {
      adFree: Boolean(data.adFree || data.power?.active),
      power: data.power,
    }
    try {
      sessionStorage.setItem(
        ENTITLEMENTS_CACHE_KEY,
        JSON.stringify({
          wallet: addr.toLowerCase(),
          at: Date.now(),
          data: normalized,
        }),
      )
    } catch {
      /* ignore */
    }
    return normalized
  } catch {
    return { adFree: false }
  }
}

export function clearEntitlementsCache() {
  try {
    sessionStorage.removeItem(ENTITLEMENTS_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

function hideHost(host: HTMLElement) {
  host.hidden = true
  host.innerHTML = ''
  host.removeAttribute('data-taffy-loaded')
}

function renderStrip(
  host: HTMLElement,
  creative: TaffyCreative,
  onClick: (e: MouseEvent) => void,
) {
  const body = creative.body?.trim() || ''
  host.innerHTML = `
    <a class="taffy-ad-strip" href="${escapeHtml(creative.href)}" rel="noopener noreferrer sponsored">
      <span class="taffy-ad-eyebrow">Ad</span>
      <span class="taffy-ad-title">${escapeHtml(creative.title)}</span>
      ${body ? `<span class="taffy-ad-body">${escapeHtml(body)}</span>` : ''}
    </a>
  `
  host.hidden = false
  host.setAttribute('data-taffy-loaded', '1')
  const a = host.querySelector('a.taffy-ad-strip') as HTMLAnchorElement | null
  a?.addEventListener('click', onClick)
}

/**
 * Mount / refresh the sidebar ad. Collapses host when disabled, ad-free, empty, or collapsed.
 */
export async function mountSidebarAd(
  host: HTMLElement | null,
  opts?: { baseUrl?: string; appId?: string; force?: boolean },
): Promise<void> {
  if (!host) return

  const baseUrl = (opts?.baseUrl ?? TAFFY_ADS_BASE).replace(/\/$/, '')
  const appId = opts?.appId ?? TAFFY_APP_ID

  if (!baseUrl || !TAFFY_ADS_ENABLED) {
    hideHost(host)
    return
  }

  if (isCollapsed()) {
    // Keep markup so expand doesn't re-serve (new impression)
    host.hidden = true
    return
  }

  const entitlements = await fetchEntitlements()
  if (entitlements.adFree) {
    hideHost(host)
    return
  }

  // Already have a creative — just show again (collapse/wallet re-check)
  if (host.getAttribute('data-taffy-loaded') === '1' && !opts?.force) {
    host.hidden = false
    return
  }

  try {
    const q = new URLSearchParams({ placement: 'sidebar', appId })
    const res = await fetch(
      `${baseUrl}/v1/serve?${q}`,
      adsFetchInit(baseUrl),
    )
    const data = (await res.json().catch(() => ({}))) as ServePayload
    const creative = data.creative
    const href = safeNavigationUrl(creative?.href)
    if (!creative?.id || !href || !creative.title) {
      hideHost(host)
      return
    }
    const safeCreative = { ...creative, href }

    const impressionId =
      typeof data.impressionId === 'string' ? data.impressionId : null

    renderStrip(host, safeCreative, (e) => {
      e.preventDefault()
      void (async () => {
        try {
          await fetch(
            `${baseUrl}/v1/click`,
            adsFetchInit(baseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                creativeId: safeCreative.id,
                placement: 'sidebar',
                appId,
                ...(impressionId ? { impressionId } : {}),
              }),
            }),
          )
        } catch {
          /* still navigate */
        }
        if (href.startsWith('/') && !href.startsWith('//')) {
          window.location.assign(href)
        } else {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      })()
    })
  } catch {
    hideHost(host)
  }
}

/** Re-evaluate ad visibility (wallet / collapse / entitlements). */
export function refreshSidebarAd(force = false) {
  const host = document.getElementById('taffy-sidebar-ad')
  if (!host) return
  void mountSidebarAd(host, { force })
}
