import type { Paginated } from './types.js'
import type {
  ConsoleManufacturer,
  ConsoleStats,
  GameConsole,
} from './console-types.js'
import { partnerShopUrl } from './affiliates.js'
import { skuUri } from './sku-uri.js'

import consolesData from '../data/consoles/consoles.json' with { type: 'json' }
import manufacturersData from '../data/consoles/manufacturers.json' with {
  type: 'json',
}

const consoles = consolesData as unknown as GameConsole[]
const manufacturers = manufacturersData as unknown as ConsoleManufacturer[]

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

export function listConsoleManufacturers(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<ConsoleManufacturer> {
  let rows = [...manufacturers]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.slug.includes(q) ||
        m.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getConsoleManufacturer(
  idOrSlug: string,
): ConsoleManufacturer | undefined {
  const key = idOrSlug.toLowerCase()
  return manufacturers.find((m) => m.id === key || m.slug === key)
}

export function listConsoles(opts?: {
  q?: string
  manufacturer?: string
  formFactor?: string
  generation?: number
  tag?: string
  limit?: number
  offset?: number
}): Paginated<GameConsole> {
  let rows = [...consoles]
  if (opts?.manufacturer) {
    const m = opts.manufacturer.toLowerCase()
    rows = rows.filter(
      (c) =>
        c.manufacturerId === m ||
        (c.manufacturer || '').toLowerCase().includes(m),
    )
  }
  if (opts?.formFactor) {
    const f = opts.formFactor.toLowerCase()
    rows = rows.filter((c) => c.formFactor === f)
  }
  if (opts?.generation != null && !Number.isNaN(opts.generation)) {
    rows = rows.filter((c) => c.generation === opts.generation)
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((c) => c.tags.some((x) => x.toLowerCase() === t))
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((c) => {
      const hay =
        `${c.name} ${c.aliases.join(' ')} ${c.manufacturer ?? ''} ${c.formFactor} ${c.tags.join(' ')} ${c.cpu ?? ''}`.toLowerCase()
      return hay.includes(q) || c.slug.includes(q) || c.id.includes(q)
    })
  }
  rows.sort(
    (a, b) =>
      (a.generation ?? 99) - (b.generation ?? 99) ||
      a.name.localeCompare(b.name),
  )
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allConsoles(): readonly GameConsole[] {
  return consoles
}

export function getConsole(idOrSlug: string): GameConsole | undefined {
  const key = idOrSlug.toLowerCase()
  return consoles.find((c) => c.id === key || c.slug === key)
}

export function enrichConsole(c: GameConsole) {
  const manufacturer = getConsoleManufacturer(c.manufacturerId) ?? null
  const shop = (c.shopPartnerIds ?? ['amazon-associates'])
    .map((id) => partnerShopUrl(id, { query: c.name }))
    .filter(Boolean)
  return {
    console: c,
    sku: skuUri('consoles', 'consoles', c.id),
    manufacturer,
    copy: {
      name: c.name,
      line: [c.name, c.manufacturer, c.formFactor, c.generation != null ? `gen ${c.generation}` : null]
        .filter(Boolean)
        .join(' · '),
      tags: c.tags.join(' '),
    },
    links: {
      sources: c.sources,
      manufacturer: manufacturer?.website ?? null,
      shop,
    },
  }
}

export function searchConsoles(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'console' | 'manufacturer'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []
  for (const c of consoles) {
    const hay =
      `${c.name} ${c.aliases.join(' ')} ${c.manufacturer ?? ''} ${c.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query) && !c.slug.includes(query)) continue
    hits.push({
      kind: 'console',
      id: c.id,
      title: c.name,
      subtitle: [c.manufacturer, c.formFactor, c.generation != null ? `gen ${c.generation}` : null]
        .filter(Boolean)
        .join(' · '),
      imageUrl: c.imageUrl ?? null,
      score: c.name.toLowerCase().startsWith(query) ? 3 : 1,
      sku: skuUri('consoles', 'consoles', c.id),
    })
  }
  for (const m of manufacturers) {
    if (m.name.toLowerCase().includes(query) || m.slug.includes(query)) {
      hits.push({
        kind: 'manufacturer',
        id: m.id,
        title: m.name,
        subtitle: 'manufacturer',
        score: 1.4,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function consoleStats(): ConsoleStats {
  const byFormFactor: Record<string, number> = {}
  for (const c of consoles) {
    byFormFactor[c.formFactor] = (byFormFactor[c.formFactor] ?? 0) + 1
  }
  return {
    consoles: consoles.length,
    manufacturers: manufacturers.length,
    byFormFactor,
  }
}
