import affiliatesData from '../data/pod/affiliates.json' with { type: 'json' }
import brandsData from '../data/pod/brands.json' with { type: 'json' }
import printMethodsData from '../data/pod/print-methods.json' with { type: 'json' }
import productsData from '../data/pod/products.json' with { type: 'json' }
import providersData from '../data/pod/providers.json' with { type: 'json' }
import { podAffiliateForProvider } from './affiliates.js'
import { indexByIdOrSlug, lookupByIdOrSlug } from './lookup.js'
import type { PodBlank, PodBrand, PodPrintMethod, PodProvider, PodStats } from './pod-types.js'
import { skuUri } from './sku-uri.js'
import { capSkuCommerce, type SkuCommerce, type SkuCommerceLink } from './sku-types.js'
import type { Paginated } from './types.js'

const brands = brandsData as unknown as PodBrand[]
const providersBase = providersData as unknown as PodProvider[]
const products = productsData as unknown as PodBlank[]
const printMethods = printMethodsData as unknown as PodPrintMethod[]
const brandsByKey = indexByIdOrSlug(brands)
const providersByKey = indexByIdOrSlug(providersBase)
const productsByKey = indexByIdOrSlug(products)
const printMethodsByKey = indexByIdOrSlug(printMethods)

type AffiliateFile = {
  providers: Record<
    string,
    { affiliateUrl?: string | null; joinUrl?: string | null; label?: string }
  >
}

/** Legacy POD-only file — merged under global partners registry */
const affiliates = affiliatesData as unknown as AffiliateFile

function page<T>(items: T[], limit: number, offset: number): Paginated<T> {
  const lim = Math.min(Math.max(limit, 1), 100)
  const off = Math.max(offset, 0)
  return {
    items: items.slice(off, off + lim),
    total: items.length,
    limit: lim,
    offset: off,
  }
}

/** Providers with affiliate URLs: env → global partners → legacy pod/affiliates.json */
export function listProviders(): PodProvider[] {
  return providersBase.map((p) => {
    const global = podAffiliateForProvider(p.id)
    const conf = affiliates.providers?.[p.id]
    const envKey = `METADATA_AFFILIATE_${p.id.toUpperCase().replace(/-/g, '_')}`
    const envUrl = process.env[envKey]?.trim() || null
    return {
      ...p,
      affiliateUrl: envUrl || global.affiliateUrl || conf?.affiliateUrl || p.affiliateUrl || null,
      affiliatesPageUrl: p.affiliatesPageUrl || global.joinUrl || conf?.joinUrl || null,
    }
  })
}

export function getProvider(idOrSlug: string): PodProvider | undefined {
  const base = lookupByIdOrSlug(providersByKey, idOrSlug)
  if (!base) return undefined
  return listProviders().find((p) => p.id === base.id)
}

export function listBrands(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<PodBrand> {
  let rows = [...brands]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.slug.includes(q) || b.tags.some((t) => t.includes(q)),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getBrand(idOrSlug: string): PodBrand | undefined {
  return lookupByIdOrSlug(brandsByKey, idOrSlug)
}

export function listPrintMethods(opts?: {
  q?: string
  limit?: number
  offset?: number
}): Paginated<PodPrintMethod> {
  let rows = [...printMethods]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.shortName.toLowerCase().includes(q) ||
        m.slug.includes(q) ||
        m.tags.some((t) => t.includes(q)) ||
        (m.description || '').toLowerCase().includes(q),
    )
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function getPrintMethod(idOrSlug: string): PodPrintMethod | undefined {
  return lookupByIdOrSlug(printMethodsByKey, idOrSlug)
}

export function listProducts(opts?: {
  q?: string
  brand?: string
  category?: string
  provider?: string
  tag?: string
  method?: string
  limit?: number
  offset?: number
}): Paginated<PodBlank> {
  let rows = [...products]
  const q = opts?.q?.trim().toLowerCase()
  if (q) {
    rows = rows.filter((p) => {
      const hay =
        `${p.title} ${p.styleCode} ${p.brandId} ${p.category} ${p.tags.join(' ')} ${p.fabric ?? ''} ${(p.printMethodIds ?? []).join(' ')}`.toLowerCase()
      return hay.includes(q) || p.slug.includes(q) || p.id.includes(q)
    })
  }
  if (opts?.brand) {
    const b = opts.brand.toLowerCase()
    rows = rows.filter((p) => p.brandId === b || p.brandId.includes(b))
  }
  if (opts?.category) {
    const c = opts.category.toLowerCase()
    rows = rows.filter((p) => p.category.toLowerCase() === c)
  }
  if (opts?.provider) {
    const pr = opts.provider.toLowerCase()
    rows = rows.filter((p) => p.listings.some((l) => l.providerId === pr))
  }
  if (opts?.tag) {
    const t = opts.tag.toLowerCase()
    rows = rows.filter((p) => p.tags.some((x) => x.toLowerCase() === t))
  }
  if (opts?.method) {
    const m = opts.method.toLowerCase()
    rows = rows.filter((p) => (p.printMethodIds ?? []).some((id) => id.toLowerCase() === m))
  }
  rows.sort(
    (a, b) =>
      (a.styleCode ?? '').localeCompare(b.styleCode ?? '') || a.title.localeCompare(b.title),
  )
  return page(rows, opts?.limit ?? 40, opts?.offset ?? 0)
}

export function allProducts(): readonly PodBlank[] {
  return products
}

function listingAffiliateUrl(
  listing: PodBlank['listings'][number],
  provider: PodProvider | undefined,
): string | null {
  const raw = listing.affiliateUrl || provider?.affiliateUrl || null
  const trimmed = raw?.trim()
  return trimmed || null
}

/**
 * POD listings are delivery (print the blank). A distinct affiliate URL
 * on the same listing is also an offer (sell). Never copies prices.
 */
export function commerceForPod(p: PodBlank): SkuCommerce {
  const sku = skuUri('pod', 'products', p.id)
  const providers = listProviders()
  const fulfill: SkuCommerceLink[] = []
  const offers: SkuCommerceLink[] = []
  for (const listing of p.listings ?? []) {
    const prov = providers.find((x) => x.id === listing.providerId)
    const productUrl = listing.productUrl?.trim() || ''
    const affiliateUrl = listingAffiliateUrl(listing, prov)
    const name = prov?.name ?? listing.providerId
    if (productUrl) {
      fulfill.push({
        role: 'fulfill',
        sku,
        partnerId: listing.providerId,
        name,
        url: productUrl,
        isAffiliate: false,
      })
      if (affiliateUrl && affiliateUrl !== productUrl) {
        offers.push({
          role: 'offer',
          sku,
          partnerId: listing.providerId,
          name,
          url: affiliateUrl,
          isAffiliate: true,
        })
      }
    } else if (affiliateUrl) {
      fulfill.push({
        role: 'fulfill',
        sku,
        partnerId: listing.providerId,
        name,
        url: affiliateUrl,
        isAffiliate: true,
      })
    }
  }
  return capSkuCommerce({ fulfill, offers })
}

export function getProduct(idOrSlug: string): PodBlank | undefined {
  const byIdOrSlug = lookupByIdOrSlug(productsByKey, idOrSlug)
  if (byIdOrSlug) return byIdOrSlug
  const key = idOrSlug.toLowerCase()
  const byBrandStyle = products.filter(
    (p) => p.styleCode && `${p.brandId}-${p.styleCode}`.toLowerCase() === key,
  )
  if (byBrandStyle.length === 1) return byBrandStyle[0]
  if (byBrandStyle.length > 1) return undefined
  const byStyle = products.filter((p) => (p.styleCode || '').toLowerCase() === key)
  if (byStyle.length === 1) return byStyle[0]
  return undefined
}

export function enrichProduct(p: PodBlank) {
  const brand = getBrand(p.brandId) ?? null
  const providers = listProviders()
  const sku = skuUri('pod', 'products', p.id)
  const commerce = commerceForPod(p)
  const methods = (p.printMethodIds ?? [])
    .map((id) => getPrintMethod(id))
    .filter((m): m is PodPrintMethod => Boolean(m))
  const listings = p.listings.map((l) => {
    const prov = providers.find((x) => x.id === l.providerId)
    const affiliateUrl = listingAffiliateUrl(l, prov)
    return {
      ...l,
      affiliateUrl,
      provider: prov
        ? {
            id: prov.id,
            name: prov.name,
            website: prov.website,
            affiliateUrl: prov.affiliateUrl,
            affiliatesPageUrl: prov.affiliatesPageUrl,
          }
        : null,
      /** Prefer affiliate deep link when set, else product URL */
      shopUrl: affiliateUrl || l.productUrl,
    }
  })
  const shop = commerce.fulfill.concat(commerce.offers).map((link) => ({
    providerId: link.partnerId,
    providerName: link.name,
    productUrl: link.url,
    affiliateUrl: link.isAffiliate ? link.url : null,
    shopUrl: link.url,
    isAffiliate: link.isAffiliate,
    sku: link.sku,
    role: link.role,
  }))
  return {
    product: {
      ...p,
      listings,
      /** Prefer transparent cutout when present */
      imageUrl: p.cutoutUrl || p.imageUrl || null,
      cutoutUrl: p.cutoutUrl ?? null,
    },
    brand,
    printMethods: methods,
    links: {
      brand: brand?.website ?? null,
      sources: p.sources,
      shop,
    },
    copy: {
      styleCode: p.styleCode,
      title: p.title,
      brandStyle: `${brand?.name ?? p.brandId} ${p.styleCode}`,
      colors: p.colors.map((c) => c.name).join(', '),
      colorCodes: p.colors.map((c) => c.code || c.name).join(', '),
      sizes: p.sizes.map((s) => s.code).join(' '),
      tags: p.tags.join(' '),
      fabric: p.fabric ?? '',
      printMethods: methods.map((m) => m.shortName || m.name).join(', '),
    },
    sku,
  }
}

export function searchPod(q: string, limit = 20, offset = 0) {
  const query = q.trim().toLowerCase()
  if (!query) return { hits: [], total: 0 }
  const hits: {
    kind: 'product' | 'brand' | 'provider'
    id: string
    title: string
    subtitle?: string | null
    imageUrl?: string | null
    score: number
    sku?: string
  }[] = []

  for (const p of products) {
    const style = (p.styleCode || '').toLowerCase()
    const hay = `${p.title} ${style} ${p.brandId} ${p.tags.join(' ')}`.toLowerCase()
    if (!hay.includes(query)) continue
    const score =
      style && style === query
        ? 3
        : style && style.includes(query)
          ? 2.5
          : p.title.toLowerCase().startsWith(query)
            ? 2
            : 1
    hits.push({
      kind: 'product',
      id: p.id,
      title: `${p.styleCode} — ${p.title}`,
      subtitle: p.brandId,
      imageUrl: p.cutoutUrl ?? p.imageUrl ?? null,
      score,
      sku: skuUri('pod', 'products', p.id),
    })
  }
  for (const b of brands) {
    if (b.name.toLowerCase().includes(query) || b.slug.includes(query)) {
      hits.push({
        kind: 'brand',
        id: b.id,
        title: b.name,
        subtitle: 'brand',
        score: 1.5,
      })
    }
  }
  for (const p of listProviders()) {
    if (p.name.toLowerCase().includes(query) || p.slug.includes(query)) {
      hits.push({
        kind: 'provider',
        id: p.id,
        title: p.name,
        subtitle: 'pod provider',
        score: 1.2,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const paged = page(hits, limit, offset)
  return { hits: paged.items, total: paged.total }
}

export function podStats(): PodStats {
  const colors = products.reduce((n, p) => n + p.colors.length, 0)
  return {
    products: products.length,
    brands: brands.length,
    providers: providersBase.length,
    colors,
    printMethods: printMethods.length,
  }
}

export function affiliatesConfig() {
  return {
    ...affiliates,
    note: 'Prefer packages/api/data/affiliates/partners.json + docs/AFFILIATES.md. This file remains for POD provider overrides.',
    providers: Object.fromEntries(
      listProviders().map((p) => [
        p.id,
        {
          affiliateUrl: p.affiliateUrl,
          website: p.website,
          affiliatesPageUrl: p.affiliatesPageUrl,
        },
      ]),
    ),
  }
}
