import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { affiliatesPublicConfig, shopsForEntity } from './affiliates.js'
import {
  boardGameStats,
  enrichBoardGame,
  getBoardGame,
  getBoardGamePublisher,
  listBoardGamePublishers,
  listBoardGames,
  searchBoardGames,
} from './boardgame-catalog.js'
import {
  characterDanbooruLine,
  getCharacter,
  getSeries,
  listCharacters,
  listSeries,
  logosForSeries,
  search,
  seriesCharacters,
  stats,
  statsAll,
} from './catalog.js'
import {
  consoleStats,
  enrichConsole,
  getConsole,
  getConsoleManufacturer,
  listConsoleManufacturers,
  listConsoles,
  searchConsoles,
} from './console-catalog.js'
import {
  datasetExportCost,
  datasetIdentity,
  getDataset,
  listDatasets,
  publisherExportShare,
} from './datasets.js'
import {
  enrichEsportsTitle,
  esportsStats,
  getEsportsLeague,
  getEsportsPlayer,
  getEsportsTeam,
  getEsportsTitle,
  listEsportsLeagues,
  listEsportsPlayers,
  listEsportsTeams,
  listEsportsTitles,
  searchEsports,
} from './esports-catalog.js'
import {
  enrichFashionItem,
  enrichSneakerModel,
  fashionCategories,
  fashionStats,
  getFashionBrand,
  getFashionItem,
  getFashionLine,
  getSneakerBrand,
  getSneakerModel,
  getSneakerSilhouette,
  listFashionBrands,
  listFashionItems,
  listFashionLines,
  listSneakerBrands,
  listSneakerModels,
  listSneakerSilhouettes,
  searchFashion,
} from './fashion-catalog.js'
import {
  enrichFigureItem,
  figureStats,
  getFigureItem,
  getFigureLine,
  getFigureMaker,
  listFigureItems,
  listFigureLines,
  listFigureMakers,
  searchFigures,
} from './figure-catalog.js'
import {
  contentLengthTooLarge,
  PUBLIC_INTAKE_MAX_BYTES,
  readJsonBodyLimited,
  readTextBodyLimited,
} from './input-limits.js'
import {
  claimPack,
  deleteWalletAccount,
  getBalance,
  getWalletAccountSummary,
  settleCatalogAccess,
} from './ledger.js'
import {
  getMarketRecord,
  historyForItem,
  quoteForCatalogCard,
  searchMarket,
} from './market-catalog.js'
import { coverageReport } from './market-coverage.js'
import { marketStatus } from './market-refresh.js'
import { handleMcpRpc, isMcpCatalogTool, mcpDiscovery } from './mcp.js'
import { isMediaVertical, merchForCharacter, merchForSeries } from './merch-hub.js'
import {
  enrichModelkitItem,
  getModelkitItem,
  getModelkitLine,
  getModelkitMaker,
  listModelkitItems,
  listModelkitLines,
  listModelkitMakers,
  modelkitStats,
  searchModelkits,
} from './modelkit-catalog.js'
import {
  albumsForSeries,
  enrichOstAlbum,
  getOstAlbum,
  getOstArtist,
  listOstAlbums,
  listOstArtists,
  ostStats,
  searchOst,
} from './ost-catalog.js'
import {
  getTopupConfig,
  metadataEnvironment,
  PAYMENT_METHODS,
  quoteTopup,
  ROBINHOOD_USDG,
  resolveTopupPurchase,
  suggestedTopups,
} from './packs.js'
import { PaymentVerifyError, verifyUsdgPayment } from './payments.js'
import {
  enrichPlushItem,
  getPlushItem,
  getPlushLine,
  getPlushMaker,
  listPlushItems,
  listPlushLines,
  listPlushMakers,
  plushStats,
  searchPlush,
} from './plush-catalog.js'
import {
  affiliatesConfig,
  enrichProduct,
  getBrand,
  getPrintMethod,
  getProduct,
  getProvider,
  listBrands,
  listPrintMethods,
  listProducts,
  listProviders,
  podStats,
  searchPod,
} from './pod-catalog.js'
import {
  peekPreview,
  previewIpFromHeaders,
  previewSearchMax,
  takePreview,
} from './preview-quota.js'
import { financeReport, walletHeld } from './finance.js'
import { clientIp, rateLimit } from './rate-limit.js'
import {
  acquireCatalogSlot,
  catalogPolicy,
  catalogUsageReport,
  dailyUsage,
  dayRetryAfter,
  recordCatalogDenial,
  releaseCatalogUsage,
  requiresEdgeProof,
  responseUnits,
  trustedEdge,
  usageSubject,
  type CatalogTier,
  type CatalogUsage,
} from './catalog-policy.js'
import {
  acceptContribution,
  appendContribution,
  appendReport,
  contributeKindsList,
  isContributeKind,
  normalizeContributeWallet,
  rejectContribution,
  validateContributionMetadata,
  validateContributionPayload,
  validateDatasetContribution,
  validateReport,
} from './reports.js'
import { getStatsPublic, recordRequest } from './request-stats.js'
import { createSearchCache } from './search-cache.js'
import {
  extractServiceKeyHeader,
  type ResolvedServiceAccount,
  resolveServiceAccount,
  serviceAllowsVertical,
} from './service-accounts.js'
import { resolveSku, resolveSkuMany, skuUri } from './sku.js'
import {
  createStripeCheckout,
  handleStripeWebhook,
  isStripeLive,
  stripePublicConfig,
  syncStripeCheckoutSession,
} from './stripe-pay.js'
import {
  enrichTcgCard,
  getTcgCard,
  getTcgGame,
  getTcgSet,
  listTcgCards,
  listTcgGames,
  listTcgSets,
  searchTcg,
  tcgFacets,
  tcgStats,
  tcgStatsByGame,
} from './tcg-catalog.js'
import {
  LIVE_VERTICALS,
  type LiveVertical,
  resolveVertical,
  VERTICAL_ALIASES,
  VERTICAL_META,
  VERTICALS,
} from './verticals.js'
import {
  createWalletNonce,
  extractSessionToken,
  getWalletSession,
  normalizeWallet,
  revokeWalletSession,
  verifyWalletSignature,
} from './wallet-auth.js'
import {
  buildRequestRequirements,
  settleVerifiedX402,
  verifyX402PayPerRequest,
  type X402VerifiedPayment,
  x402Enabled,
  x402FacilitatorUrl,
  x402PerRequestUsd,
} from './x402.js'

const VERSION = '0.7.0'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function agentDiscoveryBlock(rootDomain: string) {
  return {
    skill: '/SKILL.md',
    llms: '/llms.txt',
    llmsFull: '/llms-full.txt',
    openapi: '/openapi.json',
    /** Operator feedback queue — not catalog API. Same as human form. */
    feedback: 'POST /feedback',
    feedbackForm: `https://${rootDomain}/feedback`,
    contribute: 'POST /v1/contribute',
    datasets: 'GET /v1/datasets',
    verticals: 'GET /v1/verticals',
    sku: 'GET /v1/sku/:key · POST /v1/sku/resolve',
    wellKnown: '/.well-known/ai-plugin.json',
    mcp: '/mcp',
    rootDomain,
  }
}

/** Parse JSON or HTML form body into a plain object for report validation. */
async function readReportBody(
  c: Context,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
  const ct = (c.req.header('content-type') || '').toLowerCase()
  try {
    if (ct.includes('application/json')) {
      const raw = await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)
      if (!raw || typeof raw !== 'object') {
        return { ok: false, error: 'Invalid JSON body' }
      }
      return { ok: true, body: raw as Record<string, unknown> }
    }
    // HTML form (application/x-www-form-urlencoded or multipart)
    if (!c.req.header('content-length')) {
      return { ok: false, error: 'Form body length is required' }
    }
    if (contentLengthTooLarge(c.req.raw.headers, PUBLIC_INTAKE_MAX_BYTES)) {
      return { ok: false, error: 'Request body too large (max 256 KiB)' }
    }
    const fd = await c.req.parseBody()
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fd)) {
      if (typeof v === 'string') body[k] = v
    }
    // sources: comma-separated string → string[]
    if (typeof body.sources === 'string' && body.sources.trim()) {
      body.sources = body.sources
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
    // agent name from form → agent object (agents still send JSON)
    if (typeof body.agentName === 'string' && body.agentName.trim()) {
      body.agent = {
        name: body.agentName,
        ...(typeof body.agentUrl === 'string' ? { url: body.agentUrl } : {}),
      }
    }
    return { ok: true, body }
  } catch {
    return { ok: false, error: 'Could not parse body (use JSON or form fields)' }
  }
}

async function handleFeedbackPost(c: Context) {
  const ip = clientIp(c.req.raw.headers)
  const rl = rateLimit({
    key: `md:feedback:${ip}`,
    limit: Number(process.env.REPORT_RATE_LIMIT_PER_MIN ?? 5),
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
  }
  const parsed = await readReportBody(c)
  if (!parsed.ok) {
    return c.json({ error: 'VALIDATION', message: parsed.error }, 400)
  }
  // Default kind for simple form posts
  if (!parsed.body.kind) parsed.body.kind = 'correction'
  const validated = validateReport(parsed.body)
  if (!validated.ok) {
    return c.json({ error: 'VALIDATION', message: validated.error }, 400)
  }
  if (!validated.report.vertical) {
    validated.report.vertical = c.get('vertical') || 'anime'
  }
  let stored
  try {
    stored = await appendReport(validated.report, { ip })
  } catch (error) {
    if (error instanceof Error && error.message === 'REPORT_QUEUE_FULL') {
      return c.json({ error: 'QUEUE_BUSY', message: 'Feedback queue is busy; retry shortly.' }, 503)
    }
    console.error('[metadata] feedback persistence failed', error)
    return c.json({ error: 'PERSISTENCE_FAILED' }, 503)
  }
  console.info('[metadata] feedback queued', {
    id: stored.id,
    vertical: stored.vertical,
    entityId: stored.entityId,
    kind: stored.kind,
  })

  // Best-effort Combo quest forward (never blocks local queue)
  let combo: { ok: boolean; id?: string; error?: string; skipped?: boolean } = {
    ok: false,
    skipped: true,
  }
  try {
    const { forwardFeedbackToCombo } = await import('./combo-forward.js')
    combo = await forwardFeedbackToCombo(stored)
    if (combo.ok) {
      console.info('[metadata] feedback forwarded to Combo', {
        reportId: stored.id,
        questId: combo.id,
      })
    } else if (!combo.skipped) {
      console.warn('[metadata] Combo forward failed', combo.error)
    }
  } catch (e) {
    console.warn('[metadata] Combo forward skipped', e instanceof Error ? e.message : e)
  }

  const accept = (c.req.header('accept') || '').toLowerCase()
  const wantsHtml = accept.includes('text/html') && !accept.includes('application/json')
  // Browser form POST without Accept: application/json → redirect to form success
  if (wantsHtml || c.req.header('x-feedback-form') === '1') {
    const root = process.env.METADATA_ROOT_DOMAIN || 'metadata.fyi'
    const hub =
      process.env.METADATA_HUB_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.PORTLESS_URL ||
      (process.env.NODE_ENV === 'production' ? `https://${root}` : 'http://127.0.0.1:5177')
    return c.redirect(
      `${hub.replace(/\/$/, '')}/feedback?ok=1&id=${encodeURIComponent(stored.id)}`,
      303,
    )
  }
  return c.json(
    {
      accepted: true,
      persisted: true as const,
      status: 'queued' as const,
      id: stored.id,
      receivedAt: stored.receivedAt,
      combo:
        combo.ok || combo.skipped
          ? {
              forwarded: Boolean(combo.ok),
              questId: combo.id ?? null,
              skipped: Boolean(combo.skipped),
            }
          : { forwarded: false, error: combo.error ?? 'forward failed' },
      message:
        'Queued for operators. Catalog is not auto-updated. Same endpoint as the human feedback form (POST /feedback). Prefer data PRs for bulk fixes. When COMBO_* is configured, a Combo quest is opened for stewardship.',
      form: '/feedback',
    },
    202,
  )
}

function readRepoText(rel: string): string | null {
  try {
    const p = path.join(REPO_ROOT, rel)
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

export type MetadataRouterOptions = {
  corsOrigin?: string | string[]
  basePath?: string
  rootDomain?: string
}

type Vars = {
  vertical: LiveVertical
  wallet: string | null
  /** True only after the wallet signs the server-issued login challenge. */
  walletProven: boolean
  /** Used to distinguish a funded but spoofable address from preview access. */
  walletHasCredits: boolean
  /** Avoid reading the JSON ledger until a route actually needs paid access. */
  walletBalanceLoaded: boolean
  /** paid = credits; service = unlimited key; preview = free teaser; unpaid = blocked */
  tier: 'unpaid' | 'paid' | 'preview' | 'service'
  /** True when this request used a free preview slot */
  isPreview: boolean
  /** Preview quota reservation committed only after a successful response. */
  previewPending: { ip: string; vertical: string } | null
  catalogPending: {
    subject: string
    tier: CatalogTier
    wallet: string | null
    minimumCost: number
    dailyLimit: number
    publisher?: { wallet: string | null; payoutKey: string }
  } | null
  catalogRelease: (() => void) | null
  serviceAccount: ResolvedServiceAccount | null
  /** x402 is verified before the handler and settled only after a 2xx response. */
  x402Pending: X402VerifiedPayment | null
}

function paidLimitPerMin() {
  return paymentRatePerMin('PAID_RATE_LIMIT_PER_MIN', 300)
}
function paymentRatePerMin(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}
function maxPage() {
  return Number(process.env.MAX_LIMIT ?? process.env.PAID_MAX_LIMIT ?? 100)
}
function paymentRequiredBody(
  resource: string,
  opts?: { previewExhausted?: boolean; retryAfterSec?: number; x402Error?: string },
) {
  const previewExhausted = Boolean(opts?.previewExhausted)
  const perReq = x402PerRequestUsd()
  const accepts = buildRequestRequirements(resource, perReq) ?? []
  return {
    error: previewExhausted ? 'PREVIEW_EXHAUSTED' : 'PAYMENT_REQUIRED',
    message: previewExhausted
      ? 'Free preview for this catalog is used up. Buy credits or pay $0.01/request via x402 for full access.'
      : 'Catalog access needs prepaid credits (wallet) or x402 payment ($0.01/request USDG on Robinhood). Try free preview first.',
    preview: {
      exhausted: previewExhausted,
      note: 'Free preview is a limited teaser per catalog — not a free plan.',
    },
    retryAfterSec: opts?.retryAfterSec,
    x402: x402Enabled(),
    x402Version: 1,
    /** x402: $0.01 per request via Marian (Robinhood USDG) */
    accepts,
    accept: accepts,
    facilitator: x402Enabled()
      ? {
          url: x402FacilitatorUrl(),
          network: ROBINHOOD_USDG.network,
          asset: ROBINHOOD_USDG.symbol,
          perRequestUsd: perReq,
          note: 'Pay $0.01 USDG per request (X-PAYMENT) via Marian, or prepaid credits via Reown/Stripe claim.',
        }
      : undefined,
    x402Error: opts?.x402Error,
    topup: getTopupConfig(),
    packs: suggestedTopups(),
    claim: 'POST /v1/pay/claim { wallet, usdg|packId, txHash }',
    quote: 'GET /v1/pay/quote?usdg=',
    balance: 'GET /v1/pay/balance?wallet=0x…',
    pricing: '/pricing',
  }
}

/**
 * Metadata API router — prepaid credits + limited free preview per vertical.
 * Discovery (health, verticals, skill, openapi), preview status, and pay stay open.
 */
export function createMetadataRouter(opts: MetadataRouterOptions = {}) {
  const app = new Hono<{ Variables: Vars }>()
  const searchCache = createSearchCache<{ hits: unknown[]; total: number }>()
  const rootDomain = opts.rootDomain ?? process.env.METADATA_ROOT_DOMAIN ?? 'metadata.fyi'

  app.use(
    '*',
    cors({
      origin: opts.corsOrigin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      exposeHeaders: [
        'X-Metadata-Vertical',
        'X-Metadata-Tier',
        'X-Metadata-Service',
        'X-Metadata-Credits-Spent',
        'X-Metadata-Credits-Remaining',
        'X-Metadata-Units',
        'X-Metadata-Daily-Remaining',
        'X-Preview-Remaining',
        'X-Preview-Limit',
        'X-RateLimit-Remaining',
        'Retry-After',
      ],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Metadata-Session',
        'X-Metadata-Vertical',
        'X-Wallet-Address',
        'X-Metadata-Wallet',
        'X-Payment',
        'X-Service-Key',
        'X-Metadata-Service-Key',
      ],
    }),
  )

  app.use('*', async (c, next) => {
    const requestStartedAt = performance.now()
    // Edge rewrites Host to origin.*; prefer forwarded client host for vertical subdomains.
    const forwardedHost =
      c.req.header('x-forwarded-host') || c.req.header('x-original-host') || null
    const vertical = resolveVertical({
      host: forwardedHost || c.req.header('host'),
      header: c.req.header('x-metadata-vertical'),
      query: c.req.query('vertical'),
      rootDomain,
    })
    c.set('vertical', vertical)
    c.header('X-Metadata-Vertical', vertical)

    const walletHeader =
      c.req.header('x-wallet-address') || c.req.header('x-metadata-wallet') || null
    const headerWallet = normalizeWallet(walletHeader)
    const session = getWalletSession(extractSessionToken(c.req.raw.headers))
    const wallet = session?.wallet || headerWallet
    c.set('wallet', wallet)
    c.set('walletProven', Boolean(session))

    const serviceSecret = extractServiceKeyHeader(c.req.raw.headers)
    const serviceAccount = resolveServiceAccount(serviceSecret)
    c.set('serviceAccount', serviceAccount)

    const tier: 'unpaid' | 'paid' | 'preview' | 'service' =
      serviceAccount && (serviceAccount.ops || serviceAllowsVertical(serviceAccount, vertical))
        ? 'service'
        : 'unpaid'
    c.set('walletHasCredits', false)
    c.set('walletBalanceLoaded', false)
    c.set('tier', tier)
    c.set('isPreview', false)
    c.set('previewPending', null)
    c.set('x402Pending', null)
    c.set('catalogPending', null)
    c.set('catalogRelease', null)
    c.header('X-Metadata-Tier', tier === 'service' ? 'service' : tier)
    if (serviceAccount) {
      c.header('X-Metadata-Service', serviceAccount.id)
    }
    try {
      await next()

      const pendingCatalog = c.get('catalogPending')
      let usageReservation: CatalogUsage | null = null
      if (pendingCatalog && c.res.status >= 200 && c.res.status < 300) {
        try {
          const policy = catalogPolicy()
          const text = await c.res.clone().text()
          const bytes = Buffer.byteLength(text)
          const units = responseUnits(JSON.parse(text), bytes)
          if (bytes > policy.maxResponseBytes) {
            recordCatalogDenial('RESPONSE_TOO_LARGE')
            c.res = c.json(
              {
                error: 'RESPONSE_TOO_LARGE',
                message: 'Reduce limit or use a paginated endpoint.',
                maxBytes: policy.maxResponseBytes,
              },
              413,
            )
            c.set('x402Pending', null)
          } else if (c.get('x402Pending') && units > policy.x402MaxUnits) {
            recordCatalogDenial('X402_RESPONSE_LIMIT')
            c.res = c.json(
              {
                ...paymentRequiredBody(c.req.path),
                error: 'X402_RESPONSE_LIMIT',
                message: 'Reduce limit or use prepaid credits for this response.',
                maxUnits: policy.x402MaxUnits,
              },
              402,
            )
            c.set('x402Pending', null)
          } else {
            const cost =
              pendingCatalog.tier === 'paid' && !c.get('x402Pending')
                ? Math.max(pendingCatalog.minimumCost, units * policy.creditsPerUnit)
                : 0
            const usage = {
              subject: pendingCatalog.subject,
              tier: pendingCatalog.tier,
              units,
              bytes,
              limit: pendingCatalog.dailyLimit,
              day: new Date().toISOString().slice(0, 10),
            }
            const spent = await settleCatalogAccess({
              wallet: cost > 0 ? pendingCatalog.wallet : null,
              cost,
              usage,
              ...(pendingCatalog.publisher
                ? { publisher: { ...pendingCatalog.publisher, share: publisherExportShare(cost) } }
                : {}),
            })
            if (!spent.ok) {
              recordCatalogDenial(spent.reason)
              c.set('x402Pending', null)
              if (spent.reason === 'DAILY_QUOTA') {
                c.header('Retry-After', String(dayRetryAfter()))
                c.res = c.json(
                  {
                    error: 'DAILY_QUOTA',
                    message: 'Daily catalog budget reached.',
                    retryAfterSec: dayRetryAfter(),
                  },
                  429,
                )
              } else
                c.res = c.json({ ...paymentRequiredBody(c.req.path), requiredCredits: cost }, 402)
            } else {
              c.res.headers.set('X-Metadata-Units', String(units))
              c.res.headers.set(
                'X-Metadata-Daily-Remaining',
                String(pendingCatalog.dailyLimit - dailyUsage(pendingCatalog.subject)),
              )
              if (cost > 0) {
                c.res.headers.set('X-Metadata-Credits-Spent', String(cost))
                c.res.headers.set('X-Metadata-Credits-Remaining', String(spent.credits))
              }
              if (cost === 0) usageReservation = usage
            }
          }
        } catch {
          c.set('x402Pending', null)
          c.res = c.json({ error: 'READ_SETTLEMENT_FAILED', message: 'Retry the request.' }, 503)
        }
      }
      c.set('catalogPending', null)

      const pendingPreview = c.get('previewPending')
      c.set('previewPending', null)
      if (pendingPreview) {
        if (c.res.status >= 200 && c.res.status < 300) {
          const committed = takePreview(pendingPreview)
          if (!committed.ok) {
            const response = c.json(
              paymentRequiredBody(c.req.path, {
                previewExhausted: true,
                retryAfterSec: committed.retryAfterSec,
              }),
              402,
            )
            const headers = new Headers(response.headers)
            headers.set('X-Preview-Remaining', '0')
            headers.set('Retry-After', String(committed.retryAfterSec))
            c.res = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers,
            })
            c.res.headers.set('X-Preview-Remaining', '0')
            c.res.headers.set('Retry-After', String(committed.retryAfterSec))
          } else {
            const headers = new Headers(c.res.headers)
            headers.set('X-Preview-Remaining', String(committed.remaining))
            c.res = new Response(c.res.body, {
              status: c.res.status,
              statusText: c.res.statusText,
              headers,
            })
            c.res.headers.set('X-Preview-Remaining', String(committed.remaining))
          }
        }
      }

      // x402 authorization is deliberately two-phase: a successful catalog
      // response is required before the facilitator is asked to settle.
      const pendingX402 = c.get('x402Pending')
      if (pendingX402 && c.res.status >= 200 && c.res.status < 300) {
        const settled = await settleVerifiedX402(pendingX402)
        if (!settled.ok) {
          c.res = c.json(
            {
              error: settled.reason,
              message:
                settled.reason === 'PAYMENT_ALREADY_USED'
                  ? 'This payment authorization has already been used.'
                  : 'Payment status needs reconciliation. Do not submit a new payment until the operator checks it.',
            },
            settled.reason === 'PAYMENT_ALREADY_USED' ? 402 : 503,
          )
        } else {
          const headers = new Headers(c.res.headers)
          headers.set('X-Metadata-X402', '1')
          headers.set('X-Wallet-Address', pendingX402.wallet)
          c.res = new Response(c.res.body, {
            status: c.res.status,
            statusText: c.res.statusText,
            headers,
          })
        }
        c.set('x402Pending', null)
      }

      if (usageReservation && (c.res.status < 200 || c.res.status >= 300))
        releaseCatalogUsage(usageReservation)

      // Lightweight metrics (in-memory hour; disk rollup ~hourly)
      try {
        const pathOnly = new URL(c.req.url).pathname
        // Skip OPTIONS noise
        if (c.req.method !== 'OPTIONS') {
          recordRequest({
            method: c.req.method,
            path: pathOnly,
            status: c.res.status,
            vertical: c.get('vertical'),
            paid: c.get('tier') === 'paid',
            wallet: c.get('wallet'),
            durationMs: performance.now() - requestStartedAt,
          })
        }
      } catch {
        /* ignore metrics errors */
      }
    } finally {
      c.get('catalogRelease')?.()
      c.set('catalogRelease', null)
    }
  })

  /** Clamp list/search page size; free preview gets a smaller cap. */
  function pageLimit(c: Context<{ Variables: Vars }>, requested: number): number {
    let limit = Math.min(Math.max(1, requested), maxPage())
    if (c.get('isPreview')) {
      limit = Math.min(limit, previewSearchMax())
    }
    return limit
  }

  /**
   * Catalog gate — paid credits, or limited free preview per vertical.
   * Export-style routes (`cost > 0`) always require paid credits (not preview).
   * `previewVertical` overrides the preview-quota key only (not `c.get('vertical')`).
   */
  async function gate(
    c: Context<{ Variables: Vars }>,
    optsGate: { cost?: number; previewVertical?: string } = {},
  ): Promise<Response | null> {
    // Catalog responses depend on credentials and quotas; shared caches must
    // never turn a paid response into an unauthenticated catalog delivery.
    c.header('Cache-Control', 'private, no-store')
    if (c.req.method === 'HEAD') return c.json({ error: 'CATALOG_METHOD_UNSUPPORTED' }, 405)
    if (requiresEdgeProof() && !trustedEdge(c.req.raw.headers)) {
      return c.json({ error: 'EDGE_REQUIRED', message: 'Use the public Metadata endpoint.' }, 403)
    }
    const policy = catalogPolicy()
    const suppliedServiceKey = extractServiceKeyHeader(c.req.raw.headers)
    const account = c.get('serviceAccount')
    if (suppliedServiceKey && !account) return c.json({ error: 'INVALID_SERVICE_KEY' }, 401)
    if (account && !serviceAllowsVertical(account, c.get('vertical')))
      return c.json({ error: 'VERTICAL_FORBIDDEN' }, 403)
    const catalogIp = previewIpFromHeaders(c.req.raw.headers)
    const ipLimit = rateLimit({
      key: `md:catalog-ip:${catalogIp}`,
      limit: policy.ipPerMinute,
      windowMs: 60_000,
    })
    if (!ipLimit.ok) {
      recordCatalogDenial('IP_RATE_LIMIT')
      c.header('Retry-After', String(ipLimit.retryAfterSec))
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: ipLimit.retryAfterSec }, 429)
    }
    const identity = c.get('serviceAccount')
      ? `service:${c.get('serviceAccount')!.id}`
      : c.get('walletProven')
        ? `wallet:${c.get('wallet')}`
        : `ip:${catalogIp}`
    const release = acquireCatalogSlot(usageSubject(identity))
    if (!release) {
      recordCatalogDenial('CONCURRENCY_LIMIT')
      c.header('Retry-After', '1')
      return c.json({ error: 'CONCURRENCY_LIMIT', retryAfterSec: 1 }, 429)
    }
    c.set('catalogRelease', release)
    const balanceWallet = c.get('wallet')
    if (balanceWallet && c.get('walletProven') && walletHeld(balanceWallet))
      return c.json({ error: 'ACCOUNT_ON_HOLD' }, 403)
    if (balanceWallet && c.get('tier') !== 'service') {
      if (!c.get('walletBalanceLoaded')) {
        const walletHasCredits = (await getBalance(balanceWallet)) > 0
        c.set('walletHasCredits', walletHasCredits)
        c.set('walletBalanceLoaded', true)
        if (c.get('walletProven') && walletHasCredits) {
          c.set('tier', 'paid')
        }
      }
    }
    let wallet = c.get('wallet')
    let tier = c.get('tier')
    const cost = optsGate.cost ?? 0
    const vertical = c.get('vertical')
    const ip = previewIpFromHeaders(c.req.raw.headers)
    const serviceAccount = c.get('serviceAccount')
    function prepareCatalog(
      tier: CatalogTier,
      identity: string,
      dailyLimit: number,
    ): Response | null {
      const subject = usageSubject(identity)
      if (dailyUsage(subject) >= dailyLimit) {
        recordCatalogDenial('DAILY_QUOTA')
        c.header('Retry-After', String(dayRetryAfter()))
        return c.json({ error: 'DAILY_QUOTA', retryAfterSec: dayRetryAfter() }, 429)
      }
      c.set('catalogPending', { subject, tier, wallet, minimumCost: cost, dailyLimit })
      return null
    }

    // x402 is available for zero-cost reads only. Exports remain prepaid-only.
    // Verify now, then settle in the outer middleware after a 2xx response.
    if (cost === 0 && tier !== 'service' && tier !== 'paid' && x402Enabled()) {
      const resource = new URL(c.req.url).pathname
      const x402 = await verifyX402PayPerRequest({
        headers: c.req.raw.headers,
        resource,
      })
      if (x402 && x402.ok === false) {
        return c.json(paymentRequiredBody(resource, { x402Error: x402.reason }), 402)
      }
      if (x402 && x402.ok === true) {
        wallet = x402.payment.wallet
        if (walletHeld(wallet)) return c.json({ error: 'ACCOUNT_ON_HOLD' }, 403)
        tier = 'paid'
        c.set('wallet', wallet)
        c.set('walletProven', true)
        c.set('walletHasCredits', true)
        c.set('walletBalanceLoaded', true)
        c.set('tier', 'paid')
        c.set('isPreview', false)
        c.set('x402Pending', x402.payment)
        c.header('X-Metadata-Tier', 'paid')
        c.header('X-Wallet-Address', wallet)
      }
    }

    // First-party unlimited service keys (OpenClaw, MysteryGift, MAID, PointBlank, …)
    if (tier === 'service' && serviceAccount) {
      if (!serviceAllowsVertical(serviceAccount, vertical)) {
        return c.json(
          {
            error: 'VERTICAL_FORBIDDEN',
            message: `Service account ${serviceAccount.id} cannot access vertical ${vertical}`,
          },
          403,
        )
      }
      const limit = serviceAccount.rateLimitPerMin
      const rl = rateLimit({
        key: `md:svc:${serviceAccount.id}`,
        limit,
        windowMs: 60_000,
      })
      c.header('X-RateLimit-Remaining', String(rl.remaining))
      if (!rl.ok) {
        return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
      }
      c.set('isPreview', false)
      c.header('X-Metadata-Tier', 'service')
      // First-party keys receive a bounded internal catalog budget.
      return prepareCatalog(
        'service',
        `service:${serviceAccount.id}`,
        Math.min(policy.serviceDailyUnits, serviceAccount.dailyUnits),
      )
    }

    // Exports always need a funded wallet (service handled above)
    if (cost > 0) {
      if (!wallet) {
        return c.json(paymentRequiredBody(c.req.path), 402)
      }
      if (!c.get('walletProven')) {
        return c.json({ error: 'AUTH_REQUIRED', message: 'Sign in with wallet session' }, 401)
      }
      if (tier !== 'paid') return c.json(paymentRequiredBody(c.req.path), 402)
      const limit = paidLimitPerMin()
      const rl = rateLimit({
        key: `md:wallet:${wallet}`,
        limit,
        windowMs: 60_000,
      })
      c.header('X-RateLimit-Remaining', String(rl.remaining))
      if (!rl.ok) {
        return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
      }
      c.set('isPreview', false)
      return prepareCatalog('paid', `wallet:${wallet}`, policy.paidDailyUnits)
    }

    // A bare funded address must not be able to masquerade as a paid wallet.
    // Addresses without credits may still use the normal public preview path.
    if (wallet && !c.get('walletProven') && c.get('walletHasCredits')) {
      return c.json({ error: 'AUTH_REQUIRED', message: 'Sign in with wallet session' }, 401)
    }

    // Paid path — full catalog
    if (tier === 'paid' && wallet) {
      const limit = paidLimitPerMin()
      const rl = rateLimit({
        key: `md:wallet:${wallet}`,
        limit,
        windowMs: 60_000,
      })
      c.header('X-RateLimit-Remaining', String(rl.remaining))
      if (!rl.ok) {
        return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
      }
      c.set('isPreview', false)
      c.header('X-Metadata-Tier', 'paid')
      return prepareCatalog('paid', `wallet:${wallet}`, policy.paidDailyUnits)
    }

    if (policy.fixedPreview)
      return c.json(
        {
          ...paymentRequiredBody(c.req.path),
          previewUrl: '/v1/preview',
          message: 'Use the fixed preview sample, or pay for catalog reads.',
        },
        402,
      )

    // Light abuse cap on free previews
    const rl = rateLimit({
      key: `md:preview:${ip}`,
      limit: 30,
      windowMs: 60_000,
    })
    c.header('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.ok) {
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
    }

    // Check the short-window abuse limit before reserving the longer-lived
    // preview slot. A 429 must not burn a user's preview.
    const previewVertical = optsGate.previewVertical ?? vertical
    const prev = peekPreview({ ip, vertical: previewVertical })
    if (prev.remaining <= 0) {
      c.header('X-Preview-Remaining', '0')
      c.header('Retry-After', String(prev.retryAfterSec ?? 3600))
      return c.json(
        paymentRequiredBody(c.req.path, {
          previewExhausted: true,
          retryAfterSec: prev.retryAfterSec ?? 3600,
        }),
        402,
      )
    }

    c.set('previewPending', { ip, vertical: previewVertical })
    c.set('tier', 'preview')
    c.set('isPreview', true)
    c.header('X-Metadata-Tier', 'preview')
    c.header('X-Preview-Remaining', String(prev.remaining))
    c.header('X-Preview-Limit', String(prev.limit))
    return prepareCatalog('preview', `preview-ip:${ip}`, policy.previewDailyUnits)
  }

  const registerCatalog = (base: string) => {
    app.get(`${base}/health`, async (c) => {
      const v = c.get('vertical')
      if (v === 'pod') {
        const p = podStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: p.products,
          characters: p.colors,
          logos: p.providers,
          products: p.products,
          brands: p.brands,
          providers: p.providers,
          colors: p.colors,
          printMethods: p.printMethods,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'tcg') {
        const t = tcgStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: t.sets,
          characters: t.cards,
          logos: t.games,
          sets: t.sets,
          cards: t.cards,
          games: t.games,
          byGame: tcgStatsByGame(),
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'figures') {
        const f = figureStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: f.lines,
          characters: f.items,
          logos: f.makers,
          items: f.items,
          makers: f.makers,
          lines: f.lines,
          byKind: f.byKind,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'modelkits') {
        const m = modelkitStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: m.lines,
          characters: m.items,
          logos: m.makers,
          items: m.items,
          makers: m.makers,
          lines: m.lines,
          byKind: m.byKind,
          byGrade: m.byGrade,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'plush') {
        const p = plushStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: p.lines,
          characters: p.items,
          logos: p.makers,
          items: p.items,
          makers: p.makers,
          lines: p.lines,
          byKind: p.byKind,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'fashion') {
        const s = fashionStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: s.lines,
          characters: s.items,
          logos: s.brands,
          items: s.items,
          brands: s.brands,
          lines: s.lines,
          upcoming: s.upcoming,
          byCategory: s.byCategory,
          byBrand: s.byBrand,
          byKind: s.byKind,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'boardgames') {
        const b = boardGameStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: b.games,
          characters: b.publishers,
          logos: b.categories,
          games: b.games,
          publishers: b.publishers,
          categories: b.categories,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'ost') {
        const o = ostStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: o.albums,
          characters: o.artists,
          logos: 0,
          albums: o.albums,
          artists: o.artists,
          byMedia: o.byMedia,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'consoles') {
        const x = consoleStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: x.consoles,
          characters: x.manufacturers,
          logos: 0,
          consoles: x.consoles,
          manufacturers: x.manufacturers,
          byFormFactor: x.byFormFactor,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      if (v === 'esports') {
        const e = esportsStats()
        return c.json({
          ok: true as const,
          service: 'metadata' as const,
          ready: true as const,
          version: VERSION,
          vertical: v,
          series: e.titles,
          characters: e.players,
          logos: e.teams,
          titles: e.titles,
          leagues: e.leagues,
          teams: e.teams,
          players: e.players,
          openSource: true as const,
          x402: x402Enabled(),
        })
      }
      const s = stats(v)
      return c.json({
        ok: true as const,
        service: 'metadata' as const,
        ready: true as const,
        version: VERSION,
        vertical: v,
        series: s.series,
        characters: s.characters,
        logos: s.logos,
        openSource: true as const,
        x402: x402Enabled(),
      })
    })

    app.get(`${base}/series`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listSeries(v, {
          q: c.req.query('q'),
          type: c.req.query('type'),
          tag: c.req.query('tag'),
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/series/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      const s = getSeries(v, c.req.param('id'))
      if (!s) return c.json({ error: 'Series not found' }, 404)
      const relatedOst =
        v === 'anime' || v === 'game' || v === 'manga' || v === 'cartoons'
          ? albumsForSeries(s.slug).map((a) => ({
              id: a.id,
              title: a.title,
              type: a.type,
              year: a.year,
              mediaVertical: a.mediaVertical,
            }))
          : []
      const series =
        relatedOst.length && !s.ostAlbumIds?.length
          ? { ...s, ostAlbumIds: relatedOst.map((a) => a.id) }
          : s
      const shopQuery =
        [s.title, ...(s.aliases || []).slice(0, 2)].filter(Boolean).join(' ') || s.title
      const shops = shopsForEntity({ vertical: v, query: shopQuery })
      const merch = isMediaVertical(v)
        ? merchForSeries({ seriesId: s.id, seriesSlug: s.slug, vertical: v })
        : undefined
      return c.json({
        series,
        sku: skuUri(v, 'series', s.id),
        logos: logosForSeries(v, s.id),
        soundtracks: relatedOst,
        ...(merch ? { merch } : {}),
        links: {
          shop: shops,
        },
        affiliates: shops.map((x) => ({
          id: x.partnerId,
          name: x.name,
          affiliateUrl: x.isAffiliate ? x.shopUrl : null,
          website: x.website,
          isConfigured: x.isAffiliate,
        })),
      })
    })

    app.get(`${base}/series/:id/characters`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      const s = getSeries(v, c.req.param('id'))
      if (!s) return c.json({ error: 'Series not found' }, 404)
      const limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      const requestedOffset = Number(c.req.query('offset') ?? 0)
      const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0
      const all = seriesCharacters(v, s.id)
      const characters = all.slice(offset, offset + limit)
      return c.json({
        seriesId: s.id,
        characters,
        total: all.length,
        limit,
        offset,
      })
    })

    app.get(`${base}/series/:id/logos`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      const s = getSeries(v, c.req.param('id'))
      if (!s) return c.json({ error: 'Series not found' }, 404)
      return c.json({ seriesId: s.id, logos: logosForSeries(v, s.id) })
    })

    app.get(`${base}/characters`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listCharacters(v, {
          q: c.req.query('q'),
          series: c.req.query('series'),
          tag: c.req.query('tag'),
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/characters/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      const ch = getCharacter(v, c.req.param('id'))
      if (!ch) return c.json({ error: 'Character not found' }, 404)
      const series = getSeries(v, ch.seriesId) ?? null
      const logos = series ? logosForSeries(v, series.id) : []
      const shopQuery = [ch.name, ch.seriesTitle, series?.title].filter(Boolean).join(' ')
      const shops = shopsForEntity({
        vertical: v,
        query: shopQuery || ch.name,
      })
      const merch =
        series && isMediaVertical(v)
          ? merchForCharacter({
              seriesId: series.id,
              seriesSlug: series.slug,
              vertical: v,
              characterName: ch.name,
            })
          : undefined
      return c.json({
        character: ch,
        sku: skuUri(v, 'characters', ch.id),
        series,
        ...(merch ? { merch } : {}),
        links: {
          shop: shops,
        },
        affiliates: shops.map((x) => ({
          id: x.partnerId,
          name: x.name,
          affiliateUrl: x.isAffiliate ? x.shopUrl : null,
          website: x.website,
          isConfigured: x.isAffiliate,
        })),
        logos,
        copy: {
          danbooruLine: characterDanbooruLine(ch),
          tags: ch.tags.join(' '),
          name: ch.name,
          id: ch.id,
        },
      })
    })

    app.get(`${base}/search`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      const limit = pageLimit(c, Number(c.req.query('limit') ?? 20))
      const rawOffset = Number(c.req.query('offset') ?? 0)
      const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0
      const q = c.req.query('q') ?? ''
      const preview = c.get('isPreview') ? true : undefined
      const cacheKey = `${v}|${q.trim().toLowerCase()}|${limit}|${offset}`
      const cached = searchCache.get(cacheKey)
      const result =
        cached ??
        searchCache.set(
          cacheKey,
          v === 'pod'
            ? searchPod(q, limit, offset)
            : v === 'tcg'
              ? searchTcg(q, limit, offset)
              : v === 'figures'
                ? searchFigures(q, limit, offset)
                : v === 'modelkits'
                  ? searchModelkits(q, limit, offset)
                  : v === 'plush'
                    ? searchPlush(q, limit, offset)
                    : v === 'fashion'
                      ? searchFashion(q, limit, offset)
                      : v === 'boardgames'
                        ? searchBoardGames(q, limit, offset)
                        : v === 'ost'
                          ? searchOst(q, limit, offset)
                          : v === 'consoles'
                            ? searchConsoles(q, limit, offset)
                            : v === 'esports'
                              ? searchEsports(q, limit, offset)
                              : search(v, q, limit, offset),
        )
      return c.json({
        query: q,
        vertical: v,
        preview,
        hits: result.hits,
        total: result.total,
        limit,
        offset,
      })
    })

    // —— TCG ——
    app.get(`${base}/tcg/games`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'Use X-Metadata-Vertical: tcg' }, 400)
      }
      return c.json({ items: listTcgGames(), byGame: tcgStatsByGame() })
    })

    app.get(`${base}/tcg/facets`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'TCG vertical only' }, 400)
      }
      const game = c.req.query('game')
      if (!game) return c.json({ error: 'game query parameter is required' }, 400)
      const facets = tcgFacets(game)
      if (!facets) return c.json({ error: 'Game not found' }, 404)
      return c.json(facets)
    })

    app.get(`${base}/tcg/games/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'TCG vertical only' }, 400)
      }
      const g = getTcgGame(c.req.param('id'))
      if (!g) return c.json({ error: 'Game not found' }, 404)
      const sets = listTcgSets({ game: g.id, limit: pageLimit(c, 100) })
      return c.json({ game: g, sets: sets.items, stats: tcgStatsByGame()[g.id] })
    })

    app.get(`${base}/tcg/sets`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'TCG vertical only' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listTcgSets({
          game: c.req.query('game') || undefined,
          language: c.req.query('language') || undefined,
          q: c.req.query('q'),
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/tcg/sets/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'TCG vertical only' }, 400)
      }
      const s = getTcgSet(c.req.param('id'))
      if (!s) return c.json({ error: 'Set not found' }, 404)
      const limit = pageLimit(c, Number(c.req.query('limit') ?? 100))
      const offset = Number(c.req.query('offset') ?? 0)
      const cards = listTcgCards({
        set: s.code,
        game: s.gameId,
        limit,
        offset,
      })
      return c.json({
        set: s,
        cards: cards.items,
        totalCards: cards.total,
        limit: cards.limit,
        offset: cards.offset,
      })
    })

    app.get(`${base}/tcg/cards`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'TCG vertical only' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listTcgCards({
          language: c.req.query('language') || undefined,
          game: c.req.query('game') || undefined,
          set: c.req.query('set') || undefined,
          q: c.req.query('q'),
          rarity: c.req.query('rarity') || undefined,
          type: c.req.query('type') || undefined,
          subtype: c.req.query('subtype') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/tcg/cards/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'tcg') {
        return c.json({ error: 'TCG vertical only' }, 400)
      }
      const card = getTcgCard(c.req.param('id'))
      if (!card) return c.json({ error: 'Card not found' }, 404)
      const body = enrichTcgCard(card)
      const quotes = quoteForCatalogCard(card.id) || undefined
      return c.json({
        ...body,
        quotes,
      })
    })

    app.get(`${base}/market/coverage`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      return c.json(coverageReport())
    })

    app.get(`${base}/market/status`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      return c.json(marketStatus())
    })

    app.get(`${base}/market/search`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      return c.json(
        searchMarket({
          kind: c.req.query('kind') || undefined,
          game: c.req.query('game') || undefined,
          q: c.req.query('q') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/market/items/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const record = getMarketRecord(c.req.param('id'))
      if (!record) return c.json({ error: 'Market item not found' }, 404)
      return c.json(record)
    })

    app.get(`${base}/market/quotes/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const record = getMarketRecord(c.req.param('id'))
      if (!record?.quote) return c.json({ error: 'Market quotes not found' }, 404)
      return c.json(record.quote)
    })

    app.get(`${base}/market/history/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const record = getMarketRecord(c.req.param('id'))
      if (!record) return c.json({ error: 'Market item not found' }, 404)
      return c.json({
        itemId: record.item.id,
        items: historyForItem(
          record.item.id,
          c.req.query('variant') || undefined,
          Number(c.req.query('limit') ?? 20),
        ),
      })
    })

    // Convenience aliases
    app.get(`${base}/cards`, async (c) => {
      c.set('vertical', 'tcg')
      c.header('X-Metadata-Vertical', 'tcg')
      const denied = await gate(c, {})
      if (denied) return denied
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listTcgCards({
          game: c.req.query('game') || undefined,
          set: c.req.query('set') || undefined,
          q: c.req.query('q'),
          rarity: c.req.query('rarity') || undefined,
          type: c.req.query('type') || undefined,
          subtype: c.req.query('subtype') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/cards/:id`, async (c) => {
      c.set('vertical', 'tcg')
      c.header('X-Metadata-Vertical', 'tcg')
      const denied = await gate(c, {})
      if (denied) return denied
      const card = getTcgCard(c.req.param('id'))
      if (!card) return c.json({ error: 'Card not found' }, 404)
      return c.json(enrichTcgCard(card))
    })

    // —— POD / blanks ——
    app.get(`${base}/products`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'Use X-Metadata-Vertical: pod (or host pod.* / blanks.*)' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listProducts({
          q: c.req.query('q'),
          brand: c.req.query('brand'),
          category: c.req.query('category'),
          provider: c.req.query('provider'),
          tag: c.req.query('tag'),
          method: c.req.query('method') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/products/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'Use X-Metadata-Vertical: pod (or host pod.* / blanks.*)' }, 400)
      }
      const p = getProduct(c.req.param('id'))
      if (!p) return c.json({ error: 'Product not found' }, 404)
      return c.json(enrichProduct(p))
    })

    app.get(`${base}/brands`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'POD vertical only' }, 400)
      }
      return c.json(
        listBrands({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/brands/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'POD vertical only' }, 400)
      }
      const b = getBrand(c.req.param('id'))
      if (!b) return c.json({ error: 'Brand not found' }, 404)
      const products = listProducts({ brand: b.id, limit: pageLimit(c, 100) })
      return c.json({ brand: b, products: products.items })
    })

    app.get(`${base}/providers`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'POD vertical only' }, 400)
      }
      return c.json({ items: listProviders() })
    })

    app.get(`${base}/providers/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'POD vertical only' }, 400)
      }
      const p = getProvider(c.req.param('id'))
      if (!p) return c.json({ error: 'Provider not found' }, 404)
      return c.json({ provider: p })
    })

    app.get(`${base}/affiliates`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      // ?legacy=pod → old POD-only map
      if (c.req.query('legacy') === 'pod' || c.req.query('format') === 'pod') {
        return c.json(affiliatesConfig())
      }
      // Explicit ?vertical= filters; else use request vertical if non-default;
      // bare GET returns full registry.
      const qVert = c.req.query('vertical')?.trim() || null
      const headerVert = c.get('vertical')
      const filterVert = qVert || (headerVert && headerVert !== 'anime' ? headerVert : undefined)
      const body = affiliatesPublicConfig(filterVert)
      const configuredOnly =
        c.req.query('configured') === '1' || c.req.query('configured') === 'true'
      const partners = configuredOnly ? body.partners.filter((p) => p.isConfigured) : body.partners
      return c.json({
        ...body,
        partners,
        total: partners.length,
        configured: body.partners.filter((p) => p.isConfigured).length,
        podProviders: affiliatesConfig().providers,
      })
    })

    app.get(`${base}/print-methods`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'POD vertical only' }, 400)
      }
      return c.json(
        listPrintMethods({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/print-methods/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'pod') {
        return c.json({ error: 'POD vertical only' }, 400)
      }
      const m = getPrintMethod(c.req.param('id'))
      if (!m) return c.json({ error: 'Print method not found' }, 404)
      const products = listProducts({ method: m.id, limit: pageLimit(c, 100) })
      return c.json({ method: m, products: products.items, total: products.total })
    })

    // —— Figures / merch ——
    app.get(`${base}/figures/makers`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'figures') {
        return c.json({ error: 'Use X-Metadata-Vertical: figures' }, 400)
      }
      return c.json(
        listFigureMakers({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/figures/makers/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'figures') {
        return c.json({ error: 'Figures vertical only' }, 400)
      }
      const m = getFigureMaker(c.req.param('id'))
      if (!m) return c.json({ error: 'Maker not found' }, 404)
      const lines = listFigureLines({ maker: m.id, limit: pageLimit(c, 100) })
      const items = listFigureItems({ maker: m.id, limit: pageLimit(c, 40) })
      return c.json({
        maker: m,
        lines: lines.items,
        items: items.items,
        totalItems: items.total,
      })
    })

    app.get(`${base}/figures/lines`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'figures') {
        return c.json({ error: 'Figures vertical only' }, 400)
      }
      return c.json(
        listFigureLines({
          q: c.req.query('q'),
          maker: c.req.query('maker') || undefined,
          kind: c.req.query('kind') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/figures/lines/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'figures') {
        return c.json({ error: 'Figures vertical only' }, 400)
      }
      const line = getFigureLine(c.req.param('id'))
      if (!line) return c.json({ error: 'Line not found' }, 404)
      const maker = getFigureMaker(line.makerId) ?? null
      const items = listFigureItems({ line: line.id, limit: pageLimit(c, 40) })
      return c.json({
        line,
        maker,
        items: items.items,
        totalItems: items.total,
      })
    })

    app.get(`${base}/figures/items`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'figures') {
        return c.json({ error: 'Figures vertical only' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listFigureItems({
          q: c.req.query('q'),
          maker: c.req.query('maker') || undefined,
          line: c.req.query('line') || undefined,
          kind: c.req.query('kind') || undefined,
          series: c.req.query('series') || undefined,
          tag: c.req.query('tag') || undefined,
          release: c.req.query('release') || undefined,
          sort: c.req.query('sort') || undefined,
          order: (c.req.query('order') as 'asc' | 'desc') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/figures/items/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'figures') {
        return c.json({ error: 'Figures vertical only' }, 400)
      }
      const item = getFigureItem(c.req.param('id'))
      if (!item) return c.json({ error: 'Item not found' }, 404)
      return c.json(enrichFigureItem(item))
    })

    // —— Model kits / Gunpla ——
    app.get(`${base}/modelkits/makers`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'modelkits') {
        return c.json({ error: 'Use X-Metadata-Vertical: modelkits' }, 400)
      }
      return c.json(
        listModelkitMakers({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })
    app.get(`${base}/modelkits/makers/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'modelkits') {
        return c.json({ error: 'Model kits vertical only' }, 400)
      }
      const maker = getModelkitMaker(c.req.param('id'))
      if (!maker) return c.json({ error: 'Maker not found' }, 404)
      const lines = listModelkitLines({ maker: maker.id, limit: pageLimit(c, 40) })
      return c.json({ maker, lines: lines.items, totalLines: lines.total })
    })
    app.get(`${base}/modelkits/lines`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'modelkits') {
        return c.json({ error: 'Model kits vertical only' }, 400)
      }
      return c.json(
        listModelkitLines({
          q: c.req.query('q'),
          maker: c.req.query('maker') || undefined,
          kind: c.req.query('kind') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })
    app.get(`${base}/modelkits/lines/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'modelkits') {
        return c.json({ error: 'Model kits vertical only' }, 400)
      }
      const line = getModelkitLine(c.req.param('id'))
      if (!line) return c.json({ error: 'Line not found' }, 404)
      const maker = getModelkitMaker(line.makerId) ?? null
      const items = listModelkitItems({ line: line.id, limit: pageLimit(c, 40) })
      return c.json({
        line,
        maker,
        items: items.items,
        totalItems: items.total,
      })
    })
    app.get(`${base}/modelkits/items`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'modelkits') {
        return c.json({ error: 'Model kits vertical only' }, 400)
      }
      return c.json(
        listModelkitItems({
          q: c.req.query('q'),
          maker: c.req.query('maker') || undefined,
          line: c.req.query('line') || undefined,
          kind: c.req.query('kind') || undefined,
          grade: c.req.query('grade') || undefined,
          series: c.req.query('series') || undefined,
          tag: c.req.query('tag') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })
    app.get(`${base}/modelkits/items/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'modelkits') {
        return c.json({ error: 'Model kits vertical only' }, 400)
      }
      const item = getModelkitItem(c.req.param('id'))
      if (!item) return c.json({ error: 'Item not found' }, 404)
      return c.json(enrichModelkitItem(item))
    })

    // —— Board games ——
    app.get(`${base}/boardgames`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'boardgames') {
        return c.json(
          { error: 'Use X-Metadata-Vertical: boardgames (or host boardgames.* / bgg.*)' },
          400,
        )
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listBoardGames({
          q: c.req.query('q'),
          publisher: c.req.query('publisher') || undefined,
          category: c.req.query('category') || undefined,
          mechanic: c.req.query('mechanic') || undefined,
          players: c.req.query('players') ? Number(c.req.query('players')) : undefined,
          tag: c.req.query('tag') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/boardgames/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'boardgames') {
        return c.json({ error: 'Board games vertical only' }, 400)
      }
      const g = getBoardGame(c.req.param('id'))
      if (!g) return c.json({ error: 'Board game not found' }, 404)
      return c.json(enrichBoardGame(g))
    })

    app.get(`${base}/publishers`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'boardgames') {
        return c.json({ error: 'Board games vertical only' }, 400)
      }
      return c.json(
        listBoardGamePublishers({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/publishers/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'boardgames') {
        return c.json({ error: 'Board games vertical only' }, 400)
      }
      const p = getBoardGamePublisher(c.req.param('id'))
      if (!p) return c.json({ error: 'Publisher not found' }, 404)
      const games = listBoardGames({ publisher: p.id, limit: pageLimit(c, 40) })
      return c.json({ publisher: p, games: games.items, total: games.total })
    })

    // —— Plush / Fumo ——
    app.get(`${base}/plush/makers`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'plush') {
        return c.json({ error: 'Use X-Metadata-Vertical: plush' }, 400)
      }
      return c.json(
        listPlushMakers({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/plush/makers/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'plush') {
        return c.json({ error: 'Plush vertical only' }, 400)
      }
      const m = getPlushMaker(c.req.param('id'))
      if (!m) return c.json({ error: 'Maker not found' }, 404)
      const plines = listPlushLines({ maker: m.id, limit: pageLimit(c, 100) })
      const pitems = listPlushItems({ maker: m.id, limit: pageLimit(c, 40) })
      return c.json({
        maker: m,
        lines: plines.items,
        items: pitems.items,
        totalItems: pitems.total,
      })
    })

    app.get(`${base}/plush/lines`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'plush') {
        return c.json({ error: 'Plush vertical only' }, 400)
      }
      return c.json(
        listPlushLines({
          q: c.req.query('q'),
          maker: c.req.query('maker') || undefined,
          kind: c.req.query('kind') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/plush/lines/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'plush') {
        return c.json({ error: 'Plush vertical only' }, 400)
      }
      const line = getPlushLine(c.req.param('id'))
      if (!line) return c.json({ error: 'Line not found' }, 404)
      const maker = getPlushMaker(line.makerId) ?? null
      const pitems = listPlushItems({ line: line.id, limit: pageLimit(c, 40) })
      return c.json({
        line,
        maker,
        items: pitems.items,
        totalItems: pitems.total,
      })
    })

    app.get(`${base}/plush/items`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'plush') {
        return c.json({ error: 'Use X-Metadata-Vertical: plush (or fumo.*)' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listPlushItems({
          q: c.req.query('q'),
          maker: c.req.query('maker') || undefined,
          line: c.req.query('line') || undefined,
          kind: c.req.query('kind') || undefined,
          series: c.req.query('series') || undefined,
          tag: c.req.query('tag') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/plush/items/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'plush') {
        return c.json({ error: 'Plush vertical only' }, 400)
      }
      const item = getPlushItem(c.req.param('id'))
      if (!item) return c.json({ error: 'Item not found' }, 404)
      return c.json(enrichPlushItem(item))
    })

    const isFashionVertical = (v: string) => v === 'fashion'

    // —— Fashion (footwear / apparel / outerwear / accessories / watches) ——
    app.get(`${base}/fashion/categories`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Use X-Metadata-Vertical: fashion' }, 400)
      }
      return c.json({
        vertical: 'fashion',
        categories: fashionCategories(),
        stats: fashionStats(),
      })
    })

    app.get(`${base}/fashion/brands`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Use X-Metadata-Vertical: fashion' }, 400)
      }
      return c.json(
        listFashionBrands({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/fashion/brands/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Fashion vertical only' }, 400)
      }
      const brand = getFashionBrand(c.req.param('id'))
      if (!brand) return c.json({ error: 'Brand not found' }, 404)
      const flines = listFashionLines({ brand: brand.id, limit: pageLimit(c, 100) })
      const fitems = listFashionItems({ brand: brand.id, limit: pageLimit(c, 40) })
      return c.json({
        brand,
        lines: flines.items,
        items: fitems.items,
        totalItems: fitems.total,
      })
    })

    app.get(`${base}/fashion/lines`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Fashion vertical only' }, 400)
      }
      return c.json(
        listFashionLines({
          q: c.req.query('q'),
          brand: c.req.query('brand') || undefined,
          category: c.req.query('category') || undefined,
          kind: c.req.query('kind') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/fashion/lines/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Fashion vertical only' }, 400)
      }
      const line = getFashionLine(c.req.param('id'))
      if (!line) return c.json({ error: 'Line not found' }, 404)
      const brand = getFashionBrand(line.brandId) ?? null
      const fitems = listFashionItems({ line: line.id, limit: pageLimit(c, 40) })
      return c.json({
        line,
        brand,
        items: fitems.items,
        totalItems: fitems.total,
      })
    })

    app.get(`${base}/fashion/items`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Use X-Metadata-Vertical: fashion' }, 400)
      }
      return c.json(
        listFashionItems({
          q: c.req.query('q'),
          brand: c.req.query('brand') || undefined,
          line: c.req.query('line') || undefined,
          category: c.req.query('category') || undefined,
          kind: c.req.query('kind') || undefined,
          tag: c.req.query('tag') || undefined,
          season: c.req.query('season') || undefined,
          release: c.req.query('release') || undefined,
          sort: c.req.query('sort') || undefined,
          order: (c.req.query('order') as 'asc' | 'desc') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/fashion/items/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (!isFashionVertical(c.get('vertical'))) {
        return c.json({ error: 'Fashion vertical only' }, 400)
      }
      const item = getFashionItem(c.req.param('id'))
      if (!item) return c.json({ error: 'Item not found' }, 404)
      return c.json(enrichFashionItem(item))
    })

    // Sneakers = fashion footwear (legacy paths)
    app.get(`${base}/sneakers/brands`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      return c.json(
        listSneakerBrands({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })
    app.get(`${base}/sneakers/brands/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const brand = getSneakerBrand(c.req.param('id'))
      if (!brand) return c.json({ error: 'Brand not found' }, 404)
      const sils = listSneakerSilhouettes({ brand: brand.id, limit: pageLimit(c, 100) })
      const mods = listSneakerModels({ brand: brand.id, limit: pageLimit(c, 40) })
      return c.json({
        brand,
        silhouettes: sils.items,
        models: mods.items,
        totalModels: mods.total,
      })
    })
    app.get(`${base}/sneakers/silhouettes`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      return c.json(
        listSneakerSilhouettes({
          q: c.req.query('q'),
          brand: c.req.query('brand') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })
    app.get(`${base}/sneakers/silhouettes/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const silhouette = getSneakerSilhouette(c.req.param('id'))
      if (!silhouette) return c.json({ error: 'Silhouette not found' }, 404)
      const brand = getSneakerBrand(silhouette.brandId) ?? null
      const mods = listSneakerModels({
        silhouette: silhouette.id,
        limit: pageLimit(c, 40),
      })
      return c.json({
        silhouette,
        brand,
        models: mods.items,
        totalModels: mods.total,
      })
    })
    app.get(`${base}/sneakers/models`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      return c.json(
        listSneakerModels({
          q: c.req.query('q'),
          brand: c.req.query('brand') || undefined,
          silhouette: c.req.query('silhouette') || undefined,
          tag: c.req.query('tag') || undefined,
          release: c.req.query('release') || undefined,
          sort: c.req.query('sort') || undefined,
          order: (c.req.query('order') as 'asc' | 'desc') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })
    app.get(`${base}/sneakers/models/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const model = getSneakerModel(c.req.param('id'))
      if (!model) return c.json({ error: 'Model not found' }, 404)
      return c.json(enrichSneakerModel(model))
    })

    // Convenience aliases for figures / plush / fashion (by active vertical)
    app.get(`${base}/items`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      if (v === 'fashion') {
        return c.json(
          listFashionItems({
            q: c.req.query('q'),
            brand: c.req.query('brand') || undefined,
            line: c.req.query('line') || c.req.query('silhouette') || undefined,
            category: c.req.query('category') || undefined,
            kind: c.req.query('kind') || undefined,
            tag: c.req.query('tag') || undefined,
            season: c.req.query('season') || undefined,
            release: c.req.query('release') || undefined,
            sort: c.req.query('sort') || undefined,
            order: (c.req.query('order') as 'asc' | 'desc') || undefined,
            limit,
            offset: Number(c.req.query('offset') ?? 0),
          }),
        )
      }
      if (v === 'plush') {
        return c.json(
          listPlushItems({
            q: c.req.query('q'),
            maker: c.req.query('maker') || undefined,
            line: c.req.query('line') || undefined,
            kind: c.req.query('kind') || undefined,
            series: c.req.query('series') || undefined,
            limit,
            offset: Number(c.req.query('offset') ?? 0),
          }),
        )
      }
      if (v === 'figures') {
        return c.json(
          listFigureItems({
            q: c.req.query('q'),
            maker: c.req.query('maker') || undefined,
            line: c.req.query('line') || undefined,
            kind: c.req.query('kind') || undefined,
            series: c.req.query('series') || undefined,
            limit,
            offset: Number(c.req.query('offset') ?? 0),
          }),
        )
      }
      if (v === 'modelkits') {
        return c.json(
          listModelkitItems({
            q: c.req.query('q'),
            maker: c.req.query('maker') || undefined,
            line: c.req.query('line') || undefined,
            kind: c.req.query('kind') || undefined,
            series: c.req.query('series') || undefined,
            limit,
            offset: Number(c.req.query('offset') ?? 0),
          }),
        )
      }
      return c.json(
        { error: `GET ${base}/items is for figures|plush|modelkits|fashion verticals` },
        400,
      )
    })

    app.get(`${base}/items/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const v = c.get('vertical')
      if (v === 'fashion') {
        const fitem = getFashionItem(c.req.param('id'))
        if (!fitem) return c.json({ error: 'Item not found' }, 404)
        return c.json(enrichFashionItem(fitem))
      }
      if (v === 'plush') {
        const pitem = getPlushItem(c.req.param('id'))
        if (!pitem) return c.json({ error: 'Item not found' }, 404)
        return c.json(enrichPlushItem(pitem))
      }
      if (v === 'modelkits') {
        const mitem = getModelkitItem(c.req.param('id'))
        if (!mitem) return c.json({ error: 'Item not found' }, 404)
        return c.json(enrichModelkitItem(mitem))
      }
      if (v === 'figures') {
        const item = getFigureItem(c.req.param('id'))
        if (!item) return c.json({ error: 'Item not found' }, 404)
        return c.json(enrichFigureItem(item))
      }
      return c.json(
        { error: `GET ${base}/items/:id is for figures|plush|modelkits|fashion verticals` },
        400,
      )
    })

    app.get(`${base}/logos`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const seriesId = c.req.query('series')
      if (!seriesId) return c.json({ error: 'Query param series is required' }, 400)
      const v = c.get('vertical')
      const s = getSeries(v, seriesId)
      if (!s) return c.json({ error: 'Series not found' }, 404)
      return c.json({ seriesId: s.id, logos: logosForSeries(v, s.id) })
    })

    app.get(`${base}/export/character/:id`, async (c) => {
      const v = c.get('vertical')
      const ch = getCharacter(v, c.req.param('id'))
      if (!ch) return c.json({ error: 'Character not found' }, 404)
      const denied = await gate(c, { cost: 10 })
      if (denied) return denied
      const series = getSeries(v, ch.seriesId) ?? null
      return c.json({
        export: true,
        vertical: v,
        character: ch,
        series,
        logos: series ? logosForSeries(v, series.id) : [],
        danbooruLine: characterDanbooruLine(ch),
      })
    })

    // Legacy: agents used /v1/report — same queue as human form, but not a catalog route.
    // Prefer POST /feedback (form page + JSON). Keep thin alias for one release.
    app.post(`${base}/report`, async (c) => {
      c.header('Deprecation', 'true')
      c.header('Link', '</feedback>; rel="successor-version"')
      c.header('X-Metadata-Deprecated', 'Use POST /feedback (same form as /feedback)')
      return handleFeedbackPost(c)
    })

    app.post(`${base}/contribute`, async (c) => {
      const ip = clientIp(c.req.raw.headers)
      const rl = rateLimit({
        key: `md:contribute:${ip}`,
        limit: Number(process.env.REPORT_RATE_LIMIT_PER_MIN ?? 5),
        windowMs: 60_000,
      })
      if (!rl.ok) {
        return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
      }
      let body: {
        kind?: string
        payload?: Record<string, unknown>
        vertical?: unknown
        contributor?: unknown
        note?: unknown
        sources?: unknown
        wallet?: unknown
      }
      try {
        body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
      } catch {
        return c.json({ error: 'Invalid JSON or request body too large' }, 400)
      }
      if (!body?.kind || !body?.payload || typeof body.payload !== 'object') {
        return c.json({ error: 'kind and payload required' }, 400)
      }
      if (!isContributeKind(body.kind)) {
        return c.json(
          {
            error: `kind must be ${contributeKindsList()}`,
          },
          400,
        )
      }
      const boundedPayload = validateContributionPayload(body.payload)
      if (!boundedPayload.ok) {
        return c.json({ error: 'VALIDATION', message: boundedPayload.error }, 400)
      }
      const metadata = validateContributionMetadata(body)
      if (!metadata.ok) {
        return c.json({ error: 'VALIDATION', message: metadata.error }, 400)
      }
      let wallet: string | null = null
      if (body.wallet !== undefined && body.wallet !== null && body.wallet !== '') {
        wallet = normalizeContributeWallet(body.wallet)
        if (!wallet) {
          return c.json({ error: 'VALIDATION', message: 'wallet must be 0x + 40 hex' }, 400)
        }
        const owned = requireProvenWallet(c, wallet)
        if ('response' in owned) return owned.response
        wallet = owned.wallet
      }
      if (body.kind === 'dataset') {
        const dataset = validateDatasetContribution(boundedPayload.payload, wallet)
        if (!dataset.ok) {
          return c.json({ error: 'VALIDATION', message: dataset.error }, 400)
        }
      }
      const verticalValue = body.vertical ?? c.get('vertical') ?? 'anime'
      if (typeof verticalValue !== 'string' || verticalValue.length > 64) {
        return c.json(
          { error: 'VALIDATION', message: 'vertical must be a string <= 64 characters' },
          400,
        )
      }
      const vertical = verticalValue.toLowerCase()
      let stored
      try {
        stored = await appendContribution({
          kind: body.kind,
          vertical,
          payload: boundedPayload.payload,
          contributor: metadata.metadata.contributor,
          note: metadata.metadata.note,
          sources: metadata.metadata.sources,
          wallet,
          ip,
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'REPORT_QUEUE_FULL') {
          return c.json(
            { error: 'QUEUE_BUSY', message: 'Contribution queue is busy; retry shortly.' },
            503,
          )
        }
        console.error('[metadata] contribution persistence failed', error)
        return c.json({ error: 'PERSISTENCE_FAILED' }, 503)
      }
      console.info('[metadata] contribution queued', {
        id: stored.id,
        vertical,
        kind: body.kind,
      })
      return c.json(
        {
          accepted: true,
          persisted: true as const,
          status: 'queued' as const,
          id: stored.id,
          receivedAt: stored.receivedAt,
          message:
            'Queued for operators; not merged into catalog automatically. Prefer data PRs. See legal for copyright.',
          kind: body.kind,
        },
        202,
      )
    })

    // —— Soundtracks (ost) ——
    app.get(`${base}/ost/albums`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'ost') {
        return c.json({ error: 'Use X-Metadata-Vertical: ost (or host ost.* / soundtrack.*)' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listOstAlbums({
          q: c.req.query('q'),
          media: c.req.query('media') || undefined,
          series: c.req.query('series') || undefined,
          type: c.req.query('type') || undefined,
          artist: c.req.query('artist') || undefined,
          tag: c.req.query('tag') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/ost/albums/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'ost') {
        return c.json({ error: 'OST vertical only' }, 400)
      }
      const album = getOstAlbum(c.req.param('id'))
      if (!album) return c.json({ error: 'Album not found' }, 404)
      return c.json(enrichOstAlbum(album))
    })

    app.get(`${base}/ost/artists`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'ost') {
        return c.json({ error: 'OST vertical only' }, 400)
      }
      return c.json(
        listOstArtists({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/ost/artists/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'ost') {
        return c.json({ error: 'OST vertical only' }, 400)
      }
      const artist = getOstArtist(c.req.param('id'))
      if (!artist) return c.json({ error: 'Artist not found' }, 404)
      const albums = listOstAlbums({ artist: artist.id, limit: pageLimit(c, 40) })
      return c.json({
        artist,
        albums: albums.items,
        total: albums.total,
      })
    })

    // —— Consoles / platforms ——
    app.get(`${base}/consoles`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'consoles') {
        return c.json({ error: 'Use X-Metadata-Vertical: consoles (or host consoles.*)' }, 400)
      }
      let limit = pageLimit(c, Number(c.req.query('limit') ?? 40))
      return c.json(
        listConsoles({
          q: c.req.query('q'),
          manufacturer: c.req.query('manufacturer') || undefined,
          formFactor: c.req.query('formFactor') || c.req.query('form') || undefined,
          generation: c.req.query('generation') ? Number(c.req.query('generation')) : undefined,
          tag: c.req.query('tag') || undefined,
          limit,
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/consoles/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'consoles') {
        return c.json({ error: 'Consoles vertical only' }, 400)
      }
      const row = getConsole(c.req.param('id'))
      if (!row) return c.json({ error: 'Console not found' }, 404)
      return c.json(enrichConsole(row))
    })

    app.get(`${base}/manufacturers`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'consoles') {
        return c.json({ error: 'Consoles vertical only (hardware manufacturers)' }, 400)
      }
      return c.json(
        listConsoleManufacturers({
          q: c.req.query('q'),
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/manufacturers/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'consoles') {
        return c.json({ error: 'Consoles vertical only' }, 400)
      }
      const m = getConsoleManufacturer(c.req.param('id'))
      if (!m) return c.json({ error: 'Manufacturer not found' }, 404)
      const list = listConsoles({ manufacturer: m.id, limit: pageLimit(c, 100) })
      return c.json({ manufacturer: m, consoles: list.items, total: list.total })
    })

    // —— Esports ——
    app.get(`${base}/esports/titles`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'esports') {
        return c.json({ error: 'Use X-Metadata-Vertical: esports' }, 400)
      }
      return c.json(
        listEsportsTitles({
          q: c.req.query('q'),
          tag: c.req.query('tag') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/esports/titles/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'esports') {
        return c.json({ error: 'Esports vertical only' }, 400)
      }
      const t = getEsportsTitle(c.req.param('id'))
      if (!t) return c.json({ error: 'Title not found' }, 404)
      return c.json(enrichEsportsTitle(t))
    })

    app.get(`${base}/esports/leagues`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'esports') {
        return c.json({ error: 'Esports vertical only' }, 400)
      }
      return c.json(
        listEsportsLeagues({
          q: c.req.query('q'),
          title: c.req.query('title') || undefined,
          region: c.req.query('region') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/esports/leagues/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const l = getEsportsLeague(c.req.param('id'))
      if (!l) return c.json({ error: 'League not found' }, 404)
      return c.json({ league: l, title: getEsportsTitle(l.titleId) ?? null })
    })

    app.get(`${base}/esports/teams`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'esports') {
        return c.json({ error: 'Esports vertical only' }, 400)
      }
      return c.json(
        listEsportsTeams({
          q: c.req.query('q'),
          title: c.req.query('title') || undefined,
          region: c.req.query('region') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/esports/teams/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const t = getEsportsTeam(c.req.param('id'))
      if (!t) return c.json({ error: 'Team not found' }, 404)
      const roster = listEsportsPlayers({ team: t.id, limit: pageLimit(c, 40) })
      return c.json({ team: t, players: roster.items, totalPlayers: roster.total })
    })

    app.get(`${base}/esports/players`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      if (c.get('vertical') !== 'esports') {
        return c.json({ error: 'Esports vertical only' }, 400)
      }
      return c.json(
        listEsportsPlayers({
          q: c.req.query('q'),
          title: c.req.query('title') || undefined,
          team: c.req.query('team') || undefined,
          limit: pageLimit(c, Number(c.req.query('limit') ?? 40)),
          offset: Number(c.req.query('offset') ?? 0),
        }),
      )
    })

    app.get(`${base}/esports/players/:id`, async (c) => {
      const denied = await gate(c, {})
      if (denied) return denied
      const p = getEsportsPlayer(c.req.param('id'))
      if (!p) return c.json({ error: 'Player not found' }, 404)
      return c.json({
        player: p,
        team: p.teamId ? (getEsportsTeam(p.teamId) ?? null) : null,
        titles: p.titleIds.map((id) => getEsportsTitle(id)).filter(Boolean),
      })
    })
  }

  // Versioned + legacy unversioned catalog routes
  registerCatalog('/v1')
  registerCatalog('')

  // —— Feedback form (NOT catalog API) — humans + agents share this path ——
  app.get('/feedback', (c) =>
    c.json({
      name: 'Metadata feedback',
      description:
        'Operator queue for data quality flags. Not a catalog read/write API — reports are queued for humans and are not auto-applied.',
      form: '/feedback',
      method: 'POST',
      path: '/feedback',
      contentTypes: ['application/json', 'application/x-www-form-urlencoded'],
      body: {
        kind: 'correction|missing|spam|dmca|other (default correction)',
        vertical: 'required (anime, pod, tcg, …)',
        entityKind: 'required (series, character, product, card, item, …)',
        entityId: 'required',
        message: 'required',
        field: 'optional',
        sources: 'optional string[] or comma-separated form field',
        contributor: 'optional',
        agent: 'optional { name, url } for agents',
      },
      rateLimit: 'REPORT_RATE_LIMIT_PER_MIN (default 5/min/IP)',
      legacy: 'POST /v1/report still works but is deprecated — use POST /feedback',
    }),
  )
  app.post('/feedback', (c) => handleFeedbackPost(c))

  /** Public nerdy metrics — free, no wallet. Platform + users, hourly rollups. */
  app.get('/v1/stats', async (c) => c.json(await getStatsPublic()))

  /**
   * Free preview status for the current vertical (does not consume a slot).
   * Limited teaser per IP + catalog — not a free plan.
   */
  const previewSamples = new Map<string, unknown>()
  app.get('/v1/preview', async (c) => {
    const vertical = c.get('vertical')
    const ip = previewIpFromHeaders(c.req.raw.headers)
    const peek = peekPreview({ ip, vertical })
    const fixed = catalogPolicy().fixedPreview
    let sample: unknown
    if (fixed) {
      sample = previewSamples.get(vertical)
      if (!sample) {
        // Search intentionally returns no media hits for an empty query. Pick
        // fixed records directly, independent of any client query or IP.
        const sources: Record<string, () => unknown[]> = {
          pod: () => listProducts({ limit: 3 }).items,
          tcg: () => listTcgCards({ limit: 3 }).items,
          figures: () => listFigureItems({ limit: 3 }).items,
          plush: () => listPlushItems({ limit: 3 }).items,
          modelkits: () => listModelkitItems({ limit: 3 }).items,
          fashion: () => listFashionItems({ limit: 3 }).items,
          boardgames: () => listBoardGames({ limit: 3 }).items,
          ost: () => listOstAlbums({ limit: 3 }).items,
          consoles: () => listConsoles({ limit: 3 }).items,
          esports: () => listEsportsTitles({ limit: 3 }).items,
        }
        const rows = sources[vertical]?.() ?? listSeries(vertical, { limit: 3 }).items
        const kinds: Record<string, string> = {
          pod: 'product',
          tcg: 'card',
          boardgames: 'game',
          ost: 'album',
          consoles: 'console',
          esports: 'title',
        }
        sample = rows.map((value) => {
          const row = value as {
            id: string
            title?: string
            name?: string
            imageUrl?: string | null
            coverUrl?: string | null
          }
          return {
            id: row.id,
            kind: isMediaVertical(vertical) ? 'series' : (kinds[vertical] ?? 'item'),
            title: row.title ?? row.name ?? row.id,
            imageUrl: row.imageUrl ?? row.coverUrl ?? null,
          }
        })
        previewSamples.set(vertical, sample)
      }
      c.header('Cache-Control', 'public, max-age=300')
    }
    return c.json({
      mode: fixed ? 'fixed-sample' : 'development-quota',
      ...(fixed ? { sample } : {}),
      ok: true as const,
      vertical,
      limit: peek.limit,
      remaining: peek.remaining,
      used: peek.used,
      windowMs: peek.windowMs,
      searchMax: previewSearchMax(),
      note: fixed
        ? 'This fixed sample is free. Arbitrary catalog reads require payment.'
        : 'Development preview uses an IP quota. Production uses a fixed sample.',
    })
  })

  let verticalsCache: { expiresAt: number; body: unknown } | null = null
  app.get('/v1/verticals', (c) => {
    if (verticalsCache && verticalsCache.expiresAt > Date.now()) {
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      return c.json(verticalsCache.body)
    }
    const counts = statsAll()
    const pod = podStats()
    const fig = figureStats()
    const pl = plushStats()
    const fash = fashionStats()
    const bg = boardGameStats()
    const o = ostStats()
    const con = consoleStats()
    const esp = esportsStats()
    const aff = affiliatesPublicConfig()
    const body = {
      rootDomain,
      live: LIVE_VERTICALS,
      agent: agentDiscoveryBlock(rootDomain),
      schemas: '/docs/SCHEMAS.md (repo) — data shapes per vertical',
      aliases: VERTICAL_ALIASES,
      notes: {
        seasons: 'On anime Series as series.seasons (not a separate vertical)',
        volumes: 'On manga Series as series.volumes / volumeCount',
        printMethods: 'Under POD as GET /v1/print-methods + product.printMethodIds',
        ost: 'Live ost vertical; albums link via seriesSlug; also on GET series/:id as soundtracks[]',
        consoles:
          'Own vertical (not nested under game) — hardware platforms; games remain series/characters',
        esports: 'Titles, leagues, teams, players — link titles.gameSeriesSlug to game vertical',
        comics: 'Western comics (not manga) — same series/characters API shape as media verticals',
        plush: 'Fumo fumo + character plush — GET /v1/plush/items?kind=fumo',
        feedback:
          'POST /feedback — human form at /feedback; agents POST JSON to the same path (not a catalog route)',
        affiliates:
          'GET /v1/affiliates — docs/AFFILIATES.md + packages/api/data/affiliates/partners.json',
      },
      affiliates: {
        partners: aff.total,
        configured: aff.configured,
      },
      all: VERTICALS.map((id) => {
        let verticalCounts: Record<string, unknown> | null = null
        if (id === 'pod') {
          verticalCounts = {
            products: pod.products,
            brands: pod.brands,
            providers: pod.providers,
            colors: pod.colors,
            printMethods: pod.printMethods,
            series: pod.products,
            characters: pod.colors,
            logos: pod.providers,
          }
        } else if (id === 'tcg') {
          const t = tcgStats()
          verticalCounts = {
            games: t.games,
            sets: t.sets,
            cards: t.cards,
            byGame: tcgStatsByGame(),
            series: t.sets,
            characters: t.cards,
            logos: t.games,
          }
        } else if (id === 'figures') {
          verticalCounts = {
            items: fig.items,
            makers: fig.makers,
            lines: fig.lines,
            byKind: fig.byKind,
            series: fig.lines,
            characters: fig.items,
            logos: fig.makers,
          }
        } else if (id === 'plush') {
          verticalCounts = {
            items: pl.items,
            makers: pl.makers,
            lines: pl.lines,
            byKind: pl.byKind,
            series: pl.lines,
            characters: pl.items,
            logos: pl.makers,
          }
        } else if (id === 'fashion') {
          verticalCounts = {
            items: fash.items,
            brands: fash.brands,
            lines: fash.lines,
            upcoming: fash.upcoming,
            byCategory: fash.byCategory,
            byBrand: fash.byBrand,
            byKind: fash.byKind,
            series: fash.lines,
            characters: fash.items,
            logos: fash.brands,
          }
        } else if (id === 'boardgames') {
          verticalCounts = {
            games: bg.games,
            publishers: bg.publishers,
            categories: bg.categories,
            series: bg.games,
            characters: bg.publishers,
            logos: bg.categories,
          }
        } else if (id === 'ost') {
          verticalCounts = {
            albums: o.albums,
            artists: o.artists,
            byMedia: o.byMedia,
            series: o.albums,
            characters: o.artists,
            logos: 0,
          }
        } else if (id === 'consoles') {
          verticalCounts = {
            consoles: con.consoles,
            manufacturers: con.manufacturers,
            byFormFactor: con.byFormFactor,
            series: con.consoles,
            characters: con.manufacturers,
            logos: 0,
          }
        } else if (id === 'esports') {
          verticalCounts = {
            titles: esp.titles,
            leagues: esp.leagues,
            teams: esp.teams,
            players: esp.players,
            series: esp.titles,
            characters: esp.players,
            logos: esp.teams,
          }
        } else if (id in counts) {
          verticalCounts = counts[id as keyof typeof counts]
        }
        const hosts =
          id === 'pod'
            ? [`pod.${rootDomain}`, `blanks.${rootDomain}`]
            : id === 'tcg'
              ? [
                  `tcg.${rootDomain}`,
                  `cards.${rootDomain}`,
                  `pokemon.${rootDomain}`,
                  `yugioh.${rootDomain}`,
                  `onepiece.${rootDomain}`,
                ]
              : id === 'figures'
                ? [`figures.${rootDomain}`, `nendoroid.${rootDomain}`, `merch.${rootDomain}`]
                : id === 'plush'
                  ? [`plush.${rootDomain}`, `fumo.${rootDomain}`, `fumofumo.${rootDomain}`]
                  : id === 'fashion'
                    ? [
                        `fashion.${rootDomain}`,
                        `sneakers.${rootDomain}`,
                        `kicks.${rootDomain}`,
                        `streetwear.${rootDomain}`,
                        `watches.${rootDomain}`,
                      ]
                    : id === 'boardgames'
                      ? [`boardgames.${rootDomain}`, `bgg.${rootDomain}`, `tabletop.${rootDomain}`]
                      : id === 'cartoons'
                        ? [`cartoons.${rootDomain}`, `cartoon.${rootDomain}`, `nick.${rootDomain}`]
                        : id === 'ost'
                          ? [
                              `ost.${rootDomain}`,
                              `soundtrack.${rootDomain}`,
                              `soundtracks.${rootDomain}`,
                            ]
                          : id === 'consoles'
                            ? [
                                `consoles.${rootDomain}`,
                                `platforms.${rootDomain}`,
                                `arcade.${rootDomain}`,
                              ]
                            : id === 'esports'
                              ? [`esports.${rootDomain}`, `competitive.${rootDomain}`]
                              : id === 'comics'
                                ? [
                                    `comics.${rootDomain}`,
                                    `marvel.${rootDomain}`,
                                    `dc.${rootDomain}`,
                                  ]
                                : [`${id}.${rootDomain}`]
        return {
          id,
          ...VERTICAL_META[id],
          host: hosts[0],
          hosts,
          counts: verticalCounts,
        }
      }),
    }
    verticalsCache = { expiresAt: Date.now() + 60_000, body }
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return c.json(body)
  })

  /** Open directory of first-party verticals + accepted third-party listings. */
  app.get('/v1/datasets', async (c) => {
    const items = await listDatasets()
    return c.json({ items, total: items.length })
  })

  app.get('/v1/datasets/:id', async (c) => {
    const denied = await gate(c, {})
    if (denied) return denied
    const id = decodeURIComponent(c.req.param('id'))
    const dataset = await getDataset(id)
    if (!dataset) return c.json({ error: 'Dataset not found' }, 404)
    return c.json(dataset)
  })

  app.get('/v1/export/dataset/:id', async (c) => {
    const id = decodeURIComponent(c.req.param('id'))
    const dataset = await getDataset(id)
    if (!dataset) return c.json({ error: 'Dataset not found' }, 404)
    const cost = datasetExportCost()
    const denied = await gate(c, { cost })
    if (denied) return denied
    const pending = c.get('catalogPending')
    const consumerWallet = c.get('wallet')
    if (pending && c.get('tier') !== 'service' && consumerWallet) {
      const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
      pending.publisher = {
        wallet: dataset.publisherWallet,
        payoutKey: `dataset-export:${id}:${consumerWallet}:${day}`,
      }
    }
    return c.json({
      dataset,
      export: true as const,
      identity: datasetIdentity(dataset),
    })
  })

  async function readOpsNote(
    c: Context<{ Variables: Vars }>,
  ): Promise<{ ok: true; note: string | null } | { ok: false; response: Response }> {
    const ct = (c.req.header('content-type') || '').toLowerCase()
    if (!ct.includes('application/json')) return { ok: true, note: null }
    try {
      const raw = await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)
      if (!raw || typeof raw !== 'object') return { ok: true, note: null }
      const note = (raw as { note?: unknown }).note
      if (note === undefined || note === null || note === '') return { ok: true, note: null }
      if (typeof note !== 'string') {
        return {
          ok: false,
          response: c.json({ error: 'VALIDATION', message: 'note must be a string' }, 400),
        }
      }
      return { ok: true, note: note.slice(0, 4000) }
    } catch {
      return {
        ok: false,
        response: c.json({ error: 'Invalid JSON or request body too large' }, 400),
      }
    }
  }

  app.post('/v1/ops/contributions/:id/accept', async (c) => {
    const account = c.get('serviceAccount')
    if (c.get('tier') !== 'service' || !account?.ops) {
      return c.json({ error: 'FORBIDDEN', message: 'Ops service key required' }, 403)
    }
    const noteBody = await readOpsNote(c)
    if (!noteBody.ok) return noteBody.response
    const actor = c.get('serviceAccount')?.id ?? 'service'
    const result = await acceptContribution(c.req.param('id'), {
      actor,
      note: noteBody.note,
    })
    if (!result.ok && result.reason === 'NOT_FOUND') {
      return c.json({ error: 'NOT_FOUND', message: 'Contribution not found' }, 404)
    }
    if (!result.ok && result.reason === 'REJECTED') {
      return c.json({ error: 'CONFLICT', message: 'Contribution was rejected' }, 409)
    }
    if (!result.ok) {
      return c.json({ error: 'CONFLICT' }, 409)
    }
    return c.json(result)
  })

  app.post('/v1/ops/contributions/:id/reject', async (c) => {
    const account = c.get('serviceAccount')
    if (c.get('tier') !== 'service' || !account?.ops) {
      return c.json({ error: 'FORBIDDEN', message: 'Ops service key required' }, 403)
    }
    const noteBody = await readOpsNote(c)
    if (!noteBody.ok) return noteBody.response
    const actor = c.get('serviceAccount')?.id ?? 'service'
    const result = await rejectContribution(c.req.param('id'), {
      actor,
      note: noteBody.note,
    })
    if (!result.ok && result.reason === 'NOT_FOUND') {
      return c.json({ error: 'NOT_FOUND', message: 'Contribution not found' }, 404)
    }
    if (!result.ok && result.reason === 'ACCEPTED') {
      return c.json({ error: 'CONFLICT', message: 'Contribution was accepted' }, 409)
    }
    if (!result.ok) {
      return c.json({ error: 'CONFLICT' }, 409)
    }
    return c.json(result)
  })

  // Hub identity: preview against dedicated 'sku' bucket, never the default anime vertical.
  app.get('/v1/sku', async (c) => {
    const denied = await gate(c, { previewVertical: 'sku' })
    if (denied) return denied
    const q = c.req.query('q')
    if (!q || !q.trim()) {
      return c.json({ error: 'VALIDATION', message: 'q is required' }, 400)
    }
    const result = resolveSku(q)
    if (!result.ok) return c.json(result, 404)
    if (!result.unique) return c.json(result, 409)
    return c.json(result, 200)
  })

  app.get('/v1/sku/:key', async (c) => {
    const denied = await gate(c, { previewVertical: 'sku' })
    if (denied) return denied
    const key = decodeURIComponent(c.req.param('key'))
    const result = resolveSku(key)
    if (!result.ok) return c.json(result, 404)
    if (!result.unique) return c.json(result, 409)
    return c.json(result, 200)
  })

  /** Prefer this for namespaced URIs — Cloudflare rejects colons in the path. */
  app.post('/v1/sku/resolve', async (c) => {
    const denied = await gate(c, { previewVertical: 'sku' })
    if (denied) return denied
    let body: { key?: unknown; q?: unknown; keys?: unknown }
    try {
      body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
    } catch {
      return c.json({ error: 'Invalid JSON or request body too large' }, 400)
    }
    if (body && typeof body === 'object' && 'keys' in body) {
      if (!Array.isArray(body.keys)) {
        return c.json({ error: 'VALIDATION', message: 'keys must be an array of strings' }, 400)
      }
      if (body.keys.length > 20) {
        return c.json({ error: 'VALIDATION', message: 'keys cap is 20' }, 400)
      }
      if (body.keys.length > 0) {
        if (!body.keys.every((item) => typeof item === 'string')) {
          return c.json({ error: 'VALIDATION', message: 'keys must be an array of strings' }, 400)
        }
        return c.json({ ok: true, results: resolveSkuMany(body.keys) }, 200)
      }
    }
    const key = typeof body?.key === 'string' ? body.key : typeof body?.q === 'string' ? body.q : ''
    if (!key.trim()) {
      return c.json({ error: 'VALIDATION', message: 'key is required' }, 400)
    }
    const result = resolveSku(key)
    if (!result.ok) return c.json(result, 404)
    if (!result.unique) return c.json(result, 409)
    return c.json(result, 200)
  })

  const paymentMethodsPayload = () =>
    PAYMENT_METHODS.map((m) => {
      if (m.id === 'stripe') {
        const stripe = stripePublicConfig()
        return {
          ...m,
          status: isStripeLive() ? ('live' as const) : m.status,
          description: isStripeLive()
            ? stripe.mode === 'test'
              ? 'TEST MODE · no real charge · credits bind to your test wallet'
              : 'Card / bank · fiat · credits bind to your wallet'
            : m.description,
        }
      }
      if (m.id === 'reown') {
        const treasury = process.env.TREASURY_ADDRESS?.startsWith('0x')
        return {
          ...m,
          status: treasury ? ('live' as const) : ('coming_soon' as const),
          description: treasury
            ? m.description
            : 'USDG on Robinhood Chain · off until TREASURY_ADDRESS is set',
        }
      }
      return m
    })

  function requireProvenWallet(
    c: Context<{ Variables: Vars }>,
    requested?: unknown,
  ): { wallet: string } | { response: Response } {
    const requestedWallet =
      requested === undefined || requested === null || requested === ''
        ? null
        : normalizeWallet(requested)
    if (requested !== undefined && requested !== null && requested !== '' && !requestedWallet) {
      return { response: c.json({ error: 'INVALID_WALLET' }, 400) }
    }

    const wallet = c.get('wallet')
    if (!wallet || !c.get('walletProven')) {
      return {
        response: c.json({ error: 'AUTH_REQUIRED', message: 'Sign in with wallet session' }, 401),
      }
    }
    if (requestedWallet && requestedWallet !== wallet) {
      return {
        response: c.json(
          { error: 'WALLET_MISMATCH', message: 'Wallet does not match session' },
          403,
        ),
      }
    }
    return { wallet }
  }

  app.get('/v1/pay/auth/nonce', (c) => {
    const rl = rateLimit({
      key: `md:auth-nonce:${clientIp(c.req.raw.headers)}`,
      limit: Number(process.env.WALLET_AUTH_NONCE_RATE_PER_MIN ?? 10),
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
    }
    const wallet = c.req.query('wallet')
    if (!normalizeWallet(wallet)) {
      return c.json({ error: 'INVALID_WALLET', message: 'Valid wallet required' }, 400)
    }
    try {
      return c.json({ ok: true, ...createWalletNonce(wallet) })
    } catch (e) {
      return c.json(
        { error: 'INVALID_WALLET', message: e instanceof Error ? e.message : String(e) },
        400,
      )
    }
  })

  app.post('/v1/pay/auth/verify', async (c) => {
    const rl = rateLimit({
      key: `md:auth-verify:${clientIp(c.req.raw.headers)}`,
      limit: Number(process.env.WALLET_AUTH_VERIFY_RATE_PER_MIN ?? 20),
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
    }
    let body: { wallet?: unknown; message?: unknown; signature?: unknown }
    try {
      body = (await readJsonBodyLimited(c.req.raw, 32 * 1024)) as typeof body
    } catch {
      return c.json({ error: 'Invalid JSON or request body too large' }, 400)
    }
    try {
      const session = await verifyWalletSignature({
        wallet: body.wallet,
        message: body.message,
        signature: body.signature,
      })
      return c.json({ ok: true, token: session.token, expiresAt: session.expiresAt })
    } catch (e) {
      return c.json(
        {
          error: 'AUTH_FAILED',
          message: e instanceof Error ? e.message : String(e),
        },
        401,
      )
    }
  })

  app.post('/v1/pay/auth/logout', (c) => {
    const revoked = revokeWalletSession(extractSessionToken(c.req.raw.headers))
    return c.json({ ok: true, revoked })
  })

  app.get('/v1/ops/catalog-usage', (c) => {
    c.header('Cache-Control', 'private, no-store')
    if ((requiresEdgeProof() && !trustedEdge(c.req.raw.headers)) || !c.get('serviceAccount')?.ops)
      return c.json({ error: 'OPS_REQUIRED' }, 403)
    return c.json(catalogUsageReport())
  })

  app.get('/v1/ops/finance', (c) => {
    c.header('Cache-Control', 'private, no-store')
    if ((requiresEdgeProof() && !trustedEdge(c.req.raw.headers)) || !c.get('serviceAccount')?.ops)
      return c.json({ error: 'OPS_REQUIRED' }, 403)
    return c.json(financeReport())
  })

  app.get('/v1/pay/packs', (c) => {
    const topup = getTopupConfig()
    const body = {
      environment: metadataEnvironment(),
      catalog: catalogPolicy(),
      packs: suggestedTopups(topup),
      topup,
      asset: ROBINHOOD_USDG,
      treasury: process.env.TREASURY_ADDRESS ?? null,
      methods: paymentMethodsPayload(),
      stripe: stripePublicConfig(),
      subscription: {
        status: 'coming_soon',
        note: 'Power plan for heavy users — monthly credits via Stripe when card checkout ships.',
      },
    }
    return c.json(body)
  })

  app.get('/v1/pay/quote', (c) => {
    const usdg = Number(c.req.query('usdg') || c.req.query('amount') || '')
    const quote = quoteTopup(usdg)
    if (!quote) {
      const topup = getTopupConfig()
      return c.json(
        {
          error: 'INVALID_AMOUNT',
          message: `usdg must be between ${topup.minUsd} and ${topup.maxUsd}`,
          topup,
        },
        400,
      )
    }
    return c.json({ ok: true, quote, topup: getTopupConfig() })
  })

  app.get('/v1/pay/methods', (c) =>
    c.json({
      environment: metadataEnvironment(),
      asset: ROBINHOOD_USDG,
      methods: paymentMethodsPayload(),
      stripe: stripePublicConfig(),
    }),
  )

  /** Card / bank Checkout Session → redirect URL. */
  app.post('/v1/pay/stripe/checkout', async (c) => {
    let body: {
      packId?: string
      usdg?: number
      amount?: number
      wallet?: string
      successUrl?: string
      cancelUrl?: string
    }
    try {
      body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
    } catch {
      return c.json({ error: 'Invalid JSON or request body too large' }, 400)
    }
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON' }, 400)
    const owned = requireProvenWallet(c, body.wallet)
    if ('response' in owned) return owned.response
    const rl = rateLimit({
      key: `md:stripe-checkout:${owned.wallet}`,
      limit: paymentRatePerMin('STRIPE_CHECKOUT_RATE_PER_MIN', 10),
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
    }
    const result = await createStripeCheckout({
      packId: body.packId,
      usdg: body.usdg ?? body.amount,
      wallet: owned.wallet,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    })
    if (!result.ok) {
      return c.json({ error: result.error, message: result.message }, result.status)
    }
    return c.json({
      ok: true,
      url: result.url,
      sessionId: result.sessionId,
    })
  })

  /**
   * Stripe webhook — mint credits on checkout.session.completed.
   * Configure endpoint: POST {api}/v1/pay/stripe/webhook
   */
  app.post('/v1/pay/stripe/webhook', async (c) => {
    let raw: string
    try {
      raw = await readTextBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_BODY_TOO_LARGE') {
        return c.json({ error: 'REQUEST_BODY_TOO_LARGE', maxBytes: PUBLIC_INTAKE_MAX_BYTES }, 413)
      }
      return c.json({ error: 'Invalid webhook body' }, 400)
    }
    const sig = c.req.header('stripe-signature') || undefined
    const result = await handleStripeWebhook(raw, sig)
    if (!result.ok) {
      return c.json({ error: result.error }, result.status as 400 | 500 | 503)
    }
    return c.json({ received: true, type: result.type })
  })

  /**
   * Sync session after browser return (covers local dev without webhook CLI).
   * Idempotent with webhook path via ledger claimedTx key stripe:cs_…
   */
  app.post('/v1/pay/stripe/sync', async (c) => {
    const rl = rateLimit({
      key: `md:stripe-sync:${clientIp(c.req.raw.headers)}`,
      limit: paymentRatePerMin('STRIPE_SYNC_RATE_PER_MIN', 10),
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
    }
    let body: { sessionId?: string }
    try {
      body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
    } catch {
      return c.json({ error: 'Invalid JSON or request body too large' }, 400)
    }
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId) {
      return c.json({ error: 'sessionId required' }, 400)
    }
    if (sessionId.length > 256) {
      return c.json({ error: 'INVALID_SESSION_ID', message: 'sessionId is too long' }, 400)
    }
    const result = await syncStripeCheckoutSession(sessionId)
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          message: result.message,
        },
        result.error === 'NOT_PAID' ? 402 : 400,
      )
    }
    return c.json({
      ok: true,
      credits: result.credits,
      alreadyClaimed: result.alreadyClaimed,
    })
  })

  app.get('/v1/pay/balance', async (c) => {
    const owned = requireProvenWallet(c, c.req.query('wallet'))
    if ('response' in owned) return owned.response
    const credits = await getBalance(owned.wallet)
    return c.json({ wallet: owned.wallet, credits })
  })

  /** Signed-in account stats (credits + claim history). Not public platform metrics. */
  app.get('/v1/pay/account', async (c) => {
    const owned = requireProvenWallet(c, c.req.query('wallet'))
    if ('response' in owned) return owned.response
    const summary = await getWalletAccountSummary(owned.wallet)
    // Stub Power until subscriptions ship
    return c.json({
      ...summary,
      entitlements: {
        adFree: false,
        power: { active: false, renewsAt: null as string | null },
      },
    })
  })

  /**
   * Delete wallet account data on this API (credits; claim tombstones retained).
   * Client must confirm; does not reverse on-chain payments.
   */
  app.post('/v1/pay/account/delete', async (c) => {
    let body: { wallet?: string; confirm?: string }
    try {
      body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
    } catch {
      return c.json({ error: 'Invalid JSON or request body too large' }, 400)
    }
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON' }, 400)
    const owned = requireProvenWallet(c, body.wallet)
    if ('response' in owned) return owned.response
    if (body.confirm !== 'DELETE') {
      return c.json({ error: 'CONFIRM_REQUIRED', message: 'Send confirm: "DELETE"' }, 400)
    }
    if (walletHeld(owned.wallet) || (await getBalance(owned.wallet)) < 0)
      return c.json({ error: 'ACCOUNT_HAS_PAYMENT_RISK' }, 409)
    const result = await deleteWalletAccount(owned.wallet)
    return c.json({
      ok: true,
      wallet: owned.wallet,
      removedCredits: result.removedCredits,
      removedClaims: result.removedClaims,
    })
  })

  /**
   * Power / ad-free entitlements.
   * Until Stripe Power subscriptions ship, always adFree: false.
   * Clients use this to skip Taffy serve for subscribers.
   */
  app.get('/v1/pay/entitlements', async (c) => {
    const owned = requireProvenWallet(c, c.req.query('wallet'))
    if ('response' in owned) return owned.response
    // Stub: wire to subscription ledger when Power is live
    return c.json({
      wallet: owned.wallet,
      adFree: false,
      power: { active: false, renewsAt: null as string | null },
    })
  })

  app.post('/v1/pay/claim', async (c) => {
    const rl = rateLimit({
      key: `md:payment-claim:${clientIp(c.req.raw.headers)}`,
      limit: paymentRatePerMin('PAYMENT_CLAIM_RATE_PER_MIN', 10),
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return c.json({ error: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec }, 429)
    }
    let body: {
      wallet?: string
      packId?: string
      usdg?: number
      amount?: number
      txHash?: string
    }
    try {
      body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
    } catch {
      return c.json({ error: 'Invalid JSON or request body too large' }, 400)
    }
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON' }, 400)
    const usdg = body.usdg ?? body.amount
    const claimWallet = normalizeWallet(body.wallet)
    const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : ''
    if (!claimWallet || !txHash) {
      return c.json({ error: 'wallet and txHash required' }, 400)
    }
    if (txHash.length > 256) {
      return c.json({ error: 'INVALID_TX_HASH', message: 'txHash is too long' }, 400)
    }
    if (c.get('walletProven') && c.get('wallet') !== claimWallet) {
      return c.json({ error: 'WALLET_MISMATCH', message: 'Wallet does not match session' }, 403)
    }
    if (usdg == null && !body.packId) {
      return c.json({ error: 'usdg (or packId) and txHash required' }, 400)
    }
    const quote = resolveTopupPurchase({ packId: body.packId, usdg })
    if (!quote) {
      return c.json({ error: 'INVALID_AMOUNT', message: 'Top-up amount out of range' }, 400)
    }
    const packId = body.packId || `topup-${quote.usdg}`
    try {
      const verified = await verifyUsdgPayment({
        wallet: claimWallet,
        packId,
        usdg: quote.usdg,
        txHash,
      })
      const result = await claimPack({
        wallet: claimWallet,
        packId,
        credits: verified.totalCredits,
        txHash,
        finance: {
          kind: 'cash_topup',
          reference: txHash,
          cashMicros: Math.round(verified.usdg * 1_000_000),
          detail: {
            rail: 'usdg',
            simulated:
              metadataEnvironment() !== 'production' && process.env.DEV_TRUST_CLAIM === '1',
            feeReconciled: false,
          },
        },
      })
      return c.json({
        ok: true,
        credits: result.credits,
        alreadyClaimed: result.alreadyClaimed,
        pack: packId,
        usdg: verified.usdg,
        granted: verified.totalCredits,
        baseCredits: verified.baseCredits,
        bonusCredits: verified.bonusCredits,
      })
    } catch (e) {
      if (e instanceof PaymentVerifyError) {
        return c.json({ error: e.code, message: e.message }, 400)
      }
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[metadata] payment claim verify failed', msg)
      return c.json(
        { error: 'PAYMENT_VERIFY_FAILED', message: 'Payment could not be verified' },
        400,
      )
    }
  })

  app.get('/', (c) =>
    c.json({
      name: 'Metadata',
      version: VERSION,
      description:
        'Open multi-vertical public metadata API — anime, game, manga, cartoons, POD, TCG, figures, board games, OST. Flag bad rows via the feedback form (POST /feedback). x402 + Reown Pay.',
      vertical: c.get('vertical'),
      rootDomain,
      agent: agentDiscoveryBlock(rootDomain),
      docs: {
        skill: 'GET /SKILL.md',
        llms: 'GET /llms.txt',
        health: 'GET /v1/health',
        stats: 'GET /v1/stats',
        verticals: 'GET /v1/verticals',
        datasets: 'GET /v1/datasets',
        datasetById: 'GET /v1/datasets/:id',
        sku: 'GET /v1/sku/:key · POST /v1/sku/resolve (prefer POST for namespaced URIs)',
        series: 'GET /v1/series (seasons/volumes/soundtracks when known)',
        characters: 'GET /v1/characters/:id',
        search: 'GET /v1/search?q=',
        feedback: 'POST /feedback (same as human form /feedback — not catalog)',
        contribute: 'POST /v1/contribute',
        products: 'GET /v1/products (vertical=pod)',
        productById: 'GET /v1/products/:id (vertical=pod)',
        printMethods: 'GET /v1/print-methods (vertical=pod)',
        affiliates: 'GET /v1/affiliates',
        tcgCards: 'GET /v1/tcg/cards?game=&q=',
        tcgFacets: 'GET /v1/tcg/facets?game=pokemon',
        figureItems: 'GET /v1/figures/items?kind=nendoroid',
        modelkitItems: 'GET /v1/modelkits/items?grade=HG',
        boardgames: 'GET /v1/boardgames (vertical=boardgames)',
        ostAlbums: 'GET /v1/ost/albums?media=anime|game',
        ostAlbumById: 'GET /v1/ost/albums/:id',
        cartoons: 'GET /v1/series (vertical=cartoons)',
        comics: 'GET /v1/series (vertical=comics)',
        lightnovels: 'GET /v1/series (vertical=lightnovels)',
        consoles: 'GET /v1/consoles (vertical=consoles)',
        esportsTitles: 'GET /v1/esports/titles',
        esportsPlayers: 'GET /v1/esports/players',
        schemas: 'docs/SCHEMAS.md',
        export: 'GET /v1/export/character/:id (paid)',
        exportDataset: 'GET /v1/export/dataset/:id (paid identity summary)',
        packs: 'GET /v1/pay/packs',
        quote: 'GET /v1/pay/quote?usdg=',
        methods: 'GET /v1/pay/methods',
        authNonce: 'GET /v1/pay/auth/nonce?wallet=0x…',
        authVerify: 'POST /v1/pay/auth/verify',
        authLogout: 'POST /v1/pay/auth/logout',
        claim: 'POST /v1/pay/claim',
        stripeCheckout: 'POST /v1/pay/stripe/checkout',
        stripeWebhook: 'POST /v1/pay/stripe/webhook',
        stripeSync: 'POST /v1/pay/stripe/sync',
        balance: 'GET /v1/pay/balance?wallet=',
        account: 'GET /v1/pay/account?wallet=',
        entitlements: 'GET /v1/pay/entitlements?wallet=',
        accountDelete: 'POST /v1/pay/account/delete',
      },
      hosts: LIVE_VERTICALS.map((v) => `${v}.${rootDomain}`),
      openSource: true,
      x402: x402Enabled(),
    }),
  )

  // —— Agent discovery + SEO / AEO ——
  app.get('/SKILL.md', (c) => {
    const body = readRepoText('SKILL.md')
    if (!body) return c.text('SKILL.md not found', 404)
    c.header('Content-Type', 'text/markdown; charset=utf-8')
    return c.body(body)
  })
  app.get('/llms.txt', (c) => {
    const body = readRepoText('llms.txt')
    if (!body) return c.text('llms.txt not found', 404)
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(body)
  })
  app.get('/llms-full.txt', (c) => {
    const body = readRepoText('llms-full.txt')
    if (!body) return c.text('llms-full.txt not found', 404)
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(body)
  })
  app.get('/robots.txt', (c) => {
    const body = `# Metadata — https://${rootDomain}
# Humans: hub + docs. Agents: /llms.txt · /llms-full.txt · /SKILL.md

User-agent: *
Allow: /
Allow: /console
Allow: /pricing
Allow: /legal.html
Allow: /stats.html
Allow: /feedback
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /SKILL.md
Allow: /v1/
Allow: /openapi.json
Allow: /.well-known/
Disallow: /settings.html
Disallow: /v1/pay/account
Disallow: /v1/pay/auth/

# AI / answer-engine crawlers — same public discovery surface
User-agent: GPTBot
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /SKILL.md
Allow: /openapi.json
Allow: /v1/verticals
Allow: /v1/health
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: https://${rootDomain}/sitemap.xml
`
    c.header('Content-Type', 'text/plain; charset=utf-8')
    return c.body(body)
  })
  app.get('/sitemap.xml', (c) => {
    const base = `https://${rootDomain}`
    const hubPaths = [
      { path: '/', priority: '1.0', freq: 'daily' },
      { path: '/console', priority: '0.9', freq: 'weekly' },
      { path: '/pricing', priority: '0.8', freq: 'weekly' },
      { path: '/stats.html', priority: '0.6', freq: 'hourly' },
      { path: '/legal.html', priority: '0.5', freq: 'monthly' },
      { path: '/feedback', priority: '0.5', freq: 'monthly' },
      { path: '/SKILL.md', priority: '0.9', freq: 'weekly' },
      { path: '/llms.txt', priority: '0.9', freq: 'weekly' },
      { path: '/llms-full.txt', priority: '0.8', freq: 'weekly' },
      { path: '/openapi.json', priority: '0.7', freq: 'weekly' },
      { path: '/v1/verticals', priority: '0.8', freq: 'daily' },
      { path: '/v1/health', priority: '0.5', freq: 'hourly' },
    ]
    const verticals = [
      'anime',
      'manga',
      'lightnovels',
      'game',
      'cartoons',
      'comics',
      'pod',
      'tcg',
      'figures',
      'modelkits',
      'plush',
      'boardgames',
      'ost',
      'consoles',
      'esports',
    ]
    const rows: string[] = []
    for (const p of hubPaths) {
      rows.push(
        `  <url><loc>${base}${p.path}</loc><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`,
      )
    }
    for (const v of verticals) {
      rows.push(
        `  <url><loc>${base}/console/${v}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
      )
    }
    c.header('Content-Type', 'application/xml; charset=utf-8')
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`,
    )
  })
  app.get('/mcp', (c) => c.json(mcpDiscovery(rootDomain)))
  app.post('/mcp', async (c) => {
    let body: {
      jsonrpc?: string
      id?: string | number | null
      method?: string
      params?: Record<string, unknown>
    }
    try {
      body = (await readJsonBodyLimited(c.req.raw, PUBLIC_INTAKE_MAX_BYTES)) as typeof body
    } catch {
      return c.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
        400,
      )
    }
    const toolName = body.params && typeof body.params.name === 'string' ? body.params.name : ''
    const toolArgs =
      body.params && typeof body.params.arguments === 'object' && body.params.arguments
        ? (body.params.arguments as Record<string, unknown>)
        : {}
    const resolvedVertical =
      toolName === 'metadata_get_card' || toolName === 'metadata_market_quote'
        ? ('tcg' as const)
        : resolveVertical({
            header: typeof toolArgs.vertical === 'string' ? toolArgs.vertical : null,
            query: null,
            host: null,
            rootDomain,
          })
    c.set('vertical', resolvedVertical)
    c.header('X-Metadata-Vertical', resolvedVertical)
    if (body.method === 'tools/call' && isMcpCatalogTool(toolName)) {
      const denied = await gate(c, {})
      if (denied) return denied
    }
    const result = await handleMcpRpc(body, {
      authorized: true,
      isPreview: c.get('isPreview') === true,
    })
    if (result.error || (result.result as { isError?: boolean } | undefined)?.isError) {
      c.set('catalogPending', null)
      c.set('x402Pending', null)
      c.set('previewPending', null)
    }
    return c.json(result)
  })

  app.get('/.well-known/ai-plugin.json', (c) =>
    c.json({
      schema_version: 'v1',
      name_for_human: 'Metadata',
      name_for_model: 'metadata_public_catalog',
      description_for_human:
        'Public multi-vertical metadata API for anime, manga, games, POD, TCG, figures, board games, OST, consoles, esports, and comics.',
      description_for_model:
        'Catalog API for fandom and builder data. Set X-Metadata-Vertical (anime|manga|lightnovels|game|cartoons|comics|pod|tcg|figures|modelkits|plush|boardgames|fashion|ost|consoles|esports). Discovery is open (/v1/health, /v1/verticals, /SKILL.md, /llms.txt, POST /mcp). Catalog GET needs prepaid credits + X-Wallet-Address + X-Metadata-Session (or X-Metadata-Service-Key); limited IP preview then 402. POST /v1/pay/claim does not require a session. Flag bad rows via POST /feedback. Read https://metadata.fyi/SKILL.md first. Muse/Phantasy: POST https://metadata.fyi/mcp (streamable HTTP).',
      auth: {
        type: 'user_http',
        authorization_type: 'custom',
        custom_header_name: 'X-Metadata-Session',
        description:
          'Discovery is unauthenticated. Catalog requires X-Wallet-Address + X-Metadata-Session (prepaid credits) or X-Metadata-Service-Key. Optional X-PAYMENT for x402. POST /v1/pay/claim does not require a session.',
      },
      api: {
        type: 'openapi',
        url: `https://${rootDomain}/openapi.json`,
        is_user_authenticated: false,
      },
      logo_url: `https://${rootDomain}/logo.png`,
      contact_email: null,
      legal_info_url: `https://${rootDomain}/legal.html`,
    }),
  )
  app.get('/openapi.json', (c) => {
    const verticalHeader = {
      name: 'X-Metadata-Vertical',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description:
        'anime|manga|lightnovels|game|cartoons|comics|pod|tcg|figures|modelkits|plush|boardgames|fashion|ost|consoles|esports',
    }
    const qParam = {
      name: 'q',
      in: 'query',
      required: false,
      schema: { type: 'string' },
    }
    const limitParam = {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer' },
    }
    const offsetParam = {
      name: 'offset',
      in: 'query',
      required: false,
      schema: { type: 'integer' },
    }
    const catalogSecurity = [{}, { wallet: [], session: [] }, { serviceKey: [] }, { x402: [] }]
    const catalogErrors = {
      '401': {
        description: 'AUTH_REQUIRED — funded wallet without a valid session',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/AuthRequired' } },
        },
      },
      '402': {
        description: 'PAYMENT_REQUIRED or PREVIEW_EXHAUSTED',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/PaymentRequired' } },
        },
      },
    }
    const catalogGet = (
      summary: string,
      extra?: { parameters?: unknown[]; description?: string; responses?: Record<string, unknown> },
    ) => ({
      get: {
        summary,
        description: extra?.description,
        parameters: [verticalHeader, ...(extra?.parameters ?? [])],
        security: catalogSecurity,
        responses: {
          '200': { description: 'OK' },
          ...catalogErrors,
          ...(extra?.responses ?? {}),
        },
      },
    })
    const idParam = (name: string) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    })

    const catalogQueryParameters: Record<string, string[]> = {
      '/v1/series': ['limit', 'q', 'type', 'tag', 'offset'],
      '/v1/series/{id}/characters': ['limit', 'offset'],
      '/v1/characters': ['limit', 'q', 'series', 'tag', 'offset'],
      '/v1/search': ['limit', 'offset', 'q'],
      '/v1/tcg/facets': ['game'],
      '/v1/tcg/sets': ['limit', 'game', 'language', 'q', 'offset'],
      '/v1/tcg/sets/{id}': ['limit', 'offset'],
      '/v1/tcg/cards': [
        'language',
        'limit',
        'game',
        'set',
        'q',
        'rarity',
        'type',
        'subtype',
        'offset',
      ],
      '/v1/market/search': ['kind', 'game', 'q', 'limit', 'offset'],
      '/v1/market/history/{id}': ['variant', 'limit'],
      '/v1/cards': ['limit', 'game', 'set', 'q', 'rarity', 'type', 'subtype', 'offset'],
      '/v1/products': ['limit', 'q', 'brand', 'category', 'provider', 'tag', 'method', 'offset'],
      '/v1/brands': ['q', 'limit', 'offset'],
      '/v1/affiliates': ['legacy', 'format', 'vertical', 'configured'],
      '/v1/print-methods': ['q', 'limit', 'offset'],
      '/v1/figures/makers': ['q', 'limit', 'offset'],
      '/v1/figures/lines': ['q', 'maker', 'kind', 'limit', 'offset'],
      '/v1/figures/items': [
        'limit',
        'q',
        'maker',
        'line',
        'kind',
        'series',
        'tag',
        'release',
        'sort',
        'order',
        'offset',
      ],
      '/v1/modelkits/makers': ['q', 'limit', 'offset'],
      '/v1/modelkits/lines': ['q', 'maker', 'kind', 'limit', 'offset'],
      '/v1/modelkits/items': [
        'q',
        'maker',
        'line',
        'kind',
        'grade',
        'series',
        'tag',
        'limit',
        'offset',
      ],
      '/v1/boardgames': [
        'limit',
        'q',
        'publisher',
        'category',
        'mechanic',
        'players',
        'tag',
        'offset',
      ],
      '/v1/publishers': ['q', 'limit', 'offset'],
      '/v1/plush/makers': ['q', 'limit', 'offset'],
      '/v1/plush/lines': ['q', 'maker', 'kind', 'limit', 'offset'],
      '/v1/plush/items': ['limit', 'q', 'maker', 'line', 'kind', 'series', 'tag', 'offset'],
      '/v1/fashion/brands': ['q', 'limit', 'offset'],
      '/v1/fashion/lines': ['q', 'brand', 'category', 'kind', 'limit', 'offset'],
      '/v1/fashion/items': [
        'q',
        'brand',
        'line',
        'category',
        'kind',
        'tag',
        'season',
        'release',
        'sort',
        'order',
        'limit',
        'offset',
      ],
      '/v1/sneakers/brands': ['q', 'limit', 'offset'],
      '/v1/sneakers/silhouettes': ['q', 'brand', 'limit', 'offset'],
      '/v1/sneakers/models': [
        'q',
        'brand',
        'silhouette',
        'tag',
        'release',
        'sort',
        'order',
        'limit',
        'offset',
      ],
      '/v1/items': [
        'limit',
        'q',
        'brand',
        'line',
        'silhouette',
        'category',
        'kind',
        'tag',
        'season',
        'release',
        'sort',
        'order',
        'offset',
        'maker',
        'series',
      ],
      '/v1/logos': ['series'],
      '/v1/ost/albums': ['limit', 'q', 'media', 'series', 'type', 'artist', 'tag', 'offset'],
      '/v1/ost/artists': ['q', 'limit', 'offset'],
      '/v1/consoles': [
        'limit',
        'q',
        'manufacturer',
        'formFactor',
        'form',
        'generation',
        'tag',
        'offset',
      ],
      '/v1/manufacturers': ['q', 'limit', 'offset'],
      '/v1/esports/titles': ['q', 'tag', 'limit', 'offset'],
      '/v1/esports/leagues': ['q', 'title', 'region', 'limit', 'offset'],
      '/v1/esports/teams': ['q', 'title', 'region', 'limit', 'offset'],
      '/v1/esports/players': ['q', 'title', 'team', 'limit', 'offset'],
    }

    const document = {
      openapi: '3.0.3',
      info: {
        title: 'Metadata API',
        version: VERSION,
        description:
          'Multi-vertical public metadata. See /SKILL.md and /llms.txt. Vertical via X-Metadata-Vertical header. Catalog GET: preview, or X-Wallet-Address + X-Metadata-Session, or X-Metadata-Service-Key, or X-PAYMENT.',
      },
      servers: [{ url: `https://${rootDomain}` }],
      components: {
        securitySchemes: {
          wallet: { type: 'apiKey', in: 'header', name: 'X-Wallet-Address' },
          session: { type: 'apiKey', in: 'header', name: 'X-Metadata-Session' },
          serviceKey: { type: 'apiKey', in: 'header', name: 'X-Metadata-Service-Key' },
          x402: { type: 'apiKey', in: 'header', name: 'X-PAYMENT' },
        },
        schemas: {
          Paginated: {
            type: 'object',
            required: ['items', 'total', 'limit', 'offset'],
            properties: {
              items: { type: 'array', items: { type: 'object' } },
              total: { type: 'integer' },
              limit: { type: 'integer' },
              offset: { type: 'integer' },
            },
          },
          SearchResponse: {
            type: 'object',
            required: ['query', 'hits', 'total', 'limit', 'offset'],
            properties: {
              query: { type: 'string' },
              hits: { type: 'array', items: { type: 'object' } },
              total: { type: 'integer' },
              limit: { type: 'integer' },
              offset: { type: 'integer' },
              vertical: { type: 'string' },
              preview: { type: 'boolean' },
            },
          },
          SkuRef: {
            type: 'object',
            properties: {
              uri: { type: 'string' },
              vertical: { type: 'string' },
              collection: { type: 'string' },
              id: { type: 'string' },
              aliases: { type: 'array', items: { type: 'object' } },
              commerce: {
                type: 'object',
                description:
                  'Optional. fulfill = who delivers/prints the blank; offers = who sells (retail/affiliate, no prices). Market mids stay on /v1/market/quotes/:id.',
                properties: {
                  fulfill: { type: 'array', items: { type: 'object' } },
                  offers: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
          SkuResolveOk: {
            type: 'object',
            required: ['ok', 'unique', 'ref'],
            properties: {
              ok: { type: 'boolean', enum: [true] },
              unique: { type: 'boolean', enum: [true] },
              ref: { $ref: '#/components/schemas/SkuRef' },
            },
          },
          SkuResolveAmbiguous: {
            type: 'object',
            required: ['ok', 'unique', 'error', 'query', 'matches'],
            properties: {
              ok: { type: 'boolean', enum: [true] },
              unique: { type: 'boolean', enum: [false] },
              error: { type: 'string', enum: ['AMBIGUOUS'] },
              query: { type: 'string' },
              matches: {
                type: 'array',
                items: { $ref: '#/components/schemas/SkuRef' },
              },
            },
          },
          AuthRequired: {
            type: 'object',
            properties: {
              error: { type: 'string', enum: ['AUTH_REQUIRED'] },
              message: { type: 'string' },
            },
          },
          PaymentRequired: {
            type: 'object',
            properties: {
              error: { type: 'string', enum: ['PAYMENT_REQUIRED', 'PREVIEW_EXHAUSTED'] },
              message: { type: 'string' },
              preview: { type: 'object' },
              accepts: { type: 'array', items: { type: 'object' } },
              x402: { type: 'boolean' },
              claim: { type: 'string' },
            },
          },
        },
      },
      paths: {
        '/v1/boardgames/{id}': catalogGet('boardgames detail', { parameters: [idParam('id')] }),
        '/v1/brands': catalogGet('brands'),
        '/v1/brands/{id}': catalogGet('brands detail', { parameters: [idParam('id')] }),
        '/v1/cards': catalogGet('cards'),
        '/v1/cards/{id}': catalogGet('cards detail', { parameters: [idParam('id')] }),
        '/v1/characters': catalogGet('characters'),
        '/v1/consoles/{id}': catalogGet('consoles detail', { parameters: [idParam('id')] }),
        '/v1/esports/leagues/{id}': catalogGet('esports leagues detail', {
          parameters: [idParam('id')],
        }),
        '/v1/esports/players/{id}': catalogGet('esports players detail', {
          parameters: [idParam('id')],
        }),
        '/v1/esports/teams/{id}': catalogGet('esports teams detail', {
          parameters: [idParam('id')],
        }),
        '/v1/esports/titles/{id}': catalogGet('esports titles detail', {
          parameters: [idParam('id')],
        }),
        '/v1/fashion/brands': catalogGet('fashion brands'),
        '/v1/fashion/brands/{id}': catalogGet('fashion brands detail', {
          parameters: [idParam('id')],
        }),
        '/v1/fashion/categories': catalogGet('fashion categories'),
        '/v1/fashion/items/{id}': catalogGet('fashion items detail', {
          parameters: [idParam('id')],
        }),
        '/v1/fashion/lines': catalogGet('fashion lines'),
        '/v1/fashion/lines/{id}': catalogGet('fashion lines detail', {
          parameters: [idParam('id')],
        }),
        '/v1/figures/items/{id}': catalogGet('figures items detail', {
          parameters: [idParam('id')],
        }),
        '/v1/figures/lines': catalogGet('figures lines'),
        '/v1/figures/lines/{id}': catalogGet('figures lines detail', {
          parameters: [idParam('id')],
        }),
        '/v1/figures/makers': catalogGet('figures makers'),
        '/v1/figures/makers/{id}': catalogGet('figures makers detail', {
          parameters: [idParam('id')],
        }),
        '/v1/items': catalogGet('items'),
        '/v1/items/{id}': catalogGet('items detail', { parameters: [idParam('id')] }),
        '/v1/logos': catalogGet('logos'),
        '/v1/manufacturers': catalogGet('manufacturers'),
        '/v1/manufacturers/{id}': catalogGet('manufacturers detail', {
          parameters: [idParam('id')],
        }),
        '/v1/market/coverage': catalogGet('market coverage'),
        '/v1/market/history/{id}': catalogGet('market history detail', {
          parameters: [idParam('id')],
        }),
        '/v1/market/items/{id}': catalogGet('market items detail', { parameters: [idParam('id')] }),
        '/v1/market/search': catalogGet('market search'),
        '/v1/market/status': catalogGet('market status'),
        '/v1/modelkits/items/{id}': catalogGet('modelkits items detail', {
          parameters: [idParam('id')],
        }),
        '/v1/modelkits/lines': catalogGet('modelkits lines'),
        '/v1/modelkits/lines/{id}': catalogGet('modelkits lines detail', {
          parameters: [idParam('id')],
        }),
        '/v1/modelkits/makers': catalogGet('modelkits makers'),
        '/v1/modelkits/makers/{id}': catalogGet('modelkits makers detail', {
          parameters: [idParam('id')],
        }),
        '/v1/ost/artists': catalogGet('ost artists'),
        '/v1/ost/artists/{id}': catalogGet('ost artists detail', { parameters: [idParam('id')] }),
        '/v1/plush/items/{id}': catalogGet('plush items detail', { parameters: [idParam('id')] }),
        '/v1/plush/lines': catalogGet('plush lines'),
        '/v1/plush/lines/{id}': catalogGet('plush lines detail', { parameters: [idParam('id')] }),
        '/v1/plush/makers': catalogGet('plush makers'),
        '/v1/plush/makers/{id}': catalogGet('plush makers detail', { parameters: [idParam('id')] }),
        '/v1/print-methods/{id}': catalogGet('print methods detail', {
          parameters: [idParam('id')],
        }),
        '/v1/providers': catalogGet('providers'),
        '/v1/providers/{id}': catalogGet('providers detail', { parameters: [idParam('id')] }),
        '/v1/publishers': catalogGet('publishers'),
        '/v1/publishers/{id}': catalogGet('publishers detail', { parameters: [idParam('id')] }),
        '/v1/report': {
          post: {
            summary: 'Deprecated feedback queue alias; prefer POST /feedback',
            deprecated: true,
            responses: { '202': { description: 'Queued for operator review' } },
          },
        },
        '/v1/series/{id}/logos': catalogGet('series detail logos', { parameters: [idParam('id')] }),
        '/v1/sneakers/brands': catalogGet('sneakers brands'),
        '/v1/sneakers/brands/{id}': catalogGet('sneakers brands detail', {
          parameters: [idParam('id')],
        }),
        '/v1/sneakers/models': catalogGet('sneakers models'),
        '/v1/sneakers/models/{id}': catalogGet('sneakers models detail', {
          parameters: [idParam('id')],
        }),
        '/v1/sneakers/silhouettes': catalogGet('sneakers silhouettes'),
        '/v1/sneakers/silhouettes/{id}': catalogGet('sneakers silhouettes detail', {
          parameters: [idParam('id')],
        }),
        '/v1/tcg/games': catalogGet('tcg games'),
        '/v1/tcg/games/{id}': catalogGet('tcg games detail', { parameters: [idParam('id')] }),
        '/': {
          get: {
            summary: 'Service index + docs map',
          },
        },
        '/SKILL.md': {
          get: {
            summary: 'Agent skill (markdown)',
          },
        },
        '/mcp': {
          get: {
            summary: 'MCP discovery (Muse, Phantasy, Claude, Cursor)',
          },
          post: {
            summary: 'MCP JSON-RPC (streamable HTTP)',
          },
        },
        '/llms-full.txt': { get: { summary: 'Full agent endpoint index' } },
        '/llms.txt': {
          get: {
            summary: 'Short agent index',
          },
        },
        '/v1/health': {
          get: {
            summary: 'Health + counts',
          },
        },
        '/v1/verticals': {
          get: {
            summary: 'List verticals',
          },
        },
        '/v1/datasets': {
          get: {
            summary: 'List first-party vertical datasets and accepted third-party listings (open)',
          },
        },
        '/v1/datasets/{id}': catalogGet('Dataset listing by id', {
          parameters: [idParam('id')],
          responses: {
            '404': { description: 'Dataset not found' },
          },
        }),
        '/v1/export/dataset/{id}': {
          get: {
            summary:
              'Paid identity-summary export (counts only, not a catalog dump). Publisher split 80% of cost in credits when publisherWallet is set. Service-key exports do not credit publishers.',
            parameters: [idParam('id')],
            security: [{ wallet: [], session: [] }, { serviceKey: [] }],
            responses: {
              '200': { description: '{ dataset, export, identity: { vertical, counts } }' },
              '404': { description: 'Dataset not found' },
              ...catalogErrors,
            },
          },
        },
        '/v1/ops/catalog-usage': {
          get: {
            summary: 'Private aggregate catalog usage and denial counts',
            security: [{ serviceKey: [] }],
            responses: {
              '200': { description: 'Catalog usage report' },
              '403': { description: 'Ops key and trusted edge required in production' },
            },
          },
        },
        '/v1/ops/finance': {
          get: {
            summary: 'Private finance journal reconciliation and economic estimates',
            security: [{ serviceKey: [] }],
            responses: {
              '200': { description: 'Finance report' },
              '403': { description: 'Ops key and trusted edge required in production' },
            },
          },
        },
        '/v1/ops/contributions/{id}/accept': {
          post: {
            summary:
              'Accept a queued contribution (ops service key). Credits CONTRIBUTOR_BOUNTY_CREDITS to the row wallet once. Does not merge catalog JSON.',
            security: [{ serviceKey: [] }],
            parameters: [idParam('id')],
            responses: {
              '200': { description: 'Accepted (or alreadyApplied)' },
              '403': { description: 'Ops service key required' },
              '404': { description: 'Contribution not found' },
            },
          },
        },
        '/v1/ops/contributions/{id}/reject': {
          post: {
            summary: 'Reject a queued contribution (ops service key). No credits.',
            security: [{ serviceKey: [] }],
            parameters: [idParam('id')],
            responses: {
              '200': { description: 'Rejected' },
              '403': { description: 'Ops service key required' },
              '404': { description: 'Contribution not found' },
            },
          },
        },
        '/v1/stats': {
          get: {
            summary: 'Public platform traffic (no addresses)',
          },
        },
        '/v1/preview': {
          get: {
            summary: 'Fixed public sample in production; preview quota in development',
            parameters: [verticalHeader],
          },
        },
        '/v1/sku': catalogGet('Resolve a SKU by query', {
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Unique match',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/SkuResolveOk' } },
              },
            },
            '409': {
              description: 'AMBIGUOUS',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SkuResolveAmbiguous' },
                },
              },
            },
          },
        }),
        '/v1/sku/{key}': catalogGet('Resolve a namespaced SKU / style code / collector key', {
          parameters: [idParam('key')],
          responses: {
            '200': {
              description: 'Unique match',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/SkuResolveOk' } },
              },
            },
            '409': {
              description: 'AMBIGUOUS — use the canonical metadata:{vertical}:{collection}:{id}',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SkuResolveAmbiguous' },
                },
              },
            },
          },
        }),
        '/v1/search': catalogGet('Search current vertical', {
          parameters: [qParam, limitParam, offsetParam],
          responses: {
            '200': {
              description:
                '{ query, hits, total, limit, offset } — Paginated-compatible (hits not items)',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/SearchResponse' } },
              },
            },
          },
        }),
        '/v1/series': catalogGet('List series (media verticals)', {
          parameters: [qParam, limitParam, offsetParam],
          responses: {
            '200': {
              description: 'Paginated series',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Paginated' } },
              },
            },
          },
        }),
        '/v1/series/{id}': catalogGet('Series detail + soundtracks / merch joins', {
          parameters: [idParam('id')],
        }),
        '/v1/series/{id}/characters': catalogGet(
          'Paginated characters for a series (characterIds ∪ seriesId)',
          {
            description:
              'Pages seriesCharacters membership. Not a full dump; not GET /v1/characters?series= (title substring). Default limit 40, max MAX_LIMIT.',
            parameters: [idParam('id'), limitParam, offsetParam],
            responses: {
              '200': {
                description:
                  '{ seriesId, characters, total, limit, offset } — a page, not every character',
              },
              '404': { description: 'Series not found' },
            },
          },
        ),
        '/v1/characters/{id}': catalogGet('Character detail', { parameters: [idParam('id')] }),
        '/v1/products': catalogGet('POD products', {
          parameters: [qParam, limitParam, offsetParam],
        }),
        '/v1/products/{id}': catalogGet('POD product by id', { parameters: [idParam('id')] }),
        '/v1/print-methods': catalogGet('POD print methods'),
        '/v1/affiliates': catalogGet('Affiliate partner registry', {
          parameters: [
            { name: 'vertical', in: 'query', required: false, schema: { type: 'string' } },
          ],
        }),
        '/v1/tcg/sets': catalogGet('TCG sets', {
          parameters: [
            { name: 'game', in: 'query', required: false, schema: { type: 'string' } },
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'ja'] },
            },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/tcg/sets/{id}': catalogGet('TCG set and paginated cards', {
          parameters: [idParam('id'), limitParam, offsetParam],
        }),
        '/v1/tcg/cards': catalogGet('TCG cards', {
          parameters: [
            {
              name: 'language',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['en', 'ja'] },
            },
            { name: 'game', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'set', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'rarity', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'type', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'subtype', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/tcg/cards/{id}': catalogGet('TCG card details', {
          parameters: [idParam('id')],
        }),
        '/v1/tcg/facets': catalogGet('TCG set, rarity, type, and subtype facets for one game', {
          parameters: [
            {
              name: 'game',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
        }),
        '/v1/figures/items': catalogGet('Figure items', {
          parameters: [
            { name: 'kind', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/modelkits/items': catalogGet('Model kit items', {
          parameters: [
            { name: 'grade', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/plush/items': catalogGet('Plush items', {
          parameters: [
            { name: 'kind', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/fashion/items': catalogGet('Fashion items', {
          parameters: [
            { name: 'release', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/boardgames': catalogGet('Board games', {
          parameters: [
            { name: 'players', in: 'query', required: false, schema: { type: 'integer' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/ost/albums': catalogGet('Soundtrack albums', {
          parameters: [
            { name: 'media', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/ost/albums/{id}': catalogGet('Soundtrack album by id', {
          parameters: [idParam('id')],
        }),
        '/v1/consoles': catalogGet('Game/arcade consoles', {
          parameters: [
            { name: 'formFactor', in: 'query', required: false, schema: { type: 'string' } },
            qParam,
            limitParam,
            offsetParam,
          ],
        }),
        '/v1/esports/titles': catalogGet('Esports titles', {
          parameters: [qParam, limitParam, offsetParam],
        }),
        '/v1/esports/leagues': catalogGet('Esports leagues'),
        '/v1/esports/teams': catalogGet('Esports teams'),
        '/v1/esports/players': catalogGet('Esports players', {
          parameters: [qParam, limitParam, offsetParam],
        }),
        '/v1/market/quotes/{id}': catalogGet('Coagulated market quote (not identity catalog)', {
          parameters: [idParam('id')],
          description:
            'mid is a median of independent venues after collapsing TCGPlayer reprints. Variants include confidence (multi-venue|single-venue), venue/basis/via on sources[], and methodology. Observations, not buyable offers.',
        }),
        '/v1/export/character/{id}': {
          get: {
            summary: 'Export character JSON (prepaid; debit after found)',
            parameters: [verticalHeader, idParam('id')],
            security: [{ wallet: [], session: [] }, { serviceKey: [] }],
            responses: {
              '200': { description: 'Export payload' },
              ...catalogErrors,
            },
          },
        },
        '/v1/pay/auth/nonce': {
          get: {
            summary: 'Wallet ownership nonce for personal_sign',
            parameters: [
              { name: 'wallet', in: 'query', required: true, schema: { type: 'string' } },
            ],
            responses: {
              '200': { description: '{ ok, nonce, message, expiresAt }' },
              '400': { description: 'INVALID_WALLET' },
            },
          },
        },
        '/v1/pay/auth/verify': {
          post: {
            summary: 'Verify personal_sign and issue X-Metadata-Session token',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['wallet', 'message', 'signature'],
                    properties: {
                      wallet: { type: 'string' },
                      message: { type: 'string' },
                      signature: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: '{ ok, token, expiresAt }' },
              '401': { description: 'AUTH_FAILED' },
            },
          },
        },
        '/v1/pay/auth/logout': {
          post: {
            summary: 'Revoke the current X-Metadata-Session',
          },
        },
        '/v1/pay/packs': {
          get: {
            summary: 'Credit packs / top-up config',
          },
        },
        '/v1/pay/quote': {
          get: {
            summary: 'Quote credits for a USDG amount (usdg or amount query required)',
            parameters: [
              { name: 'usdg', in: 'query', required: false, schema: { type: 'number' } },
              {
                name: 'amount',
                in: 'query',
                required: false,
                schema: { type: 'number' },
                description: 'Alias of usdg; provide one amount query',
              },
            ],
          },
        },
        '/v1/pay/methods': {
          get: {
            summary: 'Payment methods',
          },
        },
        '/v1/pay/balance': {
          get: {
            summary: 'Wallet credit balance (signed wallet session required)',
            security: [{ session: [] }],
            parameters: [
              { name: 'wallet', in: 'query', required: false, schema: { type: 'string' } },
            ],
            responses: {
              '200': { description: 'Wallet credit balance' },
              '401': { description: 'AUTH_REQUIRED' },
            },
          },
        },
        '/v1/pay/account': {
          get: {
            summary: 'Signed-in wallet account summary',
            security: [{ session: [] }],
            parameters: [
              { name: 'wallet', in: 'query', required: false, schema: { type: 'string' } },
            ],
            responses: {
              '200': { description: 'Account' },
              '401': { description: 'AUTH_REQUIRED' },
            },
          },
        },
        '/v1/pay/entitlements': {
          get: {
            summary: 'Power / ad-free entitlements (session required)',
            security: [{ session: [] }],
          },
        },
        '/v1/pay/account/delete': {
          post: {
            summary: 'Delete wallet account (session required)',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['confirm'],
                    properties: {
                      wallet: { type: 'string' },
                      confirm: { type: 'string', enum: ['DELETE'] },
                    },
                  },
                },
              },
            },
            security: [{ session: [] }],
          },
        },
        '/v1/pay/claim': {
          post: {
            summary:
              'Claim an on-chain USDG payment. Session is not required — the transaction verifier proves the payer.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['wallet', 'txHash'],
                    properties: {
                      wallet: { type: 'string' },
                      usdg: { type: 'number' },
                      packId: { type: 'string' },
                      txHash: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        '/v1/pay/stripe/checkout': {
          post: {
            summary: 'Create Stripe Checkout session (signed wallet session required)',
            security: [{ session: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      wallet: { type: 'string' },
                      packId: { type: 'string' },
                      usdg: { type: 'number' },
                      amount: { type: 'number' },
                      successUrl: { type: 'string' },
                      cancelUrl: { type: 'string' },
                    },
                    anyOf: [
                      { required: ['packId'] },
                      { required: ['usdg'] },
                      { required: ['amount'] },
                    ],
                  },
                },
              },
            },
            responses: {
              '200': { description: '{ ok, url, sessionId }' },
              '400': { description: 'Invalid body or amount' },
              '401': { description: 'AUTH_REQUIRED' },
              '403': { description: 'WALLET_MISMATCH' },
              '429': { description: 'RATE_LIMIT' },
              '503': { description: 'Stripe unavailable or misconfigured' },
            },
          },
        },
        '/v1/pay/stripe/webhook': {
          post: {
            summary: 'Stripe webhook',
          },
        },
        '/v1/pay/stripe/sync': {
          post: {
            summary: 'Sync a Stripe Checkout session',
          },
        },
        '/feedback': {
          post: {
            summary:
              'Flag incorrect/missing data (operator queue). Same as human form at /feedback.html — not a catalog route.',
          },
          get: {
            summary: 'Feedback endpoint schema (for agents)',
          },
        },
        '/v1/sku/resolve': {
          post: {
            summary:
              'Resolve a SKU (prefer this for namespaced URIs — Cloudflare rejects colons in GET paths). Catalog-gated hub identity; 409 AMBIGUOUS is a result body, not a crash.',
            security: catalogSecurity,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      q: { type: 'string' },
                      keys: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Unique match, or batch { ok, results } (max 20 keys)',
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [
                        { $ref: '#/components/schemas/SkuResolveOk' },
                        {
                          type: 'object',
                          required: ['ok', 'results'],
                          properties: {
                            ok: { type: 'boolean', enum: [true] },
                            results: { type: 'array', maxItems: 20, items: { type: 'object' } },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              '409': {
                description:
                  'AMBIGUOUS — 409 is a result; use the canonical metadata:{vertical}:{collection}:{id}',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SkuResolveAmbiguous' },
                  },
                },
              },
              '404': { description: 'NOT_FOUND' },
              ...catalogErrors,
            },
          },
        },
        '/v1/contribute': {
          post: {
            summary:
              'Suggest a new catalog row or dataset listing (queued; not auto-merged). Optional wallet (0x + 40 hex) is credited only if an operator accepts.',
          },
        },
      },
      'x-schemas': 'See docs/SCHEMAS.md in the repository for TypeScript data shapes.',
    }
    // Filters are explicit contract metadata, not inferred from requests.
    for (const [path, names] of Object.entries(catalogQueryParameters)) {
      const operation = (document.paths as Record<string, { get?: { parameters?: unknown[] } }>)[
        path
      ]?.get
      if (!operation) continue
      const parameters = (operation.parameters ??= []) as { name: string; in: string }[]
      for (const name of names) {
        if (parameters.some((parameter) => parameter.in === 'query' && parameter.name === name))
          continue
        parameters.push({
          name,
          in: 'query',
          required: false,
          schema: { type: ['limit', 'offset'].includes(name) ? 'integer' : 'string' },
        } as (typeof parameters)[number])
      }
    }
    // Summary-only entries remain intentionally generic until their response
    // schemas are documented; OpenAPI requires a nonempty Responses Object.
    for (const item of Object.values(document.paths)) {
      for (const operation of Object.values(item)) {
        const op = operation as { responses?: Record<string, unknown> }
        op.responses ??= {
          default: { description: 'Endpoint response; see docs/API.md for behavior' },
        }
      }
    }
    return c.json(document)
  })

  return app
}
