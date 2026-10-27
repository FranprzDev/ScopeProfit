# Self-host ScopeProfit for ChatGPT

Each operator hosts their own API, PostgreSQL and export files. The public landing is not a hosted backend. This guide prepares a custom MCP connection, not a directory listing or a shared multi-tenant service. Professionals on one installation share project access by design; use separate installations for unrelated organizations.

## Prerequisites

- A server with Docker Engine and Compose v2, persistent disk and backups.
- An API hostname whose A/AAAA records point to that server. Both advertised IPv4 and IPv6 must work. Ports 80 and 443 must reach it and be free for Caddy. The optional overlay obtains and renews HTTPS certificates; it does not buy a domain or server.
- A ChatGPT account/workspace allowed to create custom MCP plugins. Check the [current OpenAI requirements](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt). Do not assume Free/Plus availability.

No backend AI or email account is required for host-led scope drafting. Avoid `analyze: true` and email delivery until those optional services are configured.

## Configure

From a trusted server shell, copy `.env.example` to `.env` and set:

| Variable            | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD` | A long random database password, URL-encoded if it contains URL-reserved characters  |
| `MCP_DOMAIN`        | The bare API hostname, for example `api.example.com`; no scheme, path or port        |
| `PUBLIC_API_URL`    | The matching HTTPS origin, for example `https://api.example.com`; no path prefix     |
| `WEB_URL`           | Your HTTPS landing origin (or the API origin for MCP-only use with no magic-link UI) |
| `ENCRYPTION_KEY`    | 32 random bytes encoded as base64                                                    |
| `SESSION_SECRET`    | A random value of at least 32 characters                                             |

Generate fresh encryption/session values with `node scripts/preflight.mjs --generate-secrets` and save them directly in protected environment/secret storage. Do not paste secrets into chat, commit `.env`, reuse local test secrets or regenerate the encryption key over existing encrypted data. Protect the file with `chmod 600 .env`.

`DATABASE_URL` in the example is for host-side commands. Compose injects its own database URL pointing to `postgres`; keep database credentials consistent. The overlay sets `TRUST_PROXY_HOPS=1` for Caddy. If adding other proxies, review the actual trust boundary rather than copying this number.

```bash
node scripts/preflight.mjs --mcp-only
docker compose -f docker-compose.yml -f docker-compose.mcp.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.mcp.yml up -d --build postgres migrate api caddy
```

The default Compose file is unchanged. The opt-in overlay publishes only Caddy's web ports, not PostgreSQL or the API directly. Do not attach untrusted containers to its internal network. Caddy persists certificate state in `caddy_data` and `caddy_config`; database and exports use the existing `postgres_data` and `storage_data` volumes. Back up database and export data together. Never use `down -v` on an installation whose data you need.

Full `production:preflight` still checks the optional AI/email credentials for the original full-service setup; `--mcp-only` intentionally does not. Neither mode proves live connectivity or credential validity.

## Provision and verify

Provision a professional only from the trusted operator shell:

```bash
docker compose -f docker-compose.yml -f docker-compose.mcp.yml exec api pnpm --filter @scopeprofit/api run mcp:keys create --email operator@example.com --label chatgpt
```

Use your own email and save the one-time API key in a password manager. It is not a ChatGPT API key. Knowing an email does not grant access; never expose the provisioning CLI as a public signup service.

Before adding ChatGPT, check from outside the server:

- `https://api.example.com/api/health` responds successfully over valid HTTPS.
- `https://api.example.com/.well-known/oauth-authorization-server` describes this installation's HTTPS issuer and registration/token endpoints.
- `https://api.example.com/.well-known/oauth-protected-resource/api/mcp` identifies this exact MCP resource.
- An unauthenticated POST to `/api/mcp` is rejected, not allowed through by the proxy. Preserve authorization headers and origin checks; do not remove auth to get a tool scan working.

Follow [ChatGPT connection steps](mcp.md#chatgpt-custom-mcp-plugin). Start with `list_projects` and a new invented brief, `analyze: false`. Review the generated scope before approval/export. Do not send client email in a connectivity test. Verify OAuth consent, discovered tools, a real authorized call and revocation before declaring the installation connected. Refresh-token renewal needs a later live check too.

To revoke access, run the existing `mcp:keys list` and `mcp:keys revoke <key-id>` through the same Compose `exec api` prefix. Revoking the key also invalidates its OAuth grants. Deleting the ChatGPT plugin alone is not server-side key revocation.

## Limits and troubleshooting

- This overlay is a deployment recipe, not proof of a live domain, certificate, working ChatGPT account or production deployment. No server is deployed by cloning the repository.
- A certificate failure usually needs DNS, firewall, port or existing-proxy checks. If TLS already terminates elsewhere, use that proxy instead of starting a competing Caddy; route the entire API origin, including `/.well-known/*` and OAuth endpoints, not only `/api/mcp`.
- A 401 needs a valid installation key or OAuth grant; a 403 may indicate an invalid Origin. Inspect sanitized server logs rather than logging tokens or request bodies.
- Recreate/refresh the ChatGPT connection if its cached tool list or OAuth metadata is stale. OpenAI documents Secure MCP Tunnel as a separate option; it is not provisioned here.
- Custom workspace access is not public app-directory distribution. Public distribution, hosting and any costs need a separate decision.

References: [OpenAI custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server), [OpenAI connection requirements](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).
