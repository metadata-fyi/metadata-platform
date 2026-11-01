/** Allowlist for URLs that a cross-origin creative may send to the browser. */
export function safeNavigationUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return null

  const base = 'https://metadata.invalid'
  try {
    const parsed = new URL(raw, base)
    if (raw.startsWith('/')) {
      if (raw.startsWith('//') || parsed.origin !== base) return null
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
    if (parsed.origin === base) return null
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

/** Validate a URL that will be rendered as an external shop/product link. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    return raw
  } catch {
    return null
  }
}
