/** Shared limits for unauthenticated public intake endpoints. */

export const PUBLIC_INTAKE_MAX_BYTES = 256 * 1024

export function contentLengthTooLarge(
  headers: Headers,
  maxBytes = PUBLIC_INTAKE_MAX_BYTES,
): boolean {
  const raw = headers.get('content-length')
  if (!raw) return false
  const length = Number(raw)
  return Number.isFinite(length) && length > maxBytes
}

/** Read an exact raw request body without allowing an unbounded chunked body. */
export async function readTextBodyLimited(
  request: Request,
  maxBytes = PUBLIC_INTAKE_MAX_BYTES,
): Promise<string> {
  if (contentLengthTooLarge(request.headers, maxBytes)) {
    throw new Error('REQUEST_BODY_TOO_LARGE')
  }

  const stream = request.body
  if (!stream) return ''

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel('request body too large')
        throw new Error('REQUEST_BODY_TOO_LARGE')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** Read a JSON request without allowing an unbounded chunked body. */
export async function readJsonBodyLimited(
  request: Request,
  maxBytes = PUBLIC_INTAKE_MAX_BYTES,
): Promise<unknown> {
  if (contentLengthTooLarge(request.headers, maxBytes)) {
    throw new Error('REQUEST_BODY_TOO_LARGE')
  }

  const stream = request.body
  if (!stream) return JSON.parse('')

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel('request body too large')
        throw new Error('REQUEST_BODY_TOO_LARGE')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
