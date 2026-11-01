/**
 * Vultr-ready fill: walk the git identity catalog and attach public-JSON quotes.
 * Network is opt-in (--live). PriceCharting official API needs PRICECHARTING_TOKEN.
 */
import { createHash } from 'node:crypto'
import { coverageFor, fillJobs } from './market-coverage.js'
import { cacheHeaders, readHttpCache, rememberResponse } from './market-http-cache.js'
import { sleep } from './market-pricecharting.js'
import { SOURCE_POLICIES } from './market-schedule.js'
import { attachLineage, ingestPublicJson } from './market-sources.js'
import {
  getMarketItemByCatalog,
  listMarketItems,
  listQuotes,
  upsertMarketItem,
  upsertQuotes,
  withMarketTransaction,
} from './market-store.js'
import type { MarketItem, MarketSourceId } from './market-types.js'
import { listTcgCards } from './tcg-catalog.js'
import type { TcgCard } from './tcg-types.js'

const USER_AGENT = 'metadata.fyi market-fill (https://metadata.fyi)'

export const JSON_FILL_FAMILIES = [
  { id: 'pokemon-cards', gameId: 'pokemon', source: 'pokemontcg' as const, mode: 'pokemon-set' },
  { id: 'mtg-cards', gameId: 'mtg', source: 'scryfall' as const, mode: 'scryfall-collection' },
  { id: 'yugioh-cards', gameId: 'yugioh', source: 'ygoprodeck' as const, mode: 'ygo-all' },
  { id: 'onepiece-cards', gameId: 'onepiece', source: 'optcg' as const, mode: 'optcg-all' },
  { id: 'weiss-cards', gameId: 'weiss', source: 'tcgcsv' as const, mode: 'tcgcsv-group' },
  { id: 'lorcana-cards', gameId: 'lorcana', source: 'tcgcsv' as const, mode: 'tcgcsv-group' },
] as const

/** TCGplayer category ids published by tcgcsv.com. */
export const TCGCSV_CATEGORIES: Record<string, number> = {
  mtg: 1,
  yugioh: 2,
  pokemon: 3,
  weiss: 20,
  onepiece: 68,
  lorcana: 71,
  'pokemon-japan': 85,
}

export function tcgcsvCategoriesFor(gameId: string): number[] {
  if (gameId === 'pokemon') return [TCGCSV_CATEGORIES.pokemon, TCGCSV_CATEGORIES['pokemon-japan']]
  const id = TCGCSV_CATEGORIES[gameId]
  return id ? [id] : []
}

export const JSON_DELAY_MS: Record<MarketSourceId, number> = {
  pricecharting: 1500,
  tcgplayer: 400,
  cardmarket: 400,
  ebay: 800,
  altxyz: 2000,
  scryfall: 400,
  ygoprodeck: 400,
  pokemontcg: 500,
  optcg: 800,
  tcgcsv: 2000,
}

/** Scryfall collection allows 75 ids; we send 20 and wait 2s so it is not a burst. */
export const SCRYFALL_COLLECTION_BATCH = 20
export const SCRYFALL_COLLECTION_GAP_MS = 2000
export const SET_DUMP_GAP_MS = 2000

export const YGO_ALL_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
export const OPTCG_ALL_URL = 'https://optcgapi.com/api/allSetCards/'
export const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
export function tcgcsvGroupsUrl(categoryId: number) {
  return `https://tcgcsv.com/tcgplayer/${categoryId}/groups`
}

export function tcgcsvGroupUrl(categoryId: number, kind: 'products' | 'prices', groupId: number) {
  return `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/${kind}`
}

export function pokemonSetDumpUrl(setCode: string) {
  return `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${setCode}.json`
}

function englishPokemonSourceId(card: Pick<TcgCard, 'sources'> & { language?: string | null }) {
  if ((card.language || 'en') !== 'en') return null
  return card.sources.pokemontcg?.match(/\/cards\/([a-z0-9]+-[a-z0-9]+)/i)?.[1] || null
}

export type PublicJsonTarget = {
  source: MarketSourceId
  url: string
}

export function publicJsonTargetForCard(
  card: Pick<TcgCard, 'id' | 'gameId' | 'number' | 'sources'>,
): PublicJsonTarget | null {
  const scryfall = card.sources.scryfall
  if (scryfall) {
    const page = scryfall.match(/scryfall\.com\/card\/([^/?#]+)\/([^/?#]+)/i)
    if (page) {
      return {
        source: 'scryfall',
        url: `https://api.scryfall.com/cards/${page[1]}/${page[2]}`,
      }
    }
    const uuid = scryfall.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (uuid) return { source: 'scryfall', url: `https://api.scryfall.com/cards/${uuid[0]}` }
  }
  const poke = card.sources.pokemontcg
  if (poke) {
    const id = poke.match(/cards\/([^/?#]+)/i)?.[1]
    if (id) return { source: 'pokemontcg', url: `https://api.pokemontcg.io/v2/cards/${id}` }
  }
  if (card.gameId === 'yugioh') {
    const konami = card.id.replace(/^yugioh-/, '')
    if (/^\d+$/.test(konami)) {
      return {
        source: 'ygoprodeck',
        url: `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${konami}`,
      }
    }
  }
  if (card.gameId === 'onepiece' && card.number) {
    return {
      source: 'optcg',
      url: `https://optcgapi.com/api/sets/card/${card.number}/`,
    }
  }
  const categoryId = TCGCSV_CATEGORIES[card.gameId]
  if (categoryId) {
    return { source: 'tcgcsv', url: tcgcsvGroupsUrl(categoryId) }
  }
  return null
}

export function catalogMarketItemId(cardId: string) {
  return `market:catalog:tcg:${cardId}`
}

export function ensureCatalogMarketItem(card: TcgCard): MarketItem {
  const existing = getMarketItemByCatalog('tcg', card.id)
  if (existing) return existing
  const now = new Date().toISOString()
  return {
    id: catalogMarketItemId(card.id),
    kind: 'card',
    title: card.number ? `${card.name} ${card.number}` : card.name,
    catalog: { vertical: 'tcg', id: card.id },
    source: {
      id: publicJsonTargetForCard(card)?.source || 'pokemontcg',
      url:
        card.sources.scryfall ||
        card.sources.pokemontcg ||
        card.sources.ygoprodeck ||
        card.sources.official ||
        card.id,
      productId: card.id,
    },
    attrs: {
      game: card.gameId,
      tcgGameId: card.gameId,
      language: card.language || 'en',
      number: card.number || '',
      setCode: card.setCode || '',
    },
    scrapeStatus: 'pending',
    lastScrapedAt: null,
    lastError: null,
    updatedAt: now,
  }
}

export async function fetchJsonCached(url: string): Promise<Record<string, unknown>> {
  const cached = readHttpCache(url)
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json',
      ...cacheHeaders(url),
    },
  })
  if (response.status === 304 && cached) {
    return JSON.parse(cached.body) as Record<string, unknown>
  }
  const body = await response.text()
  rememberResponse(url, response, body)
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`)
  }
  return JSON.parse(body) as Record<string, unknown>
}

export function fillPreview(family: string, maxItems = 25) {
  const [row] = coverageFor(
    family.endsWith('-games') ? 'game' : 'card',
    family.replace(/-cards$/, '').replace(/-games$/, ''),
  )
  if (!row) {
    return { family, error: 'unknown family', jobs: fillJobs() }
  }
  if (row.kind === 'game') {
    return {
      family: row.id,
      source: row.primary,
      access: 'pricecharting',
      pending: listMarketItems({ kind: 'game' }).filter(
        (item) => item.attrs.console === row.consoleId && item.scrapeStatus !== 'completed',
      ).length,
      command: fillJobs().find((job) => job.family === row.id)?.command,
    }
  }
  const cards = listTcgCards({ game: row.gameId, limit: maxItems }).items
  return {
    family: row.id,
    source: row.primary,
    cards: cards.map((card) => ({
      id: card.id,
      name: card.name,
      target: publicJsonTargetForCard(card),
    })),
    withTarget: cards.filter((card) => publicJsonTargetForCard(card)).length,
    total: cards.length,
  }
}

export function scryfallIdForCard(card: Pick<TcgCard, 'sources' | 'imageUrl'>) {
  const fromSource = card.sources.scryfall?.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )
  if (fromSource) return fromSource[0]
  const fromImage = card.imageUrl?.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )
  return fromImage?.[0] || null
}

export function yugiohKonamiId(card: Pick<TcgCard, 'id'>) {
  const id = card.id.replace(/^yugioh-/i, '')
  return /^\d+$/.test(id) ? id : null
}

function payloadFeedHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
}

export function applyQuotesToCard(
  card: TcgCard,
  url: string,
  payload: Record<string, unknown>,
  fetchedAt = new Date().toISOString(),
) {
  const item = ensureCatalogMarketItem(card)
  const quotes = ingestPublicJson(item.id, url, payload, {
    card,
    feedHash: payloadFeedHash(payload),
  })
  if (!quotes.length) return { item, quotes: 0 }
  upsertMarketItem({
    ...item,
    scrapeStatus: 'completed',
    lastScrapedAt: fetchedAt,
    lastError: null,
    updatedAt: fetchedAt,
  })
  upsertQuotes(item.id, quotes)
  return { item, quotes: quotes.length }
}

export function applyYgoDump(
  cards: TcgCard[],
  dump: { data?: Array<{ id?: number | string; card_prices?: unknown }> },
  url = YGO_ALL_URL,
) {
  const byId = new Map(
    (dump.data || []).map((row) => [String(row.id), row as Record<string, unknown>]),
  )
  let applied = 0
  let quotes = 0
  for (const card of cards) {
    const id = yugiohKonamiId(card)
    const row = id ? byId.get(id) : undefined
    if (!row) continue
    const result = applyQuotesToCard(card, url, row)
    if (result.quotes) {
      applied += 1
      quotes += result.quotes
    }
  }
  return { applied, quotes, http: 1, mode: 'ygo-all' as const }
}

export function applyOptcgDump(cards: TcgCard[], dump: unknown, url = OPTCG_ALL_URL) {
  const rows = Array.isArray(dump)
    ? dump
    : Array.isArray((dump as { data?: unknown }).data)
      ? (dump as { data: unknown[] }).data
      : []
  const byNumber = new Map<string, Record<string, unknown>>()
  for (const raw of rows) {
    const row = raw as Record<string, unknown>
    const key = String(row.card_id || row.card_number || row.id || '').toUpperCase()
    if (key) byNumber.set(key, row)
  }
  let applied = 0
  let quotes = 0
  for (const card of cards) {
    const row = card.number ? byNumber.get(card.number.toUpperCase()) : undefined
    if (!row) continue
    const result = applyQuotesToCard(card, url, row)
    if (result.quotes) {
      applied += 1
      quotes += result.quotes
    }
  }
  return { applied, quotes, http: 1, mode: 'optcg-all' as const }
}

export function applyPokemonSetDump(cards: TcgCard[], setCards: unknown[], url: string) {
  const byId = new Map<string, Record<string, unknown>>()
  for (const raw of setCards) {
    const row = raw as Record<string, unknown>
    if (typeof row.id === 'string') byId.set(row.id, row)
  }
  let applied = 0
  let quotes = 0
  for (const card of cards) {
    const pokeId = card.sources.pokemontcg?.match(/cards\/([^/?#]+)/i)?.[1]
    const row = (pokeId && byId.get(pokeId)) || byId.get(`${card.setCode}-${card.number}`)
    if (!row) continue
    const result = applyQuotesToCard(card, url, row)
    if (result.quotes) {
      applied += 1
      quotes += result.quotes
    }
  }
  return { applied, quotes, http: 1, mode: 'pokemon-set' as const }
}

function tcgcsvNumber(product: Record<string, unknown>): string {
  const ext = Array.isArray(product.extendedData) ? product.extendedData : []
  for (const raw of ext) {
    const row = raw as { name?: string; value?: string }
    if (row.name && /number/i.test(row.name) && row.value) return String(row.value)
  }
  const name = String(product.name || '')
  const match = name.match(/\b([A-Z0-9]{2,}\/[A-Z0-9][\w.-]*)\b/i)
  return match?.[1] || ''
}

function numberKeys(raw: string): string[] {
  const n = raw.replace(/\s+/g, '').toUpperCase()
  if (!n) return []
  const head = n.split('/')[0].replace(/^0+/, '') || n.split('/')[0]
  return [...new Set([n, n.replace(/^0+/, ''), head])]
}

export function applyTcgcsvDump(
  cards: TcgCard[],
  products: Array<Record<string, unknown>>,
  prices: Array<{ productId?: number; marketPrice?: number | null; midPrice?: number | null }>,
  url: string,
) {
  const priceById = new Map(
    prices.map((row) => [Number(row.productId), row.marketPrice ?? row.midPrice ?? null]),
  )
  const productByNumber = new Map<string, Record<string, unknown>>()
  const productByName = new Map<string, Record<string, unknown>>()
  for (const product of products) {
    for (const key of numberKeys(tcgcsvNumber(product))) productByNumber.set(key, product)
    const name = String(product.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
    if (name) productByName.set(name, product)
  }
  const now = new Date().toISOString()
  let applied = 0
  let quotes = 0
  for (const card of cards) {
    const keys = numberKeys(card.number || '')
    const product =
      keys.map((key) => productByNumber.get(key)).find(Boolean) ||
      productByName.get(card.name.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    if (!product) continue
    const price = priceById.get(Number(product.productId))
    if (price == null || !Number.isFinite(price) || price <= 0) continue
    const item = ensureCatalogMarketItem(card)
    upsertMarketItem({
      ...item,
      scrapeStatus: 'completed',
      lastScrapedAt: now,
      lastError: null,
      updatedAt: now,
    })
    upsertQuotes(item.id, [
      attachLineage({
        variant: 'ungraded',
        label: 'Ungraded',
        source: 'tcgcsv',
        url,
        price,
        fetchedAt: now,
      }),
    ])
    applied += 1
    quotes += 1
  }
  return { applied, quotes, http: 2, mode: 'tcgcsv-group' as const }
}

export function applyScryfallDump(
  cards: TcgCard[],
  scryCards: unknown[],
  url = SCRYFALL_COLLECTION_URL,
) {
  const byId = new Map<string, Record<string, unknown>>()
  const bySetNum = new Map<string, Record<string, unknown>>()
  for (const raw of scryCards) {
    const row = raw as Record<string, unknown>
    if (typeof row.id === 'string') byId.set(row.id, row)
    const set = String(row.set || '').toLowerCase()
    const num = String(row.collector_number || '')
    if (set && num) bySetNum.set(`${set}:${num}`, row)
  }
  let applied = 0
  let quotes = 0
  for (const card of cards) {
    const uuid = scryfallIdForCard(card)
    const row =
      (uuid && byId.get(uuid)) ||
      (card.setCode && card.number
        ? bySetNum.get(`${card.setCode.toLowerCase()}:${card.number}`)
        : undefined)
    if (!row) continue
    const result = applyQuotesToCard(card, url, row)
    if (result.quotes) {
      applied += 1
      quotes += result.quotes
    }
  }
  return { applied, quotes, http: 1, mode: 'scryfall-collection' as const }
}

export function collectDueCards(gameId: string, source: MarketSourceId, maxItems: number) {
  const cards: TcgCard[] = []
  const languages = process.env.MARKET_LANGUAGES?.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  let offset = 0
  while (cards.length < maxItems) {
    const page = listTcgCards({ game: gameId, limit: 80, offset })
    if (!page.items.length) break
    for (const card of page.items) {
      if (languages?.length && !languages.includes(card.language || 'en')) continue
      if (gameId === 'pokemon' && source === 'pokemontcg' && !englishPokemonSourceId(card)) continue
      if (!catalogCardIsDue(card, source)) continue
      if (!publicJsonTargetForCard(card) && gameId !== 'yugioh') continue
      cards.push(card)
      if (cards.length >= maxItems) break
    }
    offset += page.items.length
    if (offset >= page.total) break
  }
  return cards
}

export function catalogCardIsDue(
  card: Pick<TcgCard, 'id'>,
  source: MarketSourceId,
  now = Date.now(),
) {
  const item = getMarketItemByCatalog('tcg', card.id)
  if (!item) return true
  if (item.scrapeStatus === 'failed' && item.lastScrapedAt) {
    const attempted = Date.parse(item.lastScrapedAt)
    if (Number.isFinite(attempted) && now - attempted < SOURCE_POLICIES[source].minIntervalMs)
      return false
  }
  const quotes = listQuotes(item.id)
  const fromSource = quotes.filter((row) => row.source === source)
  const pool = fromSource.length ? fromSource : source === 'tcgcsv' ? [] : quotes
  if (!pool.length) return true
  const newest = pool.reduce(
    (max, row) => (row.fetchedAt > max ? row.fetchedAt : max),
    pool[0].fetchedAt,
  )
  const policy = SOURCE_POLICIES[source]
  const ts = Date.parse(newest)
  return !Number.isFinite(ts) || now - ts >= policy.minIntervalMs
}

export async function fillFamily(opts: {
  family: string
  maxItems?: number
  live: boolean
  apply: boolean
  onlyDue?: boolean
}) {
  const maxItems = opts.maxItems ?? 25
  const onlyDue = opts.onlyDue !== false
  const [row] = coverageFor(
    opts.family.endsWith('-games') ? 'game' : 'card',
    opts.family.replace(/-cards$/, '').replace(/-games$/, ''),
  )
  if (!row) return { ok: false, family: opts.family, error: 'unknown family', live: opts.live }
  if (!opts.live) {
    return {
      ok: true,
      command: 'fill',
      live: false,
      apply: opts.apply,
      preview: fillPreview(opts.family, maxItems),
    }
  }
  if (row.kind === 'game') {
    return {
      ok: true,
      command: 'fill',
      live: true,
      apply: opts.apply,
      skipped: true,
      reason: 'game families use market:discover --kind game, then sync / official API',
      preview: fillPreview(opts.family, maxItems),
    }
  }
  const cards = onlyDue
    ? collectDueCards(row.gameId || '', row.primary, maxItems)
    : listTcgCards({ game: row.gameId, limit: maxItems }).items.filter(
        (card) =>
          publicJsonTargetForCard(card) &&
          (!process.env.MARKET_LANGUAGES ||
            process.env.MARKET_LANGUAGES.split(',')
              .map((value) => value.trim().toLowerCase())
              .includes(card.language || 'en')),
      )
  if (opts.apply) {
    return await withMarketTransaction(async () => {
      const startedAt = Date.now()
      const recordUnpriced = () => {
        let unpriced = 0
        const now = new Date().toISOString()
        for (const card of cards) {
          const item = ensureCatalogMarketItem(card)
          if (listQuotes(item.id).some((quote) => Date.parse(quote.fetchedAt) >= startedAt))
            continue
          upsertMarketItem({
            ...item,
            scrapeStatus: 'failed',
            lastScrapedAt: now,
            lastError: 'No supported price quote returned; retry after the source refresh interval',
            updatedAt: now,
          })
          unpriced++
        }
        return unpriced
      }
      const bulk = await fillFamilyBulk(row.gameId || '', cards)
      const csv = await fillTcgcsvGame(row.gameId || '', cards)
      if (bulk || csv) {
        return {
          ok: true,
          command: 'fill',
          live: true,
          apply: true,
          family: opts.family,
          fetched: (bulk?.fetched || 0) + (csv?.fetched || 0),
          applied: (bulk?.applied || 0) + (csv?.applied || 0),
          quotes: (bulk?.quotes || 0) + (csv?.quotes || 0),
          http: (bulk?.http || 0) + (csv?.http || 0),
          mode: csv && bulk ? `${bulk.mode}+tcgcsv` : csv?.mode || bulk?.mode,
          tcgcsv: csv || undefined,
          unpriced: recordUnpriced(),
        }
      }
      const report = {
        fetched: 0,
        quotes: 0,
        skipped: 0,
        failed: 0,
        http: 0,
        mode: 'per-card',
      }
      for (const card of cards) {
        const target = publicJsonTargetForCard(card)
        if (!target) {
          report.skipped += 1
          continue
        }
        try {
          await sleep(JSON_DELAY_MS[target.source] ?? 400)
          const payload = await fetchJsonCached(target.url)
          report.http += 1
          const result = applyQuotesToCard(card, target.url, payload)
          report.fetched += 1
          report.quotes += result.quotes
        } catch {
          report.failed += 1
        }
      }
      return {
        ok: true,
        command: 'fill',
        live: true,
        apply: true,
        family: opts.family,
        ...report,
        unpriced: recordUnpriced(),
      }
    })
  }
  const report = {
    fetched: 0,
    quotes: 0,
    skipped: 0,
    failed: 0,
    http: 0,
    mode: 'per-card',
  }
  for (const card of cards) {
    const target = publicJsonTargetForCard(card)
    if (!target) {
      report.skipped += 1
      continue
    }
    try {
      await sleep(JSON_DELAY_MS[target.source] ?? 400)
      const payload = await fetchJsonCached(target.url)
      report.http += 1
      if (!opts.apply) {
        report.fetched += 1
        continue
      }
      const result = applyQuotesToCard(card, target.url, payload)
      report.fetched += 1
      report.quotes += result.quotes
    } catch {
      report.failed += 1
    }
  }
  return {
    ok: true,
    command: 'fill',
    live: true,
    apply: opts.apply,
    family: opts.family,
    ...report,
  }
}

async function fillFamilyBulk(gameId: string, cards: TcgCard[]) {
  if (!cards.length) return null
  if (gameId === 'yugioh') {
    const dump = await fetchJsonCached(YGO_ALL_URL)
    const result = applyYgoDump(cards, dump as { data?: Array<{ id?: number | string }> })
    return { ...result, fetched: result.applied }
  }
  if (gameId === 'onepiece') {
    const dump = await fetchJsonCached(OPTCG_ALL_URL)
    const result = applyOptcgDump(cards, dump)
    return { ...result, fetched: result.applied }
  }
  if (gameId === 'pokemon') {
    const bySet = new Map<string, TcgCard[]>()
    for (const card of cards) {
      const sourceId = englishPokemonSourceId(card)
      const code = sourceId?.slice(0, sourceId.lastIndexOf('-'))
      if (!code) continue
      const rows = bySet.get(code) || []
      rows.push(card)
      bySet.set(code, rows)
    }
    let applied = 0
    let quotes = 0
    let http = 0
    for (const [code, setCards] of bySet) {
      const url = pokemonSetDumpUrl(code)
      await sleep(SET_DUMP_GAP_MS)
      const dump = await fetchJsonCached(url)
      const rows = Array.isArray(dump)
        ? dump
        : Array.isArray((dump as { data?: unknown }).data)
          ? (dump as { data: unknown[] }).data
          : []
      const result = applyPokemonSetDump(setCards, rows, url)
      applied += result.applied
      quotes += result.quotes
      http += 1
    }
    return { applied, quotes, http, mode: 'pokemon-set' as const, fetched: applied }
  }
  if (gameId === 'mtg') {
    let applied = 0
    let quotes = 0
    let http = 0
    for (let i = 0; i < cards.length; i += SCRYFALL_COLLECTION_BATCH) {
      const batch = cards.slice(i, i + SCRYFALL_COLLECTION_BATCH)
      const identifiers = batch.map((card) => {
        const id = scryfallIdForCard(card)
        if (id) return { id }
        return { set: card.setCode || '', collector_number: card.number || '' }
      })
      await sleep(SCRYFALL_COLLECTION_GAP_MS)
      const response = await fetch(SCRYFALL_COLLECTION_URL, {
        method: 'POST',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ identifiers }),
      })
      http += 1
      if (!response.ok) throw new Error(`GET ${SCRYFALL_COLLECTION_URL} -> ${response.status}`)
      const payload = (await response.json()) as { data?: unknown[] }
      const result = applyScryfallDump(batch, payload.data || [])
      applied += result.applied
      quotes += result.quotes
    }
    return { applied, quotes, http, mode: 'scryfall-collection' as const, fetched: applied }
  }
  return null
}

async function fillTcgcsvGame(gameId: string, cards: TcgCard[]) {
  const categoryIds = tcgcsvCategoriesFor(gameId)
  if (!categoryIds.length || !cards.length) return null
  let applied = 0
  let quotes = 0
  let http = 0
  for (const categoryId of categoryIds) {
    const categoryCards = cards.filter(
      (card) =>
        gameId !== 'pokemon' || (card.language || 'en') === (categoryId === 85 ? 'ja' : 'en'),
    )
    if (!categoryCards.length) continue
    const groupsUrl = tcgcsvGroupsUrl(categoryId)
    const groupsPayload = await fetchJsonCached(groupsUrl)
    http += 1
    const groups = Array.isArray((groupsPayload as { results?: unknown }).results)
      ? (
          groupsPayload as {
            results: Array<{ groupId: number; name?: string; abbreviation?: string }>
          }
        ).results
      : []
    const belongsToGroup = (card: TcgCard, group: (typeof groups)[number]) => {
      const abbr = (group.abbreviation || '').toUpperCase()
      const name = (group.name || '').toLowerCase()
      return Boolean(
        (abbr && abbr === (card.setCode || '').toUpperCase()) ||
          (name && name === (card.setName || '').toLowerCase()),
      )
    }
    const matches = groups.filter((group) =>
      categoryCards.some((card) => belongsToGroup(card, group)),
    )
    for (const group of matches.slice(0, 5)) {
      await sleep(SET_DUMP_GAP_MS)
      const productsUrl = tcgcsvGroupUrl(categoryId, 'products', group.groupId)
      const pricesUrl = tcgcsvGroupUrl(categoryId, 'prices', group.groupId)
      const productsPayload = await fetchJsonCached(productsUrl)
      await sleep(SET_DUMP_GAP_MS)
      const pricesPayload = await fetchJsonCached(pricesUrl)
      http += 2
      const products = Array.isArray((productsPayload as { results?: unknown }).results)
        ? (productsPayload as { results: Array<Record<string, unknown>> }).results
        : []
      const prices = Array.isArray((pricesPayload as { results?: unknown }).results)
        ? (
            pricesPayload as {
              results: Array<{ productId?: number; marketPrice?: number | null }>
            }
          ).results
        : []
      const result = applyTcgcsvDump(
        categoryCards.filter((card) => belongsToGroup(card, group)),
        products,
        prices,
        pricesUrl,
      )
      applied += result.applied
      quotes += result.quotes
    }
  }
  return { applied, quotes, http, mode: 'tcgcsv-group' as const, fetched: applied }
}
