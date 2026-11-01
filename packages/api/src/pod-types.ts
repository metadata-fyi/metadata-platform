/** Print-on-demand / blank apparel catalog types */

export interface PodPrintMethod {
  id: string
  slug: string
  name: string
  shortName: string
  description?: string | null
  bestFor: string[]
  limitations: string[]
  fabrics: string[]
  tags: string[]
  updatedAt: string
}

export interface PodBrand {
  id: string
  slug: string
  name: string
  website?: string | null
  description?: string | null
  tags: string[]
  updatedAt: string
}

export interface PodProvider {
  id: string
  slug: string
  name: string
  /** Canonical site (no affiliate params) */
  website: string
  /** Our affiliate / partner URL when configured */
  affiliateUrl?: string | null
  catalogUrl?: string | null
  affiliatesPageUrl?: string | null
  description?: string | null
  tags: string[]
  updatedAt: string
}

export interface PodColor {
  id: string
  name: string
  /** Manufacturer / brand color code when known */
  code?: string | null
  hex?: string | null
  family?: string | null
}

export interface PodSize {
  code: string
  label: string
  /** Approximate chest width inches (half chest) when known */
  chestIn?: number | null
  /** Body length inches when known */
  lengthIn?: number | null
}

export interface PodListing {
  providerId: string
  /** Clean product URL (no tracking) */
  productUrl: string
  /** Optional our affiliate deep link */
  affiliateUrl?: string | null
  title?: string | null
  sku?: string | null
  notes?: string | null
}

export interface PodBlank {
  id: string
  slug: string
  brandId: string
  /** Manufacturer style number, e.g. 3001 */
  styleCode: string
  title: string
  category: string
  description?: string | null
  fabric?: string | null
  weightOz?: number | null
  fit?: string | null
  features: string[]
  sizes: PodSize[]
  colors: PodColor[]
  listings: PodListing[]
  /** Supported print methods (ids → print-methods.json) */
  printMethodIds?: string[]
  /** Brand / catalog image if public (often white-bg lifestyle / provider CDN) */
  imageUrl?: string | null
  /**
   * Transparent PNG cutout of the blank garment (ghost / flat).
   * Produced by scripts/pod-cutouts.py from Printful catalog photos
   * (manufacturer sites rarely ship transparent PNGs).
   */
  cutoutUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface PodStats {
  products: number
  brands: number
  providers: number
  colors: number
  printMethods: number
}
