/** Plastic model kits / Gunpla catalog types */

export interface ModelkitMaker {
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

export interface ModelkitLine {
  id: string
  slug: string
  name: string
  makerId: string
  /** gunpla | original | anime | vehicle | other */
  kind: string
  scale?: string | null
  description?: string | null
  website?: string | null
  tags: string[]
  updatedAt: string
}

export interface ModelkitItem {
  id: string
  slug: string
  title: string
  titleNative?: string | null
  publisherBrand?: string | null
  seriesMatchType?: 'catalog-title' | 'parent-franchise' | 'original-line' | null
  publisherManualIds?: string[]
  publisherManualUrls?: string[]
  characterName?: string | null
  seriesTitle?: string | null
  seriesSlug?: string | null
  makerId: string
  lineId?: string | null
  /** gunpla | original | anime | vehicle | other */
  kind: string
  /** HG | RG | MG | PG | 30MM | FA | MODEROID | … */
  grade?: string | null
  scale?: string | null
  productCode?: string | null
  jan?: string | null
  releaseDate?: string | null
  msrpJpy?: number | null
  material?: string | null
  description?: string | null
  imageUrl?: string | null
  shopUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface ModelkitStats {
  items: number
  makers: number
  lines: number
  byKind: Record<string, number>
  byGrade: Record<string, number>
}
