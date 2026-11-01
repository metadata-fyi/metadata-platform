/** Board games catalog types (BGG-aligned public meta) */

export interface BoardGamePublisher {
  id: string
  slug: string
  name: string
  website?: string | null
  country?: string | null
  description?: string | null
  tags: string[]
  updatedAt: string
}

export interface BoardGame {
  publisherProductIds?: string[]
  productType?: 'base-game' | 'expansion'
  publisherProductId?: string
  publisherVariants?: Array<{ id: string; title: string; sku: string | null }>
  id: string
  slug: string
  name: string
  nameNative?: string | null
  yearPublished?: number | null
  /** BoardGameGeek thing id when known */
  bggId?: number | null
  description?: string | null
  minPlayers?: number | null
  maxPlayers?: number | null
  minPlaytimeMin?: number | null
  maxPlaytimeMin?: number | null
  minAge?: number | null
  /** Approximate BGG rank / weight when seeded */
  bggRank?: number | null
  weight?: number | null
  rating?: number | null
  categories: string[]
  mechanics: string[]
  designers: string[]
  publisherIds: string[]
  /** Primary publisher name for display */
  publisher?: string | null
  imageUrl?: string | null
  thumbnailUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  shopPartnerIds?: string[]
  updatedAt: string
}

export interface BoardGameStats {
  games: number
  publishers: number
  categories: number
}
