import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const registryPath = path.join(root, 'packages/api/data/vertical-registry.json')
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
const ids = registry.verticals.map((entry) => entry.id)
const errors = []

if (registry.version !== 1) errors.push('unsupported vertical registry version')
if (new Set(ids).size !== ids.length) errors.push('duplicate vertical id in registry')
for (const [alias, target] of Object.entries(registry.aliases)) {
  if (!ids.includes(target)) errors.push(`alias ${alias} points to unknown vertical ${target}`)
}

const requiredFiles = [
  'SKILL.md',
  'llms.txt',
  'llms-full.txt',
  'docs/AGENTS.md',
  'apps/web/src/feedback.ts',
]
for (const relative of requiredFiles) {
  const file = path.join(root, relative)
  const text = fs.readFileSync(file, 'utf8')
  for (const id of ids) {
    if (!new RegExp(`\\b${id}\\b`).test(text)) {
      errors.push(`${relative} is missing live vertical ${id}`)
    }
  }
}

const runtime = fs.readFileSync(path.join(root, 'packages/api/src/verticals.ts'), 'utf8')
if (!runtime.includes('../data/vertical-registry.json')) {
  errors.push('packages/api/src/verticals.ts is not backed by the registry')
}

const snippetFiles = ['docs/API.md', 'llms.txt', 'llms-full.txt']
const requiredSnippets = ['POST /v1/sku/resolve', '/v1/datasets', '/v1/export/dataset', '/mcp']
for (const relative of snippetFiles) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8')
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      errors.push(`${relative} is missing ${snippet}`)
    }
  }
}

if (errors.length) {
  console.error('discovery check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `discovery check ok: ${ids.length} verticals, ${Object.keys(registry.aliases).length} aliases`,
)
