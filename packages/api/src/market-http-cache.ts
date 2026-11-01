/**
 * On-disk HTTP cache for scrape hosts. Keys are URLs.
 * Stores status, etag, last-modified, and body so 304s skip work.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type CachedHttp = {
  url: string
  status: number
  etag?: string
  lastModified?: string
  fetchedAt: string
  body: string
}

function cacheDir() {
  return path.join(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'), 'market-http-cache')
}

function cacheFile(url: string) {
  const hash = crypto.createHash('sha256').update(url).digest('hex')
  return path.join(cacheDir(), `${hash}.json`)
}

export function readHttpCache(url: string): CachedHttp | null {
  const file = cacheFile(url)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CachedHttp
  } catch {
    return null
  }
}

export function writeHttpCache(entry: CachedHttp) {
  fs.mkdirSync(cacheDir(), { recursive: true })
  const tmp = `${cacheFile(entry.url)}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(entry)}\n`)
  fs.renameSync(tmp, cacheFile(entry.url))
}

export function cacheHeaders(url: string): Record<string, string> {
  const cached = readHttpCache(url)
  const headers: Record<string, string> = {}
  if (cached?.etag) headers['if-none-match'] = cached.etag
  if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified
  return headers
}

export function rememberResponse(url: string, response: Response, body: string) {
  writeHttpCache({
    url,
    status: response.status,
    etag: response.headers.get('etag') || undefined,
    lastModified: response.headers.get('last-modified') || undefined,
    fetchedAt: new Date().toISOString(),
    body,
  })
}
