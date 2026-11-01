/** Fashion vertical — footwear, apparel, outerwear, accessories, watches */

export type FashionCategory =
  | 'footwear'
  | 'apparel'
  | 'outerwear'
  | 'accessories'
  | 'watches'
  | string

/** Product kind within a category */
export type FashionKind =
  | 'sneaker'
  | 'boot'
  | 'tee'
  | 'hoodie'
  | 'top'
  | 'bottom'
  | 'jacket'
  | 'cap'
  | 'bag'
  | 'watch'
  | string

export interface FashionBrand {
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

/** Line / silhouette / collection under a brand */
export interface FashionLine {
  id: string
  slug: string
  name: string
  brandId: string
  category: FashionCategory
  kind: FashionKind
  description?: string | null
  website?: string | null
  tags: string[]
  updatedAt: string
}

export interface FashionItem {
  id: string
  slug: string
  title: string
  /** Colorway / dial variant */
  colorway?: string | null
  brandId: string
  lineId?: string | null
  category: FashionCategory
  kind: FashionKind
  /** SKU, style code, or watch reference */
  styleCode?: string | null
  /** ISO release date when known */
  releaseDate?: string | null
  /** Season code e.g. FW24, SS25 */
  season?: string | null
  msrpUsd?: number | null
  gender?: 'men' | 'women' | 'unisex' | 'gs' | 'td' | null
  description?: string | null
  imageUrl?: string | null
  shopUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface FashionStats {
  items: number
  brands: number
  lines: number
  upcoming: number
  byCategory: Record<string, number>
  byBrand: Record<string, number>
  byKind: Record<string, number>
}
