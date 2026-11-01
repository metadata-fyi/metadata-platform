import { titlesForGameSeriesSlug } from './esports-catalog.js'
import {
  figureProductImageUrl,
  itemsForSeriesSlug as figureItemsForSeriesSlug,
} from './figure-catalog.js'
import { itemsForSeriesSlug as modelkitItemsForSeriesSlug } from './modelkit-catalog.js'
import { albumsForSeries } from './ost-catalog.js'
import { itemsForSeriesSlug as plushItemsForSeriesSlug } from './plush-catalog.js'
import { skuUri } from './sku.js'

const MEDIA_VERTICALS = new Set(['anime', 'manga', 'game', 'lightnovels', 'cartoons', 'comics'])

const DEFAULT_LIMIT = 20

export type MerchKindItem = {
  id: string
  title: string
  sku: string
  imageUrl?: string | null
  kind: string
}

export type MerchHub = {
  figures: { total: number; items: MerchKindItem[] }
  plush: { total: number; items: MerchKindItem[] }
  modelkits: { total: number; items: MerchKindItem[] }
  ost: { total: number; items: Array<{ id: string; title: string }> }
  esports: { total: number; items: Array<{ id: string; name: string }> }
}

export function isMediaVertical(vertical: string): boolean {
  return MEDIA_VERTICALS.has(vertical)
}

function preferCharacter<T extends { characterName?: string | null }>(
  rows: T[],
  characterName?: string | null,
): T[] {
  const name = characterName?.trim().toLowerCase()
  if (!name) return rows
  const matched = rows.filter((row) => (row.characterName || '').toLowerCase() === name)
  return matched.length ? matched : rows
}

function byTitle<T extends { title: string }>(a: T, b: T): number {
  return a.title.localeCompare(b.title)
}

function merchSlice(
  vertical: 'figures' | 'plush' | 'modelkits',
  rows: Array<{
    id: string
    title: string
    kind: string
    imageUrl?: string | null
  }>,
  limit: number,
): { total: number; items: MerchKindItem[] } {
  const sorted = [...rows].sort(byTitle)
  return {
    total: sorted.length,
    items: sorted.slice(0, limit).map((item) => ({
      id: item.id,
      title: item.title,
      sku: skuUri(vertical, 'items', item.id),
      imageUrl:
        vertical === 'figures'
          ? figureProductImageUrl(item.imageUrl)
          : item.imageUrl ?? null,
      kind: item.kind,
    })),
  }
}

function buildMerch(opts: {
  seriesSlug: string
  limitPerKind: number
  characterName?: string | null
}): MerchHub {
  const slug = opts.seriesSlug.trim().toLowerCase()
  const limit = opts.limitPerKind
  const figures = preferCharacter(figureItemsForSeriesSlug(slug), opts.characterName)
  const plush = preferCharacter(plushItemsForSeriesSlug(slug), opts.characterName)
  const modelkits = preferCharacter(modelkitItemsForSeriesSlug(slug), opts.characterName)
  const ost = albumsForSeries(slug).slice().sort(byTitle)
  const esports = titlesForGameSeriesSlug(slug)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    figures: merchSlice('figures', figures, limit),
    plush: merchSlice('plush', plush, limit),
    modelkits: merchSlice('modelkits', modelkits, limit),
    ost: {
      total: ost.length,
      items: ost.slice(0, limit).map((album) => ({ id: album.id, title: album.title })),
    },
    esports: {
      total: esports.length,
      items: esports.slice(0, limit).map((title) => ({ id: title.id, name: title.name })),
    },
  }
}

export function merchForSeries(opts: {
  seriesId: string
  seriesSlug: string
  vertical: string
  limitPerKind?: number
}): MerchHub {
  return buildMerch({
    seriesSlug: opts.seriesSlug,
    limitPerKind: opts.limitPerKind ?? DEFAULT_LIMIT,
  })
}

export function merchForCharacter(opts: {
  seriesId: string
  seriesSlug: string
  vertical: string
  characterName?: string | null
  limitPerKind?: number
}): MerchHub {
  return buildMerch({
    seriesSlug: opts.seriesSlug,
    limitPerKind: opts.limitPerKind ?? DEFAULT_LIMIT,
    characterName: opts.characterName,
  })
}
