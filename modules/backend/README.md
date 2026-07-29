# payment-processor-api

Merchant REST API for Polkadot coinage payments.

1. Copy `.env.example` to `.env` and set `BASE_URL`, `DATABASE_URL`, `MASTER_KEY`, and `SIGNUP_CODE`.
   `SIGNUP_CODE` is the shared secret every merchant must supply to `POST /v1/accounts`; without it the backend refuses to start.
2. Install dependencies:
   ```bash
   bun install
   ```
3. Start the server:
   ```bash
   bun run dev
   ```
4. Open the API reference at `http://localhost:8788/docs`.

## Notes

- Uses Bun + Hono + PostgreSQL.
- Runs as one long-lived process because the People-chain listener is stateful.

The integration tests require a reachable PostgreSQL `DATABASE_URL`; Docker Compose provides it as the `postgres` service.
