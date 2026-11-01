import seriesReleases from '../data/_maintained/series-releases.json' with { type: 'json' }
import animeCharacters from '../data/anime/characters.json' with { type: 'json' }
import animeLogos from '../data/anime/logos.json' with { type: 'json' }
import animeSeries from '../data/anime/series.json' with { type: 'json' }
import cartoonCharacters from '../data/cartoons/characters.json' with { type: 'json' }
import cartoonLogos from '../data/cartoons/logos.json' with { type: 'json' }
import cartoonSeries from '../data/cartoons/series.json' with { type: 'json' }
import comicCharacters from '../data/comics/characters.json' with { type: 'json' }
import comicEditions from '../data/comics/editions.json' with { type: 'json' }
import comicAliases from '../data/comics/series-aliases.json' with { type: 'json' }
import comicLogos from '../data/comics/logos.json' with { type: 'json' }
import comicSeries from '../data/comics/series.json' with { type: 'json' }
import gameCharacters from '../data/game/characters.json' with { type: 'json' }
import gameLogos from '../data/game/logos.json' with { type: 'json' }
import gameSeries from '../data/game/series.json' with { type: 'json' }
import lnCharacters from '../data/lightnovels/characters.json' with { type: 'json' }
import lnLogos from '../data/lightnovels/logos.json' with { type: 'json' }
import lnSeries from '../data/lightnovels/series.json' with { type: 'json' }
import mangaCharacters from '../data/manga/characters.json' with { type: 'json' }
import mangaLogos from '../data/manga/logos.json' with { type: 'json' }
import mangaSeries from '../data/manga/series.json' with { type: 'json' }
import { indexByIdOrSlug, lookupByIdOrSlug } from './lookup.js'
import { skuUri } from './sku-uri.js'
import type {
  ComicEdition,
  Logo,
  MetaCharacter,
  Paginated,
  SearchHit,
  Series,
  SeriesSeason,
  SeriesVolume,
} from './types.js'
import type { LiveVertical } from './verticals.js'

type Catalog = {
  series: Series[]
  characters: MetaCharacter[]
  logos: Logo[]
}

type ReleaseOverlay = {
  seasons?: SeriesSeason[]
  volumes?: SeriesVolume[]
  volumeCount?: number | null
  status?: string | null
}

type ReleasesFile = {
  anime?: Record<string, ReleaseOverlay>
  manga?: Record<string, ReleaseOverlay>
  cartoons?: Record<string, ReleaseOverlay>
}

const releases = seriesReleases as unknown as ReleasesFile

function applyReleases(rows: Series[], vertical: 'anime' | 'manga' | 'cartoons'): Series[] {
  const map = releases[vertical] ?? {}
  return rows.map((s) => {
    const overlay = map[s.id] || map[s.slug]
    if (!overlay) return s
    return {
      ...s,
      ...(overlay.seasons?.length ? { seasons: overlay.seasons } : {}),
      ...(overlay.volumes?.length ? { volumes: overlay.volumes } : {}),
      ...(overlay.volumeCount != null ? { volumeCount: overlay.volumeCount } : {}),
      ...(overlay.status ? { publicationStatus: overlay.status } : {}),
    }
  })
}

const emptyCatalog: Catalog = { series: [], characters: [], logos: [] }

const catalogs: Record<LiveVertical, Catalog> = {
  anime: {
    series: applyReleases(animeSeries as unknown as Series[], 'anime'),
    characters: animeCharacters as unknown as MetaCharacter[],
    logos: animeLogos as unknown as Logo[],
  },
  game: {
    series: gameSeries as unknown as Series[],
    characters: gameCharacters as unknown as MetaCharacter[],
    logos: gameLogos as unknown as Logo[],
  },
  manga: {
    series: applyReleases(mangaSeries as unknown as Series[], 'manga'),
    characters: mangaCharacters as unknown as MetaCharacter[],
    logos: mangaLogos as unknown as Logo[],
  },
  cartoons: {
    series: applyReleases(cartoonSeries as unknown as Series[], 'cartoons'),
    characters: cartoonCharacters as unknown as MetaCharacter[],
    logos: cartoonLogos as unknown as Logo[],
  },
  comics: {
    series: (comicSeries as unknown as Series[]).map((series) => ({
      ...series,
      editions: (comicEditions as unknown as ComicEdition[]).filter(
        (e) => e.seriesId === series.id,
      ),
    })),
    characters: comicCharacters as unknown as MetaCharacter[],
    logos: comicLogos as unknown as Logo[],
  },
  lightnovels: {
    series: lnSeries as unknown as Series[],
    characters: lnCharacters as unknown as MetaCharacter[],
    logos: lnLogos as unknown as Logo[],
  },
  /** POD uses pod-catalog.ts — media endpoints stay empty */
  pod: emptyCatalog,
  /** TCG uses tcg-catalog.ts — media endpoints stay empty */
  tcg: emptyCatalog,
  /** Figures uses figure-catalog.ts — media endpoints stay empty */
  figures: emptyCatalog,
  /** Fashion uses fashion-catalog.ts — media endpoints stay empty */
  fashion: emptyCatalog,
  /** Model kits uses modelkit-catalog.ts */
  modelkits: emptyCatalog,
  /** Plush uses plush-catalog.ts — media endpoints stay empty */
  plush: emptyCatalog,
  /** Board games uses boardgame-catalog.ts — media endpoints stay empty */
  boardgames: emptyCatalog,
  /** OST uses ost-catalog.ts — media endpoints stay empty */
  ost: emptyCatalog,
  /** Consoles uses console-catalog.ts */
  consoles: emptyCatalog,
  /** Esports uses esports-catalog.ts */
  esports: emptyCatalog,
}

function cat(vertical: LiveVertical): Catalog {
  return catalogs[vertical] ?? catalogs.anime
}

const seriesByKey = Object.fromEntries(
  (Object.keys(catalogs) as LiveVertical[]).map((vertical) => [
    vertical,
    indexByIdOrSlug(catalogs[vertical].series),
  ]),
) as Record<LiveVertical, Map<string, Series>>

const charactersByKey = Object.fromEntries(
  (Object.keys(catalogs) as LiveVertical[]).map((vertical) => [
    vertical,
    indexByIdOrSlug(catalogs[vertical].characters),
  ]),
) as Record<LiveVertical, Map<string, MetaCharacter>>

function page<T>(items: T[], limit: number, offset: number): Paginated<T> {
  const lim = Math.min(Math.max(limit, 1), 100)
  const off = Math.max(offset, 0)
  return {
    items: items.slice(off, off + lim),
    total: items.length,
    limit: lim,
    offset: off,
  }
}

export function stats(vertical: LiveVertical) {
  const c = cat(vertical)
  return {
    vertical,
    series: c.series.length,
    characters: c.characters.length,
    logos: c.logos.length,
  }
}

export function statsAll() {
  return {
    anime: stats('anime'),
    game: stats('game'),
    manga: stats('manga'),
    lightnovels: stats('lightnovels'),
    cartoons: stats('cartoons'),
    comics: stats('comics'),
  }
}

export function listSeries(
  vertical: LiveVertical,
  opts?: {
    q?: string
    type?: string
    tag?: string
    limit?: number
    offset?: number
  },
): Paginated<Series> {
  let rows = [...cat(vertical).series]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.slug.includes(q) ||
        s.aliases.some((a) => a.toLowerCase().includes(q)) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }
  if (opts?.type) {
    rows = rows.filter((s) => s.type === opts.type)
  }
  if (opts?.tag) {
    const tag = opts.tag.toLowerCase()
    rows = rows.filter((s) => s.tags.some((t) => t.toLowerCase() === tag))
  }
  rows.sort((a, b) => a.title.localeCompare(b.title))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getSeries(vertical: LiveVertical, idOrSlug: string): Series | undefined {
  const key =
    vertical === 'comics'
      ? ((comicAliases as Record<string, string>)[idOrSlug] ?? idOrSlug)
      : idOrSlug
  return lookupByIdOrSlug(seriesByKey[vertical] ?? seriesByKey.anime, key)
}

export function listCharacters(
  vertical: LiveVertical,
  opts?: {
    q?: string
    series?: string
    tag?: string
    limit?: number
    offset?: number
  },
): Paginated<MetaCharacter> {
  let rows = [...cat(vertical).characters]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((c) => {
      const hay =
        `${c.name} ${c.nameNative ?? ''} ${c.nameRomaji ?? ''} ${c.seriesTitle} ${c.tags.join(' ')} ${c.synopsis ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  if (opts?.series) {
    const s = opts.series.toLowerCase()
    rows = rows.filter((c) => c.seriesId === s || c.seriesTitle.toLowerCase().includes(s))
  }
  if (opts?.tag) {
    const tag = opts.tag.toLowerCase()
    rows = rows.filter((c) => c.tags.some((t) => t.toLowerCase() === tag))
  }
  rows.sort((a, b) => {
    const ra = a.popularityRank ?? 9999
    const rb = b.popularityRank ?? 9999
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getCharacter(vertical: LiveVertical, idOrSlug: string): MetaCharacter | undefined {
  return lookupByIdOrSlug(charactersByKey[vertical] ?? charactersByKey.anime, idOrSlug)
}

export function logosForSeries(vertical: LiveVertical, seriesId: string): Logo[] {
  return cat(vertical).logos.filter((l) => l.seriesId === seriesId)
}

export function search(
  vertical: LiveVertical,
  q: string,
  limit = 20,
  offset = 0,
): { hits: SearchHit[]; total: number } {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: SearchHit[] = []
  const { series, characters } = cat(vertical)

  for (const s of series) {
    const hay = `${s.title} ${s.slug} ${s.aliases.join(' ')} ${s.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query)) continue
    const score = s.title.toLowerCase().startsWith(query) ? 2 : 1
    hits.push({
      kind: 'series',
      id: s.id,
      title: s.title,
      subtitle: s.type,
      imageUrl: s.logoUrl ?? s.coverUrl ?? null,
      score,
      sku: skuUri(vertical, 'series', s.id),
    })
  }

  for (const c of characters) {
    const hay =
      `${c.name} ${c.nameNative ?? ''} ${c.nameRomaji ?? ''} ${c.seriesTitle}`.toLowerCase()
    if (!hay.includes(query)) continue
    const score = c.name.toLowerCase().startsWith(query) ? 2.5 : 1.2
    hits.push({
      kind: 'character',
      id: c.id,
      title: c.name,
      subtitle: c.seriesTitle,
      imageUrl: c.imageUrl ?? null,
      score,
      sku: skuUri(vertical, 'characters', c.id),
    })
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function seriesCharacters(vertical: LiveVertical, seriesId: string): MetaCharacter[] {
  const s = getSeries(vertical, seriesId)
  if (!s) return []
  const set = new Set(s.characterIds)
  const local = cat(vertical).characters.filter((c) => set.has(c.id) || c.seriesId === s.id)
  if (vertical !== 'anime' && vertical !== 'manga') return local
  // Cross-catalog matches require an explicit backlink: series IDs can collide.
  const other = cat(vertical === 'anime' ? 'manga' : 'anime').characters
  const ids = new Set(local.map((c) => c.id))
  return [...local, ...other.filter((c) => set.has(c.id) && !ids.has(c.id))]
}

/** Danbooru-style tag line for a character */
export function characterDanbooruLine(c: MetaCharacter): string {
  const nameTag = c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const seriesTag = c.seriesTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const tags = c.tags.map((t) => t.toLowerCase().replace(/\s+/g, '_'))
  return [`character:${nameTag}`, `series:${seriesTag}`, ...tags].join(' ')
}
