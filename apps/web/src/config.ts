import { consolePath, PATHS } from './routes'

export const ROOT_DOMAIN =
  import.meta.env.VITE_METADATA_ROOT_DOMAIN || 'metadata.fyi'

export function resolveApiBase(): string {
  const env = import.meta.env.VITE_METADATA_API_URL
  if (env) return env.replace(/\/$/, '')
  // Dev: Vite proxies /api → API. Prod: same-origin (Caddy → node).
  if (import.meta.env.DEV) return '/api'
  return ''
}

/**
 * Human console URL — always apex paths (never vertical subdomains).
 * Prod: https://metadata.fyi/console/game
 * Dev:  /console/game
 */
export function verticalHref(vertical: string, _path?: string): string {
  const path = consolePath(vertical)
  if (import.meta.env.DEV) return path
  // Absolute apex so links from any host (legacy vertical subdomain) land correctly
  return `https://${ROOT_DOMAIN}${path}`
}

export { PATHS, consolePath }

export const SOURCE_URL =
  import.meta.env.VITE_SOURCE_URL ||
  'https://forgejo.thomasjvu.com/metadata/metadata'

/** Public site / socials (override via VITE_*) */
export const SITE_URL =
  import.meta.env.VITE_SITE_URL || `https://${ROOT_DOMAIN}`

export const SOCIAL = {
  x:
    import.meta.env.VITE_SOCIAL_X ||
    import.meta.env.VITE_TWITTER_URL ||
    'https://x.com/metadata',
  discord: import.meta.env.VITE_SOCIAL_DISCORD || '',
  github: SOURCE_URL,
} as const

export const COPYRIGHT_HOLDER =
  import.meta.env.VITE_COPYRIGHT_HOLDER || 'Metadata'

/** Taffy ad network — empty base disables the sidebar ad slot */
export const TAFFY_ADS_BASE = (
  import.meta.env.VITE_TAFFY_ADS_BASE || ''
).replace(/\/$/, '')

export const TAFFY_APP_ID =
  import.meta.env.VITE_TAFFY_APP_ID || 'metadata'

export const TAFFY_ADS_ENABLED = Boolean(TAFFY_ADS_BASE)
