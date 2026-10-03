# v3 — Cierre + Mantenimiento

Alcance de la versión v3: cerrar el negocio desde que llega el cliente hasta el mantenimiento post-entrega. Documento vivo; los issues y PRs lo referencian.

## Problema

Hoy el producto cubre del lead desordenado al documento de alcance aprobado (Brief + doc 7.1 + PDF/DOCX + change requests). Falta la parte que convierte ese alcance en plata:

- No hay **precio**: no existe tarifa, moneda ni cotización. El rango de horas del Brief no se transforma en un importe que el cliente pueda aceptar.
- No hay **propuesta comercial**: no se emiten hitos, validez, T&C ni una oferta con estado (enviada/aceptada/rechazada).
- No hay **mantenimiento**: entregado el proyecto, no queda registro de retainer, horas mensuales consumidas ni qué change request consumió el retainer.

## Alcance v3

### E1 — Pricing y cotización

- **Rate card** por profesional: tarifa por hora, moneda, margen/overhead, vigencia (`RateCard`).
- **Quote** por proyecto: líneas derivadas de `Brief.data.estimates` (módulo, min/max horas, tarifa aplicada, precio calculado en rango), total, moneda, validez, T&C (`Quote`, `QuoteLine`).
- **Cálculo**: `precio = horas × tarifa` ajustado por el margen de la rate card; se persiste el resultado (no se recalcula retroactivamente).
- **Hitos** de pago (`QuoteMilestone`): nombre, porcentaje o monto, orden.
- **Estados** (enum Prisma): `draft → sent → accepted | rejected`.
- **Propuesta**: export PDF y DOCX reutilizando el render existente (`documents/render.ts`).
- **Aprobación del cliente** por link del proyecto (patrón `ProjectLink`), igual que el doc 7.1.
- Toda transición queda en `AuditEvent`.

### E2 — Mantenimiento

- **MaintenanceAgreement** (retainer por proyecto): horas por mes, precio por mes, inicio, fin, estado (enum Prisma: `active | paused | ended`).
- **MaintenanceEntry**: consumo de horas (fecha, descripción, horas, vínculo opcional con `ChangeRequest`), registrado en transacción.
- **Saldo**: horas del período menos horas consumidas; el excedente se registra como horas extra facturables (no se factura automáticamente: solo registro interno).
- Un `ChangeRequest` aceptado puede consumir del retainer cuando hay saldo; si no, queda como horas extra.

### E3 — Frontend (sin unit tests; cobertura vía E2E)

- Dashboard: bloques de Cotizaciones y Mantenimiento (estados y totales).
- `/p/[projectId]`: panel de Cotización (crear desde Brief, editar líneas/hitos, estados) y panel de Mantenimiento (saldo del período, alta de consumos, historial).
- Estilo: CSS plano con las variables de `apps/app/app/globals.css`, iconos `lucide-react`, data fetching con `apps/app/lib/api.ts`, tipos desde `@scopeprofit/contracts`.

### E4 — E2E (framework `e2e` de tester.army)

- Suite que cubre: login → proyecto → cotización → aprobación; y retainer → consumo → saldo.
- Instalación del skill: `npx skills add tester-army/e2e` (skills en `.agents/skills/`).
- Modelo del agente: endpoint compatible con OpenAI de OpenCode Zen (`https://opencode.ai/zen/v1`) con key por variable de entorno `OPENCODE_ZEN_API_KEY`; nunca commiteada.

## Fuera de alcance (v3)

- Pagos reales (Stripe, facturación electrónica, suscripciones). Solo registro interno de montos.
- CRM, tableros/tareas, timeline y finanzas tipo workspace todo-en-uno.
- Firma digital de contratos.

## Modelo de datos nuevo

| Modelo | Relación | Notas |
|---|---|---|
| `RateCard` | `ownerId → User` | tarifa, moneda, margen, vigencia, `isDefault` |
| `Quote` | `projectId @unique` | estado, moneda, totales, validez, T&C, snapshot de rate card |
| `QuoteLine` | `quoteId` | módulo, min/max horas, tarifa, precio min/max |
| `QuoteMilestone` | `quoteId` | nombre, porcentaje/monto, orden |
| `MaintenanceAgreement` | `projectId` | horas/mes, precio/mes, inicio/fin, estado |
| `MaintenanceEntry` | `agreementId`, `changeRequestId?` | fecha, horas, descripción |

Enums nuevos (Prisma): `QuoteStatus`, `MaintenanceStatus`. Los documentos de propuesta reutilizan `Document`/`DocumentVersion` con un `kind` distinguishable si hace falta.

## Contratos API (nuevos)

- `GET/PUT /me/rate-card` — tarifa del profesional.
- `GET/POST /projects/:id/quote`, `PATCH /projects/:id/quote` (líneas/hitos/estado), `POST /projects/:id/quote/generate` (derivar desde Brief), `POST /projects/:id/quote/send`, `POST /projects/:id/quote/decision` (aceptar/rechazar vía link).
- `GET/POST /projects/:id/documents/quote/:version/:format` — descarga propuesta PDF/DOCX.
- `GET/POST /projects/:id/maintenance`, `PATCH /projects/:id/maintenance`, `GET/POST /projects/:id/maintenance/entries`, `GET /projects/:id/maintenance/balance`.

Todos responden con `ok(...)` / `fail(CODE)`, validación con `class-validator` (DTOs) o Zod (payloads complejos), y autorización con `AuthService` (profesional vs cliente vía link).

## Stacks (orden de merge)

| Stack | Rama | Contenido |
|---|---|---|
| S0 | `chore/v3-setup` | baseline (format fix), skill e2e, este doc |
| S1 | `feat/v3-pricing-schema` | schema Prisma + migración + contratos |
| S2 | `feat/v3-quote-api` | rate card + quote API + tests |
| S3 | `feat/v3-quote-docs` | propuesta PDF/DOCX + aprobación + tests |
| S4 | `feat/v3-maintenance-api` | retainer + consumos + saldo + tests |
| S5 | `feat/v3-quote-ui` | UI cotización |
| S6 | `feat/v3-maintenance-ui` | UI mantenimiento |
| S7 | `feat/v3-e2e-suite` | suite E2E + config |

## Referencias de trabajo previo (no mergeado)

- `feat/v2-time-tracking` → `time-entries.service.ts` + migración `time_entries`: patrón de registro de horas.
- `feat/v2-profitability` → `profitability.service.ts`: cálculo de margen desde `brief.estimates`.
- `feature/v3-change-request-workflow` (PR #34) → flujo web de change requests en `brief-panel.tsx`: posible conflicto de UI, revisar antes de merge de S5.

## Criterios globales de aceptación

- `pnpm run format:check`, lint, typecheck, tests de backend (`node:test`) y build en verde en CI.
- Sin `any` en aplicación ni tests; enums Prisma para estados cerrados (AGENTS.md).
- Frontend sin unit tests nuevos; flujos cubiertos por la suite E2E de S7.
- Ninguna clave en el repositorio.
