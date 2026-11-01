/** Figures / official anime merchandise catalog types */

export interface FigureMaker {
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

export interface FigureLine {
  id: string
  slug: string
  name: string
  makerId: string
  /** e.g. nendoroid, figma, scale, prize, plush, acrylic, other */
  kind: string
  scale?: string | null
  description?: string | null
  website?: string | null
  tags: string[]
  updatedAt: string
}

export interface FigureItem {
  id: string
  slug: string
  title: string
  /** Character / subject name when known */
  characterName?: string | null
  /** Franchise / series title (free text; may match Metadata series) */
  seriesTitle?: string | null
  /** Optional Metadata series slug when known */
  seriesSlug?: string | null
  makerId: string
  lineId?: string | null
  /** Product type: nendoroid | figma | scale | prize | vinyl | plush | acrylic | model-kit | other */
  kind: string
  scale?: string | null
  /** Manufacturer product / JAN-style code when public */
  productCode?: string | null
  jan?: string | null
  /** Publisher catalog SKU; distinct from a Nendoroid or box number. */
  publisherProductCode?: string | null
  boxNumber?: string | null
  publisherSpecifications?: string | null
  publisherReleaseInformation?: string | null
  publisherVariantType?: string | null
  releaseDate?: string | null
  msrpJpy?: number | null
  heightMm?: number | null
  material?: string | null
  exclusivity?: string | null
  description?: string | null
  imageUrl?: string | null
  shopUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface FigureStats {
  items: number
  makers: number
  lines: number
  byKind: Record<string, number>
}
