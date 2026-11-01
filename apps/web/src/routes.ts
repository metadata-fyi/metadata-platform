/**
 * Human-facing site routes (apex only). No .html stems.
 * API stays on /v1 and {vertical}.metadata.fyi for agents.
 */

export const PATHS = {
  home: '/',
  /** Product hub (vertical selector) — linked from the landing teaser */
  app: '/app',
  console: '/console',
  pricing: '/pricing',
  stats: '/stats',
  settings: '/settings',
  legal: '/legal',
  feedback: '/feedback',
} as const

/** Clean console URL for a catalog, e.g. /console/game */
export function consolePath(vertical?: string | null): string {
  const v = (vertical || '').trim().toLowerCase()
  if (!v) return PATHS.console
  return `${PATHS.console}/${encodeURIComponent(v)}`
}

/** Feedback with optional vertical query (reporting context only). */
export function feedbackPath(vertical?: string | null): string {
  const v = (vertical || '').trim().toLowerCase()
  if (!v) return PATHS.feedback
  return `${PATHS.feedback}?vertical=${encodeURIComponent(v)}`
}
