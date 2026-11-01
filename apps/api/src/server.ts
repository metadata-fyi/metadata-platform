import fs from 'node:fs'
import path from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { contentLengthTooLarge, PUBLIC_INTAKE_MAX_BYTES } from '@metadata/api/input-limits'
import { closeRuntimeDb } from '@metadata/api/runtime-db'
import { flushStatsNow } from '@metadata/api/request-stats'
import { createOriginApp, registerOriginBackend, type OriginBackend } from './origin-app.js'
import { createRequestDrain } from './request-drain.js'
import { assertRuntimeConfiguration } from './runtime-config.js'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const corsOrigin = process.env.CORS_ORIGIN ?? '*'
const rootDomain = process.env.METADATA_ROOT_DOMAIN ?? 'metadata.fyi'
const isProd = process.env.NODE_ENV === 'production'
const releaseId = process.env.METADATA_RELEASE_ID?.trim() || ''
const here = path.dirname(fileURLToPath(import.meta.url))
const runtimeMetricsPath = path.join(
  process.env.DATA_DIR ?? path.join(process.cwd(), 'data'),
  'runtime-metrics.json',
)
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
eventLoopDelay.enable()
let runtimeMetricsTimer: ReturnType<typeof setInterval> | undefined
/** monorepo root: apps/api/src → ../../.. */
const monorepoRoot = path.resolve(here, '../../..')

/**
 * Keep the server's startup/typecheck graph lightweight. The catalog router
 * imports every catalog JSON file, so its runtime module is intentionally
 * loaded behind this small structural boundary below.
 */
type CatalogApp = OriginBackend
type MetadataRouterModule = {
  createMetadataRouter: (opts: {
    corsOrigin?: string | string[]
    rootDomain?: string
  }) => CatalogApp
}

let catalogApp: CatalogApp | undefined
let catalogsReady = false

const app = createOriginApp({
  getBackend: () => catalogApp,
  isReady: () => catalogsReady,
  releaseId,
})

const webDist = path.join(monorepoRoot, 'apps/web/dist')
const webIndex = path.join(webDist, 'index.html')
const mediaOptimized = path.join(monorepoRoot, 'packages/api/data/media/optimized')
/** When 0/false, Node is API-only (Caddy or CF Worker serves HTML). Default: on if dist exists. */
const serveStaticEnv = process.env.SERVE_STATIC
const serveStaticWanted =
  serveStaticEnv === '0' || serveStaticEnv === 'false'
    ? false
    : serveStaticEnv === '1' || serveStaticEnv === 'true'
      ? true
      : true
const hasWebDist = isProd && serveStaticWanted && fs.existsSync(webDist) && fs.existsSync(webIndex)

const apex = rootDomain.toLowerCase().replace(/^\./, '')

function isPublicIntakePath(pathname: string): boolean {
  return (
    pathname === '/feedback' ||
    /^\/v1(?:\/[^/]+)?\/(?:report|contribute)$/.test(pathname) ||
    pathname === '/v1/pay/auth/verify' ||
    pathname === '/v1/pay/claim' ||
    pathname === '/v1/pay/stripe/checkout' ||
    pathname === '/v1/pay/stripe/webhook' ||
    pathname === '/v1/pay/stripe/sync' ||
    pathname === '/v1/pay/account/delete' ||
    pathname === '/mcp'
  )
}

// Node is also a directly reachable origin in some deployments. Enforce the
// declared limit here in addition to the edge and Caddy limits.
app.use('*', async (c, next) => {
  if (
    c.req.method !== 'GET' &&
    c.req.method !== 'HEAD' &&
    isPublicIntakePath(c.req.path) &&
    contentLengthTooLarge(c.req.raw.headers, PUBLIC_INTAKE_MAX_BYTES)
  ) {
    return c.json({ error: 'REQUEST_BODY_TOO_LARGE', maxBytes: PUBLIC_INTAKE_MAX_BYTES }, 413)
  }
  return next()
})

function wantsHtml(c: {
  req: {
    header: (n: string) => string | undefined
    query: (n: string) => string | undefined
  }
}) {
  const accept = (c.req.header('accept') || '').toLowerCase()
  const format = (c.req.query('format') || '').toLowerCase()
  if (format.includes('json')) return false
  if (accept.includes('application/json') && !accept.includes('text/html')) return false
  return accept.includes('text/html')
}

function readPage(file: string): string {
  return fs.readFileSync(path.join(webDist, file), 'utf8')
}

/** Clean human paths → multi-page HTML files in dist. */
const CLEAN_PAGES: Record<string, string> = {
  '/console': 'docs.html',
  '/pricing': 'pricing.html',
  '/stats': 'stats.html',
  '/settings': 'settings.html',
  '/legal': 'legal.html',
  '/feedback': 'feedback.html',
}

// --- Vertical subdomain: browsers → apex /console/{vertical}; API stays local ---
app.use('*', async (c, next) => {
  if (!hasWebDist) return next()
  const reqHost = (c.req.header('host') || '').toLowerCase().split(':')[0]
  if (
    !reqHost ||
    reqHost === apex ||
    reqHost === `www.${apex}` ||
    reqHost === 'localhost' ||
    reqHost.startsWith('127.')
  ) {
    return next()
  }
  if (!reqHost.endsWith(`.${apex}`)) return next()

  const p = c.req.path
  // Keep API / agent discovery on the vertical host
  if (
    p.startsWith('/v1') ||
    p.startsWith('/api') ||
    p.startsWith('/SKILL') ||
    p.startsWith('/llms') ||
    p.startsWith('/openapi') ||
    p.startsWith('/.well-known')
  ) {
    return next()
  }
  // POST /feedback is API
  if (p === '/feedback' && c.req.method !== 'GET') return next()

  if (!wantsHtml(c) && c.req.method !== 'GET') return next()
  if (!wantsHtml(c) && p === '/') return next() // JSON discovery on /

  const sub = reqHost.slice(0, -(apex.length + 1)).split('.')[0] || 'anime'
  // UI always on apex
  let dest = `https://${apex}/console/${encodeURIComponent(sub)}`
  // Preserve clean page if they hit pricing etc. on a vertical host
  if (CLEAN_PAGES[p] && p !== '/console') {
    dest = `https://${apex}${p}`
  } else if (p.startsWith('/console/')) {
    dest = `https://${apex}${p}`
  }
  return c.redirect(dest, 302)
})

// --- Legacy *.html → clean paths (301) ---
if (hasWebDist) {
  app.get('/docs.html', (c) => {
    const v = (c.req.query('vertical') || '').trim().toLowerCase()
    return c.redirect(v ? `/console/${encodeURIComponent(v)}` : '/console', 301)
  })
  app.get('/pricing.html', (c) =>
    c.redirect(
      '/pricing' + (c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : ''),
      301,
    ),
  )
  app.get('/stats.html', (c) => c.redirect('/stats', 301))
  app.get('/settings.html', (c) => c.redirect('/settings', 301))
  app.get('/legal.html', (c) => c.redirect('/legal', 301))
  app.get('/feedback.html', (c) => {
    const q = c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : ''
    return c.redirect(`/feedback${q}`, 301)
  })
  app.get('/index.html', (c) => c.redirect('/', 301))

  // Clean routes → multi-page HTML
  app.get('/console', (c) => c.html(readPage('docs.html')))
  app.get('/console/:vertical', (c) => c.html(readPage('docs.html')))
  app.get('/pricing', (c) => c.html(readPage('pricing.html')))
  app.get('/stats', (c) => c.html(readPage('stats.html')))
  app.get('/settings', (c) => c.html(readPage('settings.html')))
  app.get('/legal', (c) => c.html(readPage('legal.html')))
  // GET /feedback: browsers get form HTML; agents (Accept: json) hit the API router
  app.get('/feedback', async (c, next) => {
    if (!wantsHtml(c)) return next()
    return c.html(readPage('feedback.html'))
  })
}

// API router registers GET / as discovery JSON (wins over static if mounted first).
// Browsers send Accept: text/html — serve the hub.
if (hasWebDist) {
  app.get('/', async (c, next) => {
    if (!wantsHtml(c)) return next()
    return c.html(fs.readFileSync(webIndex, 'utf8'))
  })
}

function registerMediaStatic() {
  // Official optimized catalog photos (docs/MEDIA.md) — before API/static catch-alls
  if (fs.existsSync(mediaOptimized)) {
    app.use(
      '/media/optimized/*',
      serveStatic({
        root: path.join(monorepoRoot, 'packages/api/data/media'),
        rewriteRequestPath: (p) => p.replace(/^\/media/, ''),
      }),
    )
    console.log(`[metadata] media optimized at ${mediaOptimized}`)
  }
}

function registerWebStatic() {
  if (!hasWebDist) {
    if (isProd) {
      if (!serveStaticWanted) {
        console.log(`[metadata] SERVE_STATIC=0 — API only (edge/Caddy serves HTML)`)
      } else {
        console.warn(`[metadata] no web dist at ${webDist}`)
      }
    }
    return
  }

  app.use('/*', serveStatic({ root: webDist }))
  app.get('*', async (c) => {
    const p = c.req.path
    if (
      p.startsWith('/v1') ||
      p.startsWith('/api') ||
      p === '/feedback' ||
      p.startsWith('/SKILL') ||
      p.startsWith('/llms') ||
      p.startsWith('/openapi')
    ) {
      return c.text('Not Found', 404)
    }
    // Unknown human path → hub (not docs) so /console/* already handled above
    return c.html(fs.readFileSync(webIndex, 'utf8'))
  })
  console.log(`[metadata] serving static from ${webDist}`)
}

// All routes must be registered before the server accepts a request. Hono
// builds its matcher on first use and rejects later route additions.
registerMediaStatic()
registerOriginBackend(app, {
  getBackend: () => catalogApp,
  isReady: () => catalogsReady,
})
registerWebStatic()

let shuttingDown = false
let httpServer: ReturnType<typeof serve> | undefined
const requestDrain = createRequestDrain((request) => app.fetch(request))

function writeRuntimeMetrics() {
  try {
    const metrics = process.memoryUsage()
    const report = {
      at: new Date().toISOString(),
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: { rss: metrics.rss, heapUsed: metrics.heapUsed, external: metrics.external },
      eventLoopDelayMs: {
        p99: Number.isFinite(eventLoopDelay.percentile(99))
          ? eventLoopDelay.percentile(99) / 1e6
          : null,
        max: Number.isFinite(eventLoopDelay.max) ? eventLoopDelay.max / 1e6 : null,
      },
    }
    fs.mkdirSync(path.dirname(runtimeMetricsPath), { recursive: true, mode: 0o700 })
    const temporary = `${runtimeMetricsPath}.${process.pid}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(report)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, runtimeMetricsPath)
    eventLoopDelay.reset()
  } catch (error) {
    console.warn('[metadata] runtime metrics write failed', error)
  }
}

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[metadata] ${signal} — draining requests before closing runtime db`)
  const deadline = setTimeout(() => {
    console.error('[metadata] request drain timed out; reconcile pending payments before retrying')
    if (httpServer && 'closeAllConnections' in httpServer) httpServer.closeAllConnections()
    process.exit(1)
  }, 35_000)
  if (runtimeMetricsTimer) clearInterval(runtimeMetricsTimer)
  writeRuntimeMetrics()
  eventLoopDelay.disable()
  const drained = requestDrain.stop()
  httpServer?.close()
  await drained
  try {
    flushStatsNow()
  } catch (err) {
    console.error('[metadata] stats flush failed', err)
  }
  try {
    closeRuntimeDb()
  } catch (err) {
    console.error('[metadata] runtime db close failed', err)
  }
  clearTimeout(deadline)
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

async function main() {
  assertRuntimeConfiguration()
  httpServer = serve({ fetch: requestDrain.fetch, port, hostname: host })
  console.log(`[metadata] listening on http://${host}:${port}`)
  console.log(`[metadata] root domain ${rootDomain}`)
  console.log(`[metadata] CORS_ORIGIN=${corsOrigin}`)
  console.log(
    `[metadata] x402=${process.env.X402_ENABLED ?? '0'} DEV_TRUST_CLAIM=${process.env.DEV_TRUST_CLAIM ?? '0'} stripe=${process.env.STRIPE_SECRET_KEY ? 'on' : 'off'}`,
  )

  const catalogModulePath: string = '@metadata/api/hono'
  const { createMetadataRouter } = (await import(catalogModulePath)) as MetadataRouterModule
  catalogApp = createMetadataRouter({
    rootDomain,
    corsOrigin: corsOrigin.includes(',') ? corsOrigin.split(',').map((s) => s.trim()) : corsOrigin,
  })
  catalogsReady = true
  eventLoopDelay.reset()
  writeRuntimeMetrics()
  runtimeMetricsTimer = setInterval(writeRuntimeMetrics, 60_000)
  runtimeMetricsTimer.unref()
  console.log('[metadata] catalogs ready')
}

main().catch((err) => {
  console.error('[metadata] failed to start', err)
  process.exit(1)
})
