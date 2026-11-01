/**
 * Runtime market quotes in SQLite (DATA_DIR/runtime.sqlite).
 * Catalog identity stays in git. JSON market.json is imported once if present.
 * Optional JSON snapshots under DATA_DIR/market/snapshots/ are operator copies.
 */
import fs from 'node:fs'
import path from 'node:path'
import { lineageFromSource } from './market-sources.js'
import type { MarketItem, MarketSale, MarketSet, MarketStoredQuote } from './market-types.js'
import { closeRuntimeDb, getRuntimeDb } from './runtime-db.js'

type QuoteRow = MarketStoredQuote

const STALE_MS = 24 * 60 * 60 * 1000
const SNAPSHOT_KEEP = 8

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T
}

function dataDir() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
}

function snapshotDir() {
  return path.join(dataDir(), 'market', 'snapshots')
}

function currentPointerPath() {
  return path.join(dataDir(), 'market', 'current')
}

function writeAtomic(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, body)
  fs.renameSync(tmp, file)
}

function pruneSnapshots() {
  const dir = snapshotDir()
  if (!fs.existsSync(dir)) return
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
  const extra = names.slice(0, Math.max(0, names.length - SNAPSHOT_KEEP))
  for (const name of extra) fs.unlinkSync(path.join(dir, name))
}

function writeSnapshotFromDatabase() {
  const database = getRuntimeDb()
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(snapshotDir(), `${id}.json`)
  const temporary = `${file}.${process.pid}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const descriptor = fs.openSync(temporary, 'w', 0o600)
  let closed = false
  const write = (value: string) => fs.writeFileSync(descriptor, value)
  const rows = <T extends { json: string }>(sql: string) =>
    database.prepare(sql).iterate() as Iterable<T>
  const transaction = database.transaction(() => {
    write('{"version":1,"items":{')
    let first = true
    for (const row of rows<{ id: string; json: string }>('SELECT id, json FROM market_items ORDER BY id')) {
      write(`${first ? '' : ','}${JSON.stringify(row.id)}:${JSON.stringify(parseJson<MarketItem>(row.json))}`)
      first = false
    }
    write('},"sets":{')
    first = true
    for (const row of rows<{ id: string; json: string }>('SELECT id, json FROM market_sets ORDER BY id')) {
      write(`${first ? '' : ','}${JSON.stringify(row.id)}:${JSON.stringify(parseJson<MarketSet>(row.json))}`)
      first = false
    }
    write('},"quotes":[')
    first = true
    for (const row of rows<{ json: string }>('SELECT json FROM market_quotes ORDER BY rowid')) {
      write(`${first ? '' : ','}${JSON.stringify(parseJson<QuoteRow>(row.json))}`)
      first = false
    }
    write('],"sales":[')
    first = true
    for (const row of rows<{ json: string }>('SELECT json FROM market_sales ORDER BY rowid')) {
      write(`${first ? '' : ','}${JSON.stringify(parseJson<MarketSale>(row.json))}`)
      first = false
    }
    write(']}\n')
  }).deferred
  try {
    transaction()
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    closed = true
    fs.renameSync(temporary, file)
  } catch (error) {
    if (!closed) fs.closeSync(descriptor)
    fs.rmSync(temporary, { force: true })
    throw error
  }
  writeAtomic(currentPointerPath(), `${id}\n`)
  pruneSnapshots()
}

export function flushMarketStore(opts?: { snapshot?: boolean }) {
  if (opts?.snapshot) writeSnapshotFromDatabase()
}

export async function withMarketTransaction<T>(
  fn: () => T | Promise<T>,
  opts?: { snapshot?: boolean },
): Promise<T> {
  const result = await fn()
  if (opts?.snapshot ?? true) flushMarketStore({ snapshot: true })
  return result
}

export function resetMarketStore() {
  const database = getRuntimeDb()
  database.exec(
    'DELETE FROM market_items; DELETE FROM market_sets; DELETE FROM market_quotes; DELETE FROM market_sales;',
  )
}

export function closeMarketStore() {
  closeRuntimeDb()
}

export function listMarketSets(game?: string): MarketSet[] {
  const rows = getRuntimeDb().prepare('SELECT json FROM market_sets').all() as Array<{
    json: string
  }>
  const sets = rows.map((row) => parseJson<MarketSet>(row.json))
  return game ? sets.filter((set) => set.game === game) : sets
}

export function upsertMarketSet(set: MarketSet) {
  getRuntimeDb()
    .prepare('INSERT OR REPLACE INTO market_sets(id, json) VALUES (?, ?)')
    .run(set.id, JSON.stringify(set))
}

export function getMarketItem(id: string): MarketItem | undefined {
  const row = getRuntimeDb().prepare('SELECT json FROM market_items WHERE id = ?').get(id) as
    | { json: string }
    | undefined
  return row ? parseJson<MarketItem>(row.json) : undefined
}

export function getMarketItemByUrl(url: string): MarketItem | undefined {
  const row = getRuntimeDb()
    .prepare('SELECT json FROM market_items WHERE source_url = ?')
    .get(url) as { json: string } | undefined
  return row ? parseJson<MarketItem>(row.json) : undefined
}

export function getMarketItemByCatalog(vertical: string, id: string): MarketItem | undefined {
  const row = getRuntimeDb()
    .prepare('SELECT json FROM market_items WHERE catalog_vertical = ? AND catalog_id = ?')
    .get(vertical, id) as { json: string } | undefined
  return row ? parseJson<MarketItem>(row.json) : undefined
}

export function listMarketItems(opts?: { kind?: string; game?: string; q?: string }): MarketItem[] {
  const rows = opts?.kind
    ? (getRuntimeDb()
        .prepare('SELECT json FROM market_items WHERE kind = ?')
        .all(opts.kind) as Array<{ json: string }>)
    : (getRuntimeDb().prepare('SELECT json FROM market_items').all() as Array<{ json: string }>)
  let items = rows.map((row) => parseJson<MarketItem>(row.json))
  if (opts?.game) {
    const game = opts.game.toLowerCase()
    items = items.filter(
      (item) =>
        item.attrs.game === game ||
        item.attrs.gameId === game ||
        item.catalog?.id.toLowerCase().includes(game),
    )
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    items = items.filter((item) => {
      const hay =
        `${item.title} ${item.id} ${item.source.url} ${Object.values(item.attrs).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }
  return items.sort((a, b) => a.title.localeCompare(b.title))
}

/** Stable, bounded ID-order traversal for operator exports. */
export function listMarketItemsPage(opts?: {
  kind?: string
  afterId?: string
  limit?: number
}): { items: MarketItem[]; limit: number; hasMore: boolean; nextAfterId: string | null } {
  const limit = Math.min(Math.max(Math.floor(opts?.limit ?? 100), 1), 200)
  const database = getRuntimeDb()
  const query = opts?.kind
    ? opts.afterId
      ? database.prepare('SELECT id, json FROM market_items WHERE kind = ? AND id > ? ORDER BY id LIMIT ?')
      : database.prepare('SELECT id, json FROM market_items WHERE kind = ? ORDER BY id LIMIT ?')
    : opts?.afterId
      ? database.prepare('SELECT id, json FROM market_items WHERE id > ? ORDER BY id LIMIT ?')
      : database.prepare('SELECT id, json FROM market_items ORDER BY id LIMIT ?')
  const bindings = opts?.kind
    ? opts.afterId
      ? [opts.kind, opts.afterId, limit + 1]
      : [opts.kind, limit + 1]
    : opts?.afterId
      ? [opts.afterId, limit + 1]
      : [limit + 1]
  const selected = query.all(...bindings) as Array<{ id: string; json: string }>
  const hasMore = selected.length > limit
  const pageRows = selected.slice(0, limit)
  return {
    items: pageRows.map((row) => parseJson<MarketItem>(row.json)),
    limit,
    hasMore,
    nextAfterId: hasMore ? pageRows.at(-1)?.id ?? null : null,
  }
}

export function upsertMarketItem(item: MarketItem) {
  getRuntimeDb()
    .prepare(
      'INSERT OR REPLACE INTO market_items(id, json, source_url, catalog_vertical, catalog_id, kind, scrape_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      item.id,
      JSON.stringify(item),
      item.source.url,
      item.catalog?.vertical ?? null,
      item.catalog?.id ?? null,
      item.kind,
      item.scrapeStatus,
    )
}

export function upsertQuotes(
  itemId: string,
  quotes: Array<{
    variant: string
    label: string
    source: QuoteRow['source']
    url: string
    price: number
    fetchedAt: string
    venue?: QuoteRow['venue']
    basis?: QuoteRow['basis']
    via?: QuoteRow['via']
    printing?: string
    feedHash?: string
  }>,
) {
  const database = getRuntimeDb()
  const stmt = database.prepare(
    'INSERT OR REPLACE INTO market_quotes(item_id, variant, source, json) VALUES (?, ?, ?, ?)',
  )
  const tx = database.transaction(() => {
    for (const quote of quotes) {
      stmt.run(itemId, quote.variant, quote.source, JSON.stringify({ itemId, ...quote }))
    }
  })
  tx()
}

function hydrateQuote(row: QuoteRow): QuoteRow {
  const lineage = lineageFromSource(row.source)
  return {
    ...row,
    venue: row.venue ?? lineage.venue,
    basis: row.basis ?? lineage.basis,
    via: row.via ?? lineage.via,
  }
}

export function listQuotes(itemId: string): QuoteRow[] {
  const rows = getRuntimeDb()
    .prepare('SELECT json FROM market_quotes WHERE item_id = ?')
    .all(itemId) as Array<{ json: string }>
  return rows.map((row) => hydrateQuote(parseJson<QuoteRow>(row.json)))
}

export function upsertSales(
  itemId: string,
  sales: MarketSale[],
): { added: number; unchanged: number } {
  const database = getRuntimeDb()
  const existing = database
    .prepare('SELECT variant, ebay_item_id FROM market_sales WHERE item_id = ?')
    .all(itemId) as Array<{ variant: string; ebay_item_id: string }>
  const seen = new Set(existing.map((row) => `${row.variant}:${row.ebay_item_id}`))
  let added = 0
  let unchanged = 0
  const stmt = database.prepare(
    'INSERT OR IGNORE INTO market_sales(item_id, variant, ebay_item_id, json) VALUES (?, ?, ?, ?)',
  )
  const tx = database.transaction(() => {
    for (const sale of sales) {
      const key = `${sale.variant}:${sale.ebayItemId}`
      if (seen.has(key)) {
        unchanged += 1
        continue
      }
      const result = stmt.run(
        itemId,
        sale.variant,
        sale.ebayItemId,
        JSON.stringify({ ...sale, itemId }),
      )
      if (result.changes) {
        seen.add(key)
        added += 1
      } else unchanged += 1
    }
  })
  tx()
  return { added, unchanged }
}

export function listSales(itemId: string, variant?: string): MarketSale[] {
  const rows = variant
    ? (getRuntimeDb()
        .prepare('SELECT json FROM market_sales WHERE item_id = ? AND variant = ?')
        .all(itemId, variant) as Array<{ json: string }>)
    : (getRuntimeDb()
        .prepare('SELECT json FROM market_sales WHERE item_id = ?')
        .all(itemId) as Array<{ json: string }>)
  return rows
    .map((row) => parseJson<MarketSale>(row.json))
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
}

export function isStale(fetchedAt: string | null, now = Date.now()): boolean {
  if (!fetchedAt) return true
  const ts = Date.parse(fetchedAt)
  return !Number.isFinite(ts) || now - ts > STALE_MS
}

export function marketStoreStats() {
  const database = getRuntimeDb()
  const items = (
    database.prepare('SELECT json FROM market_items').all() as Array<{ json: string }>
  ).map((row) => parseJson<MarketItem>(row.json))
  const byStatus = { pending: 0, completed: 0, failed: 0, hard_failed: 0 }
  for (const item of items) byStatus[item.scrapeStatus] += 1
  const quotes = (
    database.prepare('SELECT COUNT(*) AS n FROM market_quotes').get() as { n: number }
  ).n
  const sales = (database.prepare('SELECT COUNT(*) AS n FROM market_sales').get() as { n: number })
    .n
  return {
    items: items.length,
    quotes,
    sales,
    byStatus,
  }
}
