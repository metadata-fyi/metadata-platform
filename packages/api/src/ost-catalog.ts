import type { Paginated } from './types.js'
import type { OstAlbum, OstArtist, OstStats } from './ost-types.js'
import { shopsForEntity } from './affiliates.js'
import { resolveMedia } from './media.js'
import { skuUri } from './sku-uri.js'

import albumsData from '../data/ost/albums.json' with { type: 'json' }
import artistsData from '../data/ost/artists.json' with { type: 'json' }

const albums = albumsData as unknown as OstAlbum[]
const artists = artistsData as unknown as OstArtist[]

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

export function listOstArtists(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<OstArtist> {
  let rows = [...artists]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.includes(q) ||
        (a.nameNative || '').includes(q) ||
        a.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getOstArtist(idOrSlug: string): OstArtist | undefined {
  const key = idOrSlug.toLowerCase()
  return artists.find((a) => a.id === key || a.slug === key)
}

export function listOstAlbums(opts?: {
  q?: string
  media?: string
  series?: string
  type?: string
  artist?: string
  tag?: string
  limit?: number
  offset?: number
}): Paginated<OstAlbum> {
  let rows = [...albums]
  if (opts?.media) {
    const m = opts.media.toLowerCase()
    rows = rows.filter((a) => a.mediaVertical === m)
  }
  if (opts?.series) {
    const s = opts.series.toLowerCase()
    rows = rows.filter(
      (a) =>
        a.seriesSlug?.toLowerCase() === s ||
        (a.seriesTitle || '').toLowerCase().includes(s),
    )
  }
  if (opts?.type) {
    const t = opts.type.toLowerCase()
    rows = rows.filter((a) => a.type === t)
  }
  if (opts?.artist) {
    const ar = opts.artist.toLowerCase()
    rows = rows.filter(
      (a) =>
        a.artistIds.some((id) => id === ar || id.includes(ar)) ||
        a.artists.some((n) => n.toLowerCase().includes(ar)),
    )
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((a) => a.tags.some((x) => x.toLowerCase() === t))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((a) => {
      const hay =
        `${a.title} ${a.aliases.join(' ')} ${a.seriesTitle ?? ''} ${a.catalogNumber ?? ''} ${a.label ?? ''} ${a.artists.join(' ')} ${a.tags.join(' ')}`.toLowerCase()
      return hay.includes(q) || a.slug.includes(q) || a.id.includes(q)
    })
  }
  rows.sort(
    (a, b) =>
      (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title),
  )
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allOstAlbums(): readonly OstAlbum[] {
  return albums
}

export function getOstAlbum(idOrSlug: string): OstAlbum | undefined {
  const key = idOrSlug.toLowerCase()
  return albums.find((a) => a.id === key || a.slug === key)
}

export function albumsForSeries(seriesSlug: string): OstAlbum[] {
  const s = seriesSlug.toLowerCase()
  return albums.filter((a) => a.seriesSlug?.toLowerCase() === s)
}

export function enrichOstAlbum(album: OstAlbum) {
  const artistRows = album.artistIds
    .map((id) => getOstArtist(id))
    .filter(Boolean)
  const media = resolveMedia({
    vertical: 'ost',
    collection: 'albums',
    id: album.id,
    entityImageUrl: album.imageUrl,
  })
  const albumOut = { ...album, imageUrl: media.url ?? album.imageUrl ?? null }
  const shops = shopsForEntity({
    vertical: 'ost',
    query: [album.title, album.seriesTitle, album.catalogNumber]
      .filter(Boolean)
      .join(' '),
  })
  return {
    album: albumOut,
    media,
    sku: skuUri('ost', 'albums', album.id),
    artists: artistRows,
    copy: {
      title: album.title,
      series: album.seriesTitle ?? '',
      catalog: album.catalogNumber ?? '',
      line: [album.title, album.seriesTitle, album.year, album.type]
        .filter(Boolean)
        .join(' · '),
      artists: album.artists.join(', '),
      tags: album.tags.join(' '),
    },
    links: {
      sources: album.sources,
      shop: shops,
      series:
        album.seriesSlug && album.mediaVertical
          ? {
              vertical: album.mediaVertical,
              slug: album.seriesSlug,
            }
          : null,
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

export function searchOst(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'album' | 'artist'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []

  for (const a of albums) {
    const hay =
      `${a.title} ${a.aliases.join(' ')} ${a.seriesTitle ?? ''} ${a.artists.join(' ')} ${a.catalogNumber ?? ''}`.toLowerCase()
    if (!hay.includes(query) && !a.slug.includes(query)) continue
    const score = a.title.toLowerCase().startsWith(query)
      ? 3
      : a.title.toLowerCase().includes(query)
        ? 2
        : (a.seriesTitle || '').toLowerCase().includes(query)
          ? 1.8
          : 1
    hits.push({
      kind: 'album',
      id: a.id,
      title: a.title,
      subtitle: [a.seriesTitle, a.mediaVertical, a.type, a.year]
        .filter(Boolean)
        .join(' · '),
      imageUrl: a.imageUrl ?? null,
      score,
      sku: skuUri('ost', 'albums', a.id),
    })
  }
  for (const ar of artists) {
    if (
      ar.name.toLowerCase().includes(query) ||
      ar.slug.includes(query) ||
      (ar.nameNative || '').includes(query)
    ) {
      hits.push({
        kind: 'artist',
        id: ar.id,
        title: ar.name,
        subtitle: ar.role || 'artist',
        score: 1.5,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function ostStats(): OstStats {
  const byMedia: Record<string, number> = {}
  for (const a of albums) {
    byMedia[a.mediaVertical] = (byMedia[a.mediaVertical] ?? 0) + 1
  }
  return {
    albums: albums.length,
    artists: artists.length,
    byMedia,
  }
}
