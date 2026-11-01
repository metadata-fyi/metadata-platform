/**
 * Catalog media resolution: Arweave → optimized CDN → entity field → optional placeholder.
 * See docs/MEDIA.md
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type MediaStatus = 'placeholder' | 'source' | 'optimized' | 'arweave'

export type MediaEntry = {
  key: string
  status: MediaStatus
  sourceUrl?: string | null
  localSource?: string | null
  optimized?: {
    webp?: string | null
    jpeg?: string | null
    width?: number
    height?: number
    bytes?: number
  } | null
  arweave?: {
    txId?: string | null
    gatewayUrl?: string | null
  } | null
  credit?: string | null
  updatedAt?: string
}

type ManifestFile = {
  version: number
  updatedAt?: string
  note?: string
  entries: Record<string, MediaEntry>
}

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultManifestPath = path.join(here, '../data/media/manifest.json')

let cache: ManifestFile | null = null
let cacheMtime = 0

function loadManifest(): ManifestFile {
  const p = process.env.MEDIA_MANIFEST_PATH || defaultManifestPath
  try {
    const st = fs.statSync(p)
    if (cache && st.mtimeMs === cacheMtime) return cache
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as ManifestFile
    cache = {
      version: raw.version ?? 1,
      updatedAt: raw.updatedAt,
      note: raw.note,
      entries: raw.entries ?? {},
    }
    cacheMtime = st.mtimeMs
    return cache
  } catch {
    cache = { version: 1, entries: {} }
    cacheMtime = 0
    return cache
  }
}

export function mediaKey(
  vertical: string,
  collection: string,
  id: string,
): string {
  return `${vertical}/${collection}/${id}`.toLowerCase()
}

export function getMediaEntry(key: string): MediaEntry | null {
  const m = loadManifest()
  return m.entries[key] ?? m.entries[key.toLowerCase()] ?? null
}

function publicBase(): string {
  return (process.env.MEDIA_PUBLIC_BASE || '/media').replace(/\/$/, '')
}

function arweaveGateway(): string {
  return (process.env.ARWEAVE_GATEWAY || 'https://arweave.net').replace(
    /\/$/,
    '',
  )
}

function joinPublic(rel: string | null | undefined): string | null {
  if (!rel) return null
  if (/^https?:\/\//i.test(rel)) return rel
  const base = publicBase()
  const clean = rel.replace(/^\//, '')
  // optimized/foo.webp served at /media/optimized/foo.webp or CDN
  return `${base}/${clean}`
}

export type ResolvedMedia = {
  url: string | null
  status: MediaStatus | 'entity' | 'none'
  key: string | null
  credit: string | null
  /** Prefer webp when both exist */
  variants?: { webp?: string | null; jpeg?: string | null }
}

/**
 * Resolve best image URL for a catalog entity.
 * @param entityImageUrl imageUrl/coverUrl already on the entity JSON
 */
export function resolveMedia(opts: {
  vertical: string
  collection: string
  id: string
  entityImageUrl?: string | null
}): ResolvedMedia {
  const key = mediaKey(opts.vertical, opts.collection, opts.id)
  const entry = getMediaEntry(key)

  if (entry?.arweave?.txId) {
    const url =
      entry.arweave.gatewayUrl ||
      `${arweaveGateway()}/${entry.arweave.txId}`
    return {
      url,
      status: 'arweave',
      key,
      credit: entry.credit ?? null,
    }
  }

  if (entry?.optimized?.webp || entry?.optimized?.jpeg) {
    const webp = joinPublic(entry.optimized.webp ?? undefined)
    const jpeg = joinPublic(entry.optimized.jpeg ?? undefined)
    return {
      url: webp || jpeg,
      status: 'optimized',
      key,
      credit: entry.credit ?? null,
      variants: { webp, jpeg },
    }
  }

  if (entry?.sourceUrl) {
    return {
      url: entry.sourceUrl,
      status: 'source',
      key,
      credit: entry.credit ?? null,
    }
  }

  if (opts.entityImageUrl) {
    return {
      url: opts.entityImageUrl,
      status: 'entity',
      key,
      credit: null,
    }
  }

  if (process.env.MEDIA_PLACEHOLDER === '1') {
    const label = encodeURIComponent(opts.id.slice(0, 28))
    return {
      url: `https://placehold.co/480x480/141416/c8c8c8/png?text=${label}`,
      status: 'placeholder',
      key,
      credit: null,
    }
  }

  return { url: null, status: 'none', key, credit: null }
}

/** Apply resolved media onto a plain imageUrl field (non-destructive copy). */
export function withResolvedImageUrl<T extends { id: string; imageUrl?: string | null }>(
  vertical: string,
  collection: string,
  entity: T,
): T & { imageUrl: string | null; media?: ResolvedMedia } {
  const media = resolveMedia({
    vertical,
    collection,
    id: entity.id,
    entityImageUrl: entity.imageUrl,
  })
  return {
    ...entity,
    imageUrl: media.url,
    media,
  }
}
