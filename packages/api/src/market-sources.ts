/**
 * Independent source adapters. Live network is opt-in and unused until Vultr.
 * PriceCharting eBay tabs are NOT a second source — they are PriceCharting's copy of eBay.
 */

import { parsePricesFromTable, variantKey } from './market-pricecharting.js'
import type { TcgCard } from './tcg-types.js'
import type {
  MarketPriceBasis,
  MarketSourceId,
  MarketSourceQuote,
  MarketVenue,
} from './market-types.js'

export type IngestContext = {
  card?: Pick<TcgCard, 'rarity' | 'tags' | 'name' | 'subtypes'>
  via?: MarketSourceId
  feedHash?: string
}

type IngestedQuote = MarketSourceQuote & { variant: string; label: string }

const VENUE_BY_SOURCE: Record<MarketSourceId, { venue: MarketVenue; basis: MarketPriceBasis }> = {
  tcgplayer: { venue: 'tcgplayer', basis: 'guide' },
  tcgcsv: { venue: 'tcgplayer', basis: 'guide' },
  scryfall: { venue: 'tcgplayer', basis: 'guide' },
  optcg: { venue: 'tcgplayer', basis: 'guide' },
  pokemontcg: { venue: 'tcgplayer', basis: 'guide' },
  ygoprodeck: { venue: 'tcgplayer', basis: 'guide' },
  cardmarket: { venue: 'cardmarket', basis: 'guide' },
  pricecharting: { venue: 'pricecharting', basis: 'guide' },
  ebay: { venue: 'ebay', basis: 'sold' },
  altxyz: { venue: 'altxyz', basis: 'guide' },
}

export function lineageFromSource(source: MarketSourceId): {
  venue: MarketVenue
  basis: MarketPriceBasis
  via: MarketSourceId
} {
  const mapped = VENUE_BY_SOURCE[source]
  return { venue: mapped.venue, basis: mapped.basis, via: source }
}

export function attachLineage(
  row: Omit<IngestedQuote, 'venue' | 'basis' | 'via'> &
    Partial<Pick<IngestedQuote, 'venue' | 'basis' | 'via' | 'printing' | 'feedHash'>>,
  extras?: { via?: MarketSourceId; printing?: string; feedHash?: string },
): IngestedQuote {
  const mapped = lineageFromSource(row.source)
  return {
    ...row,
    venue: row.venue ?? mapped.venue,
    basis: row.basis ?? mapped.basis,
    via: extras?.via ?? row.via ?? mapped.via,
    printing: extras?.printing ?? row.printing,
    feedHash: extras?.feedHash ?? row.feedHash,
  }
}

type PokemonPricePoint = { market?: number; mid?: number; low?: number }

function pokemonPointPrice(point: PokemonPricePoint | undefined): number | null {
  const n = point?.market ?? point?.mid ?? point?.low
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  return n
}

export function pokemonPrintingVariantKey(printing: string): string {
  const kebab = printing
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
  return `ungraded-${kebab}`
}

/** Prefer the printing that matches the catalog card; never Object.values()[0]. */
export function preferredPokemonPrinting(
  prices: Record<string, PokemonPricePoint | undefined>,
  card?: Pick<TcgCard, 'rarity' | 'tags' | 'name' | 'subtypes'>,
): string | null {
  const available = Object.keys(prices).filter((key) => pokemonPointPrice(prices[key]) != null)
  if (!available.length) return null
  const hay =
    `${card?.rarity || ''} ${(card?.tags || []).join(' ')} ${card?.name || ''} ${(card?.subtypes || []).join(' ')}`.toLowerCase()
  const prefer: string[] = []
  if (/1st|first edition/.test(hay)) {
    if (/holo/.test(hay)) prefer.push('1stEditionHolofoil')
    prefer.push('1stEditionNormal', '1stEditionHolofoil')
  }
  if (/reverse/.test(hay)) prefer.push('reverseHolofoil')
  if (
    /holo|ultra rare|secret rare|illustration rare|\bex\b|\bgx\b|\bvmax\b|\bvstar\b|\bsar\b|rainbow/.test(
      hay,
    )
  ) {
    prefer.push('holofoil', 'unlimitedHolofoil')
  }
  prefer.push('holofoil', 'normal', 'reverseHolofoil', 'unlimitedHolofoil', 'unlimited')
  for (const key of prefer) {
    if (available.includes(key)) return key
  }
  return available[0]
}

export type SourceFixture =
  | {
      source: 'pricecharting'
      html: string
      url: string
      kind?: 'card' | 'game'
    }
  | {
      source: 'tcgplayer'
      url: string
      prices: { market?: number; low?: number; mid?: number; high?: number }
    }
  | {
      source: 'cardmarket'
      url: string
      prices: { averageSellPrice?: number; lowPrice?: number; trendPrice?: number }
    }
  | {
      source: 'ebay'
      url: string
      sold: Array<{ price: number; date?: string }>
    }
  | {
      source: 'altxyz'
      url: string
      grades: Array<{ grade: string; price: number }>
    }
  | {
      source: 'scryfall'
      url: string
      prices: { usd?: string | null; usd_foil?: string | null }
    }
  | {
      source: 'ygoprodeck'
      url: string
      card_prices?: Array<{
        tcgplayer_price?: string
        cardmarket_price?: string
        ebay_price?: string
      }>
    }
  | {
      source: 'pokemontcg'
      url: string
      tcgplayer?: { prices?: Record<string, { market?: number; mid?: number; low?: number }> }
      cardmarket?: {
        prices?: { trendPrice?: number; averageSellPrice?: number; lowPrice?: number }
      }
    }
  | {
      source: 'optcg'
      url: string
      market_price?: number | string
      inventory_price?: number | string
      marketPrice?: number | string
    }
  | {
      source: 'pricecharting-api'
      url: string
      kind?: 'card' | 'game'
      product: Record<string, unknown>
    }

const PC_API_CARD_FIELDS: Array<[string, string]> = [
  ['loose-price', 'Ungraded'],
  ['cib-price', 'Grade 7'],
  ['new-price', 'Grade 8'],
  ['graded-price', 'Grade 9'],
  ['box-only-price', 'Grade 9.5'],
  ['manual-only-price', 'PSA 10'],
  ['bgs-10-price', 'BGS 10'],
  ['condition-17-price', 'CGC 10'],
  ['condition-18-price', 'SGC 10'],
]

const PC_API_GAME_FIELDS: Array<[string, string]> = [
  ['loose-price', 'Loose'],
  ['cib-price', 'CIB'],
  ['new-price', 'New'],
  ['graded-price', 'Graded'],
  ['box-only-price', 'Box'],
  ['manual-only-price', 'Manual'],
]

/** PriceCharting official API encodes money as integer pennies. */
export function penniesToUsd(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  return Math.round(n) / 100
}

export function ingestPriceChartingApiProduct(
  product: Record<string, unknown>,
  url: string,
  kind: 'card' | 'game' = 'card',
  fetchedAt = new Date().toISOString(),
): IngestedQuote[] {
  const fields = kind === 'game' ? PC_API_GAME_FIELDS : PC_API_CARD_FIELDS
  const quotes: IngestedQuote[] = []
  for (const [key, label] of fields) {
    const price = penniesToUsd(product[key])
    if (price == null) continue
    quotes.push(
      attachLineage({
        variant: variantKey(label),
        label,
        source: 'pricecharting',
        url,
        price,
        fetchedAt,
      }),
    )
  }
  return quotes
}

export function pricechartingApiProductUrl(opts: {
  token: string
  id?: string
  q?: string
  upc?: string
}) {
  const params = new URLSearchParams({ t: opts.token })
  if (opts.id) params.set('id', opts.id)
  else if (opts.upc) params.set('upc', opts.upc)
  else if (opts.q) params.set('q', opts.q)
  return `https://www.pricecharting.com/api/product?${params}`
}

export function ingestFixture(
  itemId: string,
  fixture: SourceFixture,
  fetchedAt = new Date().toISOString(),
  ctx: IngestContext = {},
): IngestedQuote[] {
  void itemId
  const extra = { via: ctx.via, feedHash: ctx.feedHash }
  if (fixture.source === 'pricecharting') {
    const prices = parsePricesFromTable(fixture.html, fixture.kind === 'game' ? 'game' : 'card')
    return Object.values(prices).map((point) =>
      attachLineage(
        {
          variant: variantKey(point.label),
          label: point.label,
          source: 'pricecharting',
          url: fixture.url,
          price: point.price,
          fetchedAt,
        },
        extra,
      ),
    )
  }
  if (fixture.source === 'tcgplayer') {
    const price = fixture.prices.market ?? fixture.prices.mid ?? fixture.prices.low
    if (price == null) return []
    return [
      attachLineage(
        {
          variant: 'ungraded',
          label: 'Ungraded',
          source: 'tcgplayer',
          url: fixture.url,
          price,
          fetchedAt,
        },
        extra,
      ),
    ]
  }
  if (fixture.source === 'cardmarket') {
    const price =
      fixture.prices.trendPrice ?? fixture.prices.averageSellPrice ?? fixture.prices.lowPrice
    if (price == null) return []
    return [
      attachLineage(
        {
          variant: 'ungraded',
          label: 'Ungraded',
          source: 'cardmarket',
          url: fixture.url,
          price,
          fetchedAt,
        },
        extra,
      ),
    ]
  }
  if (fixture.source === 'ebay') {
    if (!fixture.sold.length) return []
    const prices = fixture.sold.map((row) => row.price)
    const mid = prices.reduce((sum, value) => sum + value, 0) / prices.length
    return [
      attachLineage(
        {
          variant: 'ungraded',
          label: 'Ungraded',
          source: 'ebay',
          url: fixture.url,
          price: Math.round(mid * 100) / 100,
          fetchedAt,
        },
        extra,
      ),
    ]
  }
  if (fixture.source === 'altxyz') {
    return fixture.grades.map((row) =>
      attachLineage(
        {
          variant: variantKey(row.grade),
          label: row.grade,
          source: 'altxyz',
          url: fixture.url,
          price: row.price,
          fetchedAt,
        },
        extra,
      ),
    )
  }
  if (fixture.source === 'scryfall') {
    const usd = fixture.prices.usd ? Number(fixture.prices.usd) : NaN
    if (!Number.isFinite(usd)) return []
    return [
      attachLineage(
        {
          variant: 'ungraded',
          label: 'Ungraded',
          source: 'scryfall',
          url: fixture.url,
          price: usd,
          fetchedAt,
        },
        extra,
      ),
    ]
  }
  if (fixture.source === 'optcg') {
    const raw = fixture.market_price ?? fixture.marketPrice ?? fixture.inventory_price
    const price = typeof raw === 'string' ? Number(raw) : raw
    if (price == null || !Number.isFinite(price) || price <= 0) return []
    return [
      attachLineage(
        {
          variant: 'ungraded',
          label: 'Ungraded',
          source: 'optcg',
          url: fixture.url,
          price,
          fetchedAt,
        },
        extra,
      ),
    ]
  }
  if (fixture.source === 'pricecharting-api') {
    return ingestPriceChartingApiProduct(fixture.product, fixture.url, fixture.kind, fetchedAt).map(
      (row) => attachLineage(row, extra),
    )
  }
  if (fixture.source === 'ygoprodeck') {
    const row = fixture.card_prices?.[0]
    const quotes: IngestedQuote[] = []
    const tcg = row?.tcgplayer_price ? Number(row.tcgplayer_price) : NaN
    const cm = row?.cardmarket_price ? Number(row.cardmarket_price) : NaN
    if (Number.isFinite(tcg)) {
      quotes.push(
        attachLineage(
          {
            variant: 'ungraded',
            label: 'Ungraded',
            source: 'tcgplayer',
            url: fixture.url,
            price: tcg,
            fetchedAt,
          },
          { ...extra, via: extra.via ?? 'ygoprodeck' },
        ),
      )
    }
    if (Number.isFinite(cm)) {
      quotes.push(
        attachLineage(
          {
            variant: 'ungraded',
            label: 'Ungraded',
            source: 'cardmarket',
            url: fixture.url,
            price: cm,
            fetchedAt,
          },
          { ...extra, via: extra.via ?? 'ygoprodeck' },
        ),
      )
    }
    return quotes
  }
  const tcgPrices = fixture.tcgplayer?.prices || {}
  const preferred = preferredPokemonPrinting(tcgPrices, ctx.card)
  const quotes: IngestedQuote[] = []
  const pokeExtra = { ...extra, via: extra.via ?? 'pokemontcg' }
  if (preferred) {
    const tcg = pokemonPointPrice(tcgPrices[preferred])
    if (tcg != null) {
      quotes.push(
        attachLineage(
          {
            variant: 'ungraded',
            label: 'Ungraded',
            source: 'tcgplayer',
            url: fixture.url,
            price: tcg,
            fetchedAt,
            printing: preferred,
          },
          pokeExtra,
        ),
      )
    }
    for (const [printing, point] of Object.entries(tcgPrices)) {
      if (printing === preferred) continue
      const price = pokemonPointPrice(point)
      if (price == null) continue
      quotes.push(
        attachLineage(
          {
            variant: pokemonPrintingVariantKey(printing),
            label: printing,
            source: 'tcgplayer',
            url: fixture.url,
            price,
            fetchedAt,
            printing,
          },
          pokeExtra,
        ),
      )
    }
  }
  const cm =
    fixture.cardmarket?.prices?.trendPrice ??
    fixture.cardmarket?.prices?.averageSellPrice ??
    fixture.cardmarket?.prices?.lowPrice
  if (cm != null) {
    quotes.push(
      attachLineage(
        {
          variant: 'ungraded',
          label: 'Ungraded',
          source: 'cardmarket',
          url: fixture.url,
          price: cm,
          fetchedAt,
        },
        pokeExtra,
      ),
    )
  }
  return quotes
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Detect Scryfall / YGOPRODeck / pokemon-tcg / OPTCG / PriceCharting official JSON. */
export function ingestPublicJson(
  itemId: string,
  url: string,
  payload: Record<string, unknown>,
  ctx: IngestContext = {},
) {
  const wrapped = asRecord(payload.data)
  const firstList = Array.isArray(payload.data) ? asRecord(payload.data[0]) : null
  const body = wrapped || firstList || payload

  if (body.status === 'success' && (body['loose-price'] != null || body['product-name'])) {
    const kind = String(body['console-name'] || '')
      .toLowerCase()
      .includes('card')
      ? 'card'
      : /nintendo|playstation|sega|gameboy|genesis|saturn|dreamcast|jaguar|psp/i.test(
            String(body['console-name'] || ''),
          )
        ? 'game'
        : 'card'
    return ingestPriceChartingApiProduct(body, url, kind).map((row) =>
      attachLineage(row, { via: ctx.via, feedHash: ctx.feedHash }),
    )
  }
  if (body.object === 'card' && body.prices && typeof body.prices === 'object') {
    return ingestFixture(
      itemId,
      {
        source: 'scryfall',
        url,
        prices: body.prices as { usd?: string | null },
      },
      undefined,
      ctx,
    )
  }
  if (Array.isArray(body.card_prices)) {
    return ingestFixture(
      itemId,
      {
        source: 'ygoprodeck',
        url,
        card_prices: body.card_prices as Array<{ tcgplayer_price?: string }>,
      },
      undefined,
      ctx,
    )
  }
  if (body.tcgplayer || body.cardmarket) {
    return ingestFixture(
      itemId,
      {
        source: 'pokemontcg',
        url,
        tcgplayer: body.tcgplayer as {
          prices?: Record<string, { market?: number; mid?: number; low?: number }>
        },
        cardmarket: body.cardmarket as {
          prices?: { trendPrice?: number; averageSellPrice?: number; lowPrice?: number }
        },
      },
      undefined,
      ctx,
    )
  }
  if (
    body.market_price != null ||
    body.marketPrice != null ||
    (typeof body.card_id === 'string' && /^(OP|ST|EB|PR)-?\d/i.test(body.card_id))
  ) {
    return ingestFixture(
      itemId,
      {
        source: 'optcg',
        url,
        market_price: body.market_price as number | string | undefined,
        marketPrice: body.marketPrice as number | string | undefined,
        inventory_price: body.inventory_price as number | string | undefined,
      },
      undefined,
      ctx,
    )
  }
  return []
}

export function venueOf(quote: Pick<MarketSourceQuote, 'source' | 'venue'>): MarketVenue {
  return quote.venue ?? lineageFromSource(quote.source).venue
}

export function sourceIndependence(quotes: MarketSourceQuote[]) {
  const ids = [...new Set(quotes.map((quote) => quote.source))]
  const venues = [...new Set(quotes.map((quote) => venueOf(quote)))]
  return {
    sources: ids,
    venues,
    independent: venues.length,
    copiesPriceChartingOnly: venues.length === 1 && venues[0] === 'pricecharting',
    singleVenue: venues.length < 2,
  }
}
