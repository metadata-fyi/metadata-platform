import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distFlag = process.argv.indexOf('--dist')
const dist = path.resolve(
  distFlag >= 0 ? process.argv[distFlag + 1] : path.join(root, 'apps/web/dist'),
)
const required = [
  'index.html',
  'app.html',
  'docs.html',
  'pricing.html',
  'stats.html',
  'settings.html',
  'legal.html',
  'feedback.html',
]

const missing = required.filter((name) => {
  const file = path.join(dist, name)
  return !fs.existsSync(file) || fs.statSync(file).size === 0
})

if (missing.length) {
  console.error(`web artifact check failed; missing or empty: ${missing.join(', ')}`)
  process.exit(1)
}

const INITIAL_JS_MAX_BYTES = 450 * 1024
const INITIAL_JS_GZIP_MAX_BYTES = 200 * 1024
const budgetFailures = []
const entries = []
for (const entry of required) {
  const html = fs.readFileSync(path.join(dist, entry), 'utf8')
  const assets = new Set()
  let moduleEntries = 0
  for (const tag of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attrs = Object.fromEntries(
      [...tag[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [
        m[1].toLowerCase(),
        m[2],
      ]),
    )
    const module = tag[1].toLowerCase() === 'script' && attrs.type === 'module'
    if (!module && !(tag[1].toLowerCase() === 'link' && attrs.rel === 'modulepreload')) continue
    const ref = module ? attrs.src : attrs.href
    if (!ref || /^(?:[a-z]+:|\/\/)/i.test(ref)) {
      budgetFailures.push(`${entry}: expected local module asset`)
      continue
    }
    if (module) moduleEntries++
    let asset
    try {
      asset = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\//, '')
    } catch {
      budgetFailures.push(`${entry}: invalid asset URL`)
      continue
    }
    const file = path.resolve(dist, asset)
    if (
      !file.startsWith(dist + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile() ||
      !fs.realpathSync(file).startsWith(fs.realpathSync(dist) + path.sep)
    ) {
      budgetFailures.push(`${entry}: missing or escaping script ${ref}`)
      continue
    }
    assets.add(path.relative(dist, file))
  }
  if (!moduleEntries) budgetFailures.push(`${entry}: no module entry scripts`)
  let rawBytes = 0
  let gzipBytes = 0
  for (const asset of assets) {
    const file = path.join(dist, asset)
    if (!fs.existsSync(file)) {
      budgetFailures.push(entry + ': missing referenced script ' + asset)
      continue
    }
    const bytes = fs.readFileSync(file)
    rawBytes += bytes.byteLength
    gzipBytes += gzipSync(bytes, { level: 9 }).byteLength
  }
  entries.push({ entry, assets: [...assets], rawBytes, gzipBytes })
  if (rawBytes > INITIAL_JS_MAX_BYTES) {
    budgetFailures.push(
      entry + ': initial JavaScript is ' + rawBytes + ' bytes; budget is ' + INITIAL_JS_MAX_BYTES,
    )
  }
  if (gzipBytes > INITIAL_JS_GZIP_MAX_BYTES) {
    budgetFailures.push(
      entry +
        ': initial JavaScript gzip is ' +
        gzipBytes +
        ' bytes; budget is ' +
        INITIAL_JS_GZIP_MAX_BYTES,
    )
  }
}

fs.mkdirSync(path.join(root, 'test-results'), { recursive: true })
fs.writeFileSync(
  path.join(root, 'test-results/web-budget.json'),
  JSON.stringify({ dist, entries, failures: budgetFailures }, null, 2) + '\n',
)

if (budgetFailures.length) {
  console.error('web artifact budget failed')
  for (const failure of budgetFailures) console.error(' - ' + failure)
  process.exit(1)
}

console.log(
  'web artifact check ok: ' +
    required.length +
    ' HTML entry points and initial JavaScript budgets in ' +
    path.relative(root, dist),
)
