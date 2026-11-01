/** Plush / fumo catalog types */

export interface PlushMaker {
  id: string
  slug: string
  name: string
  nameNative?: string | null
  website?: string | null
  country?: string | null
  description?: string | null
  tags: string[]
  updatedAt: string
}

export interface PlushLine {
  id: string
  slug: string
  name: string
  makerId: string
  /** e.g. fumo, plush, mini-plush, doll, other */
  kind: string
  scale?: string | null
  description?: string | null
  website?: string | null
  tags: string[]
  updatedAt: string
}

export interface PlushItem {
  id: string
  slug: string
  title: string
  characterName?: string | null
  seriesTitle?: string | null
  seriesSlug?: string | null
  makerId: string
  lineId?: string | null
  /** fumo | plush | mini-plush | doll | cushion | other */
  kind: string
  /** Approximate height / size class, e.g. ~20cm, Jumbo */
  scale?: string | null
  heightMm?: number | null
  productCode?: string | null
  jan?: string | null
  releaseDate?: string | null
  msrpJpy?: number | null
  material?: string | null
  exclusivity?: string | null
  description?: string | null
  imageUrl?: string | null
  shopUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface PlushStats {
  items: number
  makers: number
  lines: number
  byKind: Record<string, number>
}
