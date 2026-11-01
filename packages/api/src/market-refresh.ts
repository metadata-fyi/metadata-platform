/**
 * Consistent refresh: due queue, fair rotation, daily tick.
 * Network only when callers pass live=true (CLI --live).
 */
import {
  acquireMarketLock,
  advanceCursor,
  loadBudget,
  recordUse,
  releaseMarketLock,
  remainingToday,
  setCursor,
  writeTickResult,
} from './market-budget.js'
import { matchTcgCard, tcgGameForPriceCharting } from './market-catalog.js'
import { fillFamily, JSON_FILL_FAMILIES } from './market-fill.js'
import {
  CONSOLE_CONFIG,
  classifyPriceChartingFailure,
  computeSoftFailureBackoffMs,
  DEFAULT_DELAY_MS,
  deriveIdentityFromUrl,
  fetchPriceChartingHtml,
  fetchSetProducts,
  GAME_CONFIG,
  PRICECHARTING_BASE_URL,
  PRICECHARTING_GAMES,
  parseCategorySets,
  parseHistoricalSales,
  parsePricesFromTable,
  parseProductName,
  prioritizeCategorySetsForSync,
  sleep,
  variantKey,
} from './market-pricecharting.js'
import {
  dailyMaxFor,
  jitteredDelay,
  SOURCE_POLICIES,
  sourceOpenForWork,
} from './market-schedule.js'
import {
  attachLineage,
  ingestPriceChartingApiProduct,
  pricechartingApiProductUrl,
} from './market-sources.js'
import {
  getMarketItem,
  isStale,
  listMarketItems,
  listMarketSets,
  marketStoreStats,
  upsertMarketItem,
  upsertMarketSet,
  upsertQuotes,
  upsertSales,
  withMarketTransaction,
} from './market-store.js'
import type {
  MarketItem,
  MarketSourceId,
  PriceChartingConsole,
  PriceChartingGame,
} from './market-types.js'

export function familyKey(item: Pick<MarketItem, 'attrs' | 'kind'>): string {
  return item.attrs.console || item.attrs.game || item.attrs.tcgGameId || item.kind
}

export function itemIsDue(item: MarketItem, now = Date.now()): boolean {
  if (item.scrapeStatus === 'hard_failed') return false
  if (item.scrapeStatus === 'pending') return true
  if (item.scrapeStatus === 'failed') {
    const failedAt = Date.parse(item.updatedAt)
    return !Number.isFinite(failedAt) || now - failedAt >= computeSoftFailureBackoffMs(1)
  }
  const policy = SOURCE_POLICIES[item.source.id] ?? SOURCE_POLICIES.pricecharting
  if (!item.lastScrapedAt) return true
  const ts = Date.parse(item.lastScrapedAt)
  return !Number.isFinite(ts) || now - ts >= policy.minIntervalMs
}

export function dueMarketItems(opts?: { kind?: string; source?: MarketSourceId; now?: number }) {
  const now = opts?.now ?? Date.now()
  return listMarketItems({ kind: opts?.kind }).filter((item) => {
    if (opts?.source && item.source.id !== opts.source) return false
    return itemIsDue(item, now)
  })
}

export function pickRefreshBatch(
  items: MarketItem[],
  limit: number,
  cursor = 0,
): { picked: MarketItem[]; nextCursor: number } {
  const buckets = new Map<string, MarketItem[]>()
  const sorted = [...items].sort((a, b) => {
    const at = a.lastScrapedAt || ''
    const bt = b.lastScrapedAt || ''
    return at.localeCompare(bt) || a.id.localeCompare(b.id)
  })
  for (const item of sorted) {
    const key = familyKey(item)
    const rows = buckets.get(key) || []
    rows.push(item)
    buckets.set(key, rows)
  }
  const keys = [...buckets.keys()].sort()
  if (!keys.length || limit <= 0) return { picked: [], nextCursor: cursor }
  const start = ((cursor % keys.length) + keys.length) % keys.length
  const picked: MarketItem[] = []
  while (picked.length < limit) {
    let progressed = false
    for (let n = 0; n < keys.length && picked.length < limit; n++) {
      const key = keys[(start + n) % keys.length]
      const item = buckets.get(key)?.shift()
      if (!item) continue
      picked.push(item)
      progressed = true
    }
    if (!progressed) break
  }
  return { picked, nextCursor: (start + picked.length) % keys.length }
}

export function applyPriceChartingHtml(
  item: MarketItem,
  html: string,
  now = new Date().toISOString(),
) {
  const prices = parsePricesFromTable(html, item.kind === 'game' ? 'game' : 'card')
  const sales = parseHistoricalSales(html, item.kind === 'game' ? 'game' : 'card')
  const title = parseProductName(html, item.source.url) || item.title
  const quotes = Object.values(prices).map((point) =>
    attachLineage({
      variant: variantKey(point.label),
      label: point.label,
      source: 'pricecharting',
      url: item.source.url,
      price: point.price,
      fetchedAt: now,
    }),
  )
  upsertQuotes(item.id, quotes)
  const saleRows = Object.entries(sales).flatMap(([label, rows]) =>
    rows.map((sale) => ({
      itemId: item.id,
      variant: variantKey(label),
      saleDate: sale.date,
      price: sale.price,
      ebayItemId: sale.ebayItemId,
      title: sale.title,
      capturedAt: now,
    })),
  )
  const saleResult = upsertSales(item.id, saleRows)
  upsertMarketItem({
    ...item,
    title,
    scrapeStatus: 'completed',
    lastScrapedAt: now,
    lastError: null,
    updatedAt: now,
  })
  return {
    quotes: quotes.length,
    addedSales: saleResult.added,
    unchangedSales: saleResult.unchanged,
  }
}

export function priceChartingProductMatches(
  item: MarketItem,
  product: Record<string, unknown>,
): boolean {
  const status = String(product.status || 'success')
  if (status !== 'success') return false
  const name = String(product['product-name'] || '').toLowerCase()
  if (!name) return false
  const hay = `${item.title} ${item.source.url}`.toLowerCase()
  const tokens = name.split(/[^a-z0-9]+/).filter((token) => token.length > 2)
  if (!tokens.length) return hay.includes(name)
  const hits = tokens.filter((token) => hay.includes(token)).length
  return hits >= Math.ceil(tokens.length / 2)
}

function priceChartingLookup(item: MarketItem): { id?: string; q?: string } {
  if (item.source.productId && /^\d+$/.test(item.source.productId)) {
    return { id: item.source.productId }
  }
  const slug = item.source.url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')
  return { q: slug || item.title }
}

export function applyPriceChartingApi(
  item: MarketItem,
  product: Record<string, unknown>,
  url: string,
  now = new Date().toISOString(),
) {
  if (!priceChartingProductMatches(item, product)) {
    throw new Error('PRICECHARTING_PRODUCT_MISMATCH')
  }
  const quotes = ingestPriceChartingApiProduct(
    product,
    url,
    item.kind === 'game' ? 'game' : 'card',
    now,
  )
  if (!quotes.length) throw new Error('PRICECHARTING_EMPTY_QUOTES')
  upsertQuotes(item.id, quotes)
  upsertMarketItem({
    ...item,
    scrapeStatus: 'completed',
    lastScrapedAt: now,
    lastError: null,
    updatedAt: now,
  })
  return { quotes: quotes.length, addedSales: 0, unchangedSales: 0 }
}

export async function scrapePriceChartingItem(item: MarketItem) {
  const token = process.env.PRICECHARTING_TOKEN?.trim()
  if (token) {
    const lookup = priceChartingLookup(item)
    const url = pricechartingApiProductUrl({
      token,
      ...lookup,
    })
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'metadata.fyi market-refresh' },
    })
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`)
    const payload = (await response.json()) as Record<string, unknown>
    return applyPriceChartingApi(item, payload, url)
  }
  if (process.env.MARKET_ALLOW_PC_HTML !== '1') {
    throw new Error(
      'PRICECHARTING_HTML_DISABLED: set PRICECHARTING_TOKEN or MARKET_ALLOW_PC_HTML=1',
    )
  }
  const html = await fetchPriceChartingHtml(item.source.url)
  return applyPriceChartingHtml(item, html)
}

export function marketStatus(now = new Date()) {
  const stats = marketStoreStats()
  const items = listMarketItems()
  const stale = items.filter((item) => isStale(item.lastScrapedAt, now.getTime())).length
  const due = dueMarketItems({ now: now.getTime() }).length
  const budget = loadBudget(now)
  const sources = (Object.keys(SOURCE_POLICIES) as MarketSourceId[]).map((id) => ({
    source: id,
    used: budget.used[id] ?? 0,
    max: dailyMaxFor(id),
    remaining: remainingToday(id, now),
    open: sourceOpenForWork(SOURCE_POLICIES[id], now),
  }))
  return {
    day: budget.day,
    ...stats,
    stale,
    due,
    oldestCompletedAt:
      items
        .filter((item) => item.lastScrapedAt)
        .map((item) => item.lastScrapedAt as string)
        .sort()[0] || null,
    budget: sources,
    cursor: budget.cursor,
    lastTickAt: budget.lastTickAt,
    lastTick: budget.lastTick,
  }
}

function discoverRotation() {
  return [
    ...PRICECHARTING_GAMES.map((game) => ({ kind: 'card' as const, game })),
    ...Object.keys(CONSOLE_CONFIG).map((id) => ({
      kind: 'game' as const,
      console: id as PriceChartingConsole,
    })),
  ]
}

export function planTick(opts?: { now?: Date; batch?: number; nowWindow?: boolean }) {
  const now = opts?.now ?? new Date()
  const batch = opts?.batch ?? Number(process.env.MARKET_TICK_BATCH || 80)
  const force = Boolean(opts?.nowWindow)
  const pcOpen =
    process.env.MARKET_PRICECHARTING_ENABLED !== '0' &&
    (force || sourceOpenForWork(SOURCE_POLICIES.pricecharting, now))
  const pcRemaining = remainingToday('pricecharting', now)
  const due = dueMarketItems({ source: 'pricecharting', now: now.getTime() })
  const budget = loadBudget(now)
  const { picked } = pickRefreshBatch(due, Math.min(batch, pcRemaining), budget.cursor.family)
  const rotation = discoverRotation()
  const nextDiscover = rotation[budget.cursor.discover % rotation.length]
  return {
    day: budget.day,
    pricecharting: {
      open: pcOpen,
      remaining: pcRemaining,
      due: due.length,
      wouldRefresh: picked.map((item) => item.id),
      wouldDiscover: nextDiscover,
      pendingLow: listMarketItems().filter((item) => item.scrapeStatus === 'pending').length < 20,
    },
    json: JSON_FILL_FAMILIES.map((family) => ({
      family: family.id,
      source: family.source,
      mode: family.mode,
      open: force || sourceOpenForWork(SOURCE_POLICIES[family.source], now),
      remaining: remainingToday(family.source, now),
    })),
  }
}

export async function discoverPriceChartingCards(
  target: PriceChartingGame,
  opts: { maxItems: number; apply: boolean },
) {
  const html = await fetchPriceChartingHtml(
    `${PRICECHARTING_BASE_URL}/category/${GAME_CONFIG[target].categorySlug}`,
  )
  const sets = prioritizeCategorySetsForSync(
    target,
    parseCategorySets(html, target),
    listMarketSets(target),
  )
  const set = sets[0]
  if (!set) return { pending: 0, sets: [] as string[] }
  const products = await fetchSetProducts(set.url, opts.maxItems)
  upsertMarketSet({
    id: `${target}:${set.setSlug}`,
    game: target,
    setSlug: set.setSlug,
    name: set.name,
    url: set.url,
    productCount: products.length,
    lastSeenAt: new Date().toISOString(),
  })
  let pending = 0
  for (const product of products) {
    const identity = deriveIdentityFromUrl(product.url)
    if (getMarketItem(identity.productId)) continue
    const draft: MarketItem = {
      id: identity.productId,
      kind: 'card',
      title: product.productName,
      catalog: null,
      source: {
        id: 'pricecharting',
        url: identity.normalizedUrl,
        productId: identity.productId,
      },
      attrs: {
        game: identity.game,
        tcgGameId: tcgGameForPriceCharting(identity.game) || '',
        setSlug: identity.setSlug,
      },
      scrapeStatus: 'pending',
      lastScrapedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    }
    const card = matchTcgCard(draft)
    if (card) draft.catalog = { vertical: 'tcg', id: card.id }
    if (opts.apply) upsertMarketItem(draft)
    pending += 1
  }
  return { pending, sets: [set.setSlug] }
}

export async function discoverPriceChartingGames(
  target: PriceChartingConsole,
  opts: { maxItems: number; apply: boolean },
) {
  const config = CONSOLE_CONFIG[target]
  const setUrl = `${PRICECHARTING_BASE_URL}/console/${config.consoleSlug}`
  const products = await fetchSetProducts(setUrl, opts.maxItems)
  upsertMarketSet({
    id: `${target}:${config.consoleSlug}`,
    game: target,
    setSlug: config.consoleSlug,
    name: config.label,
    url: setUrl,
    productCount: products.length,
    lastSeenAt: new Date().toISOString(),
  })
  let pending = 0
  for (const product of products) {
    const identity = deriveIdentityFromUrl(product.url)
    if (getMarketItem(identity.productId)) continue
    if (opts.apply) {
      upsertMarketItem({
        id: identity.productId,
        kind: 'game',
        title: product.productName,
        catalog: { vertical: 'consoles', id: config.catalogId },
        source: {
          id: 'pricecharting',
          url: identity.normalizedUrl,
          productId: identity.productId,
        },
        attrs: {
          console: target,
          catalogId: config.catalogId,
          setSlug: identity.setSlug,
        },
        scrapeStatus: 'pending',
        lastScrapedAt: null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
    }
    pending += 1
  }
  return { pending, console: target }
}

export async function refreshPriceChartingBatch(opts: {
  items: MarketItem[]
  apply: boolean
  live: boolean
  delayMs?: number
}) {
  const report = { scraped: 0, failed: 0, addedSales: 0, unchangedSales: 0, skipped: 0 }
  if (!opts.live) {
    return { ...report, wouldScrape: opts.items.length }
  }
  for (const item of opts.items) {
    if (!opts.apply) {
      report.skipped += 1
      continue
    }
    try {
      const result = await scrapePriceChartingItem(item)
      report.scraped += 1
      report.addedSales += result.addedSales
      report.unchangedSales += result.unchangedSales
      recordUse('pricecharting', 1)
    } catch (error) {
      const kind = classifyPriceChartingFailure(error)
      upsertMarketItem({
        ...item,
        scrapeStatus: kind === 'hard' ? 'hard_failed' : 'failed',
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      })
      report.failed += 1
      recordUse('pricecharting', 1)
    }
    await sleep(jitteredDelay(opts.delayMs ?? DEFAULT_DELAY_MS))
  }
  return report
}

export async function runTick(opts: {
  live: boolean
  apply: boolean
  nowWindow?: boolean
  batch?: number
  delayMs?: number
  now?: Date
}) {
  const now = opts.now ?? new Date()
  const plan = planTick({ now, batch: opts.batch, nowWindow: opts.nowWindow })
  if (!opts.live) {
    return { ok: true, command: 'tick', live: false, apply: opts.apply, plan }
  }
  acquireMarketLock(now)
  const result: Record<string, unknown> = {
    ok: true,
    command: 'tick',
    live: true,
    apply: opts.apply,
    day: plan.day,
  }
  try {
    return await withMarketTransaction(async () => {
      if (plan.pricecharting.open && plan.pricecharting.remaining > 0) {
        const due = dueMarketItems({ source: 'pricecharting', now: now.getTime() })
        const budget = loadBudget(now)
        const take = Math.min(opts.batch ?? 80, plan.pricecharting.remaining)
        const { picked, nextCursor } = pickRefreshBatch(due, take, budget.cursor.family)
        result.pricecharting = await refreshPriceChartingBatch({
          items: picked,
          apply: opts.apply,
          live: true,
          delayMs: opts.delayMs,
        })
        if (opts.apply) setCursor('family', nextCursor, now)
        const pending = listMarketItems().filter((item) => item.scrapeStatus === 'pending').length
        if (opts.apply && pending < 20 && remainingToday('pricecharting', now) > 5) {
          const next = plan.pricecharting.wouldDiscover
          const discoverMax = Math.min(15, remainingToday('pricecharting', now))
          result.discover =
            next.kind === 'game'
              ? await discoverPriceChartingGames(next.console, {
                  maxItems: discoverMax,
                  apply: true,
                })
              : await discoverPriceChartingCards(next.game, { maxItems: discoverMax, apply: true })
          recordUse('pricecharting', 2)
          advanceCursor('discover', 1, now)
        }
      } else {
        result.pricecharting = { skipped: true, reason: 'window closed or budget empty' }
      }

      if (!opts.apply) {
        result.json = plan.json.map((family) => ({
          ...family,
          wouldFill: family.open && family.remaining > 0,
        }))
      } else {
        const jsonReports = []
        for (const family of plan.json) {
          if (!family.open || family.remaining <= 0) {
            jsonReports.push({
              family: family.family,
              skipped: true,
              reason: 'window closed or budget empty',
            })
            continue
          }
          const take = Math.min(opts.batch ?? 80, family.remaining)
          const fill = await fillFamily({
            family: family.family,
            maxItems: take,
            live: true,
            apply: true,
            onlyDue: true,
          })
          recordUse(family.source, Number(fill.http || fill.fetched || 0))
          jsonReports.push(fill)
        }
        result.json = jsonReports
      }
      writeTickResult(result, now)
      return result
    })
  } finally {
    releaseMarketLock()
  }
}
