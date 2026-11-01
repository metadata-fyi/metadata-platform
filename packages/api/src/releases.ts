/**
 * Shared release-date helpers for product verticals (sneakers, figures, …).
 * Dates are ISO `YYYY-MM-DD` or `YYYY-MM` or `YYYY` (partial OK).
 */

/** Normalize partial release strings for comparison (start of period). */
export function releaseDateSortKey(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  if (/^\d{4}$/.test(s)) return `${s}-01-01`
  return s
}

/** True if release is on or after today (UTC date). Unknown dates excluded. */
export function isUpcomingRelease(
  raw: string | null | undefined,
  now = new Date(),
): boolean {
  const key = releaseDateSortKey(raw)
  if (!key) return false
  const today = now.toISOString().slice(0, 10)
  return key >= today
}

/** True if release is strictly before today. */
export function isPastRelease(
  raw: string | null | undefined,
  now = new Date(),
): boolean {
  const key = releaseDateSortKey(raw)
  if (!key) return false
  const today = now.toISOString().slice(0, 10)
  return key < today
}

export type ReleaseFilter = 'all' | 'upcoming' | 'released'

export function matchesReleaseFilter(
  raw: string | null | undefined,
  filter: ReleaseFilter | string | undefined,
  now = new Date(),
): boolean {
  const f = (filter || 'all').toLowerCase()
  if (f === 'all' || !f) return true
  if (f === 'upcoming' || f === 'future') return isUpcomingRelease(raw, now)
  if (f === 'released' || f === 'past') return isPastRelease(raw, now)
  return true
}

export function sortByReleaseDate<T extends { releaseDate?: string | null }>(
  rows: T[],
  order: 'asc' | 'desc' = 'asc',
): T[] {
  const dir = order === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const ka = releaseDateSortKey(a.releaseDate) || (dir > 0 ? '9999' : '')
    const kb = releaseDateSortKey(b.releaseDate) || (dir > 0 ? '9999' : '')
    if (ka === kb) return 0
    return ka < kb ? -dir : dir
  })
}
