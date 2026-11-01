import type { Paginated } from './types.js'
import type { TcgCard, TcgFacets, TcgGame, TcgGameId, TcgSet, TcgStats } from './tcg-types.js'
import { listPartners, partnerShopUrl, type ShopLink } from './affiliates.js'
import { skuUri } from './sku-uri.js'
import { offersFromShops, type SkuCommerce } from './sku-types.js'

import gamesData from '../data/tcg/games.json' with { type: 'json' }
import setsData from '../data/tcg/sets.json' with { type: 'json' }
import { openTcgDiskCatalog } from './tcg-disk-catalog.mjs'

const disk = process.env.TCG_CATALOG_DB ? openTcgDiskCatalog(process.env.TCG_CATALOG_DB) : null
const cardsData = disk ? [] : (await import('./tcg-card-data.mjs')).default

const games = gamesData as unknown as TcgGame[]
const sets = setsData as unknown as TcgSet[]
const cards = (cardsData as unknown as TcgCard[]).sort(
  (a, b) =>
    a.gameId.localeCompare(b.gameId) ||
    a.name.localeCompare(b.name) ||
    String(a.number).localeCompare(String(b.number)),
)
const cardsById = new Map(cards.map((card) => [card.id.toLowerCase(), card]))
for (const card of cards) {
  for (const alias of card.aliases ?? []) {
    const existing = cardsById.get(alias.toLowerCase())
    if (existing && existing.id !== card.id) throw new Error(`Ambiguous card alias ${alias}`)
    cardsById.set(alias.toLowerCase(), card)
  }
}
const pokemonCardsBySourceId = new Map<string, TcgCard[]>()
for (const card of cards) {
  if (card.gameId !== 'pokemon' || !card.sourceId) continue
  const key = card.sourceId.toLowerCase()
  const matches = pokemonCardsBySourceId.get(key) || []
  matches.push(card)
  pokemonCardsBySourceId.set(key, matches)
}

const facetsByGame = new Map<TcgGameId, TcgFacets>()
const cardsByGame = new Map<TcgGameId, TcgCard[]>()
for (const card of cards) {
  const gameCards = cardsByGame.get(card.gameId) || []
  gameCards.push(card)
  cardsByGame.set(card.gameId, gameCards)
}
for (const game of games) {
  const gameCards = cardsByGame.get(game.id) || []
  const tally = (values: string[]) => {
    const counts = new Map<string, number>()
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
    return [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }
  facetsByGame.set(game.id, {
    gameId: game.id,
    totalCards: gameCards.length,
    sets: sets
      .filter((set) => set.gameId === game.id)
      .sort(
        (a, b) =>
          String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')) ||
          a.code.localeCompare(b.code),
      ),
    rarities: tally(
      gameCards.map((card) => card.rarity).filter((value): value is string => Boolean(value)),
    ),
    types: tally(gameCards.flatMap((card) => [...new Set(card.types || [])])),
    subtypes: tally(gameCards.flatMap((card) => [...new Set(card.subtypes || [])])),
  })
}

function page<T>(items: readonly T[], limit: number, offset: number): Paginated<T> {
  const lim = Math.min(Math.max(limit, 1), 100)
  const off = Math.max(offset, 0)
  return {
    items: items.slice(off, off + lim),
    total: items.length,
    limit: lim,
    offset: off,
  }
}

export function listTcgGames(): TcgGame[] {
  return [...games]
}

export function getTcgGame(id: string): TcgGame | undefined {
  const key = id.toLowerCase()
  return games.find((g) => g.id === key || g.slug === key)
}

export function listTcgSets(opts?: {
  language?: string
  game?: string
  q?: string
  limit?: number
  offset?: number
}): Paginated<TcgSet> {
  let rows = [...sets]
  if (opts?.game) {
    const g = opts.game.toLowerCase()
    rows = rows.filter((s) => s.gameId === g)
  }
  if (opts?.language) {
    const language = opts.language.toLowerCase()
    rows = rows.filter((s) => s.language === language || s.languages?.includes(language))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.series || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        Object.values(s.sourceIds || {}).some((value) => value.toLowerCase().includes(q)),
    )
  }
  rows.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.code.localeCompare(b.code))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getTcgSet(idOrCode: string): TcgSet | undefined {
  const key = idOrCode.toLowerCase()
  return (
    sets.find((s) => s.id.toLowerCase() === key) ??
    sets.find((s) => s.code.toLowerCase() === key && s.language !== 'ja')
  )
}

export function listTcgCards(opts?: {
  language?: string
  game?: string
  set?: string
  q?: string
  rarity?: string
  type?: string
  subtype?: string
  limit?: number
  offset?: number
}): Paginated<TcgCard> {
  if (disk) return disk.listCards(opts)
  const game = opts?.game?.toLowerCase()
  let rows: readonly TcgCard[] = game ? (cardsByGame.get(game as TcgGameId) ?? []) : cards
  if (opts?.language)
    rows = rows.filter((c) => (c.language ?? 'en') === opts.language?.toLowerCase())
  if (opts?.set) {
    const s = opts.set.toLowerCase()
    rows = rows.filter(
      (c) =>
        c.setId?.toLowerCase() === s ||
        c.setCode?.toLowerCase() === s ||
        c.setName?.toLowerCase().includes(s),
    )
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((c) => {
      const hay =
        `${c.name} ${c.number ?? ''} ${c.setCode ?? ''} ${c.setName ?? ''} ${c.rarity ?? ''} ${c.archetype ?? ''} ${c.tags.join(' ')} ${c.text ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  if (opts?.rarity) {
    const r = opts.rarity.toLowerCase()
    rows = rows.filter((c) => c.rarity?.toLowerCase().includes(r))
  }
  if (opts?.type) {
    const t = opts.type.toLowerCase()
    rows = rows.filter(
      (c) =>
        c.supertype?.toLowerCase().includes(t) ||
        c.types?.some((x) => x.toLowerCase().includes(t)) ||
        c.subtypes?.some((x) => x.toLowerCase().includes(t)),
    )
  }
  if (opts?.subtype) {
    const subtype = opts.subtype.toLowerCase()
    rows = rows.filter((c) => c.subtypes?.some((value) => value.toLowerCase().includes(subtype)))
  }
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allTcgCards(): readonly TcgCard[] {
  if (disk) return disk.allCards()
  return cards
}

export function allTcgGames(): readonly TcgGame[] {
  return games
}

export function getTcgCard(id: string): TcgCard | undefined {
  if (disk) return disk.getCard(id)
  const key = id.toLowerCase()
  const canonical = cardsById.get(key)
  if (canonical) return canonical
  const sourceMatches = pokemonCardsBySourceId.get(key) || []
  const english = sourceMatches.filter((card) => (card.language ?? 'en') === 'en')
  return english.length === 1
    ? english[0]
    : sourceMatches.length === 1
      ? sourceMatches[0]
      : undefined
}

/** Precomputed set and card facets for a single TCG game. */
export function tcgFacets(game: string): TcgFacets | undefined {
  const resolved = getTcgGame(game)
  if (disk && resolved) {
    const values = disk.facets(resolved.id)
    return {
      gameId: resolved.id,
      totalCards: values?.totalCards ?? 0,
      sets: sets
        .filter((set) => set.gameId === resolved.id)
        .sort(
          (a, b) =>
            String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')) ||
            a.code.localeCompare(b.code),
        ),
      rarities: values?.rarities ?? [],
      types: values?.types ?? [],
      subtypes: values?.subtypes ?? [],
    }
  }
  return resolved ? facetsByGame.get(resolved.id) : undefined
}

export function getTcgCardByCollectorKey(
  game: string,
  set: string,
  number: string,
): TcgCard | undefined {
  if (disk) return disk.collector(game, set, number)
  const g = game.toLowerCase()
  const s = set.toLowerCase()
  const n = String(number).toLowerCase()
  const hits = (cardsByGame.get(g as TcgGameId) ?? []).filter((c) => {
    const setOk = c.setCode?.toLowerCase() === s || c.setId?.toLowerCase() === s
    if (!setOk) return false
    return (c.number ?? '').toLowerCase() === n
  })
  return hits.length === 1 ? hits[0] : undefined
}

const TCG_SHOP_PARTNERS = ['tcgplayer', 'cardmarket', 'coolstuffinc', 'amazon-associates'] as const

function tcgCardShopLinks(c: TcgCard): ShopLink[] {
  return TCG_SHOP_PARTNERS.map((id) => partnerShopUrl(id, { query: c.name })).filter(
    (s): s is ShopLink => Boolean(s),
  )
}

export function commerceForTcgCard(c: TcgCard): SkuCommerce {
  return offersFromShops({
    sku: skuUri('tcg', 'cards', c.id),
    shops: tcgCardShopLinks(c),
  })
}

export function enrichTcgCard(c: TcgCard) {
  const game = getTcgGame(c.gameId) ?? null
  const set = c.setId ? getTcgSet(c.setId) : c.setCode ? getTcgSet(c.setCode) : null
  const sku = skuUri('tcg', 'cards', c.id)
  const shop = tcgCardShopLinks(c).map((s) => ({
    ...s,
    sku,
    role: 'offer' as const,
  }))
  return {
    card: c,
    game,
    set,
    copy: {
      name: c.name,
      number: c.number ?? '',
      set: c.setCode || c.setName || '',
      rarity: c.rarity ?? '',
      line: [c.name, c.setCode, c.number, c.rarity].filter(Boolean).join(' · '),
      tags: c.tags.join(' '),
    },
    links: {
      sources: c.sources,
      shop,
    },
    affiliates: listPartners({ vertical: 'tcg' })
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        name: p.name,
        affiliateUrl: p.affiliateUrl ?? null,
        website: p.website,
        isConfigured: Boolean((p as { isConfigured?: boolean }).isConfigured ?? p.affiliateUrl),
      })),
    sku: skuUri('tcg', 'cards', c.id),
  }
}

export function searchTcg(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'card' | 'set' | 'game'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []

  for (const g of games) {
    if (
      g.name.toLowerCase().includes(query) ||
      g.shortName.toLowerCase().includes(query) ||
      g.id.includes(query)
    ) {
      hits.push({
        kind: 'game',
        id: g.id,
        title: g.name,
        subtitle: 'tcg',
        score: 2.5,
        sku: skuUri('tcg', 'games', g.id),
      })
    }
  }
  for (const s of sets) {
    if (s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)) {
      hits.push({
        kind: 'set',
        id: s.id,
        title: s.name,
        subtitle: `${s.gameId} · ${s.code}`,
        imageUrl: s.imageUrl ?? null,
        score: 2,
      })
    }
  }
  if (disk) {
    const start = Math.max(0, offset - hits.length)
    const result = disk.search(query, Math.max(limit, 1) + hits.length, start)
    for (const { card: c, score } of result.items) {
      hits.push({
        kind: 'card',
        id: c.id,
        title: c.name,
        subtitle: [c.gameId, c.setCode, c.number, c.rarity].filter(Boolean).join(' · '),
        imageUrl: c.imageSmallUrl || c.imageUrl || null,
        score,
        sku: skuUri('tcg', 'cards', c.id),
      })
    }
    const otherTotal = hits.length - result.items.length
    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    const paged = page(hits, limit, offset - start)
    return { hits: paged.items, total: otherTotal + result.total }
  }
  for (const c of cards) {
    const hay = `${c.name} ${c.number ?? ''} ${c.setCode ?? ''}`.toLowerCase()
    if (!hay.includes(query)) continue
    const score = c.name.toLowerCase().startsWith(query)
      ? 2.2
      : c.number?.toLowerCase() === query
        ? 2.4
        : 1.2
    hits.push({
      kind: 'card',
      id: c.id,
      title: c.name,
      subtitle: [c.gameId, c.setCode, c.number, c.rarity].filter(Boolean).join(' · '),
      imageUrl: c.imageSmallUrl || c.imageUrl || null,
      score,
      sku: skuUri('tcg', 'cards', c.id),
    })
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function tcgStats(): TcgStats {
  return {
    games: games.length,
    sets: sets.length,
    cards: disk ? disk.count() : cards.length,
  }
}

export function tcgStatsByGame(): Record<string, { sets: number; cards: number }> {
  const out: Record<string, { sets: number; cards: number }> = {}
  for (const g of games) out[g.id] = { sets: 0, cards: 0 }
  for (const s of sets) {
    if (!out[s.gameId]) out[s.gameId] = { sets: 0, cards: 0 }
    out[s.gameId].sets++
  }
  if (disk) {
    for (const row of disk.counts()) {
      if (!out[row.game]) out[row.game] = { sets: 0, cards: 0 }
      out[row.game].cards = row.cards
    }
  } else {
    for (const c of cards) {
      if (!out[c.gameId]) out[c.gameId] = { sets: 0, cards: 0 }
      out[c.gameId].cards++
    }
  }
  return out
}

export type { TcgGameId }

/** Bounded collector lookup for SKU resolution, without a process-wide card map. */
export function tcgCollectorAliasMatches(key: string): TcgCard[] {
  if (disk) return disk.collectorAliases(key)
  const q = key.toLowerCase()
  return cards.filter(
    (card) =>
      card.setCode &&
      card.number &&
      (`${card.gameId}-${card.setCode}-${card.number}`.toLowerCase() === q ||
        `${card.gameId}:${card.setCode}:${card.number}`.toLowerCase() === q),
  )
}

export function tcgMarketMatches(opts: {
  game?: string
  setCode?: string
  language?: string
  number: string
  title: string
}): TcgCard[] {
  if (disk) return disk.matchMarket(opts)
  return cards.filter(
    (card) =>
      (!opts.game || card.gameId === opts.game) &&
      (!opts.setCode || card.setCode?.toLowerCase() === opts.setCode) &&
      (!opts.language || card.language === opts.language) &&
      card.number?.toLowerCase() === opts.number &&
      opts.title.includes(card.name.toLowerCase()),
  )
}
