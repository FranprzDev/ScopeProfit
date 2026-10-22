# MCP de Presu para ChatGPT

Este documento describe el servidor MCP expuesto por la API de ScopeProfit para Presu.

## Endpoint

- Local: `http://localhost:3001/mcp`
- Desarrollo público con ngrok: `https://<subdominio>.ngrok.app/mcp`
- Producción: `https://<api-host>/mcp`

El endpoint no lleva el prefijo `/api`.

## Autenticación

El servidor MCP acepta un Bearer token de sesión de ScopeProfit:

```http
Authorization: Bearer <sessionToken>
```

El token se obtiene del flujo normal de autenticación de ScopeProfit. Para desarrollo local se puede insertar una sesión en PostgreSQL o usar el token devuelto por la verificación de magic link.

## Herramientas disponibles

- `presu_list_projects`
- `presu_create_project`
- `presu_get_project`
- `presu_send_message`
- `presu_list_messages`
- `presu_get_brief`
- `presu_update_brief`
- `presu_get_state`
- `presu_generate_document`
- `presu_generate_quote`
- `presu_get_quote`
- `presu_download_quote`
- `presu_access_status`

## Desarrollo local

1. Copiar `.env.example` a `.env` y completar variables.
2. Levantar PostgreSQL:

```bash
docker compose up -d postgres
```

3. Aplicar migraciones:

```bash
pnpm --filter @scopeprofit/api run db:migrate
```

4. Compilar y ejecutar la API:

```bash
pnpm --filter @scopeprofit/api run build
pnpm --filter @scopeprofit/api run start
```

5. Exponer el puerto con ngrok:

```bash
ngrok http 3001
```

6. Configurar en el plugin de ChatGPT la URL HTTPS de ngrok con ruta `/mcp`, por ejemplo:

```text
https://<subdominio>.ngrok.app/mcp
```

7. Probar primero con MCP Inspector en `localhost` y luego conectar el MCP custom de ChatGPT en modo desarrollo.

## Notas de seguridad

- No registrar contenido sensible de proyectos o documentos en logs del túnel.
- El token Bearer no debe compartirse en prompts, logs ni repositorios.
- El MCP no inicia pagos ni checkouts; los contadores y pagos BNB Chain se implementan en tareas posteriores.
- Un dominio temporal de ngrok sirve para desarrollo, no para publicación estable.
