/** Coagulated collectibles market types. Quotes live in DATA_DIR, not git. */

export type MarketKind = 'card' | 'game' | 'sealed' | 'collectible'

export type MarketSourceId =
  | 'pricecharting'
  | 'tcgplayer'
  | 'cardmarket'
  | 'ebay'
  | 'altxyz'
  | 'scryfall'
  | 'ygoprodeck'
  | 'pokemontcg'
  | 'optcg'
  | 'tcgcsv'

export type PriceChartingGame = 'pokemon' | 'onepiece' | 'yugioh' | 'magic' | 'lorcana' | 'weiss'

export type PriceChartingConsole =
  | 'nes'
  | 'snes'
  | 'n64'
  | 'gb'
  | 'gbc'
  | 'gba'
  | 'nes-classic'
  | 'genesis'
  | 'sms'
  | 'ps1'
  | 'ps2'
  | 'psp'
  | 'saturn'
  | 'dc'
  | 'jag'
  | '32x'
  | 'cdi'

export type MarketCatalogRef = {
  vertical: 'tcg' | 'consoles'
  id: string
}

export type MarketItem = {
  id: string
  kind: MarketKind
  title: string
  catalog: MarketCatalogRef | null
  source: { id: MarketSourceId; url: string; productId?: string }
  attrs: Record<string, string>
  scrapeStatus: 'pending' | 'completed' | 'failed' | 'hard_failed'
  lastScrapedAt: string | null
  lastError: string | null
  updatedAt: string
}

/** Economic venue. Reprint adapters (tcgcsv, Scryfall USD, OPTCG) collapse here. */
export type MarketVenue = 'tcgplayer' | 'cardmarket' | 'ebay' | 'pricecharting' | 'altxyz'

/** How the number was produced. GUIDE is a model; SOLD is a transaction; ASKING is a listing. */
export type MarketPriceBasis = 'guide' | 'asking' | 'sold'

export type MarketQuoteLineage = {
  venue: MarketVenue
  basis: MarketPriceBasis
  /** Adapter that fetched the bytes. Independent of venue. */
  via: MarketSourceId
  printing?: string
  feedHash?: string
}

export type MarketSourceQuote = {
  source: MarketSourceId
  url: string
  price: number
  fetchedAt: string
  venue?: MarketVenue
  basis?: MarketPriceBasis
  via?: MarketSourceId
  printing?: string
  feedHash?: string
}

export type MarketStoredQuote = MarketSourceQuote & {
  itemId: string
  variant: string
  label: string
}

export type MarketVariantQuote = {
  key: string
  label: string
  /** metadata.fyi price: median of independent venues after collapsing reprints. */
  mid: number | null
  method: 'median-independent'
  /** Count of independent venues (not reprint adapters). */
  independentSources: number
  independentVenues: number
  confidence: 'multi-venue' | 'single-venue'
  low: number | null
  high: number | null
  sources: MarketSourceQuote[]
  excluded: Array<{ source: MarketSourceId; venue?: MarketVenue; price: number; reason: string }>
}

export type MarketQuote = {
  itemId: string
  currency: 'USD'
  asOf: string
  stale: boolean
  methodology: string
  variants: MarketVariantQuote[]
  /** Catalog SKU URI when the market item is bound to an exact TCG card. */
  sku?: string
}

export type MarketSale = {
  itemId: string
  variant: string
  saleDate: string
  price: number
  ebayItemId: string
  title: string
  capturedAt: string
}

export type MarketSet = {
  id: string
  game: string
  setSlug: string
  name: string
  url: string
  productCount: number
  lastSeenAt: string
}

export type MarketSourcePolicy = {
  id: MarketSourceId
  access: 'official-api' | 'public-json' | 'html' | 'browser'
  needsBrowser: boolean
  minIntervalMs: number
  dailyMaxItems: number
  preferredHourUtc: number
  jitterMs: number
  notes: string
}

export type MarketSearchHit = {
  item: MarketItem
  quote: MarketQuote | null
}
