# Metadata platform

Open-source API, TypeScript client, web console and edge worker for a multi-vertical metadata service. Code is MIT licensed. Catalog datasets and artwork are licensed separately and are not included in this source export.

This is a clean source history extracted from the reviewed operator application. It contains original empty demo inputs and neutral UI placeholders. Operational history, customer/runtime state, credentials and raw review captures are excluded. See `SOURCE-EXPORT.json` and `ASSETS.md`.

## Run locally

Use Node 22 or newer, Python 3.9 or newer, and npm.

```sh
npm ci
npm run demo:bootstrap
cp .env.example .env
npm run dev
```

The API listens on localhost:8787; the web app is on localhost:5177. Empty demo catalogs are intentional. Add appropriately licensed records using the interfaces in `packages/api/src/*types.ts`. Registry aliases and IDs are stable; preserve them when importing your own data. Configure your own payment, session, edge and provider settings before a production deployment. Payment integrations and external feedback forwarding are disabled in the example.

```sh
npm run check
npm run test:e2e
```

The repeatable API E2E writes an acceptance receipt under `outputs/`. Public CI uses only original empty fixtures and no production credentials or datasets. Hosted Metadata is at https://metadata.fyi. Catalog transport and provenance contracts are at https://github.com/metadata-fyi/catalog-contracts.

## Contributing

Submit code changes through pull requests. Keep docs with behavior changes, preserve API contracts, and include repeatable E2E evidence. Do not include customer data, credentials, publisher artwork or copied catalogs without documented redistribution rights. Font and dependency licenses remain with their respective owners.
