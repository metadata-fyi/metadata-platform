/**
 * Streamable-HTTP MCP for Muse, Phantasy, and other agent runtimes.
 * POST /mcp  JSON-RPC 2.0. GET /mcp is discovery (also served from the Worker).
 */
import { searchBoardGames } from './boardgame-catalog.js'
import { getSeries, search } from './catalog.js'
import { searchConsoles } from './console-catalog.js'
import { searchEsports } from './esports-catalog.js'
import { searchFashion } from './fashion-catalog.js'
import { searchFigures } from './figure-catalog.js'
import { getMarketRecord } from './market-catalog.js'
import { searchModelkits } from './modelkit-catalog.js'
import { searchOst } from './ost-catalog.js'
import { searchPlush } from './plush-catalog.js'
import { searchPod } from './pod-catalog.js'
import { previewSearchMax } from './preview-quota.js'
import { resolveSku } from './sku.js'
import { getTcgCard, searchTcg } from './tcg-catalog.js'
import { LIVE_VERTICALS, type LiveVertical } from './verticals.js'

export const MCP_PROTOCOL_VERSION = '2025-03-26'
export const MCP_SERVER_NAME = 'metadata'
export const MCP_SERVER_VERSION = '0.7.0'

type RpcId = string | number | null

type RpcRequest = {
  jsonrpc?: string
  id?: RpcId
  method?: string
  params?: Record<string, unknown>
}

function jsonResult(id: RpcId, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function jsonError(id: RpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }
}

function textResult(id: RpcId, value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return jsonResult(id, {
    content: [{ type: 'text', text }],
    ...(value && typeof value === 'object' && 'error' in value ? { isError: true } : {}),
  })
}

function asVertical(value: unknown): LiveVertical {
  const raw = typeof value === 'string' ? value : 'anime'
  return (LIVE_VERTICALS as readonly string[]).includes(raw) ? (raw as LiveVertical) : 'anime'
}

function searchCatalog(vertical: LiveVertical, q: string, limit: number, offset: number) {
  if (vertical === 'pod') return searchPod(q, limit, offset)
  if (vertical === 'tcg') return searchTcg(q, limit, offset)
  if (vertical === 'figures') return searchFigures(q, limit, offset)
  if (vertical === 'modelkits') return searchModelkits(q, limit, offset)
  if (vertical === 'plush') return searchPlush(q, limit, offset)
  if (vertical === 'fashion') return searchFashion(q, limit, offset)
  if (vertical === 'boardgames') return searchBoardGames(q, limit, offset)
  if (vertical === 'ost') return searchOst(q, limit, offset)
  if (vertical === 'consoles') return searchConsoles(q, limit, offset)
  if (vertical === 'esports') return searchEsports(q, limit, offset)
  return search(vertical, q, limit, offset)
}

export const MCP_TOOLS = [
  {
    name: 'metadata_discover',
    description:
      'How to use Metadata: verticals, skill, OpenAPI, access (preview / credits / service key). Call this first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'metadata_search',
    description:
      'Search one catalog vertical. Set vertical (anime, game, tcg, pod, figures, …) and q.',
    inputSchema: {
      type: 'object',
      properties: {
        vertical: { type: 'string' },
        q: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
      },
      required: ['q'],
      additionalProperties: false,
    },
  },
  {
    name: 'metadata_get_series',
    description: 'Fetch a media series by id in a vertical (anime/manga/game/…).',
    inputSchema: {
      type: 'object',
      properties: { vertical: { type: 'string' }, id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'metadata_get_card',
    description: 'Fetch a TCG card by catalog id (e.g. pokemon-sv10-60).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'metadata_sku_resolve',
    description:
      'Resolve metadata:{vertical}:{collection}:{id}. 409 AMBIGUOUS is a result, not a crash.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    name: 'metadata_market_quote',
    description:
      'Coagulated market observation for a market item id. Mid is a venue median, not a sold tape. Read confidence.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
] as const

const CATALOG_TOOLS = new Set([
  'metadata_search',
  'metadata_get_series',
  'metadata_get_card',
  'metadata_sku_resolve',
  'metadata_market_quote',
])

export function mcpDiscovery(rootDomain = 'metadata.fyi') {
  const base = `https://${rootDomain}`
  return {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: 'streamable-http',
    url: `${base}/mcp`,
    skill: `${base}/SKILL.md`,
    openapi: `${base}/openapi.json`,
    wellKnown: `${base}/.well-known/ai-plugin.json`,
    description:
      'Verified multi-vertical catalog identity and labeled market observations for agents.',
  }
}

export async function handleMcpRpc(
  body: RpcRequest,
  opts?: { authorized?: boolean; isPreview?: boolean },
): Promise<Record<string, unknown>> {
  const id = body.id ?? null
  const method = body.method || ''
  const params = body.params || {}
  if (method === 'initialize') {
    return jsonResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      instructions:
        'Call metadata_discover first. Catalog tools need preview, a funded wallet session, a service key, or x402. Quotes are observations (confidence), not solds.',
    })
  }
  if (method === 'notifications/initialized' || method === 'ping') {
    return jsonResult(id, {})
  }
  if (method === 'tools/list') {
    return jsonResult(id, { tools: MCP_TOOLS })
  }
  if (method !== 'tools/call') {
    return jsonError(id, -32601, `Method not found: ${method}`)
  }
  const name = typeof params.name === 'string' ? params.name : ''
  const args =
    params.arguments && typeof params.arguments === 'object'
      ? (params.arguments as Record<string, unknown>)
      : {}
  if (CATALOG_TOOLS.has(name) && opts?.authorized === false) {
    return textResult(id, {
      error: 'AUTH_REQUIRED',
      message:
        'Catalog tools need X-Wallet-Address + X-Metadata-Session, X-Metadata-Service-Key, or X-PAYMENT. Discovery and metadata_discover stay open.',
    })
  }
  try {
    if (name === 'metadata_discover') return textResult(id, mcpDiscovery())
    if (name === 'metadata_search') {
      const vertical = asVertical(args.vertical)
      const q = String(args.q || '')
      const requested = Math.min(Math.max(Number(args.limit) || 8, 1), 40)
      const limit = opts?.isPreview ? Math.min(requested, previewSearchMax()) : requested
      return textResult(id, { vertical, ...searchCatalog(vertical, q, limit, 0) })
    }
    if (name === 'metadata_get_series') {
      const vertical = asVertical(args.vertical)
      const series = getSeries(vertical, String(args.id || ''))
      if (!series) return textResult(id, { error: 'NOT_FOUND' })
      return textResult(id, series)
    }
    if (name === 'metadata_get_card') {
      const card = getTcgCard(String(args.id || ''))
      if (!card) return textResult(id, { error: 'NOT_FOUND' })
      return textResult(id, card)
    }
    if (name === 'metadata_sku_resolve') {
      return textResult(id, resolveSku(String(args.key || '')))
    }
    if (name === 'metadata_market_quote') {
      const record = getMarketRecord(String(args.id || ''))
      if (!record?.quote) return textResult(id, { error: 'NOT_FOUND' })
      return textResult(id, record.quote)
    }
    return jsonError(id, -32601, `Unknown tool: ${name}`)
  } catch (error) {
    return jsonError(id, -32000, error instanceof Error ? error.message : String(error))
  }
}

export function isMcpCatalogTool(name: string) {
  return CATALOG_TOOLS.has(name)
}
