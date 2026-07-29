# PolkaPay Dashboard

Admin dashboard SPA built with Vite, React 19, TanStack Router (file-based) and
TanStack Query, Zustand, and Tailwind CSS with the Polkadot design-system tokens.

Sections: **Account & Keys** (merchant account and bearer API keys), **Webhooks**
(endpoints, signed deliveries, event log), **Payments** (create payment intents,
track ongoing and past transactions with QR checkout), and **API Docs** (backend
documentation links).

## Structure

```
src/
  main.tsx              # entry: router + query provider
  routes/               # TanStack Router file-based routes
  features/<name>/       # account, webhooks, payments, docs (api/, components/)
  components/ui/          # shared design-system primitives
  lib/                   # apiClient, queryClient, utils
  stores/                # zustand: auth, theme, toast
  types/                 # shared API types
```

## Development

```sh
bun install
bun run dev
```

## Environment

- `VITE_API_PROXY_TARGET` — backend target for the local Vite proxy, default `http://localhost:8788`
- `VITE_API_BASE_URL` — prefix used by the SPA for API requests, default empty string for same-origin proxying

## Compose

The root Compose setup runs this service on port `5175`.
