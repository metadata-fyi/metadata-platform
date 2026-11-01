import { skuUri } from './sku-uri.js'
import { allBoardGames, getBoardGame } from './boardgame-catalog.js'
import type { BoardGame } from './boardgame-types.js'
import { getCharacter, getSeries } from './catalog.js'
import { allConsoles, getConsole } from './console-catalog.js'
import type { GameConsole } from './console-types.js'
import { allEsportsTitles, getEsportsTitle } from './esports-catalog.js'
import type { EsportsTitle } from './esports-types.js'
import { allFashionItems, commerceForFashionItem } from './fashion-catalog.js'
import type { FashionItem } from './fashion-types.js'
import { allFigureItems, commerceForFigureItem } from './figure-catalog.js'
import type { FigureItem } from './figure-types.js'
import { allModelkitItems, commerceForModelkitItem } from './modelkit-catalog.js'
import type { ModelkitItem } from './modelkit-types.js'
import { allOstAlbums, getOstAlbum } from './ost-catalog.js'
import type { OstAlbum } from './ost-types.js'
import { allPlushItems, commerceForPlushItem } from './plush-catalog.js'
import type { PlushItem } from './plush-types.js'
import { allProducts, commerceForPod } from './pod-catalog.js'
import type { PodBlank } from './pod-types.js'
import type {
  SkuAlias,
  SkuBatchItem,
  SkuCollection,
  SkuRef,
  SkuResolveResult,
} from './sku-types.js'
import {
  tcgCollectorAliasMatches,
  allTcgGames,
  commerceForTcgCard,
  getTcgCard,
  getTcgGame,
} from './tcg-catalog.js'
import type { TcgCard, TcgGame } from './tcg-types.js'
import type { MetaCharacter, Series } from './types.js'
import { isLiveVertical, type LiveVertical } from './verticals.js'

const SKU_COLLECTIONS = new Set<string>([
  'products',
  'items',
  'cards',
  'games',
  'series',
  'characters',
  'albums',
  'consoles',
  'titles',
])

const AMBIGUOUS_CAP = 20

export { skuUri } from './sku-uri.js'

function isSkuCollection(value: string): value is SkuCollection {
  return SKU_COLLECTIONS.has(value)
}

/** Group by commercial key; only keys that belong to exactly one row are returned. */
function commercialKeyUnique<T>(
  list: readonly T[],
  keyFn: (item: T) => string | null | undefined,
): Map<string, T> {
  const grouped = new Map<string, T[]>()
  for (const item of list) {
    const raw = keyFn(item)
    if (raw == null || raw === '') continue
    const k = String(raw).toLowerCase()
    const arr = grouped.get(k)
    if (arr) arr.push(item)
    else grouped.set(k, [item])
  }
  const unique = new Map<string, T>()
  for (const [k, arr] of grouped) {
    if (arr.length === 1) unique.set(k, arr[0]!)
  }
  return unique
}

function pushAlias(aliases: SkuAlias[], ns: SkuAlias['ns'], value: string | null | undefined) {
  if (value == null || value === '') return
  aliases.push({ ns, value })
}

function podRef(p: PodBlank): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', p.id)
  pushAlias(aliases, 'slug', p.slug)
  pushAlias(aliases, 'style', p.styleCode)
  if (p.brandId && p.styleCode) {
    pushAlias(aliases, 'style', `${p.brandId}-${p.styleCode}`)
  }
  for (const listing of p.listings ?? []) {
    pushAlias(aliases, 'listing', listing.sku)
  }
  return {
    uri: skuUri('pod', 'products', p.id),
    vertical: 'pod',
    collection: 'products',
    id: p.id,
    aliases,
    commerce: commerceForPod(p),
  }
}

function fashionRef(item: FashionItem): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', item.id)
  pushAlias(aliases, 'slug', item.slug)
  pushAlias(aliases, 'style', item.styleCode)
  return {
    uri: skuUri('fashion', 'items', item.id),
    vertical: 'fashion',
    collection: 'items',
    id: item.id,
    aliases,
    commerce: commerceForFashionItem(item),
  }
}

function merchRef(
  vertical: 'figures' | 'plush' | 'modelkits',
  item: FigureItem | PlushItem | ModelkitItem,
): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', item.id)
  pushAlias(aliases, 'slug', item.slug)
  pushAlias(aliases, 'mfr', item.productCode)
  pushAlias(aliases, 'gtin', item.jan)
  const commerce =
    vertical === 'figures'
      ? commerceForFigureItem(item as FigureItem)
      : vertical === 'plush'
        ? commerceForPlushItem(item as PlushItem)
        : commerceForModelkitItem(item as ModelkitItem)
  return {
    uri: skuUri(vertical, 'items', item.id),
    vertical,
    collection: 'items',
    id: item.id,
    aliases,
    commerce,
  }
}

function tcgCardRef(card: TcgCard): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', card.id)
  if (card.setCode && card.number) {
    pushAlias(aliases, 'tcg', `${card.gameId}-${card.setCode}-${card.number}`)
    pushAlias(aliases, 'tcg', `${card.gameId}:${card.setCode}:${card.number}`)
  }
  return {
    uri: skuUri('tcg', 'cards', card.id),
    vertical: 'tcg',
    collection: 'cards',
    id: card.id,
    aliases,
    commerce: commerceForTcgCard(card),
  }
}

function tcgGameRef(game: TcgGame): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', game.id)
  pushAlias(aliases, 'slug', game.slug)
  return {
    uri: skuUri('tcg', 'games', game.id),
    vertical: 'tcg',
    collection: 'games',
    id: game.id,
    aliases,
  }
}

function ostAlbumRef(album: OstAlbum): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', album.id)
  pushAlias(aliases, 'slug', album.slug)
  pushAlias(aliases, 'listing', album.catalogNumber)
  return {
    uri: skuUri('ost', 'albums', album.id),
    vertical: 'ost',
    collection: 'albums',
    id: album.id,
    aliases,
  }
}

function boardGameRef(game: BoardGame): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', game.id)
  pushAlias(aliases, 'slug', game.slug)
  if (game.bggId != null) pushAlias(aliases, 'id', `bgg-${game.bggId}`)
  return {
    uri: skuUri('boardgames', 'games', game.id),
    vertical: 'boardgames',
    collection: 'games',
    id: game.id,
    aliases,
  }
}

function consoleRef(c: GameConsole): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', c.id)
  pushAlias(aliases, 'slug', c.slug)
  return {
    uri: skuUri('consoles', 'consoles', c.id),
    vertical: 'consoles',
    collection: 'consoles',
    id: c.id,
    aliases,
  }
}

function esportsTitleRef(title: EsportsTitle): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', title.id)
  pushAlias(aliases, 'slug', title.slug)
  return {
    uri: skuUri('esports', 'titles', title.id),
    vertical: 'esports',
    collection: 'titles',
    id: title.id,
    aliases,
  }
}

function seriesRef(vertical: string, series: Series): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', series.id)
  pushAlias(aliases, 'slug', series.slug)
  return {
    uri: skuUri(vertical, 'series', series.id),
    vertical,
    collection: 'series',
    id: series.id,
    aliases,
  }
}

function characterRef(vertical: string, character: MetaCharacter): SkuRef {
  const aliases: SkuAlias[] = []
  pushAlias(aliases, 'id', character.id)
  pushAlias(aliases, 'slug', character.slug)
  return {
    uri: skuUri(vertical, 'characters', character.id),
    vertical,
    collection: 'characters',
    id: character.id,
    aliases,
  }
}

function parseNamespaced(
  raw: string,
): { vertical: LiveVertical; collection: SkuCollection; id: string } | null {
  const prefixed = /^metadata:([^:]+):([^:]+):(.+)$/i.exec(raw)
  const bare = prefixed ? null : /^([^:]+):([^:]+):(.+)$/.exec(raw)
  const m = prefixed ?? bare
  if (!m) return null
  const vertical = m[1]!.toLowerCase()
  const collection = m[2]!.toLowerCase()
  const id = m[3]!
  if (!isLiveVertical(vertical) || !isSkuCollection(collection)) return null
  return { vertical, collection, id }
}

function resolveExact(
  vertical: LiveVertical,
  collection: SkuCollection,
  id: string,
): SkuRef | undefined {
  const key = id.toLowerCase()
  if (collection === 'products') {
    if (vertical !== 'pod') return undefined
    const p = allProducts().find((x) => x.id.toLowerCase() === key || x.slug.toLowerCase() === key)
    return p ? podRef(p) : undefined
  }
  if (collection === 'items') {
    if (vertical === 'fashion') {
      const item = allFashionItems().find(
        (x) => x.id.toLowerCase() === key || x.slug.toLowerCase() === key,
      )
      return item ? fashionRef(item) : undefined
    }
    if (vertical === 'figures') {
      const item = allFigureItems().find(
        (x) => x.id.toLowerCase() === key || x.slug.toLowerCase() === key,
      )
      return item ? merchRef('figures', item) : undefined
    }
    if (vertical === 'plush') {
      const item = allPlushItems().find(
        (x) => x.id.toLowerCase() === key || x.slug.toLowerCase() === key,
      )
      return item ? merchRef('plush', item) : undefined
    }
    if (vertical === 'modelkits') {
      const item = allModelkitItems().find(
        (x) => x.id.toLowerCase() === key || x.slug.toLowerCase() === key,
      )
      return item ? merchRef('modelkits', item) : undefined
    }
    return undefined
  }
  if (collection === 'cards') {
    if (vertical !== 'tcg') return undefined
    const card = getTcgCard(id)
    return card ? tcgCardRef(card) : undefined
  }
  if (collection === 'games') {
    if (vertical === 'tcg') {
      const game = getTcgGame(id)
      return game ? tcgGameRef(game) : undefined
    }
    if (vertical === 'boardgames') {
      const game = getBoardGame(id)
      return game ? boardGameRef(game) : undefined
    }
    return undefined
  }
  if (collection === 'albums') {
    if (vertical !== 'ost') return undefined
    const album = getOstAlbum(id)
    return album ? ostAlbumRef(album) : undefined
  }
  if (collection === 'consoles') {
    if (vertical !== 'consoles') return undefined
    const c = getConsole(id)
    return c ? consoleRef(c) : undefined
  }
  if (collection === 'titles') {
    if (vertical !== 'esports') return undefined
    const title = getEsportsTitle(id)
    return title ? esportsTitleRef(title) : undefined
  }
  if (collection === 'series') {
    const series = getSeries(vertical, id)
    return series ? seriesRef(vertical, series) : undefined
  }
  if (collection === 'characters') {
    const character = getCharacter(vertical, id)
    return character ? characterRef(vertical, character) : undefined
  }
  return undefined
}

function addRef(found: Map<string, SkuRef>, ref: SkuRef) {
  if (!found.has(ref.uri)) found.set(ref.uri, ref)
}

type SkuIndex = {
  exact: Map<string, SkuIndexEntry[]>
  alias: Map<string, SkuIndexEntry[]>
}

type SkuIndexEntry = {
  uri: string
  build: () => SkuRef
}

function indexEntry(
  vertical: LiveVertical,
  collection: SkuCollection,
  id: string,
  build: () => SkuRef,
): SkuIndexEntry {
  return { uri: skuUri(vertical, collection, id), build }
}

function addIndexed(
  map: Map<string, SkuIndexEntry[]>,
  value: string | null | undefined,
  entry: SkuIndexEntry,
) {
  if (value == null || value === '') return
  const key = value.toLowerCase()
  const refs = map.get(key)
  if (refs) {
    if (!refs.some((item) => item.uri === entry.uri)) refs.push(entry)
  } else {
    map.set(key, [entry])
  }
}

function addIndexedKeys(
  map: Map<string, SkuIndexEntry[]>,
  entry: SkuIndexEntry,
  values: Array<string | null | undefined>,
) {
  for (const value of values) addIndexed(map, value, entry)
}

function buildSkuIndex(): SkuIndex {
  const exact = new Map<string, SkuIndexEntry[]>()
  const alias = new Map<string, SkuIndexEntry[]>()
  const add = (
    entry: SkuIndexEntry,
    exactKeys: Array<string | null | undefined>,
    aliasKeys: Array<string | null | undefined>,
  ) => {
    addIndexedKeys(exact, entry, exactKeys)
    addIndexedKeys(alias, entry, aliasKeys)
  }

  for (const product of allProducts()) {
    const entry = indexEntry('pod', 'products', product.id, () => podRef(product))
    add(
      entry,
      [product.id, product.slug],
      [
        product.styleCode,
        product.brandId && product.styleCode ? product.brandId + '-' + product.styleCode : null,
        ...(product.listings ?? []).map((listing) => listing.sku),
      ],
    )
  }

  for (const item of allFashionItems()) {
    const entry = indexEntry('fashion', 'items', item.id, () => fashionRef(item))
    add(entry, [item.id, item.slug], [item.styleCode])
  }

  for (const [vertical, items] of [
    ['figures', allFigureItems()],
    ['plush', allPlushItems()],
    ['modelkits', allModelkitItems()],
  ] as const) {
    for (const item of items) {
      const entry = indexEntry(vertical, 'items', item.id, () => merchRef(vertical, item))
      add(entry, [item.id, item.slug], [item.productCode, item.jan])
    }
  }

  // TCG cards (400k+) are resolved through tcgCardMatches() instead of per-card
  // index entries; see issues/123-sku-test-heap-oom.md.

  for (const game of allTcgGames()) {
    const entry = indexEntry('tcg', 'games', game.id, () => tcgGameRef(game))
    add(entry, [game.id, game.slug], [])
  }

  for (const album of allOstAlbums()) {
    const entry = indexEntry('ost', 'albums', album.id, () => ostAlbumRef(album))
    add(entry, [album.id, album.slug], [])
  }
  const uniqueCatalog = commercialKeyUnique(allOstAlbums(), (album) => album.catalogNumber)
  for (const album of uniqueCatalog.values()) {
    addIndexed(
      alias,
      album.catalogNumber,
      indexEntry('ost', 'albums', album.id, () => ostAlbumRef(album)),
    )
  }

  const boardGames = allBoardGames()
  for (const game of boardGames) {
    const entry = indexEntry('boardgames', 'games', game.id, () => boardGameRef(game))
    add(entry, [game.id, game.slug, game.bggId != null ? 'bgg-' + game.bggId : null], [])
  }
  const uniqueBgg = commercialKeyUnique(boardGames, (game) =>
    game.bggId != null ? String(game.bggId) : null,
  )
  for (const game of uniqueBgg.values()) {
    const entry = indexEntry('boardgames', 'games', game.id, () => boardGameRef(game))
    addIndexed(alias, game.bggId != null ? String(game.bggId) : null, entry)
    addIndexed(alias, game.bggId != null ? 'bgg-' + game.bggId : null, entry)
  }

  for (const console of allConsoles()) {
    const entry = indexEntry('consoles', 'consoles', console.id, () => consoleRef(console))
    add(entry, [console.id, console.slug], [])
  }

  for (const title of allEsportsTitles()) {
    const entry = indexEntry('esports', 'titles', title.id, () => esportsTitleRef(title))
    add(entry, [title.id, title.slug], [])
  }

  return { exact, alias }
}

let skuIndexCache: SkuIndex | undefined

function skuIndex(): SkuIndex {
  if (!skuIndexCache) skuIndexCache = buildSkuIndex()
  return skuIndexCache
}

/** Cards whose canonical id equals the query (case-insensitive). */
function tcgExactIdMatches(query: string): TcgCard[] {
  const card = getTcgCard(query)
  return card && card.id.toLowerCase() === query.toLowerCase() ? [card] : []
}

function tcgAliasMatches(query: string): TcgCard[] {
  const out = tcgExactIdMatches(query)
  const hits = tcgCollectorAliasMatches(query)
  for (const card of hits) {
    if (!out.some((existing) => existing.id === card.id)) out.push(card)
  }
  return out
}

function indexedMatches(map: Map<string, SkuIndexEntry[]>, query: string): SkuIndexEntry[] {
  return map.get(query.toLowerCase()) ?? []
}

function collectExactIdSlugMatches(query: string): SkuRef[] {
  const found = new Map<string, SkuRef>()
  for (const entry of indexedMatches(skuIndex().exact, query)) addRef(found, entry.build())
  for (const card of tcgExactIdMatches(query)) addRef(found, tcgCardRef(card))
  return [...found.values()]
}

function collectAliasMatches(query: string): SkuRef[] {
  const found = new Map<string, SkuRef>()
  for (const entry of indexedMatches(skuIndex().alias, query)) addRef(found, entry.build())
  for (const card of tcgAliasMatches(query)) addRef(found, tcgCardRef(card))
  return [...found.values()]
}

export function resolveSku(raw: string): SkuResolveResult {
  const query = raw.trim()
  if (!query) {
    return { ok: false, error: 'NOT_FOUND', query }
  }

  const namespaced = parseNamespaced(query)
  if (namespaced) {
    const ref = resolveExact(namespaced.vertical, namespaced.collection, namespaced.id)
    if (ref) return { ok: true, unique: true, ref }
    return { ok: false, error: 'NOT_FOUND', query }
  }

  const exact = collectExactIdSlugMatches(query)
  if (exact.length === 1) return { ok: true, unique: true, ref: exact[0]! }
  if (exact.length > 1) {
    return {
      ok: true,
      unique: false,
      error: 'AMBIGUOUS',
      query,
      matches: exact.slice(0, AMBIGUOUS_CAP),
    }
  }

  const matches = collectAliasMatches(query)
  if (matches.length === 0) return { ok: false, error: 'NOT_FOUND', query }
  if (matches.length === 1) return { ok: true, unique: true, ref: matches[0]! }
  return {
    ok: true,
    unique: false,
    error: 'AMBIGUOUS',
    query,
    matches: matches.slice(0, AMBIGUOUS_CAP),
  }
}

/** Trim, drop empties, unique (preserve order), then `resolveSku` per key. Cap is HTTP-layer. */
export function resolveSkuMany(keys: string[]): SkuBatchItem[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const raw of keys) {
    const query = raw.trim()
    if (!query || seen.has(query)) continue
    seen.add(query)
    unique.push(query)
  }
  return unique.map((query) => {
    const result = resolveSku(query)
    return { ...result, query }
  })
}
