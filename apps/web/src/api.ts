export { resolveApiBase } from './config'

function storedWallet(): string | null {
  try {
    const v = sessionStorage.getItem('metadata.wallet')
    return v?.startsWith('0x') ? v : null
  } catch {
    return null
  }
}

function storedSession(): { token: string; wallet?: string } | null {
  try {
    const raw = sessionStorage.getItem('metadata.session')
    if (!raw) return null
    const value = JSON.parse(raw) as {
      token?: unknown
      wallet?: unknown
      expiresAt?: unknown
    }
    if (typeof value.token !== 'string' || !value.token) return null
    if (typeof value.expiresAt === 'string') {
      const expires = Date.parse(value.expiresAt)
      if (Number.isFinite(expires) && expires <= Date.now()) {
        sessionStorage.removeItem('metadata.session')
        return null
      }
    }
    return {
      token: value.token,
      wallet: typeof value.wallet === 'string' ? value.wallet.toLowerCase() : undefined,
    }
  } catch {
    return null
  }
}

function addAuthHeaders(headers: Record<string, string>, wallet?: string | null) {
  const session = storedSession()
  if (!session) return
  if (wallet && session.wallet && wallet.toLowerCase() !== session.wallet) return
  headers['X-Metadata-Session'] = session.token
}

function errorFromBody(err: unknown, status: number): Error {
  const body = err as { message?: string; error?: string }
  const code = body.error ? `${body.error}: ` : ''
  return new Error(
    `${code}${body.message || body.error || `HTTP ${status}`}`.replace(
      /^([^:]+: )\1/,
      '$1',
    ),
  )
}

export async function getJson<T>(
  base: string,
  path: string,
  opts?: { vertical?: string; wallet?: string; signal?: AbortSignal },
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts?.vertical) headers['X-Metadata-Vertical'] = opts.vertical
  const wallet = opts?.wallet || storedWallet()
  if (wallet) headers['X-Wallet-Address'] = wallet
  addAuthHeaders(headers, wallet)
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    credentials: 'omit',
    headers,
    signal: opts?.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw errorFromBody(err, res.status)
  }
  return res.json() as Promise<T>
}

export async function postJson<T>(
  base: string,
  path: string,
  body: unknown,
  opts?: { vertical?: string; wallet?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts?.vertical) headers['X-Metadata-Vertical'] = opts.vertical
  const wallet = opts?.wallet || storedWallet()
  if (wallet) headers['X-Wallet-Address'] = wallet
  addAuthHeaders(headers, wallet)
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw errorFromBody(err, res.status)
  }
  return res.json() as Promise<T>
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const VERTICAL_ALIASES: Record<string, string> = {
  blanks: 'pod',
  cards: 'tcg',
  pokemon: 'tcg',
  yugioh: 'tcg',
  onepiece: 'tcg',
  optcg: 'tcg',
  mtg: 'tcg',
  magic: 'tcg',
  lorcana: 'tcg',
  weiss: 'tcg',
  ws: 'tcg',
  nendoroid: 'figures',
  merch: 'figures',
  figure: 'figures',
  ln: 'lightnovels',
  'light-novel': 'lightnovels',
  lightnovel: 'lightnovels',
  gunpla: 'modelkits',
  plamo: 'modelkits',
  'model-kit': 'modelkits',
  modelkit: 'modelkits',
  gundam: 'modelkits',
  fumo: 'plush',
  fumofumo: 'plush',
  plushies: 'plush',
  bgg: 'boardgames',
  tabletop: 'boardgames',
  boardgame: 'boardgames',
  cartoon: 'cartoons',
  nick: 'cartoons',
  cn: 'cartoons',
  soundtrack: 'ost',
  soundtracks: 'ost',
  vgmdb: 'ost',
  platform: 'consoles',
  platforms: 'consoles',
  arcade: 'consoles',
  competitive: 'esports',
  comic: 'comics',
  marvel: 'comics',
  dc: 'comics',
  kicks: 'fashion',
  footwear: 'fashion',
  shoes: 'fashion',
  sneakers: 'fashion',
  sneaker: 'fashion',
  streetwear: 'fashion',
  watches: 'fashion',
  watch: 'fashion',
  supreme: 'fashion',
  acg: 'fashion',
  jordan: 'fashion',
  yeezy: 'fashion',
}

const LIVE_VERTICALS = new Set([
  'anime',
  'game',
  'manga',
  'lightnovels',
  'pod',
  'tcg',
  'figures',
  'modelkits',
  'plush',
  'boardgames',
  'cartoons',
  'ost',
  'consoles',
  'esports',
  'comics',
  'fashion',
])

function normalizeVerticalId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const id = raw.trim().toLowerCase()
  if (!id) return null
  if (LIVE_VERTICALS.has(id)) return id
  if (VERTICAL_ALIASES[id]) return VERTICAL_ALIASES[id]
  return null
}

/**
 * Catalog for the console UI.
 * Priority: /console/{vertical} path → ?vertical= → host subdomain (legacy) → anime.
 */
export function currentVertical(): string {
  const fromPath = normalizeVerticalId(
    location.pathname.replace(/\/+$/, '').match(/^\/console\/([^/]+)$/i)?.[1],
  )
  if (fromPath) return fromPath

  const fromQuery = normalizeVerticalId(
    new URLSearchParams(location.search).get('vertical'),
  )
  if (fromQuery) return fromQuery

  const host = location.hostname.toLowerCase()
  const first = host.split('.')[0]
  return normalizeVerticalId(first) || 'anime'
}
