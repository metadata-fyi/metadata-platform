/** Id-then-slug lookup maps for catalog getters. Slug fills first; id wins. */

export function indexByIdOrSlug<T extends { id: string; slug: string }>(
  rows: readonly T[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const slugKey = row.slug.toLowerCase()
    if (!map.has(slugKey)) map.set(slugKey, row)
  }
  for (const row of rows) map.set(row.id.toLowerCase(), row)
  return map
}

export function lookupByIdOrSlug<T>(map: Map<string, T>, idOrSlug: string): T | undefined {
  return map.get(idOrSlug.toLowerCase())
}
