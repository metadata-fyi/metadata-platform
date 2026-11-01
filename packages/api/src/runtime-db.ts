/**
 * SQLite runtime store (DATA_DIR/runtime.sqlite).
 * Catalog identity stays git JSON. Money, quotes, sessions, preview, rate
 * limits, and dataset listings live here so they survive process restart
 * without rewriting giant JSON files.
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Database as SqliteDatabase } from 'better-sqlite3'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS wallets (
  wallet TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS finance_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  environment TEXT NOT NULL,
  wallet TEXT,
  reference TEXT,
  cash_micros INTEGER NOT NULL DEFAULT 0,
  credit_delta INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS finance_events_at ON finance_events(at);
CREATE INDEX IF NOT EXISTS finance_events_reference ON finance_events(reference);
CREATE TRIGGER IF NOT EXISTS finance_events_no_update BEFORE UPDATE ON finance_events
BEGIN SELECT RAISE(ABORT, 'finance events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS finance_events_no_delete BEFORE DELETE ON finance_events
BEGIN SELECT RAISE(ABORT, 'finance events are append-only'); END;
CREATE TABLE IF NOT EXISTS wallet_holds (
  wallet TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY(wallet, reason)
);
CREATE TABLE IF NOT EXISTS stripe_pending_entitlements (
  environment TEXT NOT NULL,
  payment_intent TEXT NOT NULL,
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (environment, event_key)
);
CREATE TABLE IF NOT EXISTS x402_settlement_attempts (
  environment TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  wallet TEXT NOT NULL,
  at TEXT NOT NULL,
  transaction_ref TEXT,
  PRIMARY KEY (environment, id)
);
CREATE TABLE IF NOT EXISTS claimed_tx (
  tx TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_nonces (
  wallet TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_sessions (
  token TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS preview_hits (
  bucket TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS preview_hits_bucket_ts ON preview_hits(bucket, ts);

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  bucket TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_ts ON rate_limit_hits(bucket, ts);

CREATE TABLE IF NOT EXISTS quota_buckets (
  kind TEXT NOT NULL,
  bucket TEXT NOT NULL,
  expires_at INTEGER,
  PRIMARY KEY(kind, bucket)
);
CREATE INDEX IF NOT EXISTS quota_buckets_expiry ON quota_buckets(kind, expires_at);
CREATE TABLE IF NOT EXISTS quota_counts (kind TEXT PRIMARY KEY, n INTEGER NOT NULL);
INSERT OR IGNORE INTO quota_counts VALUES ('rate', 0), ('preview', 0);
CREATE TRIGGER IF NOT EXISTS quota_bucket_insert AFTER INSERT ON quota_buckets
BEGIN UPDATE quota_counts SET n = n + 1 WHERE kind = NEW.kind; END;
CREATE TRIGGER IF NOT EXISTS quota_bucket_delete AFTER DELETE ON quota_buckets
BEGIN UPDATE quota_counts SET n = n - 1 WHERE kind = OLD.kind; END;

CREATE TABLE IF NOT EXISTS catalog_usage (
  day TEXT NOT NULL,
  subject TEXT NOT NULL,
  tier TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, subject)
);
CREATE TABLE IF NOT EXISTS catalog_denials (
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, reason)
);
CREATE TABLE IF NOT EXISTS market_items (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  source_url TEXT,
  catalog_vertical TEXT,
  catalog_id TEXT,
  kind TEXT,
  scrape_status TEXT
);
CREATE INDEX IF NOT EXISTS market_items_source_url ON market_items(source_url);
CREATE INDEX IF NOT EXISTS market_items_catalog ON market_items(catalog_vertical, catalog_id);
CREATE INDEX IF NOT EXISTS market_items_kind ON market_items(kind);
CREATE TABLE IF NOT EXISTS market_sets (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS market_quotes (
  item_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  source TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (item_id, variant, source)
);
CREATE TABLE IF NOT EXISTS market_sales (
  item_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  ebay_item_id TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (item_id, variant, ebay_item_id)
);
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

function dataDir() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
}

function dbPath() {
  return path.join(dataDir(), 'runtime.sqlite')
}

let db: SqliteDatabase | null = null
let openPath: string | null = null

function importLedger(database: SqliteDatabase, dir: string) {
  const ledgerFile = path.join(dir, 'ledger.json')
  if (!fs.existsSync(ledgerFile)) return
  let ledger: {
    version?: number
    wallets?: Record<string, { credits?: number }>
    claimedTx?: Record<string, { wallet: string; packId: string; at: string }>
  }
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) as typeof ledger
  } catch {
    throw new Error('corrupt ledger')
  }
  if (
    !ledger ||
    ledger.version !== 1 ||
    !ledger.claimedTx ||
    typeof ledger.claimedTx !== 'object' ||
    !ledger.wallets ||
    typeof ledger.wallets !== 'object'
  ) {
    throw new Error('corrupt ledger')
  }
  const insertWallet = database.prepare(
    'INSERT OR REPLACE INTO wallets(wallet, credits) VALUES (?, ?)',
  )
  const insertTx = database.prepare(
    'INSERT OR IGNORE INTO claimed_tx(tx, wallet, pack_id, at) VALUES (?, ?, ?, ?)',
  )
  for (const [wallet, row] of Object.entries(ledger.wallets)) {
    insertWallet.run(wallet, Math.floor(row?.credits ?? 0))
  }
  for (const [hash, row] of Object.entries(ledger.claimedTx)) {
    insertTx.run(hash, row.wallet, row.packId, row.at)
  }
}

function importMarket(database: SqliteDatabase, dir: string) {
  const marketFile = path.join(dir, 'market.json')
  if (!fs.existsSync(marketFile)) return
  try {
    const market = JSON.parse(fs.readFileSync(marketFile, 'utf8')) as {
      items?: Record<string, unknown>
      sets?: Record<string, unknown>
      quotes?: Array<Record<string, unknown>>
      sales?: Array<Record<string, unknown>>
    }
    const itemStmt = database.prepare(
      'INSERT OR REPLACE INTO market_items(id, json, source_url, catalog_vertical, catalog_id, kind, scrape_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    const setStmt = database.prepare('INSERT OR REPLACE INTO market_sets(id, json) VALUES (?, ?)')
    const quoteStmt = database.prepare(
      'INSERT OR REPLACE INTO market_quotes(item_id, variant, source, json) VALUES (?, ?, ?, ?)',
    )
    const saleStmt = database.prepare(
      'INSERT OR REPLACE INTO market_sales(item_id, variant, ebay_item_id, json) VALUES (?, ?, ?, ?)',
    )
    for (const [id, row] of Object.entries(market.items || {})) {
      itemStmt.run(...marketItemBind(id, row))
    }
    for (const [id, row] of Object.entries(market.sets || {})) {
      setStmt.run(id, JSON.stringify(row))
    }
    for (const row of market.quotes || []) {
      quoteStmt.run(row.itemId, row.variant, row.source, JSON.stringify(row))
    }
    for (const row of market.sales || []) {
      saleStmt.run(row.itemId, row.variant, row.ebayItemId, JSON.stringify(row))
    }
  } catch {
    // Quotes can be re-scraped. Do not block boot on a leftover dump.
  }
}

function importDatasets(database: SqliteDatabase, dir: string) {
  const datasetsFile = path.join(dir, 'datasets.json')
  if (!fs.existsSync(datasetsFile)) return
  try {
    const file = JSON.parse(fs.readFileSync(datasetsFile, 'utf8')) as {
      items?: Array<{ id: string }>
    }
    const stmt = database.prepare('INSERT OR REPLACE INTO datasets(id, json) VALUES (?, ?)')
    for (const item of file.items || []) {
      if (item?.id) stmt.run(item.id, JSON.stringify(item))
    }
  } catch {
    // ignore leftover listing dump
  }
}

function marketItemBind(id: string, row: unknown) {
  const item = row as {
    source?: { url?: string }
    catalog?: { vertical?: string; id?: string }
    kind?: string
    scrapeStatus?: string
  }
  return [
    id,
    JSON.stringify(row),
    item.source?.url ?? null,
    item.catalog?.vertical ?? null,
    item.catalog?.id ?? null,
    item.kind ?? null,
    item.scrapeStatus ?? null,
  ] as const
}

function ensureMarketItemColumns(database: SqliteDatabase) {
  const cols = new Set(
    (database.prepare('PRAGMA table_info(market_items)').all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  )
  const add: Array<[string, string]> = [
    ['source_url', 'TEXT'],
    ['catalog_vertical', 'TEXT'],
    ['catalog_id', 'TEXT'],
    ['kind', 'TEXT'],
    ['scrape_status', 'TEXT'],
  ]
  for (const [name, type] of add) {
    if (!cols.has(name)) database.exec(`ALTER TABLE market_items ADD COLUMN ${name} ${type}`)
  }
  database.exec('CREATE INDEX IF NOT EXISTS market_items_source_url ON market_items(source_url)')
  database.exec(
    'CREATE INDEX IF NOT EXISTS market_items_catalog ON market_items(catalog_vertical, catalog_id)',
  )
  database.exec('CREATE INDEX IF NOT EXISTS market_items_kind ON market_items(kind)')
  const already = database
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('market_items_columns') as { value: string } | undefined
  if (already?.value === '1') return
  database.exec(`
    UPDATE market_items SET
      source_url = json_extract(json, '$.source.url'),
      catalog_vertical = json_extract(json, '$.catalog.vertical'),
      catalog_id = json_extract(json, '$.catalog.id'),
      kind = json_extract(json, '$.kind'),
      scrape_status = json_extract(json, '$.scrapeStatus')
    WHERE source_url IS NULL
  `)
  database
    .prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)')
    .run('market_items_columns', '1')
}

function migrateJsonIfNeeded(database: SqliteDatabase) {
  const already = database.prepare('SELECT value FROM meta WHERE key = ?').get('migrated_json') as
    | { value: string }
    | undefined
  if (already?.value === '1') return

  const dir = dataDir()
  const migrate = database.transaction(() => {
    importLedger(database, dir)
    importMarket(database, dir)
    importDatasets(database, dir)
    database
      .prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)')
      .run('migrated_json', '1')
  })
  migrate()
}

export function runtimeDbPath() {
  return dbPath()
}

export function getRuntimeDb(): SqliteDatabase {
  const file = dbPath()
  if (db && openPath === file) return db
  if (db) {
    try {
      db.close()
    } catch {
      // ignore
    }
    db = null
    openPath = null
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const database = new Database(file)
  try {
    database.exec(SCHEMA)
    database.transaction(() => {
      if (database.prepare("SELECT value FROM meta WHERE key = 'quota_buckets_v1'").get()) return
      // Legacy quota rows have no expiry metadata. Preserve their active
      // windows while ensuring abandoned identities can eventually be swept.
      const previewWindow = Number(process.env.PREVIEW_WINDOW_MS)
      const legacyRetentionMs = Math.max(
        86_400_000,
        Number.isFinite(previewWindow) && previewWindow > 0 ? previewWindow : 0,
      )
      database.prepare(`INSERT OR IGNORE INTO quota_buckets(kind, bucket, expires_at)
        SELECT 'rate', bucket, MAX(ts) + ? FROM rate_limit_hits GROUP BY bucket`).run(legacyRetentionMs)
      database.prepare(`INSERT OR IGNORE INTO quota_buckets(kind, bucket, expires_at)
        SELECT 'preview', bucket, MAX(ts) + ? FROM preview_hits GROUP BY bucket`).run(legacyRetentionMs)
      database.prepare("INSERT INTO meta(key, value) VALUES ('quota_buckets_v1', '1')").run()
    })()
    ensureMarketItemColumns(database)
    migrateJsonIfNeeded(database)
    database.transaction(() => {
      if (
        database.prepare("SELECT value FROM meta WHERE key = 'finance_journal_initialized'").get()
      )
        return
      const at = new Date().toISOString()
      database
        .prepare(`INSERT OR IGNORE INTO finance_events(id, at, kind, environment, wallet, credit_delta)
        SELECT 'opening:' || wallet, ?, 'opening_balance', 'legacy', wallet, credits FROM wallets`)
        .run(at)
      database
        .prepare("INSERT INTO meta(key, value) VALUES ('finance_journal_initialized', '1')")
        .run()
    })()
  } catch (err) {
    try {
      database.close()
    } catch {
      // ignore
    }
    throw err
  }
  db = database
  openPath = file
  return database
}

export function closeRuntimeDb() {
  if (!db) return
  try {
    db.close()
  } catch {
    // ignore
  }
  db = null
  openPath = null
}

export function runtimeDbTransaction<T>(fn: () => T): T {
  return getRuntimeDb().transaction(fn)()
}
