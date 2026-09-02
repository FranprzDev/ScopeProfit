# Scope-to-Profit

**Copiloto comercial para freelancers y agencias.** Transforma ideas desordenadas que trae un cliente en un doc formal diagnosticado — sin que tengas que estar en la primera ronda de preguntas boludas.

> **Fuente de verdad:** `docs/scope-to-profit.md` (v0.8) — visión, MVP, plantilla manual 7.1 y arquitectura.

## Qué resuelve

Un cliente llega con audios, imágenes, videos, textos sueltos y frases tipo "quiero algo simple pero que...". Scope-to-Profit formaliza ese caos en:
- requerimientos (RF/RNF) con cita textual
- preguntas pendientes que bloquean el alcance
- riesgos con semáforo
- alcance (incluidos / excluidos / supuestos / criterios)
- estimación en rango (horas, sin precio en v1)
- próximos pasos

Objetivo: **filtrar y aclarar ideas** para que el presupuesto/cliente final sea acorde y no se regale trabajo. Después escala a diagramas de flujo, secuencia, actividades y BPMN desde el Brief.

## Arquitectura v1 — 3 apps que conviven

```
Cliente (Next.js chat)  →  Backend API (agente IA)  ←  Vos (Telegram)
                              ↓
                           DB + S3 (Brief versionado + docs)
```

- **Telegram Bot** — tu interfaz. Creás proyectos, ves TLDR, gestionás docs. Recibe texto/imagen/audio/video/docs. **No toca DB directo**, habla solo con `POST /api/telegram/webhook`.
- **Next.js Frontend** — chat para el cliente por link `https://tu-app.com/p/<uuid>`. Sin fricción, también multimedia. Habla solo con `POST /api/chat`.
- **Backend API** — **donde vive el agente IA**. Único con acceso a DB y S3. Guarda todo, mantiene el Brief enriquecido versionado por proyecto, genera el doc con plantilla 7.1 y alimenta a ambas UIs.

El **Brief en S3** es la fuente de verdad enriquecida (texto plano + imágenes + RF/RNF + dominio) — base para futuros diagramas UML.

## Flujo v1

1. Vos: `/createproject <nombre>` en Telegram → Backend crea proyecto y devuelve link Next.js para el cliente
2. Cliente: chatea desordenado en Next.js (o vos pegás un WhatsApp en Telegram)
3. Agente en Backend: filtra preguntas boludas, elicia RF/RNF + contexto, mejora el TLDR en vivo
4. Backend: formaliza → genera doc con **plantilla manual 7.1** (única, fija en v1) → exporta PDF + guarda Brief en S3
5. Vos: validás/edrás y le decís al cliente (modo supervisado, el agente no responde solo)

## Comandos Telegram v1

- `/createproject <nombre>` — crea proyecto y devuelve `🔗 Abrir chat cliente` + `📋 Copiar link`
- `/projects` — lista con **un botón por proyecto** (1 fila = 1 proyecto, con estado 🟡/🟢 y TLDR)
- `/tldr <id>` — TLDR actualizado del proyecto
- `/doc <id>` — doc 7.1 actual + PDF
- `/ask <id> <pregunta>` — inyecta pregunta al chat del cliente
- `/archive <id>` — archiva
- `/help` — ayuda

Todo mensaje/archivo (imagen, audio, video, doc) se guarda en DB + S3 vía Backend.

## Plantilla Manual 7.1 (v1)

Una sola plantilla fija. El agente la rellena, vos editás texto. Después cada usuario podrá hacer su propio docs.

1. Portada · 2. Requerimientos con cita · 3. Preguntas bloqueantes · 4. Riesgos + semáforo · 5. Alcance (incluidos/excluidos/supuestos/criterios) · 6. Estimación rango horas · 7. Próximos pasos

Ver detalle completo en `docs/scope-to-profit.md:155`.

## Stack previsto

- **Bot:** `grammy` / `telegraf` (Node/TS), webhook `setWebhook` con `secret_token`
- **Web:** Next.js (App Router), ruta `/p/[id]`
- **API:** Node/TS (o el mismo Next.js API Routes), endpoints `/api/telegram/webhook`, `/api/chat`, `/api/projects`
- **DB:** Postgres (Supabase/Neon) — tabla `projects`, `messages`, `docs`
- **Storage:** S3 (Brief y archivos por proyecto)
- **IA:** agente en Backend (LLM) con base de conocimiento de alcance oculto y trazabilidad con cita

## Estado

- `v0.8` — docs completos, sin código aún. Repo: `github.com/FranprzDev/ScopeProfit`
- Próximo paso: validar plantilla 7.1 con 5 conversaciones reales (a mano) antes de codear. Luego esqueleto `bot/` + `web/` + `api/`.

## Docs

- `docs/scope-to-profit.md` — documento completo (15 secciones, plan 30 días, diferenciadores)
