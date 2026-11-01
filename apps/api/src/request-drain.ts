/** Stop admitting work and wait for provider/database operations to finish. */
export function createRequestDrain(handler: (request: Request) => Response | Promise<Response>) {
  let stopping = false
  let active = 0
  let finished: (() => void) | undefined
  return {
    async fetch(request: Request): Promise<Response> {
      if (stopping)
        return Response.json(
          { error: 'SHUTTING_DOWN' },
          {
            status: 503,
            headers: { 'Retry-After': '5' },
          },
        )
      active++
      try {
        return await handler(request)
      } finally {
        active--
        if (stopping && active === 0) finished?.()
      }
    },
    stop(): Promise<void> {
      stopping = true
      return active === 0
        ? Promise.resolve()
        : new Promise((resolve) => {
            finished = resolve
          })
    },
  }
}
