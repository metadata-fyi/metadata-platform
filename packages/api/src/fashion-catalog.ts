import brandsData from '../data/fashion/brands.json' with { type: 'json' }
import itemsData from '../data/fashion/items.json' with { type: 'json' }
import linesData from '../data/fashion/lines.json' with { type: 'json' }
import { type ShopLink, shopsForEntity } from './affiliates.js'
import type { FashionBrand, FashionItem, FashionLine, FashionStats } from './fashion-types.js'
import { indexByIdOrSlug, lookupByIdOrSlug } from './lookup.js'
import { resolveMedia } from './media.js'
import {
  isUpcomingRelease,
  matchesReleaseFilter,
  type ReleaseFilter,
  sortByReleaseDate,
} from './releases.js'
import { skuUri } from './sku-uri.js'
import { offersFromShops, type SkuCommerce } from './sku-types.js'
import type { Paginated } from './types.js'

const brands = brandsData as unknown as FashionBrand[]
const lines = linesData as unknown as FashionLine[]
const items = itemsData as unknown as FashionItem[]
const brandsByKey = indexByIdOrSlug(brands)
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

export function listFashionBrands(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<FashionBrand> {
  let rows = [...brands]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.slug.includes(q) || b.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getFashionBrand(idOrSlug: string): FashionBrand | undefined {
  return lookupByIdOrSlug(brandsByKey, idOrSlug)
}

export function listFashionLines(opts?: {
  q?: string
  brand?: string
  category?: string
  kind?: string
  limit?: number
  offset?: number
}): Paginated<FashionLine> {
  let rows = [...lines]
  if (opts?.brand) {
    const b = opts.brand.toLowerCase()
    rows = rows.filter((l) => l.brandId === b)
  }
  if (opts?.category) {
    const c = opts.category.toLowerCase()
    rows = rows.filter((l) => l.category.toLowerCase() === c)
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

export function getFashionLine(idOrSlug: string): FashionLine | undefined {
  return lookupByIdOrSlug(linesByKey, idOrSlug)
}

export function listFashionItems(opts?: {
  q?: string
  brand?: string
  line?: string
  category?: string
  kind?: string
  tag?: string
  season?: string
  release?: ReleaseFilter | string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}): Paginated<FashionItem> {
  let rows = [...items]
  if (opts?.brand) {
    const b = opts.brand.toLowerCase()
    rows = rows.filter((i) => i.brandId === b)
  }
  if (opts?.line) {
    const l = opts.line.toLowerCase()
    rows = rows.filter((i) => (i.lineId || '').toLowerCase() === l)
  }
  if (opts?.category) {
    const c = opts.category.toLowerCase()
    rows = rows.filter((i) => i.category.toLowerCase() === c)
  }
  if (opts?.kind) {
    const k = opts.kind.toLowerCase()
    rows = rows.filter((i) => i.kind.toLowerCase() === k)
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((i) => i.tags.some((x) => x.toLowerCase().includes(t)))
  }
  if (opts?.season) {
    const s = opts.season.toLowerCase()
    rows = rows.filter((i) => (i.season || '').toLowerCase() === s)
  }
  if (opts?.release) {
    rows = rows.filter((i) => matchesReleaseFilter(i.releaseDate, opts.release))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((i) => {
      const hay =
        `${i.title} ${i.colorway ?? ''} ${i.styleCode ?? ''} ${i.season ?? ''} ${i.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || i.slug.includes(q) || i.id.includes(q)
    })
  }

  const sort = (opts?.sort || (opts?.release ? 'releaseDate' : 'title')).toLowerCase()
  const order = opts?.order === 'desc' ? 'desc' : 'asc'
  if (sort === 'releasedate' || sort === 'release' || sort === 'date') {
    rows = sortByReleaseDate(rows, order)
  } else {
    rows.sort((a, b) =>
      order === 'desc' ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title),
    )
  }
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allFashionItems(): readonly FashionItem[] {
  return items
}

export function getFashionItem(idOrSlug: string): FashionItem | undefined {
  const byIdOrSlug = lookupByIdOrSlug(itemsByKey, idOrSlug)
  if (byIdOrSlug) return byIdOrSlug
  const key = idOrSlug.toLowerCase()
  const byStyle = items.filter((i) => i.styleCode && i.styleCode.toLowerCase() === key)
  if (byStyle.length === 1) return byStyle[0]
  return undefined
}

function fashionShopQuery(item: FashionItem, brandName?: string | null): string {
  return (
    [item.title, item.colorway, item.styleCode, brandName].filter(Boolean).join(' ') || item.title
  )
}

function fashionShopLinks(item: FashionItem, brandName?: string | null): ShopLink[] {
  const q = fashionShopQuery(item, brandName)
  const shops = shopsForEntity({
    vertical: 'fashion',
    query: q,
  })
  const extra =
    item.category === 'footwear' ? shopsForEntity({ vertical: 'sneakers', query: q }) : []
  const seen = new Set(shops.map((s) => s.partnerId))
  for (const s of extra) {
    if (!seen.has(s.partnerId)) {
      shops.push(s)
      seen.add(s.partnerId)
    }
  }
  return shops
}

export function commerceForFashionItem(item: FashionItem): SkuCommerce {
  const sku = skuUri('fashion', 'items', item.id)
  const brand = getFashionBrand(item.brandId)
  return offersFromShops({
    sku,
    official: item.shopUrl
      ? {
          partnerId: item.brandId,
          name: brand?.name ?? item.brandId,
          url: item.shopUrl,
        }
      : null,
    shops: fashionShopLinks(item, brand?.name),
  })
}

export function enrichFashionItem(item: FashionItem) {
  const brand = getFashionBrand(item.brandId) ?? null
  const line = item.lineId ? (getFashionLine(item.lineId) ?? null) : null
  const media = resolveMedia({
    vertical: 'fashion',
    collection: 'items',
    id: item.id,
    entityImageUrl: item.imageUrl,
  })
  const itemOut = { ...item, imageUrl: media.url ?? item.imageUrl ?? null }
  const sku = skuUri('fashion', 'items', item.id)
  const shops = fashionShopLinks(item, brand?.name).map((s) => ({
    ...s,
    sku,
    role: 'offer' as const,
  }))

  return {
    item: itemOut,
    media,
    brand,
    line,
    release: {
      date: item.releaseDate ?? null,
      season: item.season ?? null,
      upcoming: isUpcomingRelease(item.releaseDate),
    },
    copy: {
      title: item.title,
      colorway: item.colorway ?? '',
      brand: brand?.name ?? item.brandId,
      line: line?.name ?? item.lineId ?? '',
      category: item.category,
      kind: item.kind,
      styleCode: item.styleCode ?? '',
      releaseDate: item.releaseDate ?? '',
      season: item.season ?? '',
      lineLabel: [brand?.name ?? item.brandId, line?.name, item.colorway]
        .filter(Boolean)
        .join(' · '),
      tags: item.tags.join(' '),
    },
    links: {
      shop: shops.slice(0, 12),
      brand: brand?.website ?? null,
      sources: item.sources,
      official: item.shopUrl ?? null,
    },
    affiliates: shops.slice(0, 12).map((x) => ({
      id: x.partnerId,
      name: x.name,
      affiliateUrl: x.isAffiliate ? x.shopUrl : null,
      website: x.website,
      isConfigured: x.isAffiliate,
    })),
    sku: skuUri('fashion', 'items', item.id),
  }
}

export function searchFashion(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'item' | 'brand' | 'line'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []

  for (const i of items) {
    const hay =
      `${i.title} ${i.colorway ?? ''} ${i.styleCode ?? ''} ${i.category} ${i.kind} ${i.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !i.slug.includes(query)) continue
    const score =
      i.styleCode?.toLowerCase() === query
        ? 3
        : (i.colorway || '').toLowerCase() === query
          ? 2.5
          : i.title.toLowerCase().startsWith(query)
            ? 2
            : 1
    hits.push({
      kind: 'item',
      id: i.id,
      title: i.title,
      subtitle: [i.category, i.kind, i.colorway, i.releaseDate].filter(Boolean).join(' · '),
      imageUrl: i.imageUrl ?? null,
      score,
      sku: skuUri('fashion', 'items', i.id),
    })
  }
  for (const b of brands) {
    if (b.name.toLowerCase().includes(query) || b.slug.includes(query)) {
      hits.push({
        kind: 'brand',
        id: b.id,
        title: b.name,
        subtitle: 'brand',
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
        subtitle: `${l.category} · ${l.kind}`,
        score: 1.4,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

/** Category facet list for UI / discovery */
export function fashionCategories(): {
  id: string
  label: string
  count: number
  kinds: { id: string; count: number }[]
}[] {
  const byCat: Record<string, number> = {}
  const byCatKind: Record<string, Record<string, number>> = {}
  for (const i of items) {
    byCat[i.category] = (byCat[i.category] ?? 0) + 1
    byCatKind[i.category] ??= {}
    byCatKind[i.category][i.kind] = (byCatKind[i.category][i.kind] ?? 0) + 1
  }
  const labels: Record<string, string> = {
    footwear: 'Footwear',
    apparel: 'Apparel',
    outerwear: 'Outerwear',
    accessories: 'Accessories',
    watches: 'Watches',
  }
  const order = ['footwear', 'apparel', 'outerwear', 'accessories', 'watches']
  const keys = [
    ...order.filter((k) => byCat[k]),
    ...Object.keys(byCat)
      .filter((k) => !order.includes(k))
      .sort(),
  ]
  return keys.map((id) => ({
    id,
    label: labels[id] || id,
    count: byCat[id] ?? 0,
    kinds: Object.entries(byCatKind[id] || {})
      .map(([kid, count]) => ({ id: kid, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
  }))
}

export function fashionStats(): FashionStats {
  const byCategory: Record<string, number> = {}
  const byBrand: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  let upcoming = 0
  for (const i of items) {
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1
    byBrand[i.brandId] = (byBrand[i.brandId] ?? 0) + 1
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1
    if (isUpcomingRelease(i.releaseDate)) upcoming++
  }
  return {
    items: items.length,
    brands: brands.length,
    lines: lines.length,
    upcoming,
    byCategory,
    byBrand,
    byKind,
  }
}

// —— Back-compat shims used by old sneakers routes ——
export const listSneakerBrands = listFashionBrands
export const getSneakerBrand = getFashionBrand
export function listSneakerSilhouettes(opts?: {
  q?: string
  brand?: string
  category?: string
  limit?: number
  offset?: number
}) {
  // Footwear lines only (legacy silhouette list)
  return listFashionLines({
    q: opts?.q,
    brand: opts?.brand,
    category: 'footwear',
    limit: opts?.limit,
    offset: opts?.offset,
  })
}
export const getSneakerSilhouette = getFashionLine
export function listSneakerModels(opts?: {
  q?: string
  brand?: string
  silhouette?: string
  tag?: string
  release?: ReleaseFilter | string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}) {
  return listFashionItems({
    q: opts?.q,
    brand: opts?.brand,
    line: opts?.silhouette,
    tag: opts?.tag,
    release: opts?.release,
    sort: opts?.sort,
    order: opts?.order,
    limit: opts?.limit,
    offset: opts?.offset,
    category: 'footwear',
  })
}
export const getSneakerModel = getFashionItem
export function enrichSneakerModel(item: FashionItem) {
  const e = enrichFashionItem(item)
  return {
    model: e.item,
    media: e.media,
    brand: e.brand,
    silhouette: e.line,
    release: e.release,
    copy: e.copy,
    links: e.links,
    affiliates: e.affiliates,
    sku: e.sku,
  }
}
