/**
 * Dataset directory: first-party verticals + accepted third-party listings.
 * Listings live in SQLite — never auto-merged into catalog JSON.
 */
import { boardGameStats } from './boardgame-catalog.js'
import { stats } from './catalog.js'
import { consoleStats } from './console-catalog.js'
import { esportsStats } from './esports-catalog.js'
import { fashionStats } from './fashion-catalog.js'
import { figureStats } from './figure-catalog.js'
import { modelkitStats } from './modelkit-catalog.js'
import { ostStats } from './ost-catalog.js'
import { plushStats } from './plush-catalog.js'
import { podStats } from './pod-catalog.js'
import { getRuntimeDb, runtimeDbTransaction } from './runtime-db.js'
import { tcgStats } from './tcg-catalog.js'
import { safeExternalUrl } from './url-safety.js'
import { LIVE_VERTICALS, type LiveVertical, VERTICAL_META } from './verticals.js'

export type DatasetListing = {
  id: string
  slug: string
  title: string
  description: string
  verticals: string[]
  publisherWallet: string | null
  homepage?: string
  status: 'accepted'
  createdAt: string
  contributionId?: string
}

export type DatasetRecord = DatasetListing & {
  kind: 'first-party' | 'third-party'
  publisher: string
}

const MAX_TITLE = 200
const MAX_DESCRIPTION = 2000
const MAX_HOMEPAGE = 2048
const MAX_SLUG = 80
const MAX_VERTICALS = 16

let mutex: Promise<void> = Promise.resolve()

function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn)
  mutex = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function parseListing(raw: string): DatasetListing {
  return JSON.parse(raw) as DatasetListing
}

function listListings(): DatasetListing[] {
  const rows = getRuntimeDb().prepare('SELECT json FROM datasets').all() as Array<{ json: string }>
  return rows.map((row) => parseListing(row.json))
}

export function datasetExportCost(): number {
  const n = Number(process.env.DATASET_EXPORT_COST ?? 25)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 25
}

export function publisherExportShare(cost: number): number {
  return Math.floor(cost * 0.8)
}

export function slugifyDatasetTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
  return slug || 'dataset'
}

function firstPartyDatasets(): DatasetRecord[] {
  return LIVE_VERTICALS.map((id) => ({
    id: `vertical:${id}`,
    slug: id,
    title: VERTICAL_META[id].title,
    description: VERTICAL_META[id].blurb,
    verticals: [id],
    publisherWallet: null,
    status: 'accepted' as const,
    createdAt: '',
    kind: 'first-party' as const,
    publisher: 'metadata',
  }))
}

function asRecord(item: DatasetListing): DatasetRecord {
  return {
    ...item,
    kind: 'third-party',
    publisher: item.publisherWallet ?? 'third-party',
  }
}

export async function listDatasets(): Promise<DatasetRecord[]> {
  return withLock(() => {
    const first = firstPartyDatasets()
    const firstIds = new Set(first.map((d) => d.id))
    const extras = listListings()
      .filter((item) => item.status === 'accepted' && !firstIds.has(item.id))
      .map(asRecord)
    return [...first, ...extras]
  })
}

export async function getDataset(id: string): Promise<DatasetRecord | null> {
  const items = await listDatasets()
  return items.find((item) => item.id === id) ?? null
}

export async function upsertAcceptedDataset(listing: DatasetListing): Promise<{ added: boolean }> {
  return withLock(() =>
    runtimeDbTransaction(() => {
      const exists = listListings().some(
        (item) =>
          item.id === listing.id ||
          (listing.contributionId && item.contributionId === listing.contributionId),
      )
      if (exists) return { added: false }
      getRuntimeDb()
        .prepare('INSERT OR REPLACE INTO datasets(id, json) VALUES (?, ?)')
        .run(listing.id, JSON.stringify({ ...listing, status: 'accepted' }))
      return { added: true }
    }),
  )
}

/** Internal test/maintenance hook; production code does not call this. */
export function deleteDatasetListing(id: string) {
  getRuntimeDb().prepare('DELETE FROM datasets WHERE id = ?').run(id)
}

export function listingFromContribution(row: {
  id: string
  vertical: string
  payload: Record<string, unknown>
  wallet: string | null
}): DatasetListing | null {
  const titleRaw = row.payload.title
  if (typeof titleRaw !== 'string') return null
  const title = titleRaw.trim()
  if (!title || title.length > MAX_TITLE) return null

  const slugRaw = row.payload.slug
  const slug =
    typeof slugRaw === 'string' && /^[a-z0-9-]{1,80}$/.test(slugRaw.trim().toLowerCase())
      ? slugRaw.trim().toLowerCase().slice(0, MAX_SLUG)
      : slugifyDatasetTitle(title)

  const descriptionRaw = row.payload.description
  const description =
    typeof descriptionRaw === 'string' ? descriptionRaw.trim().slice(0, MAX_DESCRIPTION) : ''

  let verticals: string[] = []
  if (Array.isArray(row.payload.verticals)) {
    for (const v of row.payload.verticals) {
      if (typeof v !== 'string') continue
      const id = v.toLowerCase().trim().slice(0, 64)
      if (id) verticals.push(id)
      if (verticals.length >= MAX_VERTICALS) break
    }
  }
  if (verticals.length === 0 && row.vertical) verticals = [row.vertical]

  const homepageRaw = row.payload.homepage
  const homepage = safeExternalUrl(
    typeof homepageRaw === 'string' ? homepageRaw.trim().slice(0, MAX_HOMEPAGE) : homepageRaw,
  )

  const listing: DatasetListing = {
    id: `dataset:${row.id}`,
    slug,
    title,
    description,
    verticals,
    publisherWallet: row.wallet,
    status: 'accepted',
    createdAt: new Date().toISOString(),
    contributionId: row.id,
  }
  if (homepage) listing.homepage = homepage
  return listing
}

const MEDIA_VERTICALS = new Set(['anime', 'game', 'manga', 'lightnovels', 'cartoons', 'comics'])

export function identityCountsForVertical(vertical: string): object {
  if (MEDIA_VERTICALS.has(vertical)) {
    return stats(vertical as LiveVertical)
  }
  switch (vertical) {
    case 'pod':
      return podStats()
    case 'tcg':
      return tcgStats()
    case 'figures':
      return figureStats()
    case 'plush':
      return plushStats()
    case 'modelkits':
      return modelkitStats()
    case 'fashion':
      return fashionStats()
    case 'boardgames':
      return boardGameStats()
    case 'ost':
      return ostStats()
    case 'consoles':
      return consoleStats()
    case 'esports':
      return esportsStats()
    default:
      return {}
  }
}

export function datasetIdentity(dataset: DatasetRecord): {
  vertical: string | null
  counts: object
} {
  const vertical = dataset.verticals[0] ?? null
  return {
    vertical,
    counts: vertical ? identityCountsForVertical(vertical) : {},
  }
}
