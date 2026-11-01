import { CONTENT_SECURITY_POLICY } from './security-policy.js'
/**
 * Metadata edge Worker:
 * - Human UI (HTML/assets) from Workers Static Assets (built Vite multi-page)
 * - API / agent discovery proxied to ORIGIN_URL (Vultr)
 * - Vertical subdomains: HTML → apex /console/{v}; /v1 stays on origin
 * - Reserved hosts (combo, origin, www) are NOT catalog verticals
 */

export interface Env {
  ASSETS: Fetcher
  ROOT_DOMAIN: string
  ORIGIN_URL: string
  RELEASE_ID?: string
  /** Origin fetch timeout in ms. Default 5000. Hung origin must 502, not stall the Worker. */
  ORIGIN_TIMEOUT_MS?: string
  /** Payment requests need time for bounded verify + settlement calls. */
  ORIGIN_PAYMENT_TIMEOUT_MS?: string
  /** Set with `wrangler secret put EDGE_SHARED_SECRET`; never commit the value. */
  EDGE_SHARED_SECRET?: string
}

/** Default origin proxy timeout. Agents should see ORIGIN_UNREACHABLE, not a CF hang. */
export const ORIGIN_FETCH_TIMEOUT_MS = 5000

function originTimeoutMs(env: Env, payment = false): number {
  const fallback = payment ? 25_000 : ORIGIN_FETCH_TIMEOUT_MS
  const raw = payment ? env.ORIGIN_PAYMENT_TIMEOUT_MS : env.ORIGIN_TIMEOUT_MS
  const n = raw ? Number(raw) : fallback
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 60_000) : fallback
}

const PUBLIC_INTAKE_MAX_BYTES = 256 * 1024

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // Enforced CSP: script execution and styles remain same-origin only; image
  // and wallet origins are explicit current integrations.
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
} as const

async function readBodyLimited(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel('request body too large')
        throw new Error('REQUEST_BODY_TOO_LARGE')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}

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

const CLEAN_HTML: Record<string, string> = {
  '/': '/index.html',
  '/app': '/app.html',
  '/console': '/docs.html',
  '/pricing': '/pricing.html',
  '/stats': '/stats.html',
  '/settings': '/settings.html',
  '/legal': '/legal.html',
  '/feedback': '/feedback.html',
}

/** Subdomains that are product surfaces, not catalog verticals. */
const RESERVED_SUBDOMAINS = new Set(['origin', 'www', 'combo'])

function apexHost(env: Env): string {
  return (env.ROOT_DOMAIN || 'metadata.fyi').toLowerCase().replace(/^\./, '')
}

function originBase(env: Env): string {
  return (env.ORIGIN_URL || 'https://origin.metadata.fyi').replace(/\/$/, '')
}

function wantsHtml(req: Request): boolean {
  const accept = (req.headers.get('accept') || '').toLowerCase()
  const url = new URL(req.url)
  if ((url.searchParams.get('format') || '').toLowerCase().includes('json')) return false
  if (accept.includes('application/json') && !accept.includes('text/html')) return false
  return accept.includes('text/html')
}

/** Paths that must hit the Node API origin. */
function isOriginPath(pathname: string, method: string): boolean {
  if (
    pathname === '/health' ||
    pathname.startsWith('/v1') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/media') ||
    pathname.startsWith('/openapi') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    (pathname === '/mcp' && method !== 'GET' && method !== 'HEAD')
  ) {
    return true
  }
  // POST feedback = API; GET feedback = static form (unless Accept: json)
  if (pathname === '/feedback' && method !== 'GET') return true
  return false
}

function isApex(host: string, apex: string): boolean {
  return host === apex || host === `www.${apex}`
}

function subdomainLabel(host: string, apex: string): string | null {
  if (!host.endsWith(`.${apex}`)) return null
  if (isApex(host, apex)) return null
  const sub = host.slice(0, -(apex.length + 1)).split('.')[0]
  return sub || null
}

/** Catalog vertical only — never combo/origin/www. */
function verticalFromHost(host: string, apex: string): string | null {
  const sub = subdomainLabel(host, apex)
  if (!sub || RESERVED_SUBDOMAINS.has(sub)) return null
  return sub
}

type ProxyOpts = {
  /**
   * Rewrite pathname before proxy (Workers fetch() always sets Host to the
   * target URL host — cannot force Host: combo.*). Combo uses `/.combo-spa` prefix.
   */
  pathPrefix?: string
  /** When true, do not set x-metadata-vertical from the public host. */
  skipVerticalHeader?: boolean
}

function withReleaseHeader(response: Response, env: Env): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  if (env.RELEASE_ID) headers.set('X-Metadata-Release', env.RELEASE_ID)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function originProxyTarget(req: Request, env: Env, opts: ProxyOpts = {}): URL | Response {
  const url = new URL(req.url)
  const origin = new URL(originBase(env) + '/')
  const rawPath = opts.pathPrefix
    ? `${opts.pathPrefix.replace(/\/$/, '')}${url.pathname === '/' ? '/' : url.pathname}`
    : url.pathname
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawPath) || rawPath.includes('\\')) {
    return jsonError(400, { error: 'BAD_PATH' })
  }
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  if (path.startsWith('//')) {
    return jsonError(400, { error: 'BAD_PATH' })
  }
  const target = new URL(path + url.search, origin)
  if (target.origin !== origin.origin) {
    return jsonError(400, { error: 'BAD_PATH' })
  }
  return target
}

async function proxyToOrigin(req: Request, env: Env, opts: ProxyOpts = {}): Promise<Response> {
  const url = new URL(req.url)
  const apex = apexHost(env)
  // ORIGIN_URL must be DNS-only (grey cloud) or a host not routed to this Worker —
  // otherwise fetch re-enters the Worker and loops.
  const targetOrError = originProxyTarget(req, env, opts)
  if (targetOrError instanceof Response) {
    return withReleaseHeader(targetOrError, env)
  }
  const target = targetOrError
  const headers = new Headers(req.headers)
  let bufferedBody: ArrayBuffer | null | undefined
  if (isPublicIntakePath(url.pathname) && req.method !== 'GET' && req.method !== 'HEAD') {
    const declared = Number(req.headers.get('content-length') || '')
    if (Number.isFinite(declared) && declared > PUBLIC_INTAKE_MAX_BYTES) {
      return withReleaseHeader(
        new Response(
          JSON.stringify({ error: 'REQUEST_BODY_TOO_LARGE', maxBytes: PUBLIC_INTAKE_MAX_BYTES }),
          { status: 413, headers: { 'content-type': 'application/json' } },
        ),
        env,
      )
    }
    try {
      bufferedBody = await readBodyLimited(req, PUBLIC_INTAKE_MAX_BYTES)
    } catch {
      return withReleaseHeader(
        new Response(
          JSON.stringify({ error: 'REQUEST_BODY_TOO_LARGE', maxBytes: PUBLIC_INTAKE_MAX_BYTES }),
          { status: 413, headers: { 'content-type': 'application/json' } },
        ),
        env,
      )
    }
  }
  // Remove client-supplied proxy identity headers before adding edge identity.
  headers.delete('cf-connecting-ip')
  headers.delete('x-real-ip')
  headers.delete('x-forwarded-for')
  headers.delete('x-metadata-client-ip')
  headers.delete('x-metadata-edge-token')
  // The apex console selects a catalog with this public header. A vertical
  // subdomain remains authoritative; proxy identity headers are never selectors.
  const requestedVertical = headers.get('x-metadata-vertical')?.trim().toLowerCase()
  headers.delete('x-metadata-vertical')
  if (
    !opts.skipVerticalHeader &&
    (url.hostname.toLowerCase() === apex || url.hostname.toLowerCase() === `www.${apex}`) &&
    requestedVertical &&
    /^[a-z][a-z0-9-]{0,63}$/.test(requestedVertical)
  )
    headers.set('x-metadata-vertical', requestedVertical)
  // Preserve client IP for preview rate limits only through the shared proof.
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) headers.set('x-metadata-client-ip', cfIp)
  if (env.EDGE_SHARED_SECRET) headers.set('x-metadata-edge-token', env.EDGE_SHARED_SECRET)
  headers.set('x-forwarded-proto', 'https')
  headers.set('x-forwarded-host', url.hostname)
  // Host is forced to ORIGIN_URL host by the runtime; set it explicitly anyway.
  headers.set('host', new URL(originBase(env)).host)
  if (!opts.skipVerticalHeader) {
    const sub = verticalFromHost(url.hostname.toLowerCase(), apex)
    if (sub && !headers.get('x-metadata-vertical')) {
      headers.set('x-metadata-vertical', sub)
    }
  }
  // Avoid compressing twice awkwardly
  headers.delete('accept-encoding')
  // Prevent accidental Worker-to-Worker loop markers
  headers.set('x-metadata-edge', '1')

  const timeoutMs = originTimeoutMs(
    env,
    url.pathname.startsWith('/v1/pay/') ||
      headers.has('x-payment') ||
      headers.has('payment-signature'),
  )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal: controller.signal,
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = bufferedBody ?? req.body
    // @ts-expect-error duplex required for streaming body in Workers
    init.duplex = 'half'
  }

  let res: Response
  try {
    res = await fetch(target.toString(), init)
  } catch (e) {
    const aborted = controller.signal.aborted
    console.error(
      '[metadata-edge] origin unreachable',
      aborted ? `timeout ${timeoutMs}ms` : e instanceof Error ? e.message : String(e),
    )
    return withReleaseHeader(jsonError(502, { error: 'ORIGIN_UNREACHABLE', timeoutMs }), env)
  } finally {
    clearTimeout(timer)
  }
  // Clone headers; strip hop-by-hop
  const out = new Headers(res.headers)
  out.delete('transfer-encoding')
  return withReleaseHeader(
    new Response(res.body, { status: res.status, statusText: res.statusText, headers: out }),
    env,
  )
}

function assetRequest(req: Request, assetPath: string): Request {
  const url = new URL(req.url)
  url.pathname = assetPath
  return new Request(url.toString(), {
    method: 'GET',
    headers: req.headers,
  })
}

function mapCleanPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (CLEAN_HTML[p]) return CLEAN_HTML[p]
  if (/^\/console\/[^/]+$/.test(p)) return '/docs.html'
  // legacy
  if (p === '/docs.html' || p === '/docs') return '/docs.html'
  if (p.endsWith('.html')) return p
  return null
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const apex = apexHost(env)
    const host = url.hostname.toLowerCase()
    const path = url.pathname
    if (path.startsWith('//') || path.includes('\\') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
      return withReleaseHeader(jsonError(400, { error: 'BAD_PATH' }), env)
    }

    // origin.* is DNS-only normally; if a request still hits the Worker, refuse to proxy-to-self
    if (host === `origin.${apex}`) {
      return withReleaseHeader(
        new Response('origin hostname is API origin (DNS-only). Point browsers at metadata.fyi.', {
          status: 404,
        }),
        env,
      )
    }

    // --- Combo SPA lives on origin (Caddy), not Workers Static Assets ---
    // Must not treat "combo" as a catalog vertical → /console/combo.
    // Workers cannot override Host on fetch(), so origin serves SPA under /.combo-spa/*.
    if (host === `combo.${apex}`) {
      return proxyToOrigin(req, env, {
        pathPrefix: '/.combo-spa',
        skipVerticalHeader: true,
      })
    }

    // --- Vertical host: API stays; browsers → apex console ---
    const vertical = verticalFromHost(host, apex)
    if (vertical) {
      if (isOriginPath(path, req.method)) {
        return proxyToOrigin(req, env)
      }
      if (path === '/' && !wantsHtml(req)) {
        return proxyToOrigin(req, env)
      }
      if (path === '/feedback' && wantsHtml(req) === false && req.method === 'GET') {
        return proxyToOrigin(req, env)
      }
      // Human UI never lives on vertical hosts
      if (req.method === 'GET' || req.method === 'HEAD') {
        let dest = `https://${apex}/console/${encodeURIComponent(vertical)}`
        if (path.startsWith('/console')) dest = `https://${apex}${path}`
        else if (
          CLEAN_HTML[path.replace(/\/+$/, '') || '/'] &&
          path !== '/' &&
          path !== '/console'
        ) {
          dest = `https://${apex}${path.replace(/\/+$/, '')}`
        }
        return withReleaseHeader(Response.redirect(dest, 302), env)
      }
      return proxyToOrigin(req, env)
    }

    // --- Apex (or workers.dev): API vs assets ---
    if (isOriginPath(path, req.method)) {
      return proxyToOrigin(req, env)
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && path === '/mcp') {
      const res = await env.ASSETS.fetch(assetRequest(req, '/mcp.json'))
      if (res.status !== 404) return withReleaseHeader(res, env)
    }
    // Root discovery JSON for agents
    if (path === '/' && !wantsHtml(req)) {
      return proxyToOrigin(req, env)
    }
    if (path === '/feedback' && req.method === 'GET' && !wantsHtml(req)) {
      return proxyToOrigin(req, env)
    }

    // Legacy *.html → clean (301) for apex
    if (path === '/docs.html') {
      const v = url.searchParams.get('vertical')
      const loc = v ? `/console/${encodeURIComponent(v)}` : '/console'
      return withReleaseHeader(Response.redirect(new URL(loc, url.origin).toString(), 301), env)
    }
    for (const [legacy, clean] of [
      ['/pricing.html', '/pricing'],
      ['/stats.html', '/stats'],
      ['/settings.html', '/settings'],
      ['/legal.html', '/legal'],
      ['/feedback.html', '/feedback'],
      ['/index.html', '/'],
    ] as const) {
      if (path === legacy) {
        return withReleaseHeader(
          Response.redirect(new URL(clean + url.search, url.origin).toString(), 301),
          env,
        )
      }
    }

    // Map clean routes → built HTML files
    const mapped = mapCleanPath(path)
    if (mapped) {
      const res = await env.ASSETS.fetch(assetRequest(req, mapped))
      if (res.status !== 404) return withReleaseHeader(res, env)
    }

    // Static file as-is (assets/*, favicon, etc.)
    const asIs = await env.ASSETS.fetch(req)
    if (asIs.status !== 404) return withReleaseHeader(asIs, env)

    // Unknown human path → hub
    if (wantsHtml(req) || req.method === 'GET') {
      return withReleaseHeader(await env.ASSETS.fetch(assetRequest(req, '/index.html')), env)
    }
    return withReleaseHeader(new Response('Not Found', { status: 404 }), env)
  },
}
