import itemsData from '../data/plush/items.json' with { type: 'json' }
import linesData from '../data/plush/lines.json' with { type: 'json' }
import makersData from '../data/plush/makers.json' with { type: 'json' }
import { shopsForEntity } from './affiliates.js'
import { indexByIdOrSlug, lookupByIdOrSlug } from './lookup.js'
import { resolveMedia } from './media.js'
import type { PlushItem, PlushLine, PlushMaker, PlushStats } from './plush-types.js'
import { skuUri } from './sku-uri.js'
import { offersFromShops, type SkuCommerce } from './sku-types.js'
import type { Paginated } from './types.js'

const makers = makersData as unknown as PlushMaker[]
const lines = linesData as unknown as PlushLine[]
const items = itemsData as unknown as PlushItem[]
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

export function listPlushMakers(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<PlushMaker> {
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

export function getPlushMaker(idOrSlug: string): PlushMaker | undefined {
  return lookupByIdOrSlug(makersByKey, idOrSlug)
}

export function listPlushLines(opts?: {
  q?: string
  maker?: string
  kind?: string
  limit?: number
  offset?: number
}): Paginated<PlushLine> {
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

export function getPlushLine(idOrSlug: string): PlushLine | undefined {
  return lookupByIdOrSlug(linesByKey, idOrSlug)
}

export function listPlushItems(opts?: {
  q?: string
  maker?: string
  line?: string
  kind?: string
  series?: string
  tag?: string
  limit?: number
  offset?: number
}): Paginated<PlushItem> {
  let rows = [...items]
  if (opts?.maker) {
    const m = opts.maker.toLowerCase()
    rows = rows.filter((i) => i.makerId === m)
  }
  if (opts?.line) {
    const l = opts.line.toLowerCase()
    rows = rows.filter((i) => (i.lineId || '').toLowerCase() === l)
  }
  if (opts?.kind) {
    const k = opts.kind.toLowerCase()
    rows = rows.filter((i) => i.kind.toLowerCase() === k)
  }
  if (opts?.series) {
    const s = opts.series.toLowerCase()
    rows = rows.filter(
      (i) =>
        (i.seriesSlug || '').toLowerCase() === s || (i.seriesTitle || '').toLowerCase().includes(s),
    )
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((i) => i.tags.some((x) => x.toLowerCase().includes(t)))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((i) => {
      const hay =
        `${i.title} ${i.characterName ?? ''} ${i.seriesTitle ?? ''} ${i.productCode ?? ''} ${i.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || i.slug.includes(q) || i.id.includes(q)
    })
  }
  rows.sort((a, b) => a.title.localeCompare(b.title))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

/** Exact `seriesSlug` match only. Does not substring-match `seriesTitle`. */
export function itemsForSeriesSlug(slug: string): PlushItem[] {
  const s = slug.trim().toLowerCase()
  if (!s) return []
  return items.filter((i) => (i.seriesSlug || '').toLowerCase() === s)
}

export function allPlushItems(): readonly PlushItem[] {
  return items
}

export function getPlushItem(idOrSlug: string): PlushItem | undefined {
  const byIdOrSlug = lookupByIdOrSlug(itemsByKey, idOrSlug)
  if (byIdOrSlug) return byIdOrSlug
  const key = idOrSlug.toLowerCase()
  const byCode = items.filter((i) => i.productCode && i.productCode.toLowerCase() === key)
  if (byCode.length === 1) return byCode[0]
  return undefined
}

function plushShopQuery(item: PlushItem): string {
  return (
    [item.title, item.characterName, item.seriesTitle, item.productCode]
      .filter(Boolean)
      .join(' ') || item.title
  )
}

export function commerceForPlushItem(item: PlushItem): SkuCommerce {
  const sku = skuUri('plush', 'items', item.id)
  const maker = getPlushMaker(item.makerId)
  return offersFromShops({
    sku,
    official: item.shopUrl
      ? {
          partnerId: item.makerId,
          name: maker?.name ?? item.makerId,
          url: item.shopUrl,
        }
      : null,
    shops: shopsForEntity({ vertical: 'plush', query: plushShopQuery(item) }),
  })
}

export function enrichPlushItem(item: PlushItem) {
  const maker = getPlushMaker(item.makerId) ?? null
  const line = item.lineId ? (getPlushLine(item.lineId) ?? null) : null
  const media = resolveMedia({
    vertical: 'plush',
    collection: 'items',
    id: item.id,
    entityImageUrl: item.imageUrl,
  })
  const itemOut = { ...item, imageUrl: media.url ?? item.imageUrl ?? null }
  const sku = skuUri('plush', 'items', item.id)
  const shops = shopsForEntity({
    vertical: 'plush',
    query: plushShopQuery(item),
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
    sku: skuUri('plush', 'items', item.id),
  }
}

export function searchPlush(q: string, limit = 20, offset = 0) {
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
          : i.kind === 'fumo' && query.includes('fumo')
            ? 2.5
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
      sku: skuUri('plush', 'items', i.id),
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

export function plushStats(): PlushStats {
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
