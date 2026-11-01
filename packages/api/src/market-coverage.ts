/** Which legitimate source fills each catalog family. Used before any --live scrape. */

import type { MarketKind, MarketSourceId, PriceChartingConsole } from './market-types.js'

export type CoverageRow = {
  id: string
  kind: MarketKind
  catalog: 'tcg' | 'consoles'
  gameId?: string
  consoleId?: string
  sources: MarketSourceId[]
  primary: MarketSourceId
  soldComps: 'yes' | 'limited' | 'no-free'
  notes: string
}

const GAME_NOTE =
  'No free official sold-price API for retro games. eBay solds are not in the free Browse API. PriceCharting official /api/product (paid) covers Loose/CIB/New.'

function gameRow(consoleId: PriceChartingConsole, extra?: string): CoverageRow {
  return {
    id: `${consoleId}-games`,
    kind: 'game',
    catalog: 'consoles',
    consoleId,
    sources: ['pricecharting'],
    primary: 'pricecharting',
    soldComps: 'no-free',
    notes: extra ? `${GAME_NOTE} ${extra}` : GAME_NOTE,
  }
}

export const CATALOG_COVERAGE: CoverageRow[] = [
  {
    id: 'pokemon-cards',
    kind: 'card',
    catalog: 'tcg',
    gameId: 'pokemon',
    sources: ['pokemontcg', 'tcgcsv', 'pricecharting'],
    primary: 'pokemontcg',
    soldComps: 'limited',
    notes:
      'Free: PokemonTCG/pokemon-tcg-data + pokemontcg.io JSON (TCGplayer market + Cardmarket trend). tcgcsv category 85 is TCGPlayer Pokemon Japan (USD listings of JP printings), still the tcgplayer venue — not Yuyutei/Cardrush. Catalog identity is EN-only today so JP groups apply only when set codes match. Graded solds still need PriceCharting. No official JP domestic sold API.',
  },
  {
    id: 'mtg-cards',
    kind: 'card',
    catalog: 'tcg',
    gameId: 'mtg',
    sources: ['scryfall', 'tcgcsv', 'pricecharting'],
    primary: 'scryfall',
    soldComps: 'limited',
    notes:
      'Free Scryfall prices.usd (their TCGplayer market + Cardmarket trend, synced daily). Official TCGplayer API is closed to new keys.',
  },
  {
    id: 'yugioh-cards',
    kind: 'card',
    catalog: 'tcg',
    gameId: 'yugioh',
    sources: ['ygoprodeck', 'tcgcsv', 'pricecharting'],
    primary: 'ygoprodeck',
    soldComps: 'limited',
    notes:
      'Free YGOPRODeck card_prices (lists tcgplayer/cardmarket/ebay ask). We store those as their own source ids.',
  },
  {
    id: 'onepiece-cards',
    kind: 'card',
    catalog: 'tcg',
    gameId: 'onepiece',
    sources: ['optcg', 'tcgcsv', 'pricecharting'],
    primary: 'optcg',
    soldComps: 'limited',
    notes:
      'Free OPTCG API (optcgapi.com) daily TCGPlayer-based market. Community API, attribute it. Catalog numbers like OP06-022 map to /api/sets/card/{id}/.',
  },
  {
    id: 'lorcana-cards',
    kind: 'card',
    catalog: 'tcg',
    gameId: 'lorcana',
    sources: ['tcgcsv', 'pricecharting'],
    primary: 'tcgcsv',
    soldComps: 'limited',
    notes:
      'Ungraded: tcgcsv.com category 71 (daily TCGplayer JSON). lorcana-api.com is identity. Graded/solds: PriceCharting.',
  },
  {
    id: 'weiss-cards',
    kind: 'card',
    catalog: 'tcg',
    gameId: 'weiss',
    sources: ['tcgcsv', 'pricecharting'],
    primary: 'tcgcsv',
    soldComps: 'limited',
    notes:
      'PriceCharting has Weiss under Other TCG (weiss-schwarz-* sets). Ungraded market: tcgcsv.com category 20 (daily TCGplayer JSON). Graded solds still PriceCharting.',
  },
  gameRow('nes', 'NTSC NES first.'),
  gameRow('snes'),
  gameRow('n64'),
  gameRow('gb'),
  gameRow('gbc'),
  gameRow('gba'),
  gameRow('genesis'),
  gameRow('sms'),
  gameRow('ps1'),
  gameRow('ps2'),
  gameRow('psp'),
  gameRow('saturn'),
  gameRow('dc'),
  gameRow('jag'),
]

export const SOURCE_INVESTIGATION = {
  ebay: {
    joinFree: true,
    soldCompsOfficial: false,
    browseApi: 'active listings only',
    findCompletedItems: 'shut off 2020',
    marketplaceInsights:
      'Limited-release. Application Growth Check required. Community reports through 2025–2026: public sold access removed; most small apps denied.',
    conclusion:
      'eBay cannot replace PriceCharting for sold comps. Join is free; the sold-data API is not available to us.',
  },
  tcgplayer: {
    officialApi: false,
    note: 'Partner API is closed to new developers. Use pokemon-tcg-data, Scryfall, YGOPRODeck, and OPTCG which republish TCGplayer market as public JSON.',
  },
  pricecharting: {
    officialApi: true,
    free: false,
    approx: '$49/mo PriceCharting Pro',
    rateLimit: '1 request/second; CSV once/10min on Legendary',
    historicSales: false,
    note: 'Legitimate path for retro + graded + Lorcana/Weiss. Prefer /api/product JSON over HTML. Prices are pennies. Demo token is docs-only — never default it.',
  },
  scryfall: {
    officialApi: false,
    publicJson: true,
    free: true,
    note: 'prices.usd is Scryfall’s TCGplayer market; prices.eur is Cardmarket trend. Daily sync. Required User-Agent.',
  },
  pokemontcg: {
    officialApi: false,
    publicJson: true,
    free: true,
    note: 'pokemontcg.io / PokemonTCG/pokemon-tcg-data embed tcgplayer.prices.*.market and cardmarket.prices.trendPrice.',
  },
  ygoprodeck: {
    officialApi: false,
    publicJson: true,
    free: true,
    note: 'cardinfo.php card_prices lists tcgplayer/cardmarket/ebay asking prices. Store vendors as themselves.',
  },
  optcg: {
    officialApi: false,
    publicJson: true,
    free: true,
    note: 'optcgapi.com is a community REST API, no auth. Market price is TCGPlayer-based. Attribute; cap daily calls.',
  },
  tcgcsv: {
    officialApi: false,
    publicJson: true,
    free: true,
    note: 'tcgcsv.com daily public dump of TCGplayer prices. Weiss is category 20. Attribute the project.',
  },
} as const

export type FillJob = {
  family: string
  kind: MarketKind
  source: MarketSourceId
  access: 'official-api' | 'public-json' | 'html' | 'blocked'
  command: string
  ready: boolean
  needsToken: boolean
  reason: string
}

export function coverageFor(kind: string, id?: string) {
  return CATALOG_COVERAGE.filter(
    (row) => row.kind === kind && (!id || row.gameId === id || row.consoleId === id),
  )
}

export function coverageSummary() {
  return {
    families: CATALOG_COVERAGE.length,
    freePrimary: CATALOG_COVERAGE.filter((row) =>
      ['pokemontcg', 'scryfall', 'ygoprodeck', 'optcg', 'tcgcsv'].includes(row.primary),
    ).map((row) => row.id),
    pricechartingRequired: CATALOG_COVERAGE.filter((row) => row.primary === 'pricecharting').map(
      (row) => row.id,
    ),
    ebaySoldOfficial: false,
    ebaySoldNote: SOURCE_INVESTIGATION.ebay.conclusion,
    pricechartingHtmlPrices:
      Boolean(process.env.PRICECHARTING_TOKEN) || process.env.MARKET_ALLOW_PC_HTML === '1',
    tcgplayerOfficial: false,
    tcgplayerNote: SOURCE_INVESTIGATION.tcgplayer.note,
    pricechartingOfficial: {
      exists: true,
      free: false,
      approx: SOURCE_INVESTIGATION.pricecharting.approx,
      rateLimit: SOURCE_INVESTIGATION.pricecharting.rateLimit,
      historicSales: SOURCE_INVESTIGATION.pricecharting.historicSales,
      note: SOURCE_INVESTIGATION.pricecharting.note,
    },
    investigation: SOURCE_INVESTIGATION,
  }
}

export function fillJobs(opts?: { hasPricechartingToken?: boolean }): FillJob[] {
  const token = opts?.hasPricechartingToken ?? Boolean(process.env.PRICECHARTING_TOKEN)
  return CATALOG_COVERAGE.map((row) => {
    if (row.primary === 'pricecharting') {
      return {
        family: row.id,
        kind: row.kind,
        source: 'pricecharting' as const,
        access: token ? ('official-api' as const) : ('html' as const),
        command:
          row.kind === 'game'
            ? `npm run market:discover -- --kind game --console ${row.consoleId} --max-items 25 --live --apply`
            : `npm run market:discover -- --game ${row.gameId === 'mtg' ? 'magic' : row.gameId} --max-sets 1 --max-items 25 --live --apply`,
        ready: true,
        needsToken: token,
        reason: token
          ? 'PriceCharting official /api/product once items exist; discover still needs category HTML or CSV.'
          : row.notes,
      }
    }
    return {
      family: row.id,
      kind: row.kind,
      source: row.primary,
      access: 'public-json' as const,
      command: `npm run market:fill -- --family ${row.id} --max-items 25 --live --apply`,
      ready: true,
      needsToken: false,
      reason: row.notes,
    }
  })
}

export function coverageReport() {
  return {
    ...coverageSummary(),
    families: CATALOG_COVERAGE,
    fill: fillJobs(),
  }
}
