import { Hono } from 'hono'

export type OriginBackend = {
  fetch: (request: Request) => Response | Promise<Response>
}

export type OriginAppOptions = {
  getBackend?: () => OriginBackend | undefined | null
  isReady?: () => boolean
  releaseId?: string
}

/**
 * Liveness/readiness wrapper that does not import catalog JSON.
 * GET /health is live as soon as the process can answer.
 * GET /v1/health and unmatched /v1/* stay 503 until getBackend is ready.
 */
export function createOriginApp(opts: OriginAppOptions = {}) {
  const getBackend = () => opts.getBackend?.() ?? undefined
  const isReady = () => (opts.isReady ? opts.isReady() : Boolean(getBackend()))

  const app = new Hono()

  const releaseId = opts.releaseId?.trim()
  if (releaseId) {
    app.use('*', async (c, next) => {
      await next()
      c.header('X-Metadata-Release', releaseId)
    })
  }

  app.get('/health', (c) =>
    c.json({
      ok: true as const,
      service: 'metadata' as const,
      ready: isReady(),
    }),
  )

  app.get('/v1/health', async (c, next) => {
    if (!isReady()) {
      return c.json(
        {
          ok: false as const,
          service: 'metadata' as const,
          ready: false as const,
          starting: true as const,
        },
        503,
      )
    }
    const backend = getBackend()
    if (backend) return backend.fetch(c.req.raw)
    return next()
  })

  app.all('/v1/*', async (c, next) => {
    if (!isReady()) {
      return c.json({ error: 'STARTING', message: 'Catalog is loading' }, 503)
    }
    const backend = getBackend()
    if (backend) {
      const response = await backend.fetch(c.req.raw)
      if (response.status !== 404) return response
    }
    return next()
  })

  return app
}

/**
 * Register non-versioned catalog delegation after server/static routes have
 * been declared but before the server accepts its first request.
 */
export function registerOriginBackend(app: Hono, opts: OriginAppOptions = {}) {
  const getBackend = () => opts.getBackend?.() ?? undefined
  const isReady = () => (opts.isReady ? opts.isReady() : Boolean(getBackend()))

  app.all('*', async (c, next) => {
    if (c.req.path.startsWith('/v1')) return next()
    if (!isReady()) return next()
    const backend = getBackend()
    if (backend) {
      const response = await backend.fetch(c.req.raw)
      if (response.status !== 404) return response
    }
    return next()
  })
}
