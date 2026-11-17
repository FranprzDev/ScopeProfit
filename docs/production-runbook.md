# Runbook de producción

Estado real de la instancia pública del autor y los procedimientos de operación. Para
desplegar una instalación nueva desde cero, seguí
[production-launch-checklist.md](production-launch-checklist.md) y
[self-host-chatgpt.md](self-host-chatgpt.md).

## Topología vigente

| Componente       | Dónde corre          | Detalle                                                                            |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------- |
| Landing + /docs  | Vercel               | https://scopeprofit.vercel.app                                                     |
| MCP/API          | Cloudflare Worker    | https://scopeprofit-mcp.franutn23.workers.dev (`apps/mcp-worker`, `wrangler.toml`) |
| Base de datos    | Neon Postgres (free) | driver serverless de Neon (`@prisma/adapter-neon`)                                 |
| Archivos subidos | Cloudflare KV        | binding `STORAGE_KV` en `wrangler.toml`                                            |
| Secrets          | Cloudflare secrets   | `DATABASE_URL` y `ENCRYPTION_KEY` con `wrangler secret put`                        |

Todo corre en free tiers: Workers free + Neon free. La alternativa autoalojada es
`docker-compose.yml` (PostgreSQL con volumen `postgres_data` y archivos con volumen
`storage_data`) más el overlay Caddy de `docker-compose.mcp.yml` para HTTPS propio.

## Dominio HTTPS

Ya está definido: el MCP responde HTTPS en `scopeprofit-mcp.franutn23.workers.dev` y la
landing en `scopeprofit.vercel.app`; `PUBLIC_API_URL` y `WEB_URL` están en
`wrangler.toml`. El discovery de OAuth (`/.well-known/*`) vive en la raíz del origen del
API, así que el API necesita su propio origen (lo tiene). En self-host, Caddy emite el
certificado para `MCP_DOMAIN` automáticamente.

## Base de datos y backups

- **Producción (autor):** Neon gestionado; los backups/snapshots los mantiene Neon.
- **Self-host:** volumen `postgres_data` ya declarado en `docker-compose.yml`. Backup
  manual o por cron con:

  ```bash
  bash scripts/backup.sh
  ```

  Genera `backups/db-<timestamp>.dump` (pg_dump formato custom) y
  `backups/storage-<timestamp>.tar.gz` (archivos subidos). Guardar copias fuera del
  host; retención sugerida de 7 backups diarios. Nunca usar `docker compose down -v` en
  una instalación con datos.

## Almacenamiento de archivos

- **Producción (autor):** Cloudflare KV (`STORAGE_KV`).
- **Self-host:** `storage_data` montado en `/data/storage` (ya configurado; la API lee
  `STORAGE_ROOT=/data/storage`). `scripts/backup.sh` lo incluye en el backup.
- Límites vigentes: imágenes de hasta 10 MB, máximo 5 por input, URLs https públicas.

## Secrets y rotación

| Secret                               | Qué protege                                                             | Cómo rotar                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`                     | Cifra las AI keys que los profesionales guardan (`mcp:keys set-ai-key`) | Generar una nueva y cargarla como secret. **Invalida las AI keys guardadas:** cada profesional debe volver a cargar la suya. Planificar la rotación con aviso. |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Acceso a la base                                                        | Cambiar el password en Postgres/Neon y actualizar el secret (`wrangler secret put DATABASE_URL` o `.env`).                                                     |
| API keys `sp_live_…`                 | Acceso de agentes y conectores OAuth                                    | No se rotan: se revocan (`mcp:keys revoke <key-id>`) y se crean nuevas (`mcp:keys create`). Revocar la key también invalida sus grants OAuth.                  |
| Tokens OAuth `sp_at_…`               | Conectores ChatGPT/Claude                                               | Expiran solos; se revocan con `/revoke` o al revocar la API key ligada.                                                                                        |
| `AI_GATEWAY_API_KEY`                 | Análisis server-side opcional                                           | Regenerar en el dashboard de Vercel AI Gateway y actualizar el secret.                                                                                         |

- Generar secrets nuevos: `node scripts/preflight.mjs --generate-secrets` (imprime
  `ENCRYPTION_KEY` y `POSTGRES_PASSWORD`).
- Dónde se guardan: Cloudflare secrets en producción; `.env` con `chmod 600` en
  self-host; gestor de contraseñas para respaldo. Nunca commitear ni pegar en chats.
- Cadencia sugerida: cada 90 días.

## Validación

- **Formato de variables:** `pnpm run production:preflight` (o `--mcp-only` para el
  flujo MCP sin IA ni email). Valida formato, no conectividad.
- **Conectividad real:** `node scripts/smoke-production.mjs --url <origen>` corre
  checks vivos: health, discovery OAuth, metadata de recurso protegido y rechazo 401
  sin auth; con `SCOPEPROFIT_API_KEY` también hace `initialize` + `tools/list` (20
  tools). Es de solo lectura. Evidencia 2026-11-17: 4/4 PASS anónimos contra
  `https://scopeprofit-mcp.franutn23.workers.dev`.
- **CI:** `backend-ci.yml` corre el smoke Docker (`scripts/smoke.sh`, migraciones +
  suite completa + persistencia) en cada PR y push a `main`.

## AI Gateway (opcional)

Solo se usa cuando un profesional pide análisis server-side (`analyze: true`, agente
LangGraph + Gemini). La instancia pública corre host-led por defecto (`analyze:
false`) y no necesita gateway. Para habilitarlo: `AI_GATEWAY_API_KEY` en el entorno y
`SCOPEPROFIT_AI_KEY=<gemini-key> pnpm --filter @scopeprofit/api run mcp:keys set-ai-key
--email <email>`. Monitorear uso y costo en el dashboard de Vercel AI Gateway.
