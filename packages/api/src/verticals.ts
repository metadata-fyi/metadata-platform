/** Runtime vertical registry shared by API discovery and maintenance checks. */
import registryJson from '../data/vertical-registry.json' with { type: 'json' }

type RegistryEntry = {
  id: string
  title: string
  blurb: string
}

const registry = registryJson as {
  version: number
  verticals: RegistryEntry[]
  aliases: Record<string, string>
}

const registryVerticals = registry.verticals.map((entry) => entry.id)

/** Live vertical ids. The JSON registry is the runtime source of truth. */
export const VERTICALS = registryVerticals as readonly string[]
export type VerticalId = (typeof VERTICALS)[number]

/** Verticals with live catalog data. */
export const LIVE_VERTICALS = VERTICALS
export type LiveVertical = (typeof LIVE_VERTICALS)[number]

/** Host / query aliases, also served from the canonical registry. */
export const VERTICAL_ALIASES: Record<string, LiveVertical> = {
  ...registry.aliases,
}

export function isLiveVertical(v: string): v is LiveVertical {
  return (LIVE_VERTICALS as readonly string[]).includes(v)
}

export function isVerticalId(v: string): v is VerticalId {
  return (VERTICALS as readonly string[]).includes(v)
}

export const VERTICAL_META = Object.fromEntries(
  registry.verticals.map(({ id, title, blurb }) => [id, { title, blurb, live: true }]),
) as Record<VerticalId, { title: string; blurb: string; live: boolean }>

/**
 * Resolve vertical from Host header, X-Metadata-Vertical, or ?vertical=.
 */
export function resolveVertical(opts: {
  host?: string | null
  header?: string | null
  query?: string | null
  rootDomain?: string
}): LiveVertical {
  const root = (opts.rootDomain ?? process.env.METADATA_ROOT_DOMAIN ?? 'metadata.fyi')
    .toLowerCase()
    .replace(/^\./, '')

  const fromExplicit = (opts.header || opts.query || '').toLowerCase().trim()
  if (isLiveVertical(fromExplicit)) return fromExplicit
  if (fromExplicit && VERTICAL_ALIASES[fromExplicit]) {
    return VERTICAL_ALIASES[fromExplicit]
  }

  const host = (opts.host ?? '').toLowerCase().split(':')[0].replace(/\.$/, '')

  if (host && root && host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1)).split('.')[0]
    if (isLiveVertical(sub)) return sub
    if (VERTICAL_ALIASES[sub]) return VERTICAL_ALIASES[sub]
  }

  const first = host.split('.')[0]
  if (isLiveVertical(first)) return first
  if (VERTICAL_ALIASES[first]) return VERTICAL_ALIASES[first]

  return 'anime'
}
