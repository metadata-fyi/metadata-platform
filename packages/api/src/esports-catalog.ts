import type { Paginated } from './types.js'
import type {
  EsportsLeague,
  EsportsPlayer,
  EsportsStats,
  EsportsTeam,
  EsportsTitle,
} from './esports-types.js'
import { skuUri } from './sku-uri.js'

import titlesData from '../data/esports/titles.json' with { type: 'json' }
import leaguesData from '../data/esports/leagues.json' with { type: 'json' }
import teamsData from '../data/esports/teams.json' with { type: 'json' }
import playersData from '../data/esports/players.json' with { type: 'json' }

const titles = titlesData as unknown as EsportsTitle[]
const leagues = leaguesData as unknown as EsportsLeague[]
const teams = teamsData as unknown as EsportsTeam[]
const players = playersData as unknown as EsportsPlayer[]

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

export function listEsportsTitles(opts?: {
  q?: string
  tag?: string
  limit?: number
  offset?: number
}): Paginated<EsportsTitle> {
  let rows = [...titles]
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((x) => x.tags.some((y) => y.toLowerCase() === t))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((x) => {
      const hay =
        `${x.name} ${x.aliases.join(' ')} ${x.genre ?? ''} ${x.publisher ?? ''} ${x.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || x.slug.includes(q)
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allEsportsTitles(): readonly EsportsTitle[] {
  return titles
}

export function getEsportsTitle(idOrSlug: string): EsportsTitle | undefined {
  const key = idOrSlug.toLowerCase()
  return titles.find((t) => t.id === key || t.slug === key)
}

/** Exact `gameSeriesSlug` match only. */
export function titlesForGameSeriesSlug(slug: string): EsportsTitle[] {
  const s = slug.trim().toLowerCase()
  if (!s) return []
  return titles.filter((t) => (t.gameSeriesSlug || '').toLowerCase() === s)
}

export function listEsportsLeagues(opts?: {
  q?: string
  title?: string
  region?: string
  limit?: number
  offset?: number
}): Paginated<EsportsLeague> {
  let rows = [...leagues]
  if (opts?.title) {
    const t = opts.title.toLowerCase()
    rows = rows.filter((l) => l.titleId === t || l.titleId.includes(t))
  }
  if (opts?.region) {
    const r = opts.region.toLowerCase()
    rows = rows.filter((l) => (l.region || '').toLowerCase().includes(r))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.shortName || '').toLowerCase().includes(q) ||
        l.slug.includes(q),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getEsportsLeague(idOrSlug: string): EsportsLeague | undefined {
  const key = idOrSlug.toLowerCase()
  return leagues.find((l) => l.id === key || l.slug === key)
}

export function listEsportsTeams(opts?: {
  q?: string
  title?: string
  region?: string
  limit?: number
  offset?: number
}): Paginated<EsportsTeam> {
  let rows = [...teams]
  if (opts?.title) {
    const t = opts.title.toLowerCase()
    rows = rows.filter((x) => x.titleIds.some((id) => id === t || id.includes(t)))
  }
  if (opts?.region) {
    const r = opts.region.toLowerCase()
    rows = rows.filter((x) => (x.region || '').toLowerCase().includes(r))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (x) =>
        x.name.toLowerCase().includes(q) ||
        (x.shortName || '').toLowerCase().includes(q) ||
        x.slug.includes(q),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getEsportsTeam(idOrSlug: string): EsportsTeam | undefined {
  const key = idOrSlug.toLowerCase()
  return teams.find((t) => t.id === key || t.slug === key)
}

export function listEsportsPlayers(opts?: {
  q?: string
  title?: string
  team?: string
  limit?: number
  offset?: number
}): Paginated<EsportsPlayer> {
  let rows = [...players]
  if (opts?.title) {
    const t = opts.title.toLowerCase()
    rows = rows.filter((p) => p.titleIds.some((id) => id === t || id.includes(t)))
  }
  if (opts?.team) {
    const t = opts.team.toLowerCase()
    rows = rows.filter((p) => p.teamId === t || (p.teamId || '').includes(t))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((p) => {
      const hay =
        `${p.handle} ${p.nameReal ?? ''} ${p.role ?? ''} ${p.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || p.slug.includes(q)
    })
  }
  rows.sort((a, b) => a.handle.localeCompare(b.handle))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getEsportsPlayer(idOrSlug: string): EsportsPlayer | undefined {
  const key = idOrSlug.toLowerCase()
  return players.find(
    (p) => p.id === key || p.slug === key || p.handle.toLowerCase() === key,
  )
}

export function enrichEsportsTitle(t: EsportsTitle) {
  const titleLeagues = leagues.filter((l) => l.titleId === t.id)
  const titleTeams = teams.filter((x) => x.titleIds.includes(t.id))
  return {
    title: t,
    sku: skuUri('esports', 'titles', t.id),
    leagues: titleLeagues.slice(0, 40),
    teams: titleTeams.slice(0, 40),
    copy: {
      name: t.name,
      line: [t.name, t.genre, t.publisher].filter(Boolean).join(' · '),
      tags: t.tags.join(' '),
    },
    links: { sources: t.sources, website: t.website ?? null },
  }
}

export function searchEsports(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'title' | 'league' | 'team' | 'player'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []
  for (const t of titles) {
    if (
      `${t.name} ${t.aliases.join(' ')}`.toLowerCase().includes(query) ||
      t.slug.includes(query)
    ) {
      hits.push({
        kind: 'title',
        id: t.id,
        title: t.name,
        subtitle: t.genre || 'title',
        score: t.name.toLowerCase().startsWith(query) ? 3 : 2,
        sku: skuUri('esports', 'titles', t.id),
      })
    }
  }
  for (const l of leagues) {
    if (l.name.toLowerCase().includes(query) || l.slug.includes(query)) {
      hits.push({
        kind: 'league',
        id: l.id,
        title: l.name,
        subtitle: l.region || 'league',
        score: 1.5,
      })
    }
  }
  for (const t of teams) {
    if (t.name.toLowerCase().includes(query) || t.slug.includes(query)) {
      hits.push({
        kind: 'team',
        id: t.id,
        title: t.name,
        subtitle: 'team',
        score: 1.4,
      })
    }
  }
  for (const p of players) {
    if (
      p.handle.toLowerCase().includes(query) ||
      (p.nameReal || '').toLowerCase().includes(query)
    ) {
      hits.push({
        kind: 'player',
        id: p.id,
        title: p.handle,
        subtitle: p.role || 'player',
        score: 1.6,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function esportsStats(): EsportsStats {
  return {
    titles: titles.length,
    leagues: leagues.length,
    teams: teams.length,
    players: players.length,
  }
}
