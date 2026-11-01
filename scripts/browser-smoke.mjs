import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'apps/web/dist')
const routes = new Map([
  ['/', 'index.html'],
  ['/app', 'app.html'],
  ['/console/anime', 'docs.html'],
  ['/pricing', 'pricing.html'],
  ['/stats', 'stats.html'],
  ['/settings', 'settings.html'],
  ['/legal', 'legal.html'],
  ['/feedback', 'feedback.html'],
])

for (const file of routes.values()) {
  const target = path.join(dist, file)
  assert.ok(fs.existsSync(target), 'missing built browser entry: ' + file)
  assert.ok(fs.statSync(target).size > 0, 'empty built browser entry: ' + file)
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
  const relative = routes.get(pathname) || pathname.replace(/^\/+/, '')
  const target = path.resolve(dist, relative)
  if (!target.startsWith(dist + path.sep) || !fs.existsSync(target)) {
    response.writeHead(404)
    response.end('Not Found')
    return
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  fs.createReadStream(target).pipe(response)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address === 'object')
const base = 'http://127.0.0.1:' + address.port

try {
  for (const route of routes.keys()) {
    const response = await fetch(base + route)
    const html = await response.text()
    assert.equal(response.status, 200, route + ' should be reachable')
    assert.match(response.headers.get('content-type') || '', /text\/html/)
    assert.match(html, /<!doctype html>/i, route + ' should contain an HTML document')
    assert.match(html, /<script\b/i, route + ' should reference its browser entry')
  }
  console.log('browser-facing artifact smoke ok: ' + routes.size + ' routes')
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}
