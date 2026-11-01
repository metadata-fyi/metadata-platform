import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const api = path.join(root, 'packages/api')
const manifest = JSON.parse(fs.readFileSync(path.join(api, 'package.json'), 'utf8'))
if (manifest.private !== true)
  throw new Error(
    'Server catalog package must remain private; publish only a separately reviewed client SDK.',
  )
const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: api,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const report = JSON.parse(raw)
const files = report?.[0]?.files ?? []
const paths = files.map((entry) => String(entry.path))
const forbidden = paths.filter(
  (file) =>
    file.startsWith('data/') ||
    file.includes('/inbox/') ||
    file === 'data/service-accounts.json' ||
    file.startsWith('data/service-account'),
)
if (forbidden.length) {
  console.error('Package boundary violation:')
  for (const file of forbidden) console.error(`- ${file}`)
  process.exit(1)
}

const size = Number(report?.[0]?.size ?? 0)
const maxBytes = 150 * 1024 * 1024
if (size > maxBytes) {
  console.error(`Package is too large: ${size} bytes (max ${maxBytes})`)
  process.exit(1)
}

console.log(`package boundary ok: ${paths.length} files, ${size} bytes`)
