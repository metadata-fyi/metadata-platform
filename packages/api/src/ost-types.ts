/** Soundtrack / OST catalog types */

export type OstMediaVertical = 'anime' | 'game' | 'cartoon' | 'manga' | 'other'

export type OstAlbumType =
  | 'ost'
  | 'insert'
  | 'character-song'
  | 'arrange'
  | 'vocal'
  | 'vinyl'
  | 'ep'
  | 'single'
  | 'other'

export type OstReleaseFormat = 'cd' | 'vinyl' | 'digital'

export interface OstArtist {
  id: string
  slug: string
  name: string
  nameNative?: string | null
  role?: string | null
  tags: string[]
  sources?: Record<string, string>
  updatedAt: string
}

export interface OstTrack {
  number?: number | null
  disc?: number | null
  title: string
  durationSec?: number | null
  artists?: string[]
}

export interface OstAlbum {
  id: string
  slug: string
  title: string
  aliases: string[]
  /** Original catalog album associated with a distinct physical edition. */
  parentAlbumId?: string | null
  /** Source edition facts, including physical track-side labels. */
  editionDetails?: Record<string, unknown>
  /** Primary media franchise vertical this OST belongs to */
  mediaVertical: OstMediaVertical
  /** Metadata series slug when known (anime/game/cartoon) */
  seriesSlug?: string | null
  seriesTitle?: string | null
  type: OstAlbumType
  catalogNumber?: string | null
  label?: string | null
  releaseDate?: string | null
  year?: number | null
  /** Physical/digital edition identifiers (MusicBrainz core data, CC0) */
  barcode?: string | null
  format?: OstReleaseFormat | null
  musicbrainzReleaseId?: string | null
  /** ISO 3166-1 alpha-2 (or MusicBrainz XW/XE) release country */
  country?: string | null
  discCount?: number | null
  trackCount?: number | null
  /** Composer / artist ids */
  artistIds: string[]
  /** Display names (denormalized) */
  artists: string[]
  tracks?: OstTrack[]
  description?: string | null
  imageUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  shopPartnerIds?: string[]
  updatedAt: string
}

export interface OstStats {
  albums: number
  artists: number
  byMedia: Record<string, number>
}
