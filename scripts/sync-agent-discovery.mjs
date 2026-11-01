#!/usr/bin/env node
/**
 * Copy agent discovery files into the web public dir so the Worker can serve
 * SKILL / llms / well-known / MCP discovery even when origin is down.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dest = path.join(root, 'apps/web/public')
const wellKnown = path.join(dest, '.well-known')
fs.mkdirSync(wellKnown, { recursive: true })

for (const name of ['SKILL.md', 'llms.txt', 'llms-full.txt']) {
  fs.copyFileSync(path.join(root, name), path.join(dest, name))
}

const plugin = {
  schema_version: 'v1',
  name_for_human: 'Metadata',
  name_for_model: 'metadata_public_catalog',
  description_for_human:
    'Public multi-vertical metadata API for anime, manga, games, POD, TCG, figures, board games, OST, consoles, esports, and comics.',
  description_for_model:
    'Catalog identity oracle plus labeled market observations. Read https://metadata.fyi/SKILL.md. MCP: POST https://metadata.fyi/mcp. OpenAPI: https://metadata.fyi/openapi.json. Set X-Metadata-Vertical. Discovery is open; catalog reads need preview, credits+session, service key, or x402.',
  auth: {
    type: 'user_http',
    authorization_type: 'custom',
    custom_header_name: 'X-Metadata-Session',
    description:
      'Discovery is unauthenticated. Catalog requires X-Wallet-Address + X-Metadata-Session or X-Metadata-Service-Key. Optional X-PAYMENT for x402.',
  },
  api: {
    type: 'openapi',
    url: 'https://metadata.fyi/openapi.json',
    is_user_authenticated: false,
  },
  mcp: {
    url: 'https://metadata.fyi/mcp',
    transport: 'streamable-http',
  },
  logo_url: 'https://metadata.fyi/logo.png',
  contact_email: null,
  legal_info_url: 'https://metadata.fyi/legal.html',
}

const mcp = {
  name: 'metadata',
  version: '0.7.0',
  protocolVersion: '2025-03-26',
  transport: 'streamable-http',
  url: 'https://metadata.fyi/mcp',
  skill: 'https://metadata.fyi/SKILL.md',
  openapi: 'https://metadata.fyi/openapi.json',
  wellKnown: 'https://metadata.fyi/.well-known/ai-plugin.json',
  description:
    'Verified multi-vertical catalog identity and labeled market observations for Muse, Phantasy, and other agents.',
}

fs.writeFileSync(path.join(wellKnown, 'ai-plugin.json'), `${JSON.stringify(plugin, null, 2)}\n`)
fs.writeFileSync(
  path.join(wellKnown, 'mcp.json'),
  `${JSON.stringify({ mcpServers: { metadata: { url: 'https://metadata.fyi/mcp', transport: 'streamable-http' } } }, null, 2)}\n`,
)
fs.writeFileSync(path.join(dest, 'mcp.json'), `${JSON.stringify(mcp, null, 2)}\n`)
console.log('synced agent discovery into apps/web/public')
