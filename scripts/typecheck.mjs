#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const existing = process.env.NODE_OPTIONS || ''
const flags = existing
  .split(/\s+/)
  .filter(Boolean)
  .filter((flag) => !flag.startsWith('--max-old-space-size='))
const env = {
  ...process.env,
  NODE_OPTIONS: [...flags, '--max-old-space-size=8192'].join(' '),
}

for (const workspace of ['@metadata/server', '@metadata/web']) {
  const result = spawnSync(npm, ['run', 'typecheck', '-w', workspace], {
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`typecheck could not start for ${workspace}: ${result.error.message}`)
    process.exit(1)
  }
  if (typeof result.status !== 'number' || result.status !== 0) {
    process.exit(typeof result.status === 'number' ? result.status : 1)
  }
}
