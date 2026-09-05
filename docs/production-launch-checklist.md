# Checklist de lanzamiento a producción

La aplicación está funcionalmente completa e implementada según `README.md`, `docs/scope-to-profit.md` y `docs/technical-plan.md` (PR #3). Lo único que queda pendiente son credenciales y configuración específicas del entorno real, que no pueden generarse de forma autónoma. Completa esta lista con tus propios valores y el producto queda operativo en producción.

## 1. Cuentas y credenciales reales

- [ ] **Brevo**: crear cuenta, verificar dominio/remitente, generar `BREVO_API_KEY`, definir `BREVO_SENDER_EMAIL` verificado.
- [ ] **Gemini**: cada usuario final carga su propia `GEMINI_API_KEY` desde `/settings` (ya implementado con cifrado AES-256-GCM). No requiere key global del operador.
- [ ] **Telegram**: crear bot con @BotFather, obtener `TELEGRAM_BOT_TOKEN`, definir `TELEGRAM_AUTHORIZED_USER_IDS` (IDs numéricos autorizados), generar `TELEGRAM_WEBHOOK_SECRET` propio.

## 2. Infraestructura

- [ ] Dominio HTTPS real para `WEB_URL` (usado en magic links, links de edición firmados y webhook de Telegram).
- [ ] Base de datos PostgreSQL gestionada (o el `docker-compose.yml` provisto) con backups habilitados.
- [ ] Volumen/bucket de almacenamiento persistente para archivos subidos (`apps/api/src/modules/storage`).

## 3. Secretos

- [ ] Rotar `ENCRYPTION_KEY`, `SESSION_SECRET` y `TELEGRAM_WEBHOOK_SECRET` — generar valores nuevos para producción (no reutilizar los usados en pruebas locales). Se pueden generar con `node scripts/preflight.mjs --generate-secrets`.
- [ ] Cargar todas las variables de `.env.example` en el gestor de secretos del entorno de despliegue.

## 4. Validación previa al primer despliegue

- [ ] Ejecutar `npm run production:preflight` en el entorno real con las variables reales cargadas.
- [ ] Confirmar CI en verde en el PR #3 (`backend-ci.yml`, `frontend-ci.yml`).
- [ ] Configurar el webhook de Telegram apuntando a `WEB_URL` una vez desplegado.

## 5. Go-live

- [ ] Mergear PR #3 a `main`.
- [ ] Desplegar con `docker-compose.yml` (o el orquestador elegido) en el entorno de producción.
- [ ] Dar de alta al primer usuario y ejecutar un flujo completo real (Telegram → chat → brief → documento) como smoke test manual final.

Ninguno de estos pasos requiere más decisiones de producto: todo el código, contratos, esquema de base de datos y flujos ya están implementados y probados (unit, integración y e2e con Postgres real).
