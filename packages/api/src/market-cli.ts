/**
 * Discover / sync / tick market rows into DATA_DIR.
 *
 *   npx tsx packages/api/src/market-cli.ts status
 *   npx tsx packages/api/src/market-cli.ts tick
 *   npx tsx packages/api/src/market-cli.ts discover --game pokemon --max-items 25
 *   npx tsx packages/api/src/market-cli.ts sync --max-items 25 --delay 1500
 */

import { coverageReport, fillJobs } from './market-coverage.js'
import { fillFamily } from './market-fill.js'
import {
  CONSOLE_CONFIG,
  DEFAULT_DELAY_MS,
  normalizePriceChartingConsole,
  normalizePriceChartingGame,
  PRICECHARTING_GAMES,
} from './market-pricecharting.js'
import {
  discoverPriceChartingCards,
  discoverPriceChartingGames,
  dueMarketItems,
  marketStatus,
  planTick,
  refreshPriceChartingBatch,
  runTick,
} from './market-refresh.js'
import { planScrapeDay } from './market-schedule.js'
import { ingestFixture, ingestPublicJson } from './market-sources.js'
import { upsertQuotes } from './market-store.js'

const args = process.argv.slice(2)
const command = args[0] || 'discover'

function flag(name: string, fallback?: string) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

function num(name: string, fallback: number) {
  const value = Number(flag(name))
  return Number.isFinite(value) ? value : fallback
}

const apply = args.includes('--apply')
const live = args.includes('--live')
const nowWindow = args.includes('--now')
const maxItems = num('--max-items', 25)
const delayMs = num('--delay', DEFAULT_DELAY_MS)
const kind = flag('--kind', 'card')
const game = normalizePriceChartingGame(flag('--game', kind === 'game' ? undefined : 'pokemon'))
const consoleId = normalizePriceChartingConsole(flag('--console'))

function requireLive() {
  if (!live) {
    throw new Error('refusing network: pass --live only on the dedicated scrape host')
  }
}

async function discover() {
  requireLive()
  if (kind === 'game') {
    if (!consoleId) {
      console.error(`--console must be one of ${Object.keys(CONSOLE_CONFIG).join(', ')}`)
      process.exit(2)
    }
    const result = await discoverPriceChartingGames(consoleId, { maxItems, apply })
    console.log(
      JSON.stringify({ ok: true, command: 'discover', kind: 'game', apply, ...result }, null, 2),
    )
    return
  }
  if (!game) {
    console.error(`--game must be one of ${PRICECHARTING_GAMES.join(', ')}`)
    process.exit(2)
  }
  const result = await discoverPriceChartingCards(game, { maxItems, apply })
  console.log(JSON.stringify({ ok: true, command: 'discover', game, apply, ...result }, null, 2))
}

async function sync() {
  requireLive()
  const due = dueMarketItems({ kind: kind === 'game' ? 'game' : 'card', source: 'pricecharting' })
  const batch = due.slice(0, maxItems)
  const report = await refreshPriceChartingBatch({ items: batch, apply, live: true, delayMs })
  console.log(
    JSON.stringify({ ok: true, command: 'sync', apply, due: due.length, ...report }, null, 2),
  )
}

if (command === 'plan') {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: 'plan',
        live: false,
        windows: planScrapeDay(),
        tick: planTick({ nowWindow }),
      },
      null,
      2,
    ),
  )
} else if (command === 'status') {
  console.log(JSON.stringify({ ok: true, command: 'status', ...marketStatus() }, null, 2))
} else if (command === 'tick') {
  if (live) requireLive()
  const result = await runTick({
    live,
    apply,
    nowWindow,
    batch: maxItems === 25 ? 80 : maxItems,
    delayMs,
  })
  console.log(JSON.stringify(result, null, 2))
} else if (command === 'coverage') {
  console.log(JSON.stringify({ ok: true, command: 'coverage', ...coverageReport() }, null, 2))
} else if (command === 'fill') {
  const family = flag('--family')
  if (!family) {
    console.log(
      JSON.stringify({ ok: true, command: 'fill', live: false, jobs: fillJobs() }, null, 2),
    )
  } else {
    if (live) requireLive()
    const result = await fillFamily({ family, maxItems, live, apply })
    console.log(JSON.stringify(result, null, 2))
  }
} else if (command === 'discover') await discover()
else if (command === 'sync') await sync()
else if (command === 'ingest-fixture') {
  const file = flag('--file')
  if (!file) {
    console.error('ingest-fixture requires --file path.json')
    process.exit(2)
  }
  const { readFileSync } = await import('node:fs')
  const payload = JSON.parse(readFileSync(file, 'utf8'))
  const quotes = payload.fixture
    ? ingestFixture(payload.itemId, payload.fixture)
    : ingestPublicJson(payload.itemId, payload.url || '', payload.payload || payload)
  if (apply) upsertQuotes(payload.itemId, quotes)
  console.log(
    JSON.stringify({ ok: true, command: 'ingest-fixture', apply, quotes: quotes.length }, null, 2),
  )
} else {
  console.error(
    'usage: market-cli.ts plan|status|tick|coverage|fill|discover|sync|ingest-fixture [--family mtg-cards] [--kind card|game] [--console nes] [--game pokemon] [--live] [--apply] [--now]',
  )
  process.exit(2)
}
