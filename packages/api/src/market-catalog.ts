import {
  GAME_CONFIG,
  medianPrice,
  normalizeGradeLabel,
  variantKey,
} from './market-pricecharting.js'
import { lineageFromSource, venueOf } from './market-sources.js'
import {
  getMarketItem,
  getMarketItemByCatalog,
  isStale,
  listMarketItems,
  listQuotes,
  listSales,
} from './market-store.js'
import type {
  MarketItem,
  MarketQuote,
  MarketSearchHit,
  MarketSourceQuote,
  MarketVenue,
} from './market-types.js'
import { skuUri } from './sku-uri.js'
import { tcgMarketMatches, getTcgCard } from './tcg-catalog.js'
import type { Paginated } from './types.js'

function page<T>(items: T[], limit: number, offset: number): Paginated<T> {
  const lim = Math.min(Math.max(limit, 1), 100)
  const off = Math.max(offset, 0)
  return { items: items.slice(off, off + lim), total: items.length, limit: lim, offset: off }
}

export const FYI_PRICE_METHODOLOGY =
  'metadata.fyi price = median of independent venues in a 48h window after collapsing TCGPlayer reprints (pokemontcg, tcgcsv, Scryfall USD, OPTCG) to one venue. Cardmarket is a second venue. PriceCharting is a third (eBay-modelled guide). Outliers below 0.4x or above 2.5x the venue median are dropped when 3+ venues exist. A single-venue mid is returned with confidence=single-venue. PriceCharting completed-auction rows are not treated as eBay.'

const FRESH_MS = 48 * 60 * 60 * 1000

type CoagulateRow = {
  source: MarketSourceQuote['source']
  price: number
  url: string
  fetchedAt: string
  label?: string
  venue?: MarketVenue
  basis?: MarketSourceQuote['basis']
  via?: MarketSourceQuote['via']
  printing?: string
  feedHash?: string
}

function collapseByVenue(pool: CoagulateRow[]) {
  const groups = new Map<MarketVenue, CoagulateRow[]>()
  for (const row of pool) {
    const venue = venueOf(row)
    const rows = groups.get(venue) || []
    rows.push(row)
    groups.set(venue, rows)
  }
  return [...groups.entries()].map(([venue, members]) => {
    const prices = members.map((row) => row.price)
    const newest = members.reduce(
      (max, row) => (row.fetchedAt > max ? row.fetchedAt : max),
      members[0].fetchedAt,
    )
    return {
      venue,
      price: medianPrice(prices) as number,
      members,
      fetchedAt: newest,
    }
  })
}

export function coagulateVariant(rows: CoagulateRow[], now = Date.now()) {
  const fresh = rows.filter((row) => {
    const ts = Date.parse(row.fetchedAt)
    return Number.isFinite(ts) && now - ts <= FRESH_MS
  })
  const pool = fresh.length ? fresh : rows
  const collapsed = collapseByVenue(pool)
  const raw = medianPrice(collapsed.map((row) => row.price))
  const excluded: MarketQuote['variants'][0]['excluded'] = []
  const kept = collapsed.filter((row) => {
    if (raw == null || collapsed.length < 3) return true
    if (row.price < raw * 0.4) {
      excluded.push({
        source: row.members[0].source,
        venue: row.venue,
        price: row.price,
        reason: 'below 0.4x venue median',
      })
      return false
    }
    if (row.price > raw * 2.5) {
      excluded.push({
        source: row.members[0].source,
        venue: row.venue,
        price: row.price,
        reason: 'above 2.5x venue median',
      })
      return false
    }
    return true
  })
  const prices = kept.map((row) => row.price)
  const venues = kept.length
  return {
    mid: medianPrice(prices),
    method: 'median-independent' as const,
    independentSources: venues,
    independentVenues: venues,
    confidence: (venues >= 2 ? 'multi-venue' : 'single-venue') as 'multi-venue' | 'single-venue',
    low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null,
    sources: kept.flatMap((row) =>
      row.members.map((member) => {
        const lineage = lineageFromSource(member.source)
        return {
          source: member.source,
          url: member.url,
          price: member.price,
          fetchedAt: member.fetchedAt,
          venue: venueOf(member),
          basis: member.basis ?? lineage.basis,
          via: member.via ?? lineage.via,
          printing: member.printing,
          feedHash: member.feedHash,
        }
      }),
    ),
    excluded,
  }
}

export function buildMarketQuote(itemId: string, now = Date.now()): MarketQuote | null {
  const quotes = listQuotes(itemId)
  if (!quotes.length) return null
  const byVariant = new Map<string, typeof quotes>()
  for (const row of quotes) {
    const rows = byVariant.get(row.variant) || []
    rows.push(row)
    byVariant.set(row.variant, rows)
  }
  const variants = [...byVariant.entries()].map(([key, rows]) => ({
    key,
    label: rows[0]?.label || key,
    ...coagulateVariant(rows, now),
  }))
  const newest = quotes.reduce(
    (max, row) => (row.fetchedAt > max ? row.fetchedAt : max),
    quotes[0].fetchedAt,
  )
  return {
    itemId,
    currency: 'USD',
    asOf: newest,
    stale: isStale(newest, now),
    methodology: FYI_PRICE_METHODOLOGY,
    variants,
  }
}

/** Exact catalog SKU only — never first-match search hits. */
function catalogBoundSku(item: MarketItem): {
  catalog: ReturnType<typeof getTcgCard> | null
  sku?: string
} {
  const catalog = item.catalog?.vertical === 'tcg' ? (getTcgCard(item.catalog.id) ?? null) : null
  const sku = catalog ? skuUri('tcg', 'cards', catalog.id) : undefined
  return { catalog, sku }
}

function quoteWithCatalogSku(item: MarketItem): MarketQuote | null {
  const { sku } = catalogBoundSku(item)
  const built = buildMarketQuote(item.id)
  return built && sku ? { ...built, sku } : built
}

export function searchMarket(opts?: {
  kind?: string
  game?: string
  q?: string
  limit?: number
  offset?: number
}): Paginated<MarketSearchHit> {
  const items = listMarketItems({
    kind: opts?.kind,
    game: opts?.game,
    q: opts?.q,
  })
  return page(
    items.map((item) => ({ item, quote: quoteWithCatalogSku(item) })),
    opts?.limit ?? 40,
    opts?.offset ?? 0,
  )
}

export function getMarketRecord(id: string) {
  const item = getMarketItem(id)
  if (!item) return null
  const { catalog, sku } = catalogBoundSku(item)
  const quote = quoteWithCatalogSku(item)
  return {
    item,
    quote,
    catalog,
    ...(sku ? { sku } : {}),
  }
}

/** SKU-bound quote for a catalog TCG card id (not a market item id). */
export function quoteForCatalogCard(cardId: string) {
  const item = getMarketItemByCatalog('tcg', cardId)
  if (!item) return null
  return getMarketRecord(item.id)?.quote ?? null
}

export function historyForItem(id: string, variant?: string, limit = 20) {
  const requested = variant ? normalizeGradeLabel(variant) : undefined
  const key = requested ? variantKey(requested) : undefined
  return listSales(id, key).slice(0, Math.min(Math.max(limit, 1), 100))
}

export function matchTcgCard(item: Pick<MarketItem, 'title' | 'attrs'>) {
  const game = item.attrs.tcgGameId || item.attrs.game
  const number = (item.attrs.number || extractNumber(item.title) || '').toLowerCase()
  if (!number) return null
  const setCode = item.attrs.setCode?.toLowerCase()
  const language = item.attrs.language?.toLowerCase()
  const title = item.title.toLowerCase()
  const matches = tcgMarketMatches({ game, setCode, language, number, title })
  // Pricing must not be attached to an arbitrary printing with the same name/number.
  return matches.length === 1 && !matches[0].gameplay?.printingLanguageUnresolved
    ? matches[0]
    : null
}

function extractNumber(title: string): string | null {
  const match = title.match(/(\d+)\s*\/\s*\d+/) || title.match(/\b(\d{1,4})\b/)
  return match?.[1] || null
}

export function tcgGameForPriceCharting(game: string): string | undefined {
  const key = game as keyof typeof GAME_CONFIG
  return GAME_CONFIG[key]?.tcgGameId
}
