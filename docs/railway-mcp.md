# Deploy the MCP API on Railway

ScopeProfit is self-hosted. This recipe deploys only the API and its storage, not the public landing. It uses the existing API Dockerfile and host-led drafting, so Gemini and email credentials are not required unless those features are explicitly enabled.

## Cost and validation boundary

Checked October 28, 2026. Railway's Free plan includes $1 of monthly usage credit, 0.5 GB RAM per service and one volume per project. The trial has a one-time $5 grant expiring after 30 days. Hobby costs $5/month plus usage beyond the included $5. Volumes and databases consume usage; "free trial" does not mean unlimited free hosting. Confirm the account's limits and budget before deploying. Do not upgrade automatically.

This recipe has not been deployed to a live Railway account. Local PostgreSQL migrations, API build and MCP HTTP/OAuth/stdio tests are separate from a Railway deployment. Docker Compose configuration can be checked without a daemon; a successful config check does not prove the image builds or runs.

## Service settings

Use the repository root as the build context. Do not set the root to `apps/api`: the Dockerfile copies workspace manifests and `packages/contracts` from the root.

| Setting             | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Source              | Your ScopeProfit repository and reviewed branch                              |
| Root directory      | `/`                                                                          |
| Dockerfile variable | `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`                                |
| Pre-deploy command  | `pnpm --filter @scopeprofit/api run db:migrate`                              |
| Pre-deploy timeout  | Set a bounded timeout appropriate for your database, for example 300 seconds |
| Start command       | Keep the Dockerfile CMD, `pnpm --filter @scopeprofit/api run start`          |
| Healthcheck path    | `/api/health`                                                                |
| Replicas            | One, because uploads use a single attached filesystem volume                 |

Use dashboard settings for a new service, or Railway's current Infrastructure as Code workflow. Do not add a new `railway.json` based on old tutorials: the current Config as Code guide says new services cannot opt into it and existing legacy files stop working on December 1, 2026. Railway's Dockerfile/monorepo pages still mention that old route, so follow the dedicated deprecation guidance when they disagree.

## Database and variables

Provide a supported PostgreSQL connection as `DATABASE_URL`. A Railway PostgreSQL service is one option; an existing externally hosted database is another. Inspect connectivity, SSL requirements, backups and price before selecting it. Free projects allow one volume, so do not assume both a database volume and API upload volume fit that plan. Do not move production data just to complete a setup exercise.

Set these API service variables privately:

- `DATABASE_URL`: the selected database connection, never committed.
- `ENCRYPTION_KEY`: a stable random 32-byte base64 key. Preserve it across deployments; rotating it can make existing encrypted values unreadable.
- `WEB_URL`: your existing HTTPS public origin. This does not deploy or modify that website.
- `PUBLIC_API_URL`: the API's own HTTPS origin, without a path or trailing query. Use its generated Railway public domain or your API domain, not the landing proxy.
- `PORT`: use the platform-provided value; the API reads it. Ensure the public domain targets that port.
- `TRUST_PROXY_HOPS`: the actual trusted reverse-proxy hop count for this deployment. Do not enable arbitrary proxy trust.
- `STORAGE_ROOT=/data/storage`.
- Keep `MCP_ALLOW_HTTP_IMAGE_URLS=false` and `MCP_ALLOW_PRIVATE_IMAGE_URLS=false` in production.

Do not put `SCOPEPROFIT_API_KEY` into public client JavaScript. Provision keys after the database migrations succeed using the trusted service shell and the documented `mcp:keys` CLI. Keep each connector's key private and revoke temporary verification keys afterward.

## Persistent uploads and export files

Attach a persistent volume at `/data/storage`. Uploads and generated documents must survive a redeploy. Railway mounts volumes at runtime as root; the API Dockerfile runs as `node`, so its build-time `chown` does not establish ownership of the mounted volume.

Choose and verify a permission strategy before accepting uploads. Railway documents `RAILWAY_RUN_UID=0` as its compatibility setting for non-root images; it changes the service's runtime privilege and should be an explicit operator choice, not a hidden Dockerfile change. Alternatively arrange ownership compatible with the existing non-root user and verify an actual write/read after mounting. Never use world-writable permissions as a shortcut.

Volumes are not mounted during pre-deploy commands. Run database migrations there, not file migration or upload initialization. Back up PostgreSQL and the file volume together. Railway documents a short redeploy interruption for services with volumes, and trial data retention ends after credit expiry; keep off-platform backups.

## Verify before connecting a host

1. Confirm migration success and a healthy API deployment.
2. Fetch `GET /api/health` on the public API origin.
3. Call `/api/mcp` without a token. Expect `401` and a `WWW-Authenticate` resource metadata pointer, not a landing HTML page.
4. Inspect the advertised protected-resource and authorization-server metadata. Resource must match the exact public `/api/mcp` URL; DCR, S256 PKCE, token refresh and consent must be reachable.
5. Provision a temporary professional key. Connect an official SDK client with the bearer header, list tools, create a synthetic project and verify a host-led scope/export without provider or email calls.
6. Redeploy and confirm the synthetic project's export still downloads. This checks both database and volume persistence.
7. Complete a real target-host OAuth round trip, then revoke its temporary key and confirm calls fail. Local SDK compatibility alone is not real Claude validation.
8. Check usage and remove temporary test resources through supported routes. Do not delete real projects or volumes as cleanup.

## Sources

- [Railway plans](https://docs.railway.com/pricing/plans)
- [Free trial and retention](https://docs.railway.com/pricing/free-trial)
- [Dockerfile selection](https://docs.railway.com/builds/dockerfiles)
- [Shared monorepos](https://docs.railway.com/deployments/monorepo)
- [Pre-deploy command lifecycle](https://docs.railway.com/deployments/pre-deploy-command)
- [Volume mount timing and permissions](https://docs.railway.com/volumes)
- [Volume limits and caveats](https://docs.railway.com/volumes/reference)
- [Config as Code deprecation](https://docs.railway.com/config-as-code)
- [Current Infrastructure as Code API](https://docs.railway.com/infrastructure-as-code/reference)
