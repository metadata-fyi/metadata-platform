import itemsData from '../data/modelkits/items.json' with { type: 'json' }
import linesData from '../data/modelkits/lines.json' with { type: 'json' }
import makersData from '../data/modelkits/makers.json' with { type: 'json' }
import { shopsForEntity } from './affiliates.js'
import { indexByIdOrSlug, lookupByIdOrSlug } from './lookup.js'
import { resolveMedia } from './media.js'
import type { ModelkitItem, ModelkitLine, ModelkitMaker, ModelkitStats } from './modelkit-types.js'
import { skuUri } from './sku-uri.js'
import { offersFromShops, type SkuCommerce } from './sku-types.js'
import type { Paginated } from './types.js'

const makers = makersData as unknown as ModelkitMaker[]
const lines = linesData as unknown as ModelkitLine[]
const items = itemsData as unknown as ModelkitItem[]
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

export function listModelkitMakers(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<ModelkitMaker> {
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

export function getModelkitMaker(idOrSlug: string): ModelkitMaker | undefined {
  return lookupByIdOrSlug(makersByKey, idOrSlug)
}

export function listModelkitLines(opts?: {
  q?: string
  maker?: string
  kind?: string
  limit?: number
  offset?: number
}): Paginated<ModelkitLine> {
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

export function getModelkitLine(idOrSlug: string): ModelkitLine | undefined {
  return lookupByIdOrSlug(linesByKey, idOrSlug)
}

export function listModelkitItems(opts?: {
  q?: string
  maker?: string
  line?: string
  kind?: string
  grade?: string
  series?: string
  tag?: string
  limit?: number
  offset?: number
}): Paginated<ModelkitItem> {
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
  if (opts?.grade) {
    const g = opts.grade.toLowerCase()
    rows = rows.filter((i) => (i.grade || '').toLowerCase() === g)
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
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((i) => {
      const hay =
        `${i.title} ${i.titleNative ?? ''} ${i.characterName ?? ''} ${i.seriesTitle ?? ''} ${i.productCode ?? ''} ${i.jan ?? ''} ${i.publisherBrand ?? ''} ${i.grade ?? ''} ${i.makerId} ${i.lineId ?? ''} ${i.kind} ${i.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || i.slug.includes(q) || i.id.includes(q)
    })
  }
  rows.sort(
    (a, b) =>
      a.title.localeCompare(b.title) || String(a.productCode).localeCompare(String(b.productCode)),
  )
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

/** Exact `seriesSlug` match only. Does not substring-match `seriesTitle`. */
export function itemsForSeriesSlug(slug: string): ModelkitItem[] {
  const s = slug.trim().toLowerCase()
  if (!s) return []
  return items.filter((i) => i.seriesSlug?.toLowerCase() === s)
}

export function allModelkitItems(): readonly ModelkitItem[] {
  return items
}

export function getModelkitItem(idOrSlug: string): ModelkitItem | undefined {
  const byIdOrSlug = lookupByIdOrSlug(itemsByKey, idOrSlug)
  if (byIdOrSlug) return byIdOrSlug
  const key = idOrSlug.toLowerCase()
  const byCode = items.filter((i) => i.productCode && i.productCode.toLowerCase() === key)
  if (byCode.length === 1) return byCode[0]
  return undefined
}

function modelkitShopQuery(item: ModelkitItem): string {
  return (
    [item.title, item.characterName, item.seriesTitle, item.productCode]
      .filter(Boolean)
      .join(' ') || item.title
  )
}

export function commerceForModelkitItem(item: ModelkitItem): SkuCommerce {
  const sku = skuUri('modelkits', 'items', item.id)
  const maker = getModelkitMaker(item.makerId)
  return offersFromShops({
    sku,
    official: item.shopUrl
      ? {
          partnerId: item.makerId,
          name: maker?.name ?? item.makerId,
          url: item.shopUrl,
        }
      : null,
    shops: shopsForEntity({ vertical: 'modelkits', query: modelkitShopQuery(item) }),
  })
}

export function enrichModelkitItem(item: ModelkitItem) {
  const maker = getModelkitMaker(item.makerId) ?? null
  const line = item.lineId ? (getModelkitLine(item.lineId) ?? null) : null
  const media = resolveMedia({
    vertical: 'modelkits',
    collection: 'items',
    id: item.id,
    entityImageUrl: item.imageUrl,
  })
  const itemOut = { ...item, imageUrl: media.url ?? item.imageUrl ?? null }
  const sku = skuUri('modelkits', 'items', item.id)
  const shops = shopsForEntity({
    vertical: 'modelkits',
    query: modelkitShopQuery(item),
  }).map((s) => ({ ...s, sku, role: 'offer' as const }))
  return {
    item: itemOut,
    media,
    maker,
    line,
    copy: {
      title: item.title,
      mecha: item.characterName ?? '',
      series: item.seriesTitle ?? '',
      grade: item.grade ?? line?.name ?? item.kind,
      scale: item.scale ?? line?.scale ?? '',
      maker: maker?.name ?? item.makerId,
      productCode: item.productCode ?? '',
      lineLabel: [
        maker?.name ?? item.makerId,
        item.grade ?? line?.name ?? item.kind,
        item.scale,
        item.productCode,
      ]
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
    sku: skuUri('modelkits', 'items', item.id),
  }
}

export function searchModelkits(q: string, limit = 20, offset = 0) {
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
      `${i.title} ${i.titleNative ?? ''} ${i.characterName ?? ''} ${i.seriesTitle ?? ''} ${i.productCode ?? ''} ${i.jan ?? ''} ${i.publisherBrand ?? ''} ${i.grade ?? ''} ${i.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !i.slug.includes(query)) continue
    hits.push({
      kind: 'item',
      id: i.id,
      title: i.title,
      subtitle: [i.grade, i.scale, i.seriesTitle].filter(Boolean).join(' · '),
      imageUrl: i.imageUrl ?? null,
      score: hay.startsWith(query) ? 3 : 1,
      sku: skuUri('modelkits', 'items', i.id),
    })
  }
  for (const m of makers) {
    const hay = `${m.name} ${m.nameNative ?? ''} ${m.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !m.slug.includes(query)) continue
    hits.push({
      kind: 'maker',
      id: m.id,
      title: m.name,
      subtitle: 'maker',
      score: 2,
    })
  }
  for (const l of lines) {
    const hay = `${l.name} ${l.kind} ${l.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !l.slug.includes(query)) continue
    hits.push({
      kind: 'line',
      id: l.id,
      title: l.name,
      subtitle: l.scale || l.kind,
      score: 2,
    })
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function modelkitStats(): ModelkitStats {
  const byKind: Record<string, number> = {}
  const byGrade: Record<string, number> = {}
  for (const i of items) {
    byKind[i.kind] = (byKind[i.kind] || 0) + 1
    const g = i.grade || 'other'
    byGrade[g] = (byGrade[g] || 0) + 1
  }
  return {
    items: items.length,
    makers: makers.length,
    lines: lines.length,
    byKind,
    byGrade,
  }
}
