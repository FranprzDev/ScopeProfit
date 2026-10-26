# v3 quotes, rate card and maintenance: API access without a UI

The v3 features (rate card, quotes, maintenance retainers) were only reachable from the Next.js web app (`apps/app`), which was removed when the product went MCP-first. Their API is unchanged and still covered by the backend tests, but **it is not exposed as MCP tools yet** (see "Follow-up" below).

## Endpoints

All paths are relative to `PUBLIC_API_URL` and carry the global `/api` prefix. Request and response shapes are the DTOs in the controllers listed.

| Feature     | Endpoints                                                                                                                                                                         | Controller                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Rate card   | `GET /api/me/rate-card`, `PUT /api/me/rate-card` (`label`, `hourlyRate`, `currency`, `marginPercent`)                                                                             | `apps/api/src/modules/pricing/rate-card.controller.ts` |
| Quotes      | `GET /api/me/quotes`, `GET /api/projects/:id/quote`, `POST …/quote/generate`, `PATCH …/quote`, `POST …/quote/send`, `POST …/quote/decision`, `GET …/quote/:format` (`pdf`/`docx`) | `apps/api/src/modules/pricing/quote.controller.ts`     |
| Maintenance | `GET /api/me/maintenance`, `GET/POST/PATCH /api/projects/:id/maintenance`, `GET/POST …/maintenance/entries`, `GET …/maintenance/balance?month=YYYY-MM`                            | `apps/api/src/modules/maintenance/*.controller.ts`     |

## Authentication

These controllers authenticate with the `sp_session` cookie only. MCP API keys and OAuth tokens are **not** accepted here. The client-side quote endpoints (`GET …/quote`, `POST …/quote/decision`, downloads) also accept the client project token in the `x-project-token` header.

Stopgap to get a professional session without the web app:

1. Have the installation operator provision the professional account from a trusted server shell (`mcp:keys create --email <email>` creates it; add `--claim-legacy-telegram-id <id>` to keep the projects of an account created before email authorization).
2. Request a magic link and open it against the API origin, then read the cookie from the `302` response:

   ```bash
   curl -s https://api.<your-domain>/api/auth/magic-link/request \
     -X POST -H "Content-Type: application/json" -d '{"email":"<email>"}'
   curl -si "https://api.<your-domain>/api/auth/magic-link/verify?token=<token-from-the-email>" | grep -i set-cookie
   ```

3. Send that cookie on the v3 calls:

   ```bash
   curl -s https://api.<your-domain>/api/projects/<project-id>/quote/generate \
     -X POST -H "Content-Type: application/json" -d '{}' \
     -b "sp_session=<value>"
   ```

`https://api.<your-domain>` is a placeholder for your `PUBLIC_API_URL`. The session lasts up to 30 days.

## Follow-up

- Expose v3 as MCP tools (`get_rate_card`/`set_rate_card`, `generate_quote`/`update_quote`/`send_quote`, `get_maintenance`/`log_maintenance_entry`/`get_maintenance_balance`). Not trivial: `ScopeToolsService` and the stdio entrypoint need the pricing and maintenance services wired in, the quote patch payload (lines and milestones) needs Zod schemas and tests, and the server instructions currently say "Estimates are hour ranges, never prices", which a quote tool would contradict. That is a product decision.
- Alternatively, accept `Authorization: Bearer sp_live_…` on the REST controllers so scripts can use the same API key as MCP.
