# Production launch checklist

For host-led MCP drafting without backend AI or email, use [self-host-chatgpt.md](self-host-chatgpt.md) and `node scripts/preflight.mjs --mcp-only`. The AI/email credential steps below belong to the optional full-service flow. There is no client `/settings` web app in the current MCP-first product; provision optional AI keys with the trusted `mcp:keys set-ai-key` CLI. A completed checklist does not prove a live ChatGPT connection.

## 1. Cuentas y credenciales reales

- [ ] **Brevo**: crear cuenta, verificar dominio/remitente, generar `BREVO_API_KEY`, definir `BREVO_SENDER_EMAIL` verificado.
- [ ] **Vercel AI Gateway**: configurar `AI_GATEWAY_API_KEY`; el agente lo usa para evaluar si hace falta pedir aclaraciones.
- [ ] **Optional Gemini agent**: provision the professional key from a trusted server shell with `SCOPEPROFIT_AI_KEY=<key> pnpm --filter @scopeprofit/api run mcp:keys set-ai-key --email <email>`. Host-led MCP drafting uses `analyze: false` and needs no backend AI key.
- [ ] **Profesionales**: crear la cuenta profesional y su API key desde una consola confiable del servidor con `mcp:keys create --email <email>`. No hay lista de emails en el entorno ni alta profesional pública. Los profesionales existentes con `telegram_id` y sin email se vinculan con `mcp:keys create --email <email> --claim-legacy-telegram-id <id>`, que conserva sus proyectos; las tablas `telegram_*` y la columna `telegram_id` se conservan.
- [ ] **Plausible (optional landing analytics)**: create the site in Plausible (cloud or self-hosted) and set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (e.g. `scopeprofit.app`) and `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC` (e.g. `https://plausible.io/js/script.js`) at landing build time (Docker build args or Vercel env). Leave both empty to keep analytics off; setting only one fails the build.

## 2. Infraestructura

- [ ] Dominio HTTPS real para `WEB_URL` (usado en magic links, links de edición firmados).
- [ ] Base de datos PostgreSQL gestionada (o el `docker-compose.yml` provisto) con backups habilitados.
- [ ] Volumen/bucket de almacenamiento persistente para archivos subidos (`apps/api/src/modules/storage`).

## 3. Secretos

- [ ] Rotar `ENCRYPTION_KEY`, y `SESSION_SECRET` — generar valores nuevos para producción (no reutilizar los usados en pruebas locales). Se pueden generar con `node scripts/preflight.mjs --generate-secrets`.
- [ ] Cargar todas las variables de `.env.example` en el gestor de secretos del entorno de despliegue.

## 4. Validación previa al primer despliegue

- [ ] Ejecutar `pnpm run production:preflight` en el entorno real con las variables reales cargadas.
- [ ] Confirmar CI en verde en el último PR de la implementación (`backend-ci.yml`, `frontend-ci.yml` — landing only).

## 5. Go-live

- [ ] Confirmar que la implementación vigente está mergeada en `main`.
- [ ] Desplegar con `docker-compose.yml` (o el orquestador elegido) en el entorno de producción.
- [ ] Dar de alta al primer usuario y ejecutar un flujo completo real (MCP → brief → documento) como smoke test manual final.

Local PostgreSQL tests do not prove live provider credentials, email delivery, public HTTPS or a real ChatGPT connection. Verify each enabled external service before declaring production.

## 6. MCP server (MCP-first release)

- [ ] Expose the API directly on its own HTTPS origin (for example `https://api.<domain>`) and set `PUBLIC_API_URL` to it. OAuth discovery (`/.well-known/*`), `/authorize`, `/token`, `/register`, `/revoke` and `/oauth/consent` live at the origin root, so the API needs its own origin.
- [ ] Set `TRUST_PROXY_HOPS=1` (or the real number of proxies) when running behind a load balancer.
- [ ] Run `pnpm run db:migrate` so the `api_keys`, `oauth_clients` and `oauth_tokens` tables exist.
- [ ] Issue the first key: `pnpm --filter @scopeprofit/api run mcp:keys create --email <email> --label chatgpt` (run only from a trusted server shell). Store it in a password manager; it is shown once.
- [ ] Optional server-side agent: `SCOPEPROFIT_AI_KEY=<gemini-key> pnpm --filter @scopeprofit/api run mcp:keys set-ai-key --email <email>` plus `AI_GATEWAY_API_KEY`.
- [ ] Connect ChatGPT (custom MCP plugin, OAuth; account/workspace permission required) and Claude following `docs/mcp.md`, then run one full flow: `create_project` → `add_client_input` → `update_scope_section` → `approve_scope` → `export_document`.
