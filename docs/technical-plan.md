# Plan técnico v1

Estado: propuesta para revisión antes de implementar.

## 1. Objetivo

Construir el vertical slice que permite crear un proyecto desde Telegram, abrir un chat cliente en Next.js, transformar mensajes en un Brief versionado y aprobar desde Telegram la entrega automática de PDF y DOCX.

## 2. Arquitectura

```text
Telegram Bot ─┐
Next.js Web  ─┼─> NestJS API ─> PostgreSQL
              │              └─> filesystem persistente
              └─> nunca acceden directamente a DB ni archivos
```

- `web`: Next.js App Router.
- `api`: NestJS, agente LangGraph + LangChain JS y acceso exclusivo a DB/filesystem.
- `bot`: módulo Telegram dentro de `api` en v1; no se separa otro servicio sin necesidad real.
- `db`: PostgreSQL.
- `storage`: volumen persistente configurado por `STORAGE_ROOT`.
- Desarrollo y despliegue: Docker; `docker-compose.yml` para desarrollo y servicios separados para producción.

## 3. Estructura del repositorio

```text
apps/
  api/
    src/modules/{auth,projects,chat,brief,documents,telegram,agent,storage}/
  web/
    app/p/[projectId]/
packages/
  contracts/                 # solo si web y api comparten tipos reales
docs/
```

El proyecto usa un monorepo. Frontend y Backend mantienen pipelines independientes; `packages/contracts` se usa para contratos compartidos reales. No se crean otros paquetes hasta que exista una duplicación concreta.

## 4. Módulos del Backend

| Módulo | Responsabilidad |
|---|---|
| `AuthModule` | Magic link del cliente y sesiones profesionales/clientes |
| `ProjectsModule` | Crear, consultar y archivar proyectos |
| `ChatModule` | Mensajes, adjuntos y actualización del chat |
| `BriefModule` | Brief estructurado, preguntas, riesgos, alcance y versiones |
| `AgentModule` | LangGraph, prompts, herramientas y gateway de modelos |
| `DocumentsModule` | Markdown, PDF, DOCX y versiones aprobadas |
| `TelegramModule` | Webhook, comandos, callbacks y autorizados |
| `StorageModule` | Archivos recibidos y artefactos en filesystem |

`AuthModule` usa Brevo para emails transaccionales de magic link. El remitente y dominio deben verificarse.

## 5. Modelo de datos inicial

Nombres en plural y `snake_case`:

- `users`: identidad y rol (`client`, `professional`).
- `sessions`: sesiones autenticadas y expiración.
- `projects`: proyecto, cliente, estado y link activo.
- `project_links`: tokens de acceso del cliente, revocación y vencimiento.
- `messages`: mensajes de chat/Telegram, autor, contenido y `thread_id`.
- `files`: metadata de adjuntos y ruta relativa en storage.
- `briefs`: snapshot estructurado vigente por proyecto.
- `brief_versions`: historial de cambios del Brief y origen (`agent`, `client`, `professional`).
- `documents`: documento lógico y estado actual.
- `document_versions`: Markdown, PDF/DOCX asociados y versión aprobable.
- `audit_events`: acciones sensibles, actor y resultado.

El Brief estructurado es autoritativo en PostgreSQL. El Markdown es un artefacto materializado; nunca se edita como fuente independiente.

## 6. Estados y reglas

Estados de proyecto: `draft` → `in_review` → `changes_requested` → `approved` → `delivered` → `archived`.

- El agente puede actualizar el borrador, pero no aprobar ni entregar.
- Aprobar valida actor, estado y versión exacta.
- Aprobar es idempotente y genera PDF/DOCX automáticamente.
- Rechazar conserva la versión anterior y vuelve a `changes_requested`.
- Las acciones de Telegram validan autorización y responden siempre `answerCallbackQuery`.

## 7. API v1

- `POST /api/auth/magic-link/request`
- `GET /api/auth/magic-link/verify`
- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/messages`
- `POST /api/projects/:id/files`
- `GET /api/projects/:id/brief`
- `PATCH /api/projects/:id/brief`
- `POST /api/projects/:id/documents/generate`
- `POST /api/projects/:id/approve`
- `GET /api/projects/:id/state`
- `POST /api/telegram/webhook`

Todos los endpoints verifican sesión, proyecto y permisos. Los contratos definitivos de request/response se fijan antes de escribir controladores.

### 7.1 Formato de errores

El Backend usa un `ApiErrorHandler` global. Todas las respuestas de error mantienen este formato:

```json
{
  "success": false,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found",
    "details": null,
    "requestId": "..."
  }
}
```

`code` y los nombres de campos son estables y están en inglés. `message` no expone secretos ni detalles internos. El handler convierte errores de validación, autenticación, autorización, dominio e infraestructura en respuestas HTTP consistentes.

## 8. IA

La primera integración usa Gemini 3.8 Flash con la API key propia de cada usuario. La key se ingresa mediante un flujo seguro del Backend, se cifra en reposo y nunca se expone al Frontend ni al logging. El acceso al proveedor se encapsula en un gateway.

Variables técnicas iniciales:

- `AI_PROVIDER=google`
- `AI_MODEL=gemini-3.8-flash`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `ENCRYPTION_KEY`

El agente devuelve datos estructurados para Brief, preguntas, riesgos, alcance y estimación. La validación de campos, estados, versiones y sumas queda en código determinístico.

No se incorpora RAG, pgvector ni vector database en v1.

El logging inicial es estructurado y sirve para mejorar el agente: `requestId`, `projectId`, `threadId`, etapa, duración, proveedor/modelo, resultado, error code y conteos. No registra tokens, secretos, URLs firmadas, teléfonos completos ni contenido sensible sin sanitizar.

## 9. Generación de documentos

- `docx` genera el documento Word editable.
- `pdfkit` genera el PDF.
- Ambos renderers reciben el mismo `DocumentData` derivado del Brief estructurado.
- No se usa Chromium, Puppeteer ni conversión PDF → DOCX.
- La plantilla 7.1 es fija en v1; no hay editor de plantillas.

## 10. Chat, edición y polling

- El cliente puede enviar texto e imágenes desde el chat.
- El editor integrado usa Tiptap para editar las secciones habilitadas del documento junto con el chat.
- Tiptap persiste su contenido como JSON estructurado; el Backend valida el JSON y genera `DocumentData` sin aceptar HTML arbitrario como fuente de verdad.
- Cada edición o mensaje crea una nueva versión cuando modifica el Brief o el documento; no se sobrescriben versiones históricas.
- El Frontend consulta `GET /api/projects/:id/state` cada 10 segundos mientras el proyecto tenga una operación pendiente del agente.
- La respuesta incluye `briefVersion`, `documentVersion`, `agentStatus`, `pendingQuestions` y `updatedAt`.
- El polling se detiene cuando no hay operación pendiente, cuando el usuario abandona la pantalla o después de 30 minutos; se reanuda al enviar un mensaje o guardar una edición.
- Un error temporal permite reintentar en el siguiente ciclo; después de cinco errores consecutivos se muestra un error recuperable y se detiene el polling.
- No se agregan WebSockets, SSE, Redis ni colas en v1.

## 11. Docker y persistencia

- `web` y `api` tienen Dockerfiles multi-stage.
- PostgreSQL usa volumen persistente.
- `STORAGE_ROOT` apunta a un volumen persistente para multimedia, Markdown, PDF y DOCX.
- Secretos solo por variables de entorno.
- El smoke test real debe crear un proyecto, procesar un mensaje y comprobar DB, archivo y documento generado; `/health` solo comprueba disponibilidad.
- PostgreSQL corre como contenedor propio con volumen persistente.
- No se agregan todavía Redis, colas, observabilidad externa ni object storage.
- Solo se aceptan archivos de imagen y texto. No se aceptan audio, video, PDF, DOCX ni otros formatos como entrada v1.
- Las imágenes se almacenan en filesystem persistente; el texto se guarda en PostgreSQL.
- Se validan MIME type real, extensión, tamaño máximo y contenido antes de persistir.
- El límite inicial es 10 MB por imagen y 1 MB por mensaje de texto.
- Todas las variables de entorno, estados, códigos, servicios y nombres técnicos se escriben en inglés.

## 12. CI/CD y calidad

Frontend y Backend tienen pipelines separados:

- `frontend-ci.yml` corre cuando cambian `apps/web`, su configuración o contratos compartidos.
- `backend-ci.yml` corre cuando cambian `apps/api`, su configuración, migraciones, Docker o contratos compartidos.
- Ambos workflows viven en el mismo monorepo y publican artefactos de su aplicación respectiva.
- Un cambio exclusivo en Frontend no ejecuta el CI/CD del Backend.
- Cada pipeline ejecuta lint, typecheck, build y sus tests.
- Backend: unit tests, integration tests y E2E tests completos.
- El smoke test reproducible levanta Docker, aplica migraciones y verifica un flujo real, incluyendo PostgreSQL y filesystem.
- El smoke test no usa `/health` como prueba funcional.

## 13. Frontend

Visual minimalista: una pantalla de chat y un panel de Brief/documento, responsive, tipografía y colores neutros, estados visibles y pocas acciones. No se crea un design system ni componentes abstractos hasta tener una segunda pantalla que lo justifique.

## 14. Orden de implementación

1. Monorepo, Docker, configuración y migraciones.
2. Proyecto, magic link, sesiones y link cliente.
3. Chat cliente y recepción de mensajes/archivos.
4. Brief versionado y agente con proveedor inicial.
5. Documento Markdown/PDF/DOCX.
6. Telegram: proyectos, detalle, aprobación, rechazo y links.
7. UI del Brief/documento y validación del vertical slice.

## 15. Criterio de terminado

Un caso real puede recorrer: crear proyecto → cliente inicia sesión → envía información → agente actualiza Brief → se genera documento → profesional revisa y aprueba en Telegram → cliente recibe PDF y DOCX; todo sobre datos y archivos persistentes.

## 16. Fuera de v1

Pagos, pricing/margen, Jira/Trello/Slack, audio/video/PDF/DOCX como entrada, múltiples plantillas, diagramas, RAG, vector DB, múltiples proveedores simultáneos, WebSockets/SSE y automatización comercial avanzada.

## 17. Decisiones cerradas de implementación

### 17.1 Prisma

- Prisma ORM y Prisma Migrate son obligatorios.
- `schema.prisma` vive en `apps/api/prisma/schema.prisma`.
- Las migraciones se ejecutan en CI y al iniciar el entorno de desarrollo; producción aplica migraciones explícitas antes del despliegue.
- IDs usan UUID; timestamps se almacenan en UTC.
- Estados se modelan como enums Prisma.
- Índices mínimos: email, project owner/client, project state, message project/createdAt, versions project/version.

### 17.2 API

- API REST JSON bajo `/api`.
- IDs y fechas usan strings; fechas son ISO 8601 UTC.
- Listados usan `limit` y `cursor`; máximo `limit=100`.
- Éxito: `{ "success": true, "data": ... }`.
- Error: `{ "success": false, "error": { "code", "message", "details", "requestId" } }`.
- Autenticación: cookie de sesión HttpOnly/Secure/SameSite=Lax para Web; webhook secret de Telegram para Telegram.
- Validación de payloads con DTOs y `class-validator` en los límites del Backend.
- `ApiErrorHandler` global asigna códigos estables y evita filtrar detalles internos.

### 17.3 Gemini por usuario

- El usuario configura su key desde una pantalla protegida del Frontend.
- El Backend cifra la key con AES-256-GCM usando `ENCRYPTION_KEY` antes de guardarla.
- La key nunca se devuelve en respuestas, logs, trazas ni eventos.
- Se guarda solo un indicador no sensible: `hasAiApiKey`.
- El agente usa la key del propietario del proyecto; si no existe, el proyecto queda en `agent_configuration_required`.
- No se guarda una key global del sistema en v1.

### 17.4 Brevo

- `AuthModule` usa la API REST de Brevo para emails transaccionales.
- Variables requeridas: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`.
- El magic link dura 15 minutos, es de un solo uso y se invalida después de verificarse.
- La sesión del cliente dura 30 días y puede revocarse.
- El template contiene solo el enlace firmado; nunca incluye información del Brief.

### 17.5 Archivos y Tiptap

- Entrada permitida: texto plano e imágenes `image/jpeg`, `image/png`, `image/webp`.
- Límite: 10 MB por imagen y 1 MB por mensaje de texto.
- El Backend verifica MIME real, extensión, tamaño y decodificación de imagen.
- Tiptap usa el schema mínimo de párrafos, headings, listas, tablas y marcas básicas.
- El contenido Tiptap se guarda como JSON validado en la versión del documento; HTML solo se genera al renderizar.

### 17.6 Polling

- Endpoint: `GET /api/projects/:id/state`.
- Intervalo: 10 segundos.
- Se activa al enviar mensaje, cargar proyecto o guardar edición.
- Se detiene al recibir `agentStatus=idle` o `failed`, al abandonar la pantalla o tras 30 minutos.
- Después de cinco errores consecutivos muestra `POLLING_UNAVAILABLE` y se detiene.
- El servidor no mantiene conexiones abiertas.

### 17.7 Documentos

- `DocumentData` es el único modelo de renderizado.
- `docx` produce el DOCX editable.
- `pdfkit` produce el PDF.
- El Markdown se materializa como snapshot legible.
- Cada salida se guarda con `projectId`, `documentVersion`, `format` y checksum SHA-256.

### 17.8 Docker y CI/CD

- El monorepo contiene `apps/web`, `apps/api`, `packages/contracts` y `docker-compose.yml`.
- Compose levanta `web`, `api` y `postgres`.
- PostgreSQL y `STORAGE_ROOT` tienen volúmenes persistentes.
- `.github/workflows/frontend-ci.yml` filtra `apps/web/**`, `packages/contracts/**`, archivos raíz de configuración y su Dockerfile.
- `.github/workflows/backend-ci.yml` filtra `apps/api/**`, `packages/contracts/**`, Prisma, Docker y configuración del Backend.
- Ambos pipelines ejecutan lint, typecheck, build y tests de su aplicación.
- El Backend ejecuta unit, integration, E2E y smoke tests; el smoke usa Docker Compose y una base de datos descartable.

### 17.9 Criterio de implementación

No se comienza con todos los módulos a la vez. El primer vertical slice debe cubrir Auth, Projects, Chat, Brief, Agent, Documents y el estado de polling; Telegram se integra inmediatamente después para cerrar aprobación y entrega.
