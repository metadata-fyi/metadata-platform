const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/

/** Return only absolute HTTP(S) URLs suitable for external navigation. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || CONTROL_OR_BACKSLASH.test(raw)) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    return raw
  } catch {
    return null
  }
}

/** Validate a deep-link template while preserving supported placeholders. */
export function safeExternalTemplate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const template = value.trim()
  const probe = template.replace(/\{query\}/g, 'query').replace(/\{tag\}/g, 'tag')
  if (/[{}]/.test(probe)) return null
  return safeExternalUrl(probe) ? template : null
}
