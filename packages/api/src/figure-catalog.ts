import itemsData from '../data/figures/items.json' with { type: 'json' }
import linesData from '../data/figures/lines.json' with { type: 'json' }
import makersData from '../data/figures/makers.json' with { type: 'json' }
import { shopsForEntity } from './affiliates.js'
import type { FigureItem, FigureLine, FigureMaker, FigureStats } from './figure-types.js'
import { indexByIdOrSlug, lookupByIdOrSlug } from './lookup.js'
import { resolveMedia } from './media.js'
import { matchesReleaseFilter, sortByReleaseDate } from './releases.js'
import { skuUri } from './sku-uri.js'
import { offersFromShops, type SkuCommerce } from './sku-types.js'
import type { Paginated } from './types.js'

const makers = makersData as unknown as FigureMaker[]
const lines = linesData as unknown as FigureLine[]
const items = itemsData as unknown as FigureItem[]
const makersByKey = indexByIdOrSlug(makers)
const linesByKey = indexByIdOrSlug(lines)
const itemsByKey = indexByIdOrSlug(items)

function page<T>(itemsIn: T[], limit: number, offset: number): Paginated<T> {
  const lim = Math.min(Math.max(limit, 1), 100)
  const off = Math.max(offset, 0)
  return {
    items: itemsIn.slice(off, off + lim),
    total: itemsIn.length,
    limit: lim,
    offset: off,
  }
}

export function listFigureMakers(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<FigureMaker> {
  let rows = [...makers]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.slug.includes(q) ||
        (m.nameNative || '').toLowerCase().includes(q) ||
        m.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getFigureMaker(idOrSlug: string): FigureMaker | undefined {
  return lookupByIdOrSlug(makersByKey, idOrSlug)
}

export function listFigureLines(opts?: {
  q?: string
  maker?: string
  kind?: string
  limit?: number
  offset?: number
}): Paginated<FigureLine> {
  let rows = [...lines]
  if (opts?.maker) {
    const m = opts.maker.toLowerCase()
    rows = rows.filter((l) => l.makerId === m || l.makerId.includes(m))
  }
  if (opts?.kind) {
    const k = opts.kind.toLowerCase()
    rows = rows.filter((l) => l.kind.toLowerCase() === k)
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (l) =>
        l.name.toLowerCase().includes(q) || l.slug.includes(q) || l.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getFigureLine(idOrSlug: string): FigureLine | undefined {
  return lookupByIdOrSlug(linesByKey, idOrSlug)
}

export function listFigureItems(opts?: {
  q?: string
  maker?: string
  line?: string
  kind?: string
  series?: string
  tag?: string
  /** all | upcoming | released */
  release?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}): Paginated<FigureItem> {
  let rows = [...items]
  if (opts?.maker) {
    const m = opts.maker.toLowerCase()
    rows = rows.filter((i) => i.makerId === m)
  }
  if (opts?.line) {
    const l = opts.line.toLowerCase()
    rows = rows.filter((i) => i.lineId === l || i.lineId?.includes(l))
  }
  if (opts?.kind) {
    const k = opts.kind.toLowerCase()
    rows = rows.filter((i) => i.kind.toLowerCase() === k)
  }
  if (opts?.series) {
    const s = opts.series.toLowerCase()
    rows = rows.filter(
      (i) => i.seriesSlug?.toLowerCase() === s || (i.seriesTitle || '').toLowerCase().includes(s),
    )
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((i) => i.tags.some((x) => x.toLowerCase() === t))
  }
  if (opts?.release) {
    rows = rows.filter((i) => matchesReleaseFilter(i.releaseDate, opts.release))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((i) => {
      const hay =
        `${i.title} ${i.characterName ?? ''} ${i.seriesTitle ?? ''} ${i.productCode ?? ''} ${i.publisherProductCode ?? ''} ${i.jan ?? ''} ${i.boxNumber ?? ''} ${i.makerId} ${i.lineId ?? ''} ${i.kind} ${i.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || i.slug.includes(q) || i.id.includes(q)
    })
  }
  const sort = (opts?.sort || (opts?.release ? 'releaseDate' : '')).toLowerCase()
  if (sort === 'releasedate' || sort === 'release' || sort === 'date') {
    rows = sortByReleaseDate(rows, opts?.order === 'desc' ? 'desc' : 'asc')
  } else {
    rows.sort(
      (a, b) =>
        a.title.localeCompare(b.title) ||
        String(a.productCode).localeCompare(String(b.productCode)),
    )
  }
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

/** Exact `seriesSlug` match only. Does not substring-match `seriesTitle`. */
export function itemsForSeriesSlug(slug: string): FigureItem[] {
  const s = slug.trim().toLowerCase()
  if (!s) return []
  return items.filter((i) => i.seriesSlug?.toLowerCase() === s)
}

export function allFigureItems(): readonly FigureItem[] {
  return items
}

/** Do not present an AniList character portrait as a figure/product photo. */
export function figureProductImageUrl(imageUrl?: string | null): string | null {
  if (!imageUrl) return null
  try {
    const url = new URL(imageUrl)
    const isAniListCharacterImage =
      (url.hostname.toLowerCase() === 'anilist.co' ||
        url.hostname.toLowerCase().endsWith('.anilist.co')) &&
      /\/character\//i.test(url.pathname)
    if (isAniListCharacterImage) return null
  } catch {
    // Catalog validation reports malformed URLs; preserve the value here.
  }
  return imageUrl
}

export function getFigureItem(idOrSlug: string): FigureItem | undefined {
  const byIdOrSlug = lookupByIdOrSlug(itemsByKey, idOrSlug)
  if (byIdOrSlug) return byIdOrSlug
  const key = idOrSlug.toLowerCase()
  const byCode = items.filter((i) => i.productCode && i.productCode.toLowerCase() === key)
  if (byCode.length === 1) return byCode[0]
  return undefined
}

function figureShopQuery(item: FigureItem): string {
  return (
    [item.title, item.characterName, item.seriesTitle, item.productCode]
      .filter(Boolean)
      .join(' ') || item.title
  )
}

export function commerceForFigureItem(item: FigureItem): SkuCommerce {
  const sku = skuUri('figures', 'items', item.id)
  const maker = getFigureMaker(item.makerId)
  return offersFromShops({
    sku,
    official: item.shopUrl
      ? {
          partnerId: item.makerId,
          name: maker?.name ?? item.makerId,
          url: item.shopUrl,
        }
      : null,
    shops: shopsForEntity({ vertical: 'figures', query: figureShopQuery(item) }),
  })
}

export function enrichFigureItem(item: FigureItem) {
  const maker = getFigureMaker(item.makerId) ?? null
  const line = item.lineId ? (getFigureLine(item.lineId) ?? null) : null
  const media = resolveMedia({
    vertical: 'figures',
    collection: 'items',
    id: item.id,
    entityImageUrl: figureProductImageUrl(item.imageUrl),
  })
  const itemOut = { ...item, imageUrl: figureProductImageUrl(media.url) }
  const sku = skuUri('figures', 'items', item.id)
  const shops = shopsForEntity({
    vertical: 'figures',
    query: figureShopQuery(item),
  }).map((s) => ({ ...s, sku, role: 'offer' as const }))
  return {
    item: itemOut,
    media,
    maker,
    line,
    copy: {
      title: item.title,
      character: item.characterName ?? '',
      series: item.seriesTitle ?? '',
      line: line?.name ?? item.lineId ?? '',
      maker: maker?.name ?? item.makerId,
      productCode: item.productCode ?? '',
      scale: item.scale ?? line?.scale ?? '',
      lineLabel: [maker?.name ?? item.makerId, line?.name ?? item.kind, item.productCode]
        .filter(Boolean)
        .join(' · '),
      tags: item.tags.join(' '),
    },
    links: {
      shop: shops,
      maker: maker?.website ?? null,
      line: line?.website ?? null,
      sources: item.sources,
      official: item.shopUrl ?? null,
    },
    affiliates: shops.map((x) => ({
      id: x.partnerId,
      name: x.name,
      affiliateUrl: x.isAffiliate ? x.shopUrl : null,
      website: x.website,
      isConfigured: x.isAffiliate,
    })),
    sku: skuUri('figures', 'items', item.id),
  }
}

export function searchFigures(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'item' | 'maker' | 'line'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []

  for (const i of items) {
    const hay =
      `${i.title} ${i.characterName ?? ''} ${i.seriesTitle ?? ''} ${i.productCode ?? ''} ${i.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !i.slug.includes(query)) continue
    const score =
      i.productCode?.toLowerCase() === query
        ? 3
        : (i.characterName || '').toLowerCase() === query
          ? 2.8
          : i.title.toLowerCase().startsWith(query)
            ? 2
            : (i.characterName || '').toLowerCase().includes(query)
              ? 1.8
              : 1
    hits.push({
      kind: 'item',
      id: i.id,
      title: i.title,
      subtitle: [i.characterName, i.seriesTitle, i.kind].filter(Boolean).join(' · '),
      imageUrl: i.imageUrl ?? null,
      score,
      sku: skuUri('figures', 'items', i.id),
    })
  }
  for (const m of makers) {
    if (
      m.name.toLowerCase().includes(query) ||
      m.slug.includes(query) ||
      (m.nameNative || '').includes(query)
    ) {
      hits.push({
        kind: 'maker',
        id: m.id,
        title: m.name,
        subtitle: 'maker',
        score: 1.5,
      })
    }
  }
  for (const l of lines) {
    if (l.name.toLowerCase().includes(query) || l.slug.includes(query)) {
      hits.push({
        kind: 'line',
        id: l.id,
        title: l.name,
        subtitle: l.kind,
        score: 1.4,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function figureStats(): FigureStats {
  const byKind: Record<string, number> = {}
  for (const i of items) {
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1
  }
  return {
    items: items.length,
    makers: makers.length,
    lines: lines.length,
    byKind,
  }
}
