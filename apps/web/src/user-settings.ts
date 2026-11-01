/**
 * Client-side user preferences (localStorage).
 * Account identity is the connected wallet — no email accounts.
 *
 * Reduced motion: default follows OS `prefers-reduced-motion`.
 * Only stores a value after the user explicitly toggles Settings.
 */

const REDUCED_MOTION_KEY = 'metadata.pref.reducedMotion'

export type UserPrefs = {
  reducedMotion: boolean
  /** true when user set an override in Settings */
  reducedMotionOverride: boolean
}

/** OS preference. */
export function osPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Whether the user has saved an explicit choice (not just OS default). */
export function hasReducedMotionOverride(): boolean {
  try {
    return localStorage.getItem(REDUCED_MOTION_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Effective reduced-motion: explicit pref if set, else OS.
 */
export function getReducedMotionPref(): boolean {
  try {
    const raw = localStorage.getItem(REDUCED_MOTION_KEY)
    if (raw === null) return osPrefersReducedMotion()
    return raw === '1' || raw === 'true'
  } catch {
    return osPrefersReducedMotion()
  }
}

export function setReducedMotionPref(on: boolean) {
  try {
    localStorage.setItem(REDUCED_MOTION_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  applyPrefsToDocument()
  window.dispatchEvent(
    new CustomEvent('metadata:prefs', { detail: { reducedMotion: on } }),
  )
}

/** Apply body class so CSS + portal can react. */
export function applyPrefsToDocument() {
  const on = getReducedMotionPref()
  document.documentElement.classList.toggle('is-reduced-motion', on)
  document.body?.classList.toggle('is-reduced-motion', on)
}

let mqBound = false

/** Keep in sync when following OS and the system setting changes. */
export function bindOsReducedMotionListener() {
  if (mqBound || typeof window === 'undefined') return
  mqBound = true
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      if (hasReducedMotionOverride()) return
      applyPrefsToDocument()
      window.dispatchEvent(
        new CustomEvent('metadata:prefs', {
          detail: { reducedMotion: getReducedMotionPref() },
        }),
      )
    }
    mq.addEventListener?.('change', onChange)
  } catch {
    /* ignore */
  }
}

/** Wipe client-side Metadata keys (wallet session, prefs, UI state). */
export function clearLocalUserData() {
  const keys = [
    'metadata.wallet',
    'metadata.pref.reducedMotion',
    'metadata.sidebarCollapsed',
    'metadata.entitlements',
  ]
  for (const k of keys) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  applyPrefsToDocument()
}
