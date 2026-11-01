export type SkuCollection =
  | 'products'
  | 'items'
  | 'cards'
  | 'games'
  | 'series'
  | 'characters'
  | 'albums'
  | 'consoles'
  | 'titles'

export interface SkuAlias {
  ns: 'id' | 'slug' | 'style' | 'mfr' | 'gtin' | 'listing' | 'tcg'
  value: string
}

export type SkuCommerceRole = 'offer' | 'fulfill'

export interface SkuCommerceLink {
  role: SkuCommerceRole
  sku: string
  partnerId: string
  name: string
  url: string
  isAffiliate: boolean
}

export interface SkuCommerce {
  fulfill: SkuCommerceLink[]
  offers: SkuCommerceLink[]
}

/** Cap for each of `commerce.fulfill` and `commerce.offers`. */
export const SKU_COMMERCE_CAP = 10

/** Strip extras (never copy price/mid onto a link) and cap each role array. */
export function capSkuCommerce(commerce: SkuCommerce, cap = SKU_COMMERCE_CAP): SkuCommerce {
  const link = (row: SkuCommerceLink): SkuCommerceLink => ({
    role: row.role,
    sku: row.sku,
    partnerId: row.partnerId,
    name: row.name,
    url: row.url,
    isAffiliate: row.isAffiliate,
  })
  return {
    fulfill: commerce.fulfill.slice(0, cap).map(link),
    offers: commerce.offers.slice(0, cap).map(link),
  }
}

/** Retail/affiliate shops (+ optional official URL) are offers, never fulfill. */
export function offersFromShops(opts: {
  sku: string
  official?: { partnerId: string; name: string; url: string } | null
  shops: Array<{ partnerId: string; name: string; shopUrl: string; isAffiliate: boolean }>
}): SkuCommerce {
  const offers: SkuCommerceLink[] = []
  const seen = new Set<string>()
  if (opts.official?.url) {
    offers.push({
      role: 'offer',
      sku: opts.sku,
      partnerId: opts.official.partnerId,
      name: opts.official.name,
      url: opts.official.url,
      isAffiliate: false,
    })
    seen.add(opts.official.url)
  }
  for (const s of opts.shops) {
    if (!s.shopUrl || seen.has(s.shopUrl)) continue
    seen.add(s.shopUrl)
    offers.push({
      role: 'offer',
      sku: opts.sku,
      partnerId: s.partnerId,
      name: s.name,
      url: s.shopUrl,
      isAffiliate: s.isAffiliate,
    })
  }
  return capSkuCommerce({ fulfill: [], offers })
}

export interface SkuRef {
  /** Canonical subject: metadata:{vertical}:{collection}:{id} */
  uri: string
  vertical: string
  collection: SkuCollection
  id: string
  aliases: SkuAlias[]
  /** Sell vs delivery. Omitted on series/game/character refs. */
  commerce?: SkuCommerce
}

export type SkuResolveOk = {
  ok: true
  unique: true
  ref: SkuRef
}

export type SkuResolveAmbiguous = {
  ok: true
  unique: false
  error: 'AMBIGUOUS'
  query: string
  matches: SkuRef[]
}

export type SkuResolveMiss = {
  ok: false
  error: 'NOT_FOUND'
  query: string
}

export type SkuResolveResult = SkuResolveOk | SkuResolveAmbiguous | SkuResolveMiss

/** One item in a batch POST /v1/sku/resolve `{ keys }` envelope. */
export type SkuBatchItem = { query: string } & SkuResolveResult

export type SkuBatchResult = {
  ok: true
  results: SkuBatchItem[]
}
