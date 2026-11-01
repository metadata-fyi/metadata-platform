/** Single-flight, jittered, daily-capped scrape windows. Never hits the network. */

import type { MarketSourceId, MarketSourcePolicy } from './market-types.js'

export const SOURCE_POLICIES: Record<MarketSourceId, MarketSourcePolicy> = {
  pricecharting: {
    id: 'pricecharting',
    access: 'html',
    needsBrowser: false,
    minIntervalMs: 12 * 60 * 60 * 1000,
    dailyMaxItems: 200,
    preferredHourUtc: 7,
    jitterMs: 45 * 60 * 1000,
    notes:
      'HTML product pages for now. Official /api/product later if PRICECHARTING_TOKEN is set. Same-site single-flight. Override cap with MARKET_PC_DAILY_MAX.',
  },
  tcgplayer: {
    id: 'tcgplayer',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 24 * 60 * 60 * 1000,
    dailyMaxItems: 400,
    preferredHourUtc: 11,
    jitterMs: 30 * 60 * 1000,
    notes: 'Prefer pokemon-tcg-data / official partner JSON. Do not HTML-scrape search pages.',
  },
  cardmarket: {
    id: 'cardmarket',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 24 * 60 * 60 * 1000,
    dailyMaxItems: 400,
    preferredHourUtc: 13,
    jitterMs: 30 * 60 * 1000,
    notes: 'Prefer public JSON blobs. Independent EU comps from TCGplayer.',
  },
  ebay: {
    id: 'ebay',
    access: 'official-api',
    needsBrowser: false,
    minIntervalMs: 18 * 60 * 60 * 1000,
    dailyMaxItems: 150,
    preferredHourUtc: 16,
    jitterMs: 40 * 60 * 1000,
    notes:
      'Developers Program is free to join, but sold comps are Marketplace Insights (limited-release, usually denied). Browse is active listings only. Do not treat PriceCharting eBay tabs as official eBay.',
  },
  altxyz: {
    id: 'altxyz',
    access: 'browser',
    needsBrowser: true,
    minIntervalMs: 36 * 60 * 60 * 1000,
    dailyMaxItems: 40,
    preferredHourUtc: 20,
    jitterMs: 60 * 60 * 1000,
    notes:
      'Last-resort graded quotes. Browser/session required. Camoufox may help fingerprint, not IP.',
  },
  scryfall: {
    id: 'scryfall',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 12 * 60 * 60 * 1000,
    dailyMaxItems: 1000,
    preferredHourUtc: 9,
    jitterMs: 20 * 60 * 1000,
    notes:
      'Free Scryfall JSON (prices.usd / usd_foil). Collection in 20-card batches with 2s gaps; per-card 400ms. Required UA.',
  },
  ygoprodeck: {
    id: 'ygoprodeck',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 12 * 60 * 60 * 1000,
    dailyMaxItems: 800,
    preferredHourUtc: 10,
    jitterMs: 20 * 60 * 1000,
    notes:
      'Free YGOPRODeck cardinfo.php card_prices (tcgplayer/cardmarket/ebay listed separately).',
  },
  pokemontcg: {
    id: 'pokemontcg',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 24 * 60 * 60 * 1000,
    dailyMaxItems: 1000,
    preferredHourUtc: 8,
    jitterMs: 20 * 60 * 1000,
    notes: 'Pokemon TCG API / pokemon-tcg-data GitHub JSON (embedded tcgplayer + cardmarket).',
  },
  optcg: {
    id: 'optcg',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 12 * 60 * 60 * 1000,
    dailyMaxItems: 800,
    preferredHourUtc: 12,
    jitterMs: 20 * 60 * 1000,
    notes:
      'Free OPTCG API (optcgapi.com) daily TCGPlayer-based market. Community, no auth. Attribute it; do not hammer their VPS.',
  },
  tcgcsv: {
    id: 'tcgcsv',
    access: 'public-json',
    needsBrowser: false,
    minIntervalMs: 24 * 60 * 60 * 1000,
    dailyMaxItems: 80,
    preferredHourUtc: 14,
    jitterMs: 20 * 60 * 1000,
    notes:
      'tcgcsv.com daily public JSON of TCGplayer prices. Weiss (category 20) and other games without a first-party feed. Attribute; 2s between group files.',
  },
}

const SOURCE_ORDER: MarketSourceId[] = [
  'pricecharting',
  'pokemontcg',
  'scryfall',
  'ygoprodeck',
  'optcg',
  'tcgcsv',
  'tcgplayer',
  'cardmarket',
  'ebay',
  'altxyz',
]

export function jitteredDelay(baseMs: number, jitterRatio = 0.35): number {
  const span = baseMs * jitterRatio
  return Math.max(250, Math.round(baseMs - span / 2 + Math.random() * span))
}

export function nextWindowUtc(policy: MarketSourcePolicy, now = new Date(), salt = 0): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      policy.preferredHourUtc,
      0,
      0,
    ),
  )
  const jitter = ((salt * 7919) % Math.max(policy.jitterMs, 1)) - policy.jitterMs / 2
  next.setTime(next.getTime() + jitter)
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

export function planScrapeDay(now = new Date()) {
  return SOURCE_ORDER.map((id, index) => {
    const policy = SOURCE_POLICIES[id]
    const start = nextWindowUtc(policy, now, index + 1)
    return {
      source: id,
      access: policy.access,
      needsBrowser: policy.needsBrowser,
      dailyMaxItems: policy.dailyMaxItems,
      minIntervalHours: policy.minIntervalMs / (60 * 60 * 1000),
      startAt: start.toISOString(),
      notes: policy.notes,
    }
  }).sort((a, b) => a.startAt.localeCompare(b.startAt))
}

/** Different websites may run at the same time. The same source may not. */
export function assertSingleFlight(running: Set<MarketSourceId>, next: MarketSourceId) {
  if (running.has(next)) {
    throw new Error(`${next} is already running; refuse a second flight`)
  }
}

export function canRunInParallel(a: MarketSourceId, b: MarketSourceId) {
  return a !== b
}

export function remainingDailyBudget(used: number, source: MarketSourceId): number {
  return Math.max(0, dailyMaxFor(source) - used)
}

export function dailyMaxFor(source: MarketSourceId): number {
  if (source === 'pricecharting') {
    const override = Number(process.env.MARKET_PC_DAILY_MAX)
    if (Number.isFinite(override) && override > 0) return Math.floor(override)
  }
  return SOURCE_POLICIES[source].dailyMaxItems
}

/** After the preferred hour (minus 1h), keep hourly ticks until the daily budget is gone. */
export function sourceOpenForWork(policy: MarketSourcePolicy, now = new Date()): boolean {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60
  return hour >= policy.preferredHourUtc - 1
}
