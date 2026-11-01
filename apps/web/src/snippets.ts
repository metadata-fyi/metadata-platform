/** Copy-pasteable client snippets for the Metadata console */

export type SnipLang = 'typescript' | 'javascript' | 'python' | 'curl'

export type SnipExample = {
  id: string
  title: string
  description: string
  code: Record<SnipLang, string>
}

function hostFor(vertical: string, rootDomain: string, apiBase: string, dev: boolean) {
  if (dev) return apiBase
  return `https://${vertical}.${rootDomain}`
}

/** Canonical examples per vertical — same structure to avoid layout shift */
export function examplesForVertical(
  vertical: string,
  apiBase: string,
  rootDomain: string,
  dev: boolean,
): SnipExample[] {
  const base = hostFor(vertical, rootDomain, apiBase, dev)
  const header = `X-Metadata-Vertical: ${vertical}`

  // Vertical-specific sample IDs / queries
  const sample: Record<
    string,
    { search: string; getPath: string; getLabel: string; notes?: string }
  > = {
    anime: {
      search: 'rem',
      getPath: '/v1/characters/waifu_rem',
      getLabel: 'get character',
    },
    manga: {
      search: 'luffy',
      getPath: '/v1/series/one-piece',
      getLabel: 'get series',
    },
    game: {
      search: 'link',
      getPath: '/v1/search?q=zelda&limit=5',
      getLabel: 'search',
    },
    cartoons: {
      search: 'spongebob',
      getPath: '/v1/series/avatar-the-last-airbender',
      getLabel: 'get series',
    },
    comics: {
      search: 'spider',
      getPath: '/v1/series/spider-man',
      getLabel: 'get series',
    },
    pod: {
      search: '3001',
      getPath: '/v1/products/bella-canvas-3001',
      getLabel: 'get product',
    },
    tcg: {
      search: 'pikachu',
      getPath: '/v1/tcg/cards?game=mtg&q=bolt&limit=5',
      getLabel: 'search cards',
    },
    figures: {
      search: 'nendoroid',
      getPath: '/v1/figures/items?kind=nendoroid&limit=5',
      getLabel: 'list items',
    },
    plush: {
      search: 'fumo',
      getPath: '/v1/plush/items?kind=fumo&limit=5',
      getLabel: 'list fumos',
    },
    fashion: {
      search: 'dunk',
      getPath: '/v1/fashion/items?release=upcoming&limit=5',
      getLabel: 'upcoming drops',
    },
    boardgames: {
      search: 'wingspan',
      getPath: '/v1/boardgames/wingspan',
      getLabel: 'get game',
    },
    ost: {
      search: 'persona',
      getPath: '/v1/ost/albums?media=anime&q=cowboy',
      getLabel: 'list albums',
    },
    consoles: {
      search: 'switch',
      getPath: '/v1/consoles?limit=10',
      getLabel: 'list consoles',
    },
    esports: {
      search: 'faker',
      getPath: '/v1/esports/titles',
      getLabel: 'list titles',
    },
  }

  const s = sample[vertical] || sample.anime
  const searchQ = s.search
  const getPath = s.getPath

  const health: SnipExample = {
    id: 'health',
    title: 'Health check',
    description: 'Confirm the vertical is up and see catalog counts.',
    code: {
      curl: `curl ${base}/v1/health \\
  -H '${header}'`,
      javascript: `const res = await fetch('${base}/v1/health', {
  headers: { 'X-Metadata-Vertical': '${vertical}' },
})
const health = await res.json()
console.log(health)`,
      typescript: `const res = await fetch('${base}/v1/health', {
  headers: { 'X-Metadata-Vertical': '${vertical}' },
})
const health: { ok: boolean; series: number; characters: number } =
  await res.json()
console.log(health)`,
      python: `import requests

r = requests.get(
    "${base}/v1/health",
    headers={"X-Metadata-Vertical": "${vertical}"},
    timeout=20,
)
r.raise_for_status()
print(r.json())`,
    },
  }

  const walletHeader = `X-Wallet-Address: 0xYOUR`
  const sessionHeader = `X-Metadata-Session: mds_YOUR_TOKEN`
  const walletJs = `'X-Wallet-Address': wallet`
  const sessionJs = `'X-Metadata-Session': session`

  const search: SnipExample = {
    id: 'search',
    title: 'Search',
    description: `Search the ${vertical} catalog (prepaid credits + X-Wallet-Address + X-Metadata-Session).`,
    code: {
      curl: `curl '${base}/v1/search?q=${encodeURIComponent(searchQ)}&limit=10' \\
  -H '${header}' \\
  -H '${walletHeader}' \\
  -H '${sessionHeader}'`,
      javascript: `const wallet = '0xYOUR'
const session = 'mds_YOUR_TOKEN' // POST /v1/pay/auth/verify
const q = '${searchQ}'
const res = await fetch(
  \`${base}/v1/search?q=\${encodeURIComponent(q)}&limit=10\`,
  {
    headers: {
      'X-Metadata-Vertical': '${vertical}',
      ${walletJs},
      ${sessionJs},
    },
  },
)
const { hits } = await res.json()
console.log(hits)`,
      typescript: `const wallet = '0xYOUR' as \`0x\${string}\`
const session = 'mds_YOUR_TOKEN' // POST /v1/pay/auth/verify
const q = '${searchQ}'
const res = await fetch(
  \`${base}/v1/search?q=\${encodeURIComponent(q)}&limit=10\`,
  {
    headers: {
      'X-Metadata-Vertical': '${vertical}',
      ${walletJs},
      ${sessionJs},
    },
  },
)
const data = (await res.json()) as {
  hits: { kind: string; id: string; title: string }[]
}
console.log(data.hits)`,
      python: `import requests

wallet = "0xYOUR"
session = "mds_YOUR_TOKEN"  # POST /v1/pay/auth/verify
r = requests.get(
    "${base}/v1/search",
    params={"q": "${searchQ}", "limit": 10},
    headers={
        "X-Metadata-Vertical": "${vertical}",
        "X-Wallet-Address": wallet,
        "X-Metadata-Session": session,
    },
    timeout=20,
)
r.raise_for_status()
print(r.json()["hits"])`,
    },
  }

  const getOne: SnipExample = {
    id: 'get',
    title: s.getLabel.charAt(0).toUpperCase() + s.getLabel.slice(1),
    description: 'Fetch a single entity by path (credits + wallet + session).',
    code: {
      curl: `curl '${base}${getPath}' \\
  -H '${header}' \\
  -H '${walletHeader}' \\
  -H '${sessionHeader}'`,
      javascript: `const wallet = '0xYOUR'
const session = 'mds_YOUR_TOKEN'
const res = await fetch('${base}${getPath}', {
  headers: {
    'X-Metadata-Vertical': '${vertical}',
    ${walletJs},
    ${sessionJs},
  },
})
if (!res.ok) throw new Error(await res.text())
const data = await res.json()
console.log(data)`,
      typescript: `const wallet = '0xYOUR' as \`0x\${string}\`
const session = 'mds_YOUR_TOKEN'
const res = await fetch('${base}${getPath}', {
  headers: {
    'X-Metadata-Vertical': '${vertical}',
    ${walletJs},
    ${sessionJs},
  },
})
if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
const data: unknown = await res.json()
console.log(data)`,
      python: `import requests

wallet = "0xYOUR"
session = "mds_YOUR_TOKEN"
r = requests.get(
    "${base}${getPath}",
    headers={
        "X-Metadata-Vertical": "${vertical}",
        "X-Wallet-Address": wallet,
        "X-Metadata-Session": session,
    },
    timeout=20,
)
r.raise_for_status()
print(r.json())`,
    },
  }

  const sdk: SnipExample = {
    id: 'sdk',
    title: 'TypeScript client',
    description: 'Use the published-style client helper from @metadata/api.',
    code: {
      curl: `# SDK is TypeScript-first — use the TS tab
curl ${base}/v1/health -H '${header}'`,
      javascript: `// npm: use the TS client, or plain fetch as above
const base = '${base}'
const vertical = '${vertical}'
const wallet = '0xYOUR'
const session = 'mds_YOUR_TOKEN' // nonce → personal_sign → verify

async function mdGet(path) {
  const res = await fetch(base + path, {
    headers: {
      'X-Metadata-Vertical': vertical,
      'X-Wallet-Address': wallet,
      'X-Metadata-Session': session,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const health = await fetch(base + '/v1/health', {
  headers: { 'X-Metadata-Vertical': vertical },
}).then((r) => r.json())
const { hits } = await mdGet('/v1/search?q=${searchQ}&limit=5')`,
      typescript: `import { createMetadataClient } from '@metadata/api/client'

const md = createMetadataClient({
  baseUrl: '${base}',
  vertical: '${vertical}',
  wallet: '0x…',
  session: 'mds_…', // POST /v1/pay/auth/verify
})

const health = await md.health()
const { hits } = await md.search('${searchQ}', 5)
// media verticals:
// const { character, copy } = await md.getCharacter('waifu_rem')`,
      python: `"""Minimal Metadata client (stdlib)."""
from __future__ import annotations
import json
import urllib.parse
import urllib.request

BASE = "${base}"
VERTICAL = "${vertical}"
WALLET = "0xYOUR"
SESSION = "mds_YOUR_TOKEN"  # POST /v1/pay/auth/verify

def md_get(path: str, *, paid: bool = True) -> dict:
    headers = {
        "X-Metadata-Vertical": VERTICAL,
        "Accept": "application/json",
    }
    if paid:
        headers["X-Wallet-Address"] = WALLET
        headers["X-Metadata-Session"] = SESSION
    req = urllib.request.Request(BASE + path, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode())

health = md_get("/v1/health", paid=False)
hits = md_get("/v1/search?" + urllib.parse.urlencode({"q": "${searchQ}", "limit": 5}))
print(health, hits.get("hits", hits)[:2] if isinstance(hits, dict) else hits)`,
    },
  }

  const paid: SnipExample = {
    id: 'wallet',
    title: 'Wallet session (required)',
    description:
      'Catalog and balance need a signed session: GET /v1/pay/auth/nonce → personal_sign → POST /v1/pay/auth/verify, then send X-Wallet-Address + X-Metadata-Session. Quote and on-chain claim remain session-optional.',
    code: {
      curl: `# 1. nonce  2. personal_sign message  3. POST /v1/pay/auth/verify → token
curl '${base}/v1/pay/auth/nonce?wallet=0xYOUR'
# Catalog (session required):
curl '${base}/v1/search?q=${encodeURIComponent(searchQ)}&limit=5' \\
  -H '${header}' \\
  -H 'X-Wallet-Address: 0xYOUR' \\
  -H 'X-Metadata-Session: mds_YOUR_TOKEN'
# Balance requires the signed session token:
curl '${base}/v1/pay/balance?wallet=0xYOUR' \\
  -H '${header}' \\
  -H 'X-Wallet-Address: 0xYOUR' -H 'X-Metadata-Session: mds_YOUR_TOKEN'`,
      javascript: `const wallet = '0xYOUR'
const nonce = await fetch(
  \`${base}/v1/pay/auth/nonce?wallet=\${wallet}\`,
).then((r) => r.json())
// personal_sign(nonce.message) → signature
const { token: session } = await fetch('${base}/v1/pay/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet, message: nonce.message, signature: '0x…' }),
}).then((r) => r.json())
const bal = await fetch(
  \`${base}/v1/pay/balance?wallet=\${wallet}\`,
  { headers: { 'X-Wallet-Address': wallet, 'X-Metadata-Session': session } },
)
console.log(session, await bal.json())`,
      typescript: `const wallet = '0xYOUR' as \`0x\${string}\`
const nonce = (await fetch(
  \`${base}/v1/pay/auth/nonce?wallet=\${wallet}\`,
).then((r) => r.json())) as { message: string }
// personal_sign(nonce.message) → signature
const { token: session } = (await fetch('${base}/v1/pay/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet, message: nonce.message, signature: '0x…' }),
}).then((r) => r.json())) as { token: string }
const bal = (await fetch(
  \`${base}/v1/pay/balance?wallet=\${wallet}\`,
  { headers: { 'X-Wallet-Address': wallet, 'X-Metadata-Session': session } },
).then((r) => r.json())) as { wallet: string; credits: number }
console.log(session, bal)`,
      python: `import requests

wallet = "0xYOUR"
nonce = requests.get(
    f"${base}/v1/pay/auth/nonce",
    params={"wallet": wallet},
    timeout=20,
).json()
# personal_sign(nonce["message"]) → signature
verify = requests.post(
    "${base}/v1/pay/auth/verify",
    json={"wallet": wallet, "message": nonce["message"], "signature": "0x…"},
    timeout=20,
).json()
# Balance requires the signed session token:
r = requests.get(
    f"${base}/v1/pay/balance",
    params={"wallet": wallet},
    headers={
        "X-Wallet-Address": wallet,
        "X-Metadata-Session": verify.get("token", ""),
    },
    timeout=20,
)
print(verify.get("token"), r.json())`,
    },
  }

  // Feedback is documented on /feedback — not catalog snippets
  return [health, search, getOne, sdk, paid]
}

export const LANG_LABELS: Record<SnipLang, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  curl: 'curl',
}

export const LANGS: SnipLang[] = ['typescript', 'javascript', 'python', 'curl']
