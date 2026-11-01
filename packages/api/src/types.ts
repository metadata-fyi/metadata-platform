/** Metadata — open multi-vertical public-data API */

export type SeriesType = 'anime' | 'game' | 'manga' | 'light-novel' | 'cartoon' | 'comic' | 'other'

/** Anime cour / season block (lives on Series, not a separate vertical) */
export interface SeriesSeason {
  number: number
  title: string
  episodes?: number | null
  yearStart?: number | null
  yearEnd?: number | null
  cour?: string | null
  status?: string | null
  notes?: string | null
}

/** Manga / LN volume row (lives on Series, not a separate vertical) */
export interface SeriesVolume {
  number: number
  title?: string | null
  chapters?: string | null
  releaseDate?: string | null
  isbn?: string | null
  status?: string | null
  notes?: string | null
}

export interface ComicEdition {
  id: string
  slug: string
  title: string
  seriesId: string
  kind: 'volume' | 'run'
  characterIds: string[]
  coverUrl?: string | null
  description?: string | null
  sources?: Record<string, string>
  updatedAt: string
}

export interface Series {
  id: string
  slug: string
  title: string
  aliases: string[]
  type: SeriesType
  tags: string[]
  characterIds: string[]
  anilistMediaId?: number | null
  logoUrl?: string | null
  coverUrl?: string | null
  description?: string | null
  sources?: Record<string, string>
  /** Anime seasons / cours — self-maintained overlay when present */
  seasons?: SeriesSeason[]
  /** Manga volume highlights + count — self-maintained overlay when present */
  volumes?: SeriesVolume[]
  /** Source-backed comics volumes/runs linked to the canonical series. */
  editions?: ComicEdition[]
  volumeCount?: number | null
  publicationStatus?: string | null
  /** Linked soundtrack album ids (ost vertical) when known */
  ostAlbumIds?: string[]
  updatedAt: string
}

export interface MetaCharacter {
  id: string
  slug: string
  name: string
  nameNative?: string | null
  nameRomaji?: string | null
  seriesId: string
  seriesTitle: string
  tags: string[]
  archetype?: string | null
  hairColor?: string | null
  eyeColor?: string | null
  age?: number | null
  birthday?: string | null
  heightCm?: number | null
  origin?: string | null
  imageUrl?: string | null
  popularityRank?: number | null
  synopsis?: string | null
  adult: boolean
  updatedAt: string
}

export interface Logo {
  seriesId: string
  kind: 'logo' | 'cover' | 'banner' | 'icon'
  url: string
  width?: number | null
  height?: number | null
  license?: string | null
  attribution?: string | null
}

export interface SearchHit {
  kind: 'series' | 'character'
  id: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  score: number
  sku?: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/** @deprecated Prefer ReportPayload / ContributePayload from reports.ts — re-exported for clients */
export type ContributeKind =
  | 'series'
  | 'character'
  | 'logo'
  | 'product'
  | 'brand'
  | 'card'
  | 'figure'
  | 'boardgame'
  | 'ost'
  | 'album'
  | 'other'

export interface ContributePayload {
  kind: ContributeKind
  payload: Record<string, unknown>
  vertical?: string
  contributor?: string
  note?: string
  sources?: string[]
}

export type ReportKind = 'correction' | 'missing' | 'spam' | 'dmca' | 'other'

export interface ReportPayload {
  kind: ReportKind
  vertical: string
  entityKind: string
  entityId: string
  field?: string | null
  currentValue?: unknown
  suggestedValue?: unknown
  message: string
  sources?: string[]
  contributor?: string | null
  agent?: { name?: string; url?: string } | null
}

/** Optional OST album ids linked from a media series */
// (Series may also gain ostAlbumIds — see Series interface)

export interface MetadataHealth {
  ok: true
  service: 'metadata'
  version: string
  vertical: string
  series: number
  characters: number
  logos: number
  openSource: true
  x402: boolean
}

/** Pack / top-up id — preset (`starter`) or dynamic (`topup-20`). */
export type PackId = string

export interface CreditPack {
  id: PackId
  name: string
  credits: number
  usdg: number
  highlight?: boolean
}
