/** PriceCharting HTML parsers and identity helpers. Ported from OpenClaw market-data. */

import type { PriceChartingConsole, PriceChartingGame } from './market-types.js'

export const PRICECHARTING_BASE_URL = 'https://www.pricecharting.com'
export const PRICECHARTING_GAMES = [
  'pokemon',
  'onepiece',
  'yugioh',
  'magic',
  'lorcana',
  'weiss',
] as const
export const DEFAULT_DELAY_MS = 1500

export const GAME_CONFIG: Record<
  PriceChartingGame,
  { label: string; categorySlug: string; setSlugPrefix: string; tcgGameId: string }
> = {
  pokemon: {
    label: 'Pokemon',
    categorySlug: 'pokemon-cards',
    setSlugPrefix: 'pokemon-',
    tcgGameId: 'pokemon',
  },
  onepiece: {
    label: 'One Piece',
    categorySlug: 'one-piece-cards',
    setSlugPrefix: 'one-piece-',
    tcgGameId: 'onepiece',
  },
  yugioh: {
    label: 'Yu-Gi-Oh',
    categorySlug: 'yugioh-cards',
    setSlugPrefix: 'yugioh-',
    tcgGameId: 'yugioh',
  },
  magic: {
    label: 'Magic: The Gathering',
    categorySlug: 'magic-cards',
    setSlugPrefix: 'magic-',
    tcgGameId: 'mtg',
  },
  lorcana: {
    label: 'Disney Lorcana',
    categorySlug: 'lorcana-cards',
    setSlugPrefix: 'lorcana-',
    tcgGameId: 'lorcana',
  },
  weiss: {
    label: 'Weiss Schwarz',
    categorySlug: 'other-tcg-cards',
    setSlugPrefix: 'weiss-schwarz-',
    tcgGameId: 'weiss',
  },
}

export const CONSOLE_CONFIG: Record<
  PriceChartingConsole,
  { label: string; consoleSlug: string; catalogId: string }
> = {
  nes: { label: 'NES', consoleSlug: 'nes', catalogId: 'nintendo-entertainment-system' },
  snes: {
    label: 'SNES',
    consoleSlug: 'super-nintendo',
    catalogId: 'super-nintendo-entertainment-system',
  },
  n64: { label: 'Nintendo 64', consoleSlug: 'nintendo-64', catalogId: 'nintendo-64' },
  gb: { label: 'Game Boy', consoleSlug: 'gameboy', catalogId: 'game-boy' },
  gbc: { label: 'Game Boy Color', consoleSlug: 'gameboy-color', catalogId: 'game-boy-color' },
  gba: { label: 'Game Boy Advance', consoleSlug: 'gameboy-advance', catalogId: 'game-boy-advance' },
  'nes-classic': {
    label: 'NES Classic',
    consoleSlug: 'nes-classic',
    catalogId: 'nintendo-entertainment-system',
  },
  genesis: { label: 'Sega Genesis', consoleSlug: 'sega-genesis', catalogId: 'sega-genesis' },
  sms: {
    label: 'Master System',
    consoleSlug: 'sega-master-system',
    catalogId: 'sega-master-system',
  },
  ps1: { label: 'PlayStation', consoleSlug: 'playstation', catalogId: 'playstation' },
  ps2: { label: 'PlayStation 2', consoleSlug: 'playstation-2', catalogId: 'playstation-2' },
  psp: { label: 'PSP', consoleSlug: 'psp', catalogId: 'playstation-portable' },
  saturn: { label: 'Sega Saturn', consoleSlug: 'sega-saturn', catalogId: 'sega-saturn' },
  dc: { label: 'Dreamcast', consoleSlug: 'dreamcast', catalogId: 'dreamcast' },
  jag: { label: 'Jaguar', consoleSlug: 'atari-jaguar', catalogId: 'atari-jaguar' },
  '32x': { label: 'Sega 32X', consoleSlug: 'sega-32x', catalogId: 'sega-32x' },
  cdi: { label: 'CD-i', consoleSlug: 'philips-cd-i', catalogId: 'philips-cd-i' },
}

const VARIANT_KEYS: Record<string, string> = {
  Ungraded: 'ungraded',
  'Grade 7': 'grade7',
  'Grade 8': 'grade8',
  'Grade 9': 'grade9',
  'Grade 9.5': 'grade95',
  'PSA 10': 'psa10',
  'BGS 10': 'bgs10',
  'CGC 10': 'cgc10',
  'SGC 10': 'sgc10',
  Loose: 'loose',
  CIB: 'cib',
  New: 'new',
  Graded: 'graded',
  Box: 'box',
  Manual: 'manual',
}

export type CategorySetEntry = { name: string; url: string; setSlug: string }
export type SetProductEntry = { productName: string; url: string; productSlug: string }
export type PricePoint = { label: string; price: number }
export type SaleRecord = {
  grade: string
  date: string
  price: number
  title: string
  ebayItemId: string
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
}

export function slugToTitle(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim()
}

export function variantKey(label: string): string {
  return VARIANT_KEYS[label] || label.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function normalizePriceChartingGame(value?: string | null): PriceChartingGame | null {
  if (!value) return null
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const aliases: Record<string, PriceChartingGame> = {
    pokemon: 'pokemon',
    onepiece: 'onepiece',
    onepiececards: 'onepiece',
    yugioh: 'yugioh',
    yugiohcards: 'yugioh',
    magic: 'magic',
    magicthegathering: 'magic',
    magiccards: 'magic',
    mtg: 'magic',
    lorcana: 'lorcana',
    disneylorcana: 'lorcana',
    lorcanacards: 'lorcana',
    weiss: 'weiss',
    weissschwarz: 'weiss',
    weissschwarzcards: 'weiss',
  }
  return aliases[normalized] || null
}

export function normalizeGradeLabel(grade?: string): string | undefined {
  if (!grade) return undefined
  const compact = grade.trim().toLowerCase().replace(/\s+/g, '')
  if (!compact) return undefined
  const lookup: Record<string, string> = {
    ungraded: 'Ungraded',
    raw: 'Ungraded',
    grade7: 'Grade 7',
    grade8: 'Grade 8',
    grade9: 'Grade 9',
    grade95: 'Grade 9.5',
    'grade9.5': 'Grade 9.5',
    psa7: 'Grade 7',
    psa8: 'Grade 8',
    psa9: 'Grade 9',
    psa95: 'Grade 9.5',
    'psa9.5': 'Grade 9.5',
    psa10: 'PSA 10',
    cgc7: 'Grade 7',
    cgc8: 'Grade 8',
    cgc9: 'Grade 9',
    cgc95: 'Grade 9.5',
    'cgc9.5': 'Grade 9.5',
    cgc10: 'PSA 10',
    bgs7: 'Grade 7',
    bgs8: 'Grade 8',
    bgs9: 'Grade 9',
    bgs95: 'Grade 9.5',
    'bgs9.5': 'Grade 9.5',
    bgs10: 'PSA 10',
    loose: 'Loose',
    cib: 'CIB',
    new: 'New',
  }
  return lookup[compact] || grade.trim().replace(/\s+/g, ' ')
}

export function classifyPriceChartingFailure(error: unknown): 'soft' | 'hard' {
  const message = error instanceof Error ? error.message : String(error)
  const hard = [
    /must be a valid url/i,
    /must point to pricecharting\.com/i,
    /must point to a product page/i,
    /unsupported pricecharting set slug/i,
    /returned 404/i,
    /returned 410/i,
  ]
  return hard.some((pattern) => pattern.test(message)) ? 'hard' : 'soft'
}

export function computeSoftFailureBackoffMs(failureCount: number): number {
  return Math.min(12 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.max(failureCount - 1, 0))
}

export function buildSetId(game: string, setSlug: string): string {
  return `${game}:${setSlug.toLowerCase()}`
}

export function buildProductId(game: string, setSlug: string, productSlug: string): string {
  return `market:pc:${game}:${setSlug.toLowerCase()}:${productSlug.toLowerCase()}`
}

export function deriveGameFromSetSlug(setSlug: string): PriceChartingGame {
  const decoded = decodeURIComponent(setSlug).toLowerCase()
  for (const game of PRICECHARTING_GAMES) {
    if (decoded.startsWith(GAME_CONFIG[game].setSlugPrefix)) return game
  }
  throw new Error(`Unsupported PriceCharting set slug: ${setSlug}`)
}

export function normalizePriceChartingConsole(value?: string | null): PriceChartingConsole | null {
  if (!value) return null
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const aliases: Record<string, PriceChartingConsole> = {
    nes: 'nes',
    famicom: 'nes',
    nintendoentertainmentsystem: 'nes',
    snes: 'snes',
    supernintendo: 'snes',
    supernintendoentertainmentsystem: 'snes',
    n64: 'n64',
    nintendo64: 'n64',
    gb: 'gb',
    gameboy: 'gb',
    gbc: 'gbc',
    gameboycolor: 'gbc',
    gba: 'gba',
    gameboyadvance: 'gba',
    genesis: 'genesis',
    megadrive: 'genesis',
    segagenesis: 'genesis',
    sms: 'sms',
    mastersystem: 'sms',
    segamastersystem: 'sms',
    ps1: 'ps1',
    playstation: 'ps1',
    psx: 'ps1',
    ps2: 'ps2',
    playstation2: 'ps2',
    psp: 'psp',
    saturn: 'saturn',
    segasaturn: 'saturn',
    dc: 'dc',
    dreamcast: 'dc',
    jaguar: 'jag',
    atarijaguar: 'jag',
    sega32x: '32x',
    '32x': '32x',
    cdi: 'cdi',
    philipscdi: 'cdi',
  }
  return aliases[compact] || null
}

export function consoleFromSetSlug(setSlug: string): PriceChartingConsole | null {
  const decoded = decodeURIComponent(setSlug).toLowerCase()
  for (const [id, config] of Object.entries(CONSOLE_CONFIG)) {
    if (decoded === config.consoleSlug || decoded.startsWith(`${config.consoleSlug}-`)) {
      return id as PriceChartingConsole
    }
  }
  return normalizePriceChartingConsole(decoded)
}

export function normalizePriceChartingUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('pricecharting_url must be a valid URL')
  }
  if (!['pricecharting.com', 'www.pricecharting.com'].includes(url.hostname)) {
    throw new Error('pricecharting_url must point to pricecharting.com')
  }
  url.hash = ''
  url.search = ''
  return url
}

export function deriveIdentityFromUrl(rawUrl: string) {
  const url = normalizePriceChartingUrl(rawUrl)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'game' || parts.length < 3) {
    throw new Error('pricecharting_url must point to a product page')
  }
  const setSlug = decodeURIComponent(parts[1])
  const productSlug = decodeURIComponent(parts[2])
  const consoleId = consoleFromSetSlug(setSlug)
  if (consoleId) {
    return {
      kind: 'game' as const,
      game: consoleId,
      consoleId,
      setSlug,
      productSlug,
      setId: buildSetId(consoleId, setSlug),
      productId: buildProductId(consoleId, setSlug, productSlug),
      normalizedUrl: url.toString(),
    }
  }
  const game = deriveGameFromSetSlug(setSlug)
  return {
    kind: 'card' as const,
    game,
    consoleId: null,
    setSlug,
    productSlug,
    setId: buildSetId(game, setSlug),
    productId: buildProductId(game, setSlug, productSlug),
    normalizedUrl: url.toString(),
  }
}

function extractPrimaryTable(html: string): string {
  const tablePatterns = [
    /<table[^>]*id="games_table"[^>]*>([\s\S]*?)<\/table>/i,
    /<table[^>]*id="price_data"[^>]*>([\s\S]*?)<\/table>/i,
  ]
  for (const pattern of tablePatterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

export function parseCategorySets(html: string, game: PriceChartingGame): CategorySetEntry[] {
  const tableHtml = extractPrimaryTable(html) || html
  const results = new Map<string, CategorySetEntry>()
  const linkRegex = /<a[^>]+href="([^"]*\/console\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of tableHtml.matchAll(linkRegex)) {
    const href = decodeHtml(match[1])
    const setSlug = decodeURIComponent(href.split('/console/')[1] || '').trim()
    if (!setSlug) continue
    if (!setSlug.toLowerCase().startsWith(GAME_CONFIG[game].setSlugPrefix)) continue
    const url = href.startsWith('http') ? href : `${PRICECHARTING_BASE_URL}${href}`
    results.set(url, {
      name: stripTags(match[2]) || slugToTitle(setSlug),
      url,
      setSlug,
    })
  }
  return Array.from(results.values())
}

export function parseSetProducts(html: string): SetProductEntry[] {
  const tableHtml = extractPrimaryTable(html)
  if (!tableHtml) return []
  const results = new Map<string, SetProductEntry>()
  const linkRegex = /<a[^>]+href="([^"]*\/game\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of tableHtml.matchAll(linkRegex)) {
    const href = decodeHtml(match[1])
    const url = href.startsWith('http') ? href : `${PRICECHARTING_BASE_URL}${href}`
    const cleanUrl = url.split('?')[0]
    const parts = new URL(cleanUrl).pathname.split('/').filter(Boolean)
    if (parts[0] !== 'game' || parts.length < 3) continue
    const productSlug = decodeURIComponent(parts[2])
    results.set(cleanUrl, {
      productName: stripTags(match[2]) || slugToTitle(productSlug),
      url: cleanUrl,
      productSlug,
    })
  }
  return Array.from(results.values())
}

export function parseNextPageForm(html: string): Record<string, string> | null {
  const formMatch = html.match(/<form[^>]*class="[^"]*\bnext_page\b[^"]*"[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch?.[1]) return null
  const form: Record<string, string> = {}
  const inputRegex = /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi
  for (const match of formMatch[1].matchAll(inputRegex)) {
    form[decodeHtml(match[1])] = decodeHtml(match[2])
  }
  return typeof form.cursor === 'string' && form.cursor.length > 0 ? form : null
}

export function prioritizeCategorySetsForSync(
  game: PriceChartingGame,
  sets: CategorySetEntry[],
  existingSets: Array<{ id: string; lastSeenAt: string | null; productCount?: number | null }>,
): CategorySetEntry[] {
  const existing = new Map(existingSets.map((row) => [row.id, row]))
  return [...sets].sort((left, right) => {
    const leftExisting = existing.get(buildSetId(game, left.setSlug))
    const rightExisting = existing.get(buildSetId(game, right.setSlug))
    if (!leftExisting && rightExisting) return -1
    if (leftExisting && !rightExisting) return 1
    const leftSeen = leftExisting?.lastSeenAt
      ? Date.parse(leftExisting.lastSeenAt)
      : Number.NEGATIVE_INFINITY
    const rightSeen = rightExisting?.lastSeenAt
      ? Date.parse(rightExisting.lastSeenAt)
      : Number.NEGATIVE_INFINITY
    if (leftSeen !== rightSeen) return leftSeen - rightSeen
    const productCountOrder =
      Number(leftExisting?.productCount || 0) - Number(rightExisting?.productCount || 0)
    if (productCountOrder !== 0) return productCountOrder
    return left.name.localeCompare(right.name)
  })
}

export function parsePricesFromTable(
  html: string,
  mode: 'card' | 'game' = 'card',
): Record<string, PricePoint> {
  const prices: Record<string, PricePoint> = {}
  const tableHtml = extractPrimaryTable(html)
  if (!tableHtml) return prices
  const tbodies = Array.from(
    tableHtml.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/gi),
    (match) => match[1],
  )
  const mainTbody = tbodies[0] || ''
  const additionalTbody = tbodies[1] || ''
  const extractors =
    mode === 'game'
      ? [
          { html: mainTbody, label: 'Loose', id: 'used_price' },
          { html: mainTbody, label: 'CIB', id: 'complete_price' },
          { html: mainTbody, label: 'New', id: 'new_price' },
        ]
      : [
          { html: mainTbody, label: 'Ungraded', id: 'used_price' },
          { html: mainTbody, label: 'Grade 7', id: 'complete_price' },
          { html: mainTbody, label: 'Grade 8', id: 'new_price' },
          { html: additionalTbody, label: 'Grade 9', id: 'graded_price' },
          { html: additionalTbody, label: 'Grade 9.5', id: 'box_only_price' },
          { html: additionalTbody, label: 'PSA 10', id: 'manual_only_price' },
        ]
  for (const extractor of extractors) {
    const regex = new RegExp(
      `<td[^>]*id="${extractor.id}"[^>]*>[\\s\\S]*?<span[^>]*class="[^"]*js-price[^"]*"[^>]*>([^<]+)<\\/span>`,
      'i',
    )
    const match = extractor.html.match(regex)
    const numeric = match?.[1] ? Number.parseFloat(match[1].replace(/[$,]/g, '')) : Number.NaN
    if (!Number.isNaN(numeric) && numeric >= 0) {
      prices[extractor.label] = { label: extractor.label, price: numeric }
    }
  }
  return prices
}

export function parseHistoricalSales(
  html: string,
  mode: 'card' | 'game' = 'card',
): Record<string, SaleRecord[]> {
  const grades: Record<string, SaleRecord[]> = {}
  const gradeTabs: Record<string, string> =
    mode === 'game'
      ? {
          'completed-auctions-used': 'Loose',
          'completed-auctions-cib': 'CIB',
          'completed-auctions-new': 'New',
        }
      : {
          'completed-auctions-used': 'Ungraded',
          'completed-auctions-cib': 'Grade 7',
          'completed-auctions-new': 'Grade 8',
          'completed-auctions-graded': 'Grade 9',
          'completed-auctions-box-only': 'Grade 9.5',
          'completed-auctions-manual-only': 'PSA 10',
        }
  for (const [tabClass, gradeLabel] of Object.entries(gradeTabs)) {
    const tabRegex = new RegExp(
      `<div\\s+class="${tabClass}"[^>]*>([\\s\\S]*?)<div\\s+class="completed-auctions`,
      'i',
    )
    const tabMatch = html.match(tabRegex)
    if (!tabMatch?.[1] || tabMatch[1].includes('No sales data for this card and grade')) continue
    for (const rowMatch of tabMatch[1].matchAll(
      /<tr[^>]*id="ebay-([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi,
    )) {
      const ebayItemId = rowMatch[1]
      const rowContent = rowMatch[2]
      const dateMatch = rowContent.match(/<td[^>]*class="date"[^>]*>([^<]+)<\/td>/i)
      const priceMatch = rowContent.match(
        /<td[^>]*class="numeric"[^>]*>[\s\S]*?<span[^>]*class="js-price"[^>]*>([^<]+)<\/span>/i,
      )
      if (!dateMatch?.[1] || !priceMatch?.[1]) continue
      const price = Number.parseFloat(priceMatch[1].replace(/[$,]/g, ''))
      if (Number.isNaN(price)) continue
      const titleMatch = rowContent.match(/<td[^>]*class="title"[^>]*>([\s\S]*?)<\/td>/i)
      if (!grades[gradeLabel]) grades[gradeLabel] = []
      grades[gradeLabel].push({
        grade: gradeLabel,
        date: decodeHtml(dateMatch[1]),
        price,
        title: titleMatch?.[1] ? stripTags(titleMatch[1]) : '',
        ebayItemId,
      })
    }
  }
  return grades
}

export function parseProductName(html: string, url: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1Match?.[1]) return stripTags(h1Match[1])
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) {
    return decodeHtml(
      titleMatch[1].replace(/\s*\|\s*PriceCharting.*$/i, '').replace(/\s*Prices?$/i, ''),
    )
  }
  return slugToTitle(new URL(url).pathname.split('/').pop() || 'pricecharting-item')
}

export function medianPrice(prices: number[]): number | null {
  if (prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return Math.round(value * 100) / 100
}

const PRICE_HEADERS = {
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
}

export async function fetchPriceChartingHtml(url: string): Promise<string> {
  const { cacheHeaders, readHttpCache, rememberResponse } = await import('./market-http-cache.js')
  const response = await fetch(url, {
    headers: { ...PRICE_HEADERS, ...cacheHeaders(url) },
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 304) {
    const cached = readHttpCache(url)
    if (cached?.body) return cached.body
  }
  if (response.status === 429) throw new Error(`PriceCharting returned 429 for ${url}`)
  if (!response.ok) throw new Error(`PriceCharting returned ${response.status} for ${url}`)
  const body = await response.text()
  rememberResponse(url, response, body)
  return body
}

export async function postPriceChartingForm(
  url: string,
  form: Record<string, string>,
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...PRICE_HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`PriceCharting returned ${response.status} for ${url}`)
  return response.text()
}

export async function fetchSetProducts(setUrl: string, limit: number): Promise<SetProductEntry[]> {
  const maxResults = Number.isFinite(limit) ? Math.max(0, limit) : Number.MAX_SAFE_INTEGER
  if (maxResults === 0) return []
  const results = new Map<string, SetProductEntry>()
  const seenCursors = new Set<string>()
  let html = await fetchPriceChartingHtml(setUrl)
  while (true) {
    for (const product of parseSetProducts(html)) {
      results.set(product.url, product)
      if (results.size >= maxResults) return Array.from(results.values()).slice(0, maxResults)
    }
    const nextForm = parseNextPageForm(html)
    if (!nextForm?.cursor || seenCursors.has(nextForm.cursor)) break
    seenCursors.add(nextForm.cursor)
    html = await postPriceChartingForm(setUrl, nextForm)
  }
  return Array.from(results.values()).slice(0, maxResults)
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
