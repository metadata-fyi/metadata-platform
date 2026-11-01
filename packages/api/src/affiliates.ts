/**
 * Global affiliate / partner registry.
 *
 * Config: packages/api/data/affiliates/partners.json
 * Env:    METADATA_AFFILIATE_<PARTNER_ID>  (hyphens → underscores, uppercased)
 * Docs:   docs/AFFILIATES.md
 */

import partnersFile from '../data/affiliates/partners.json' with { type: 'json' }
import { safeExternalTemplate, safeExternalUrl } from './url-safety.js'

export type AffiliateCategory =
  | 'pod-provider'
  | 'tcg-marketplace'
  | 'retail'
  | 'marketplace'
  | 'maker-shop'
  | 'streaming'
  | 'digital-store'
  | 'network'
  | string

export interface AffiliatePartner {
  id: string
  name: string
  verticals: string[]
  category: AffiliateCategory
  website: string
  joinUrl?: string | null
  /** Live tracking URL — fill in JSON or env; keep null in public git if preferred */
  affiliateUrl?: string | null
  deepLinkTemplate?: string | null
  commissionNotes?: string | null
  disclosure?: 'affiliate' | 'sponsored' | 'direct' | string | null
  priority?: number
  tags?: string[]
}

type PartnersFile = {
  updatedAt?: string
  version?: number
  note?: string
  partners: AffiliatePartner[]
}

const file = partnersFile as unknown as PartnersFile

function envKeyFor(id: string) {
  return `METADATA_AFFILIATE_${id.toUpperCase().replace(/-/g, '_')}`
}

/** Resolve live affiliate URL: env wins, then partners.json */
export function resolveAffiliateUrl(partner: AffiliatePartner): string | null {
  const envUrl = process.env[envKeyFor(partner.id)]?.trim()
  if (envUrl) return safeExternalUrl(envUrl)
  const fromFile = partner.affiliateUrl?.trim()
  return safeExternalUrl(fromFile)
}

function sanitizePartner(partner: AffiliatePartner) {
  return {
    ...partner,
    website: safeExternalUrl(partner.website) ?? '',
    joinUrl: partner.joinUrl ? safeExternalUrl(partner.joinUrl) : null,
    affiliateUrl: resolveAffiliateUrl(partner),
    deepLinkTemplate: partner.deepLinkTemplate
      ? safeExternalTemplate(partner.deepLinkTemplate)
      : null,
  }
}

export function listPartners(opts?: {
  vertical?: string
  category?: string
  q?: string
  configuredOnly?: boolean
}): AffiliatePartner[] {
  let rows = [...(file.partners ?? [])]
  if (opts?.vertical) {
    const v = opts.vertical.toLowerCase()
    rows = rows.filter((p) => p.verticals.map((x) => x.toLowerCase()).includes(v))
  }
  if (opts?.category) {
    const c = opts.category.toLowerCase()
    rows = rows.filter((p) => p.category.toLowerCase() === c)
  }
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((p) => {
      const hay =
        `${p.id} ${p.name} ${p.category} ${(p.tags ?? []).join(' ')} ${p.website}`.toLowerCase()
      return hay.includes(q)
    })
  }
  rows.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || a.name.localeCompare(b.name))

  const enriched = rows.map((p) => ({
    ...sanitizePartner(p),
    envKey: envKeyFor(p.id),
    isConfigured: Boolean(resolveAffiliateUrl(p)),
  }))

  if (opts?.configuredOnly) {
    return enriched.filter((p) => p.isConfigured)
  }
  return enriched
}

export function getPartner(id: string) {
  const key = id.toLowerCase()
  const p = (file.partners ?? []).find((x) => x.id === key)
  if (!p) return undefined
  return {
    ...sanitizePartner(p),
    envKey: envKeyFor(p.id),
    isConfigured: Boolean(resolveAffiliateUrl(p)),
  }
}

export type ShopLink = {
  partnerId: string
  name: string
  /** Alias for POD / UI shop rows */
  providerName: string
  shopUrl: string
  productUrl: string
  isAffiliate: boolean
  website: string
  category: string
  disclosure: string
  /** Canonical subject URI when stamped by a catalog enrich */
  sku?: string
  /** Sell (`offer`) vs delivery (`fulfill`). Affiliate/title-search rows are offers. */
  role?: 'offer' | 'fulfill'
}

/** Extract Amazon Associates tag from a configured affiliate base URL if present. */
function amazonTagFromAffiliateUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).searchParams.get('tag') || ''
  } catch {
    const m = url.match(/[?&]tag=([^&]+)/i)
    return m?.[1] || ''
  }
}

/** Shop URL for a partner: deep-link search when possible, else site / affiliate base */
export function partnerShopUrl(partnerId: string, opts?: { query?: string }): ShopLink | null {
  const p = getPartner(partnerId)
  if (!p) return null
  const q = opts?.query?.trim() || ''
  const affiliateUrl = safeExternalUrl(p.affiliateUrl)
  const website = safeExternalUrl(p.website)
  let shopUrl = affiliateUrl || website
  if (!shopUrl) return null
  if (q && p.deepLinkTemplate) {
    const tag = amazonTagFromAffiliateUrl(affiliateUrl)
    const deepLink = p.deepLinkTemplate
      .replace(/\{query\}/g, encodeURIComponent(q))
      .replace(/\{tag\}/g, encodeURIComponent(tag))
    // If template still has empty tag=, drop bare tag param noise
    shopUrl =
      safeExternalUrl(deepLink.replace(/([?&])tag=&/, '$1').replace(/[?&]tag=$/, '')) || shopUrl
  } else if (q && affiliateUrl && !p.deepLinkTemplate) {
    // Append search to affiliate base when no template
    try {
      const u = new URL(affiliateUrl)
      if (!u.searchParams.has('k') && !u.searchParams.has('q')) {
        u.searchParams.set('k', q)
      }
      shopUrl = u.toString()
    } catch {
      shopUrl = affiliateUrl
    }
  }
  const isAffiliate = Boolean(affiliateUrl)
  return {
    partnerId: p.id,
    name: p.name,
    providerName: p.name,
    shopUrl,
    productUrl: shopUrl,
    isAffiliate,
    website: website || shopUrl,
    category: p.category,
    disclosure: isAffiliate ? p.disclosure || 'affiliate' : 'direct',
  }
}

/**
 * Build shop / affiliate rows for any catalog entity.
 * Uses partners registered for the vertical; prefers retail/marketplace/streaming
 * over bare networks unless nothing else matches.
 */
export function shopsForEntity(opts: {
  vertical: string
  /** Search / product title used in deep links */
  query: string
  limit?: number
}): ShopLink[] {
  const vertical = opts.vertical.toLowerCase()
  const query = opts.query.trim()
  if (!query) return []
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 24)

  const partners = listPartners({ vertical })
  const prefer = new Set([
    'retail',
    'marketplace',
    'maker-shop',
    'digital-store',
    'streaming',
    'tcg-marketplace',
    'pod-provider',
    'plush-maker',
    'plush-retail',
  ])
  const ranked = [...partners].sort((a, b) => {
    const ap = prefer.has(a.category) ? 0 : a.category === 'network' ? 2 : 1
    const bp = prefer.has(b.category) ? 0 : b.category === 'network' ? 2 : 1
    return ap - bp || (a.priority ?? 99) - (b.priority ?? 99) || a.name.localeCompare(b.name)
  })

  const out: ShopLink[] = []
  for (const p of ranked) {
    if (p.category === 'network') continue // Impact/CJ etc. are not product deep-links
    const row = partnerShopUrl(p.id, { query })
    if (!row) continue
    out.push(row)
    if (out.length >= limit) break
  }
  return out
}

export function affiliatesPublicConfig(vertical?: string) {
  const partners = listPartners({ vertical })
  const configured = partners.filter((p) => Boolean((p as { isConfigured?: boolean }).isConfigured))
  return {
    updatedAt: file.updatedAt ?? null,
    version: file.version ?? 1,
    note: file.note ?? null,
    docs: 'See docs/AFFILIATES.md — set affiliateUrl in partners.json or METADATA_AFFILIATE_* env',
    vertical: vertical ?? null,
    total: partners.length,
    configured: configured.length,
    partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      verticals: p.verticals,
      category: p.category,
      website: p.website,
      joinUrl: p.joinUrl ?? null,
      affiliateUrl: p.affiliateUrl ?? null,
      deepLinkTemplate: p.deepLinkTemplate ?? null,
      envKey: (p as { envKey?: string }).envKey,
      isConfigured: Boolean((p as { isConfigured?: boolean }).isConfigured),
      commissionNotes: p.commissionNotes ?? null,
      disclosure: p.disclosure ?? 'affiliate',
      tags: p.tags ?? [],
      priority: p.priority ?? 99,
    })),
    /** Quick map: partner id → live URL (null if not joined yet) */
    urls: Object.fromEntries(partners.map((p) => [p.id, p.affiliateUrl ?? null])),
  }
}

/** Backward-compatible POD provider injection from global registry */
export function podAffiliateForProvider(providerId: string): {
  affiliateUrl: string | null
  joinUrl: string | null
  label: string | null
} {
  const p = getPartner(providerId)
  if (!p) {
    return { affiliateUrl: null, joinUrl: null, label: null }
  }
  return {
    affiliateUrl: p.affiliateUrl ?? null,
    joinUrl: p.joinUrl ?? null,
    label: p.name,
  }
}
