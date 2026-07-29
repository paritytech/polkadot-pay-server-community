# Polkadot Pay Server (Community)

> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

This is code developed and published by Parity as an experimental proof-of-concept. It is **not** a Parity product or service, and Parity does not operate, host, deploy, or endorse any downstream deployment of it — downstream operators run their own forks at their own discretion.

Run a local payment API, hosted QR payment page, and admin dashboard. The backend uses PostgreSQL for state, Redis for settlement work, and the selected Polkadot People chain to observe payments.

## Prerequisites

- Docker Desktop (or Docker Engine with Compose) running
- `curl` and `jq` for the smoke test below
- A reachable People-chain endpoint for the selected network

## Configuration

Create a local configuration file:

```bash
cp .env.example .env
```

Set these variables before starting the application:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL. Under Compose, keep the default `postgres` host. |
| `BASE_URL` | Yes | Public backend origin. Set `http://localhost:8788` for local Compose. |
| `MASTER_KEY` | Yes | Exactly 64 hexadecimal characters. Encrypts payment private keys at rest. Do not change it while the PostgreSQL volume contains active or late-completable payments. |
| `SIGNUP_CODE` | Yes | Non-empty shared secret required to create merchant accounts. Choose a private value. |
| `NETWORK` | Yes | `paseo`, `paseo-next-v2`, or `previewnet`. Use a network with a People-chain endpoint; the template defaults to `paseo-next-v2`. |
| `REDIS_URL` | No | Redis connection URL. Defaults to the Compose Redis service. |
| `OPERATOR_MNEMONIC` | No | Operator BIP39 mnemonic that funds coin mints via topUp and receives automatic settlement. Leave empty to disable top-ups and use the manual claim-export flow. |
| `SETTLEMENT_ACCOUNT_PATH` | No | Sr25519 derivation path for the operator account used by auto-settlement. Empty uses the mnemonic's default account. |
| `PAYMENTS_V1_AUTH_KEY` | No | 0x-prefixed 32-byte ed25519 seed (64 hex chars). Authorizes `Coinage.transfer` on the People chain; without it, coin offboarding fails with `System.CallFiltered`. |
| `SETTLEMENT_POLL_MS` | No | Settlement-worker polling interval in milliseconds; defaults to `20000`. |
| `SETTLEMENT_MAX_CLAIM_ATTEMPTS` | No | Settlement claim attempts before a payment is marked `failed`; defaults to `2`. |

For local Compose, the template already supplies working PostgreSQL, Redis, port, and URL values. You must replace `SIGNUP_CODE`; generate a new `MASTER_KEY` for any non-disposable environment:

```bash
openssl rand -hex 32
```

`MASTER_KEY`, `SIGNUP_CODE`, `PAYMENTS_V1_AUTH_KEY`, and `OPERATOR_MNEMONIC` are secrets.

## Run the app

```bash
docker compose up --build
```

Wait for `payment-processor-api listening on http://localhost:8788`, then confirm the backend is reachable:

```bash
curl http://localhost:8788/healthz
```

| Service | URL |
| --- | --- |
| Backend API | http://localhost:8788 |
| Admin dashboard | http://localhost:5175 |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

Useful commands:

```bash
docker compose logs -f backend
docker compose exec backend bun run typecheck
docker compose down                 # stop services; retain data
docker compose down -v              # stop services and delete local data
```

The development images copy source at build time. After code changes, rerun `docker compose up --build`.

## API documentation

With the backend running:

- **Integration guide:** http://localhost:8788/docs
- **Interactive reference:** http://localhost:8788/docs/reference
- **OpenAPI 3.1 document:** http://localhost:8788/openapi.json

The interactive reference documents every request and response and can generate `curl` commands. Authenticated endpoints are under `/v1`; use `Authorization: Bearer <API_KEY>`.

## Test flow

This verifies account creation, authenticated payment creation, and the hosted QR page. It creates a pending payment only; completing it requires a compatible, funded Polkadot wallet on the selected network.

1. Export the signup secret from your local `.env`:

   ```bash
   export SIGNUP_CODE="$(grep '^SIGNUP_CODE=' .env | cut -d= -f2-)"
   ```

2. Create a merchant account and save its one-time API key:

   ```bash
   curl -sS -X POST http://localhost:8788/v1/accounts \
     -H 'content-type: application/json' \
     --data "{\"name\":\"Local test merchant\",\"signup_code\":\"$SIGNUP_CODE\"}" \
     | tee account.json

   export API_KEY="$(jq -r '.api_key.secret' account.json)"
   ```

3. Create a payment and save its hosted payment URL:

   ```bash
   curl -sS -X POST http://localhost:8788/v1/payments \
     -H "Authorization: Bearer $API_KEY" \
     -H 'content-type: application/json' \
     --data '{"amount":"1.00","description":"Local QR test","expires_in":900}' \
     | tee payment.json

   jq -r '.payment_url, .qr.deeplink, .qr.svg' payment.json
   ```

4. Open the printed `payment_url` in a browser. It renders the QR code and status. Scan it with a compatible Polkadot app to attempt a real payment. The printed `qr.svg` is also a URL; paste it into a browser to inspect the QR image directly.

5. Check the status:

   ```bash
   PAYMENT_ID="$(jq -r '.id' payment.json)"
   curl -sS "http://localhost:8788/public/payments/$PAYMENT_ID/status" | jq
   ```

The API key is returned in full only when the account or key is created. Store it securely; it cannot be retrieved later.

## Security

Before deploying it for real use cases, you are responsible for:

- Reviewing the code yourself; this is a reference proof-of-concept, not a hardened production build.
- Checking that dependencies are up to date and free of known vulnerabilities.
- Securing your own fork or deployment environment, especially `MASTER_KEY`, `SIGNUP_CODE`, `OPERATOR_MNEMONIC`, `PAYMENTS_V1_AUTH_KEY`, database credentials, and CI secrets.
- Tracking the latest tagged release / commits for security fixes; older releases are not backported (exceptions might apply).

For Parity's security disclosure process and Bug Bounty program, see [parity.io/bug-bounty](https://parity.io/bug-bounty). See [SECURITY.md](./SECURITY.md) for this repository's security policy and safe-use guidance.

## License

Licensed under [GPL-3.0-or-later](./LICENSE).
