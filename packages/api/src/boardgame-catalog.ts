import type { Paginated } from './types.js'
import type {
  BoardGame,
  BoardGamePublisher,
  BoardGameStats,
} from './boardgame-types.js'
import { shopsForEntity } from './affiliates.js'
import { resolveMedia } from './media.js'
import { skuUri } from './sku-uri.js'

import gamesData from '../data/boardgames/games.json' with { type: 'json' }
import publishersData from '../data/boardgames/publishers.json' with {
  type: 'json',
}

const games = gamesData as unknown as BoardGame[]
const publishers = publishersData as unknown as BoardGamePublisher[]

function page<T>(items: T[], limit: number, offset: number): Paginated<T> {
  const lim = Math.min(Math.max(limit, 1), 100)
  const off = Math.max(offset, 0)
  return {
    items: items.slice(off, off + lim),
    total: items.length,
    limit: lim,
    offset: off,
  }
}

export function listBoardGamePublishers(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<BoardGamePublisher> {
  let rows = [...publishers]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.includes(q) ||
        p.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getBoardGamePublisher(
  idOrSlug: string,
): BoardGamePublisher | undefined {
  const key = idOrSlug.toLowerCase()
  return publishers.find((p) => p.id === key || p.slug === key)
}

export function listBoardGames(opts?: {
  q?: string
  publisher?: string
  category?: string
  mechanic?: string
  players?: number
  tag?: string
  limit?: number
  offset?: number
}): Paginated<BoardGame> {
  let rows = [...games]
  if (opts?.publisher) {
    const p = opts.publisher.toLowerCase()
    rows = rows.filter(
      (g) =>
        g.publisherIds.some((id) => id === p || id.includes(p)) ||
        (g.publisher || '').toLowerCase().includes(p),
    )
  }
  if (opts?.category) {
    const c = opts.category.toLowerCase()
    rows = rows.filter((g) =>
      g.categories.some((x) => x.toLowerCase() === c || x.toLowerCase().includes(c)),
    )
  }
  if (opts?.mechanic) {
    const m = opts.mechanic.toLowerCase()
    rows = rows.filter((g) =>
      g.mechanics.some((x) => x.toLowerCase().includes(m)),
    )
  }
  if (opts?.players != null && !Number.isNaN(opts.players)) {
    const n = opts.players
    rows = rows.filter(
      (g) =>
        (g.minPlayers == null || g.minPlayers <= n) &&
        (g.maxPlayers == null || g.maxPlayers >= n),
    )
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((g) => g.tags.some((x) => x.toLowerCase() === t))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((g) => {
      const hay =
        `${g.name} ${g.nameNative ?? ''} ${g.publisher ?? ''} ${g.designers.join(' ')} ${g.categories.join(' ')} ${g.mechanics.join(' ')} ${g.tags.join(' ')}`.toLowerCase()
      return (
        hay.includes(q) ||
        g.slug.includes(q) ||
        g.id.includes(q) ||
        String(g.bggId ?? '') === q
      )
    })
  }
  rows.sort((a, b) => {
    const ra = a.bggRank ?? 99999
    const rb = b.bggRank ?? 99999
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allBoardGames(): readonly BoardGame[] {
  return games
}

export function getBoardGame(idOrSlug: string): BoardGame | undefined {
  const key = idOrSlug.toLowerCase()
  return games.find(
    (g) =>
      g.id === key ||
      g.slug === key ||
      String(g.bggId) === key ||
      `bgg-${g.bggId}` === key,
  )
}

export function enrichBoardGame(g: BoardGame) {
  const pubs = g.publisherIds
    .map((id) => getBoardGamePublisher(id))
    .filter(Boolean)
  const media = resolveMedia({
    vertical: 'boardgames',
    collection: 'games',
    id: g.id,
    entityImageUrl: g.imageUrl || g.thumbnailUrl,
  })
  const game = {
    ...g,
    imageUrl: media.url ?? g.imageUrl ?? null,
    thumbnailUrl: g.thumbnailUrl ?? media.url ?? null,
  }
  const shops = shopsForEntity({ vertical: 'boardgames', query: g.name })

  return {
    game,
    media,
    sku: skuUri('boardgames', 'games', g.id),
    publishers: pubs,
    copy: {
      name: g.name,
      year: g.yearPublished != null ? String(g.yearPublished) : '',
      players:
        g.minPlayers != null && g.maxPlayers != null
          ? g.minPlayers === g.maxPlayers
            ? `${g.minPlayers}`
            : `${g.minPlayers}–${g.maxPlayers}`
          : '',
      playtime:
        g.minPlaytimeMin != null
          ? g.maxPlaytimeMin != null && g.maxPlaytimeMin !== g.minPlaytimeMin
            ? `${g.minPlaytimeMin}–${g.maxPlaytimeMin} min`
            : `${g.minPlaytimeMin} min`
          : '',
      weight: g.weight != null ? String(g.weight) : '',
      line: [
        g.name,
        g.yearPublished,
        g.minPlayers != null
          ? `${g.minPlayers}–${g.maxPlayers ?? g.minPlayers}p`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      categories: g.categories.join(', '),
      mechanics: g.mechanics.join(', '),
      tags: g.tags.join(' '),
    },
    links: {
      bgg: g.bggId
        ? `https://boardgamegeek.com/boardgame/${g.bggId}`
        : null,
      sources: g.sources,
      shop: shops,
    },
    affiliates: shops.map((x) => ({
      id: x.partnerId,
      name: x.name,
      affiliateUrl: x.isAffiliate ? x.shopUrl : null,
      website: x.website,
      isConfigured: x.isAffiliate,
    })),
  }
}

export function searchBoardGames(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'game' | 'publisher'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []

  for (const g of games) {
    const hay =
      `${g.name} ${g.designers.join(' ')} ${g.categories.join(' ')} ${g.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !g.slug.includes(query)) continue
    const score = g.name.toLowerCase().startsWith(query)
      ? 3
      : g.name.toLowerCase().includes(query)
        ? 2
        : 1
    hits.push({
      kind: 'game',
      id: g.id,
      title: g.name,
      subtitle: [
        g.yearPublished,
        g.minPlayers != null
          ? `${g.minPlayers}–${g.maxPlayers ?? g.minPlayers}p`
          : null,
        g.publisher,
      ]
        .filter(Boolean)
        .join(' · '),
      imageUrl: g.thumbnailUrl || g.imageUrl || null,
      score: score + (g.bggRank != null && g.bggRank <= 50 ? 0.5 : 0),
      sku: skuUri('boardgames', 'games', g.id),
    })
  }
  for (const p of publishers) {
    if (p.name.toLowerCase().includes(query) || p.slug.includes(query)) {
      hits.push({
        kind: 'publisher',
        id: p.id,
        title: p.name,
        subtitle: 'publisher',
        score: 1.2,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function boardGameStats(): BoardGameStats {
  const cats = new Set<string>()
  for (const g of games) for (const c of g.categories) cats.add(c)
  return {
    games: games.length,
    publishers: publishers.length,
    categories: cats.size,
  }
}
