import type { BoardGame } from './boardgame-types.js'
import type { GameConsole } from './console-types.js'
import type { EsportsTitle } from './esports-types.js'
import type { FashionItem } from './fashion-types.js'
import type { FigureItem, FigureLine, FigureMaker } from './figure-types.js'
import type { ModelkitItem } from './modelkit-types.js'
import type { OstAlbum } from './ost-types.js'
import type { PlushItem, PlushLine, PlushMaker } from './plush-types.js'
import type { PodBlank, PodBrand, PodPrintMethod, PodProvider } from './pod-types.js'
import type { SkuResolveResult } from './sku-types.js'
import type {
  TcgCard,
  TcgCardDetail,
  TcgFacets,
  TcgGame,
  TcgSet,
  TcgSetDetail,
} from './tcg-types.js'
import type {
  Logo,
  MetaCharacter,
  MetadataHealth,
  Paginated,
  SearchHit,
  Series,
} from './types.js'

export type MetadataClientOptions = {
  baseUrl: string
  fetch?: typeof fetch
  credentials?: RequestCredentials
  /** Sent as X-Metadata-Vertical when set */
  vertical?: string
  /** Sent as X-Wallet-Address for paid tier */
  wallet?: string
  /** Signed session from POST /v1/pay/auth/verify */
  session?: string
  /** First-party unlimited tier: X-Metadata-Service-Key */
  serviceKey?: string
}

/** Thrown on non-OK HTTP. `code` is `body.error` when present. */
export class MetadataHttpError extends Error {
  readonly status: number
  readonly body: unknown
  readonly code: string | undefined

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = 'MetadataHttpError'
    this.status = status
    this.body = body
    const code =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error?: unknown }).error
        : undefined
    this.code = typeof code === 'string' ? code : undefined
  }
}

function join(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function qs(params?: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams()
  if (!params) return ''
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function createMetadataClient(opts: MetadataClientOptions) {
  const base = opts.baseUrl
  const f = opts.fetch ?? fetch
  const credentials = opts.credentials ?? 'omit'

  function headers(override?: { vertical?: string }): Record<string, string> {
    const h: Record<string, string> = {}
    const vertical = override?.vertical ?? opts.vertical
    if (vertical) h['X-Metadata-Vertical'] = vertical
    if (opts.wallet) h['X-Wallet-Address'] = opts.wallet
    if (opts.session) h['X-Metadata-Session'] = opts.session
    if (opts.serviceKey) h['X-Metadata-Service-Key'] = opts.serviceKey
    return h
  }

  async function parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg =
        (body as { error?: string; message?: string }).message ||
        (body as { error?: string }).error ||
        `Metadata ${res.status}`
      throw new MetadataHttpError(res.status, body, msg)
    }
    return res.json() as Promise<T>
  }

  async function get<T>(path: string, override?: { vertical?: string }): Promise<T> {
    const res = await f(join(base, path), { credentials, headers: headers(override) })
    return parse<T>(res)
  }

  async function post<T>(
    path: string,
    body?: unknown,
    override?: { vertical?: string },
  ): Promise<T> {
    const h = headers(override)
    h['Content-Type'] = 'application/json'
    const res = await f(join(base, path), {
      method: 'POST',
      credentials,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return parse<T>(res)
  }

  return {
    health: (vertical?: string) =>
      get<MetadataHealth>('/v1/health', vertical ? { vertical } : undefined),
    verticals: () => get<unknown>('/v1/verticals'),

    listSeries: (params?: {
      q?: string
      type?: string
      tag?: string
      limit?: number
      offset?: number
    }) =>
      get<Paginated<Series>>(
        `/v1/series${qs({
          q: params?.q,
          type: params?.type,
          tag: params?.tag,
          limit: params?.limit,
          offset: params?.offset,
        })}`,
      ),

    getSeries: (id: string) =>
      get<{ series: Series; logos: Logo[] }>(`/v1/series/${encodeURIComponent(id)}`),

    getCharacter: (id: string) =>
      get<{
        character: MetaCharacter
        series: Series | null
        logos: Logo[]
        copy?: { danbooruLine: string; tags: string; name: string; id: string }
      }>(`/v1/characters/${encodeURIComponent(id)}`),

    search: (q: string, limit?: number, offset?: number) =>
      get<{
        query: string
        hits: SearchHit[]
        total: number
        limit: number
        offset: number
        vertical?: string
        preview?: boolean
      }>(`/v1/search${qs({ q, limit, offset })}`),

    sku: async (key: string) => {
      let res: Response
      if (key.includes(':')) {
        const h = headers()
        h['Content-Type'] = 'application/json'
        res = await f(join(base, '/v1/sku/resolve'), {
          method: 'POST',
          credentials,
          headers: h,
          body: JSON.stringify({ key }),
        })
      } else {
        res = await f(join(base, `/v1/sku/${encodeURIComponent(key)}`), {
          credentials,
          headers: headers(),
        })
      }
      // 200 unique / 409 ambiguous / 404 not found are result bodies, not crashes.
      if (res.status === 200 || res.status === 409 || res.status === 404) {
        return res.json() as Promise<SkuResolveResult>
      }
      return parse<SkuResolveResult>(res)
    },

    skuMany: (keys: string[]) =>
      post<{ ok: true; results: unknown[] }>('/v1/sku/resolve', { keys }),

    datasets: {
      list: () => get<{ items: unknown[]; total: number }>('/v1/datasets'),
      get: (id: string) =>
        get<unknown>(`/v1/datasets/${encodeURIComponent(id)}`),
      export: (id: string) =>
        get<unknown>(`/v1/export/dataset/${encodeURIComponent(id)}`),
    },

    contribute: (body: unknown) => post<unknown>('/v1/contribute', body),

    market: {
      quote: (id: string) =>
        get<unknown>(`/v1/market/quotes/${encodeURIComponent(id)}`, {
          vertical: 'tcg',
        }),
      search: (params?: { q?: string; kind?: string; game?: string }) =>
        get<unknown>(`/v1/market/search${qs(params)}`, { vertical: 'tcg' }),
    },

    packs: () => get<unknown>('/v1/pay/packs'),
    balance: (wallet: string) =>
      get<{ wallet: string; credits: number }>(`/v1/pay/balance${qs({ wallet })}`),

    auth: {
      nonce: (wallet: string) =>
        get<{ ok: true; nonce: string; message: string; expiresAt: string }>(
          `/v1/pay/auth/nonce${qs({ wallet })}`,
        ),
      verify: (body: { wallet: string; message: string; signature: string }) =>
        post<{ ok: true; token: string; expiresAt: string }>('/v1/pay/auth/verify', body),
    },

    /** TCG vertical helpers (pass vertical override or set opts.vertical = 'tcg') */
    tcg: {
      games: () =>
        get<Paginated<TcgGame> | { items: TcgGame[] }>('/v1/tcg/games', { vertical: 'tcg' }),
      facets: (game: string) =>
        get<TcgFacets>(`/v1/tcg/facets${qs({ game })}`, { vertical: 'tcg' }),
      sets: (params?: { game?: string; q?: string; limit?: number; offset?: number }) =>
        get<Paginated<TcgSet>>(`/v1/tcg/sets${qs(params)}`, { vertical: 'tcg' }),
      set: (id: string, params?: { limit?: number; offset?: number }) =>
        get<TcgSetDetail>(`/v1/tcg/sets/${encodeURIComponent(id)}${qs(params)}`, {
          vertical: 'tcg',
        }),
      cards: (params?: {
        game?: string
        q?: string
        set?: string
        rarity?: string
        type?: string
        subtype?: string
        limit?: number
        offset?: number
      }) => get<Paginated<TcgCard>>(`/v1/tcg/cards${qs(params)}`, { vertical: 'tcg' }),
      card: (id: string) =>
        get<TcgCardDetail>(`/v1/tcg/cards/${encodeURIComponent(id)}`, { vertical: 'tcg' }),
    },

    /** POD / blanks */
    pod: {
      products: (params?: {
        q?: string
        brand?: string
        category?: string
        limit?: number
        offset?: number
      }) => get<Paginated<PodBlank>>(`/v1/products${qs(params)}`, { vertical: 'pod' }),
      product: (id: string) =>
        get<{ product: PodBlank } | PodBlank>(`/v1/products/${encodeURIComponent(id)}`, {
          vertical: 'pod',
        }),
      brands: () =>
        get<Paginated<PodBrand> | { items: PodBrand[] }>('/v1/brands', { vertical: 'pod' }),
      providers: () =>
        get<Paginated<PodProvider> | { items: PodProvider[] }>('/v1/providers', {
          vertical: 'pod',
        }),
      printMethods: () =>
        get<Paginated<PodPrintMethod> | { items: PodPrintMethod[] }>('/v1/print-methods', {
          vertical: 'pod',
        }),
    },

    figures: {
      items: (params?: {
        q?: string
        kind?: string
        limit?: number
        offset?: number
      }) =>
        get<Paginated<FigureItem>>(`/v1/figures/items${qs(params)}`, { vertical: 'figures' }),
      makers: () =>
        get<Paginated<FigureMaker> | { items: FigureMaker[] }>('/v1/figures/makers', {
          vertical: 'figures',
        }),
      lines: () =>
        get<Paginated<FigureLine> | { items: FigureLine[] }>('/v1/figures/lines', {
          vertical: 'figures',
        }),
    },

    plush: {
      items: (params?: {
        q?: string
        kind?: string
        limit?: number
        offset?: number
      }) => get<Paginated<PlushItem>>(`/v1/plush/items${qs(params)}`, { vertical: 'plush' }),
      makers: () =>
        get<Paginated<PlushMaker> | { items: PlushMaker[] }>('/v1/plush/makers', {
          vertical: 'plush',
        }),
      lines: () =>
        get<Paginated<PlushLine> | { items: PlushLine[] }>('/v1/plush/lines', {
          vertical: 'plush',
        }),
    },

    fashion: {
      items: (params?: {
        q?: string
        brand?: string
        kind?: string
        category?: string
        release?: string
        limit?: number
        offset?: number
      }) =>
        get<Paginated<FashionItem>>(`/v1/fashion/items${qs(params)}`, { vertical: 'fashion' }),
      item: (id: string) =>
        get<FashionItem>(`/v1/fashion/items/${encodeURIComponent(id)}`, { vertical: 'fashion' }),
    },

    modelkits: {
      items: (params?: {
        q?: string
        grade?: string
        kind?: string
        series?: string
        limit?: number
        offset?: number
      }) =>
        get<Paginated<ModelkitItem>>(`/v1/modelkits/items${qs(params)}`, {
          vertical: 'modelkits',
        }),
      item: (id: string) =>
        get<ModelkitItem>(`/v1/modelkits/items/${encodeURIComponent(id)}`, {
          vertical: 'modelkits',
        }),
    },

    boardgames: {
      list: (params?: {
        q?: string
        players?: number
        publisher?: string
        limit?: number
        offset?: number
      }) =>
        get<Paginated<BoardGame>>(`/v1/boardgames${qs(params)}`, { vertical: 'boardgames' }),
      get: (id: string) =>
        get<BoardGame>(`/v1/boardgames/${encodeURIComponent(id)}`, { vertical: 'boardgames' }),
    },

    ost: {
      albums: (params?: {
        q?: string
        media?: string
        series?: string
        type?: string
        limit?: number
        offset?: number
      }) => get<Paginated<OstAlbum>>(`/v1/ost/albums${qs(params)}`, { vertical: 'ost' }),
      album: (id: string) =>
        get<OstAlbum>(`/v1/ost/albums/${encodeURIComponent(id)}`, { vertical: 'ost' }),
    },

    consoles: {
      list: (params?: {
        q?: string
        formFactor?: string
        generation?: number
        manufacturer?: string
        limit?: number
        offset?: number
      }) => get<Paginated<GameConsole>>(`/v1/consoles${qs(params)}`, { vertical: 'consoles' }),
      get: (id: string) =>
        get<GameConsole>(`/v1/consoles/${encodeURIComponent(id)}`, { vertical: 'consoles' }),
    },

    esports: {
      titles: (params?: { q?: string; tag?: string; limit?: number; offset?: number }) =>
        get<Paginated<EsportsTitle>>(`/v1/esports/titles${qs(params)}`, { vertical: 'esports' }),
      title: (id: string) =>
        get<EsportsTitle>(`/v1/esports/titles/${encodeURIComponent(id)}`, {
          vertical: 'esports',
        }),
    },
  }
}

export type MetadataClient = ReturnType<typeof createMetadataClient>
