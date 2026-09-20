# Scope-to-Profit

**Copiloto de alcance para freelancers y agencias.** Transforma las ideas desordenadas de un cliente en un documento formal y diagnosticado.

> **Fuente de verdad:** `docs/scope-to-profit.md` — alcance vigente de las versiones v1 y v2.

## Qué resuelve

Un cliente llega con imágenes, textos sueltos y frases tipo "quiero algo simple pero que...". Scope-to-Profit formaliza ese caos en:

- requerimientos (RF/RNF) con cita textual
- preguntas pendientes que bloquean el alcance
- riesgos con semáforo
- alcance (incluidos / excluidos / supuestos / criterios)
- estimación en rango (horas, sin precio en v1)
- próximos pasos

Objetivo: **filtrar y aclarar ideas** para que el cliente y el equipo entiendan el alcance antes de construir.

## Arquitectura v1 — 3 apps que conviven

```
Cliente (Next.js chat)  →  Backend API (agente IA)  ←  Vos (Telegram)
                              ↓
                           DB + filesystem persistente (Brief versionado + docs)
```

- **Telegram Bot** — tu interfaz. Creás proyectos, ves TLDR, gestionás docs mediante botones inline. `callback_query` controla ver, editar, aprobar, rechazar, archivar y gestionar links; la edición abre una URL HTTPS firmada solo para el profesional. **No toca DB directo**, habla solo con `POST /api/telegram/webhook`.
- **Next.js Frontend** — chat colaborativo para el cliente por link `https://tu-app.com/p/<uuid>`. Muestra la conversación y el borrador 7.1 actualizado en vivo. El cliente puede editar partes habilitadas o proponer cambios por chat; el agente reprocesa el documento completo y detecta preguntas pendientes. Requiere cuenta iniciada para identificar al cliente. El link no vence por defecto y se revoca o vence desde Telegram. Habla solo con `POST /api/chat`.
- **Backend API** — **donde vive el agente IA**. Único con acceso a DB y filesystem persistente. Guarda todo, mantiene el Brief enriquecido versionado por proyecto, genera el doc con plantilla 7.1 y alimenta a ambas UIs.

El **Brief en PostgreSQL** es la fuente de verdad enriquecida (RF/RNF + dominio + versiones). El filesystem persistente guarda los archivos recibidos y los artefactos PDF/DOCX.

## Flujo v1

1. Vos: `/createproject <nombre>` en Telegram → Backend crea proyecto y devuelve link Next.js para el cliente
2. Cliente: comparte su idea por texto e imágenes en el chat Next.js; el profesional puede enviar preguntas desde Telegram con `/ask`.
3. Agente en Backend: filtra preguntas boludas, elicia RF/RNF + contexto, mejora el TLDR en vivo
4. Backend: formaliza → genera doc con **plantilla manual 7.1** (única, fija en v1) → exporta PDF/DOCX + guarda Brief en PostgreSQL
5. Cliente y agente: revisan y mejoran el borrador en vivo; el cliente puede editar partes habilitadas o pedir cambios por chat
6. Vos: validás desde Telegram y aprobás el alcance final; el sistema envía automáticamente al cliente el PDF y el DOCX editable

## Comandos Telegram v1

- `/createproject <nombre>` — crea proyecto y devuelve `🔗 Abrir chat cliente` + `📋 Copiar link`
- `/projects` — lista con **un botón por proyecto** (1 fila = 1 proyecto, con estado 🟡/🟢 y TLDR)
- `/tldr <id>` — TLDR actualizado del proyecto
- `/doc <id>` — doc 7.1 actual + PDF
- `/ask <id> <pregunta>` — inyecta pregunta al chat del cliente
- `/archive <id>` — archiva
- `/help` — comandos, botones y flujo de revisión/aprobación

Todo mensaje e imagen se guarda en DB + filesystem persistente vía Backend.

## Plantilla Manual 7.1 (v1)

Una sola plantilla fija. El agente la rellena, vos editás texto. Después cada usuario podrá hacer su propio docs.

1. Portada · 2. Requerimientos con cita · 3. Preguntas bloqueantes · 4. Riesgos + semáforo · 5. Alcance (incluidos/excluidos/supuestos/criterios) · 6. Estimación rango horas · 7. Próximos pasos

Ver detalle completo en `docs/scope-to-profit.md:155`.

## Stack v1

- **Bot:** `grammy` / `telegraf` (Node/TS), webhook `setWebhook` con `secret_token`
- **Web:** Next.js (App Router), ruta `/p/[id]`
- **API:** NestJS (Node/TS), endpoints `/api/telegram/webhook`, `/api/chat`, `/api/projects`
- **Agente:** LangGraph + LangChain JS dentro del Backend NestJS
- **Modelos:** gateway configurable; el agente no queda atado a un proveedor ni modelo específico
- **DB:** PostgreSQL — datos del producto, Brief versionado y checkpointer de LangGraph
- **Storage:** filesystem persistente del Backend (archivos y artefactos por proyecto)
- **Documentos:** fuente estructurada → Markdown, `pdfkit` → PDF y `docx` → DOCX editable
- **Errores API:** `ApiErrorHandler` global con códigos estables en inglés y `requestId`
- **Calidad:** unit, integration, E2E y smoke tests reproducibles sobre Docker
- **CI/CD:** pipelines separados para Frontend y Backend; el Backend usa path filters
- **Despliegue:** Docker Compose con PostgreSQL en contenedor propio y volúmenes persistentes
- **Repositorio:** monorepo con pipelines independientes para Frontend y Backend
- **Entrada:** texto e imágenes; edición integrada con Tiptap
- **Actualización:** polling cada 10 segundos mientras el agente procesa
- **Email:** Brevo para magic links, usando su plan gratuito
- **Modelo inicial:** Gemini 3.8 Flash con API key propia de cada usuario

## Estado de versiones

- **v1 — entregada:** autenticación, proyectos, chat cliente, Telegram, Brief estructurado y versionado, agente IA, documento 7.1, PDF/DOCX, aprobación y entrega.
- **v2 — entregada:** diff del Brief, registro y clasificación básica de solicitudes de cambio, y endurecimiento de tipos y estados.
- **Pendiente antes de una nueva versión:** configuración de producción, preflight, webhook real y smoke test completo.

## Docs

- `docs/scope-to-profit.md` — documento completo (15 secciones, plan 30 días, diferenciadores)
- `docs/technical-plan.md` — arquitectura, módulos, datos, API, Docker y orden de implementación v1
