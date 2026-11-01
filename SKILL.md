---
name: metadata-api
description: >
  Public multi-vertical metadata API for anime, manga, games, cartoons, comics, light novels,
  POD blanks, TCG cards, figures/Nendoroids, model kits, plush, board games, fashion,
  consoles, esports, and soundtracks (OST). Use when an agent
  needs series/character data, product blanks, card lookups, figure SKUs, tabletop
  metadata, soundtrack albums, or to report incorrect catalog rows.
---

# Metadata API skill

Open, MIT-licensed metadata API for companion apps and agents.

**Access (not a free plan):** **fixed free sample** per catalog in production, then **prepaid credits** on a wallet for full catalog. Discovery (`/v1/health`, `/v1/preview`, `/SKILL.md`, payment packs/quote/methods) stays open. Stripe Checkout and wallet account routes require a signed session. Details: repo `docs/ACCESS.md`.

## Base URL

| Environment | Base |
|-------------|------|
| Production (apex) | `https://metadata.fyi` |
| Production (vertical host) | `https://{vertical}.metadata.fyi` |

Local:

| Mode | Web | API |
|------|-----|-----|
| Ports (`npm run dev`, Node 22) | `http://127.0.0.1:5177` | `http://127.0.0.1:8787` |
| Named (`npm run dev:named`, Portless / Node 24+) | `https://metadata.localhost` | `https://api.metadata.localhost` |

`X-Metadata-Vertical` still works. Host-based verticals on named URLs are a follow-up. Production origin bind remains `:8787`.

Always prefer **versioned** routes under `/v1/`.

## Muse / Phantasy / MCP

Streamable HTTP MCP:

```http
GET  /mcp
POST /mcp
```

Call `metadata_discover` first, then `metadata_search` / `metadata_get_series` /
`metadata_get_card` / `metadata_sku_resolve` / `metadata_market_quote`. Catalog
tools use the same preview / session / service-key / x402 gate as `/v1`.

OpenAPI: `GET /openapi.json`. Plugin: `GET /.well-known/ai-plugin.json`.
How to connect Muse and Phantasy: repository `docs/CONNECTORS.md`.

## Select a vertical

Send one of:

1. Header: `X-Metadata-Vertical: anime` (or `manga`, `lightnovels`, `game`, `cartoons`, `comics`, `pod`, `tcg`, `figures`, `modelkits`, `plush`, `boardgames`, `fashion`, `ost`, `consoles`, `esports`)
2. Host: `anime.metadata.fyi`, `pod.metadata.fyi`, …
3. Query: `?vertical=anime`

Aliases: `blanks`→pod, `cards`/`pokemon`→tcg, `nendoroid`→figures, `gunpla`→modelkits, `ln`→lightnovels, `bgg`→boardgames, `soundtrack`→ost, `nick`→cartoons, `platform`/`arcade`→consoles, `marvel`/`dc`→comics.

**Data shapes:** see repository `docs/SCHEMAS.md` (Series, PodBlank, TcgCard, GameConsole, EsportsPlayer, OstAlbum, ReportPayload, …).

## Discovery endpoints (start here)

```http
GET /llms.txt
GET /SKILL.md
GET /v1/verticals
GET /v1/datasets
GET /v1/health
GET /v1/stats
GET /v1/preview
GET /
GET /openapi.json
```

`GET /v1/stats` is free (no wallet) — public **platform** traffic (paths, verticals, status, paid/unpaid mix). No wallet addresses. UI: `/stats.html`. Per-wallet account stats live on `/settings.html` (signed-in).

`GET /v1/preview` returns the fixed production sample or the remaining development/staging preview budget; it does not consume a slot.

## SKU (catalog-gated hub identity, not open discovery)

Hub identity resolver for `metadata:{vertical}:{collection}:{id}`. Catalog-gated (preview / paid / service / x402) — **not** a discovery route. Prefer POST. Collections: `products` (pod), `items` (fashion/figures/plush/modelkits), `cards`/`games` (tcg; boardgames also `games` by vertical), `series`/`characters` (media), `albums` (ost), `consoles`, `titles` (esports).

```http
POST /v1/sku/resolve
GET  /v1/sku/{key}
GET  /v1/sku?q=
```

**Prefer `POST /v1/sku/resolve` `{ "key": "metadata:pod:products:bella-canvas-3001" }`** — Cloudflare rejects colons in GET paths. Exact catalog ids/slugs resolve uniquely even when mill style codes collide.

- **200** unique `{ ok, unique: true, ref }`
- **409** ambiguous `{ unique: false, error: "AMBIGUOUS", matches }` — a **result**, not a crash. Bare mill codes like `3001` are often 409; use the canonical id.
- **404** `{ ok: false, error: "NOT_FOUND" }`

SDK `sku()` returns the JSON on 200/409/404 (does not throw). `keys` is accepted (max 20); batch is HTTP 200 `{ results }` even if items are NOT_FOUND or AMBIGUOUS.

## Core patterns by vertical

### Media (anime | manga | game | cartoons)

```http
GET /v1/search?q={query}
GET /v1/series?q=
GET /v1/series/{id}
GET /v1/characters/{id}
```

Anime series may include `seasons[]`. Manga series may include `volumes[]` / `volumeCount`.
Series may list `ostAlbumIds` when soundtrack rows are linked.
Series and character detail include `merch` (figures / plush / modelkits / ost / esports) joined by exact `seriesSlug`.

### POD / blanks (`pod`)

```http
GET /v1/products?q=3001
GET /v1/products/{id}
GET /v1/print-methods
GET /v1/brands
GET /v1/providers
GET /v1/affiliates?vertical=pod
```

### TCG (`tcg`)

```http
GET /v1/tcg/games
GET /v1/tcg/cards?game=pokemon&q=pikachu
GET /v1/tcg/cards/{id}
GET /v1/market/coverage
GET /v1/market/status
GET /v1/market/search?kind=card&game=pokemon&q=charizard
GET /v1/market/quotes/{id}
GET /v1/market/history/{id}?variant=psa10
```

Quotes are coagulated **observations**, not identity and not a sold tape. `mid` is a median of **venues** (TCGPlayer reprints collapse to one venue; Cardmarket is a second; PriceCharting is an eBay-modelled guide). Read `confidence` (`multi-venue` | `single-venue`), `stale`, `basis`, and `asOf` before treating `mid` as a price. eBay sold comps are not available to us.

### Figures (`figures`)

```http
GET /v1/figures/items?kind=nendoroid
GET /v1/figures/items?maker=funko&q=2358
GET /v1/figures/items/{id}
GET /v1/figures/makers
GET /v1/figures/lines
```

Figure `q` searches JAN, publisher product code, and box number as well as names. `publisherProductCode` is the publisher catalog SKU; `productCode` retains the existing manufacturer/line code, and Funko `boxNumber` is separate. Release dates can have month precision (`YYYY-MM`). Unknown fields remain null.

### Board games (`boardgames`)

```http
GET /v1/boardgames?players=2&q=wingspan
GET /v1/boardgames/{id}
GET /v1/publishers
```

### Soundtracks (`ost`)

```http
GET /v1/ost/albums?media=anime&q=cowboy
GET /v1/ost/albums?series=attack-on-titan
GET /v1/ost/albums/{id}
GET /v1/ost/artists?q=sawano
GET /v1/search?q=persona
```

Albums include `mediaVertical` + `seriesSlug` linking back to anime/game series.

### Consoles (`consoles`) — hardware, **not** nested under `game`

```http
GET /v1/consoles?formFactor=arcade
GET /v1/consoles?generation=9&q=playstation
GET /v1/consoles/{id}
GET /v1/manufacturers
```

### Esports (`esports`)

```http
GET /v1/esports/titles
GET /v1/esports/titles/league-of-legends
GET /v1/esports/leagues?title=dota-2
GET /v1/esports/teams?q=t1
GET /v1/esports/players?q=faker
```

### Comics (`comics`) — western only (use `manga` for manga)

```http
GET /v1/search?q=spider-man
GET /v1/series/batman
GET /v1/characters/batman__bruce-wayne
```

## Flag incorrect data (not a catalog route)

Do **not** invent catalog patches. Humans use the form at `/feedback.html`.
Agents POST JSON to the **same** endpoint:

```http
POST /feedback
Content-Type: application/json
Accept: application/json

{
  "kind": "correction",
  "vertical": "anime",
  "entityKind": "series",
  "entityId": "one-piece",
  "field": "title",
  "message": "Description is truncated / wrong title on slug X",
  "suggestedValue": { "title": "…" },
  "sources": ["https://…"],
  "agent": { "name": "my-agent", "url": "https://…" }
}
```

Kinds: `correction` | `missing` | `spam` | `dmca` | `other`.  
Response `202` with `{ id, persisted: true, status: "queued" }`. Operator queue only — **not** auto-applied.  
`POST /v1/report` is deprecated (alias → same queue).

Suggest new rows:

```http
POST /v1/contribute
Content-Type: application/json

{
  "kind": "character",
  "vertical": "cartoons",
  "payload": { "name": "…", "seriesId": "…" },
  "note": "missing cast member",
  "sources": ["https://…"],
  "wallet": "0x…"
}
```

`wallet` is optional. Operator accept may credit it (Metadata credits, not USD). Never auto-merged. Kind `dataset` requires `payload.title` (≤ 200) and `wallet`; after accept it appears on `GET /v1/datasets`. `GET /v1/export/dataset/{id}` is a prepaid identity summary (counts), not a dump.

## Affiliates

```http
GET /v1/affiliates
GET /v1/affiliates?vertical=figures
GET /v1/affiliates?configured=1
```

## Access: preview · credits · x402

Full write-up: repository **`docs/ACCESS.md`**.

### Free preview (teaser — not a free plan)

- Production exposes three fixed sample items per vertical at `GET /v1/preview`; arbitrary catalog queries require payment and return **402** `PAYMENT_REQUIRED` without funding.
- Development and staging allow a bounded per-IP preview: eight requests per day, five search results, and 10,000 response units per day. Exhaustion returns **429**.
- Exports never use preview.

### Prepaid credits (full catalog)

- After minting credits, sign the server challenge (`GET /v1/pay/auth/nonce` → `POST /v1/pay/auth/verify`) and send `X-Wallet-Address: 0x…` plus `X-Metadata-Session: <token>`. Tier `paid` while **balance &gt; 0**.
- Top up: Reown Pay on `/pricing.html` ($5 min, snapped), or settle USDG then `POST /v1/pay/claim` `{ wallet, usdg|packId, txHash }` (claim is session-optional because the verified transfer proves the payer). Quote: `GET /v1/pay/quote?usdg=20` (open). Balance: `GET /v1/pay/balance?wallet=0x…` requires a matching `X-Metadata-Session`; the session identifies the wallet.
- Stripe: when configured (`STRIPE_SECRET_KEY`), `POST /v1/pay/stripe/checkout` → webhook/sync mints credits, otherwise `503 STRIPE_DISABLED`. Methods: `GET /v1/pay/methods`.
- **Plain reads** with balance &gt; 0 are rate-limited and debit **at least 1 credit per returned data unit**. Export-style routes debit credits (`cost > 0`).
- Service keys (`X-Metadata-Service-Key`) are rate-limited first-party access, no credit spend (see `docs/SERVICE-ACCOUNTS.md`).

### x402 ($0.01 / zero-cost read · Marian)

- When `X402_ENABLED=1`, **402** includes `accepts[]` for **$0.01 USDG** on Robinhood (`eip155:4663`) via **Marian** for zero-cost catalog reads.
- Retry with **`X-PAYMENT`** (base64 payment payload) → Metadata verifies before the handler and settles only after a successful 2xx response.
- Export-style routes remain **prepaid-only** and require a funded wallet session; x402 is never accepted for an export charge.
- Prepaid credits (Reown/Stripe claim) still unlock full access with `X-Wallet-Address` + `X-Metadata-Session` while balance &gt; 0.
- Requires `TREASURY_ADDRESS` + `X402_FACILITATOR_API_KEY` (Marian merchant key). See `docs/ACCESS.md`.

## Legal

Public-data aggregation; no claim of ownership of third-party IP. See `/legal.html` on the hub. Prefer official / public sources in report `sources`.

## Quick curl

```bash
# Discovery (no credits)
curl -s "$BASE/v1/health" -H "X-Metadata-Vertical: anime"

# Fixed production sample (no wallet)
curl -s "$BASE/v1/preview" -H "X-Metadata-Vertical: anime"
curl -s "$BASE/v1/search?q=rem" -H "X-Metadata-Vertical: anime"

# Full catalog (funded wallet + session)
export WALLET=0xYOUR
# 1. GET $BASE/v1/pay/auth/nonce?wallet=$WALLET
# 2. personal_sign the returned message
# 3. POST $BASE/v1/pay/auth/verify  { wallet, message, signature } → SESSION
curl -s "$BASE/v1/search?q=rem" -H "X-Metadata-Vertical: anime" -H "X-Wallet-Address: $WALLET" -H "X-Metadata-Session: $SESSION"
curl -s "$BASE/v1/figures/items?kind=nendoroid&limit=5" -H "X-Metadata-Vertical: figures" -H "X-Wallet-Address: $WALLET" -H "X-Metadata-Session: $SESSION"
curl -s "$BASE/v1/ost/albums?media=game&q=persona" -H "X-Metadata-Vertical: ost" -H "X-Wallet-Address: $WALLET" -H "X-Metadata-Session: $SESSION"

# Feedback form / agents (open)
curl -s -X POST "$BASE/feedback" -H "Content-Type: application/json" -H "Accept: application/json" -d \
  '{"kind":"correction","vertical":"anime","entityKind":"series","entityId":"one-piece","message":"example flag from skill","agent":{"name":"skill"}}'
```

## Source

Open source: Forgejo / git repo for this project. Data under `packages/api/data/`. Human PRs welcome (`CONTRIBUTING.md`).

Azuki TCG: gameId=azuki is available through the existing /v1/tcg/games, /v1/tcg/sets, /v1/tcg/cards, and facet routes. English official gallery variants preserve gameplay (IKZ cost, attack, health, gate power, abilities, card text, errata, and publisher product memberships). Collector-code groups differ from sealed-product records; gallery coverage does not certify every physical printing. Announced products can have no published card checklist.

Azuki set/product descriptions retain official contents and configurations. Set search also matches descriptions and sourceIds (including publisherSku); unknown checklists remain incomplete.
