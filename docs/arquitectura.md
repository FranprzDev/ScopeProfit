# Arquitectura por fases — Scope-to-Profit (sin precios)

Idea central: quitar fricción cliente <-> developer. Solo alcance y comunicación.

Decisión ADR-001: el PDF original hablaba de precios/margen. Se elimina del sistema para siempre. No hay campos de precio en DB, .md, IA ni frontend.

## Reglas globales

- Fuente única: `.md` versionado. PDF derivado, nunca se edita.
- Draft = estado privado. Presupuesto / Anexo = documento congelado al enviar.
- Jerarquía: `Proyecto 1:N Presupuestos 1:N Anexos`.
- IA cortafiltros transversal (no es fase, corre en backend): diseña sistemas, detecta alcance oculto, pregunta hasta definir.
- Memoria doble separada: `global/` (estilo dev) + `clients/X.md` (contexto cliente). Query de X solo carga X.

## Ciclo de vida (vale para Presupuesto y Anexo)

`draft_abierto -> en_analisis_IA -> sugerido -> aprobado | editado | rechazado -> congelado/enviado`

- `draft_abierto`: itera dev en Telegram o pedido cliente en frontend.
- `en_analisis_IA`: IA clasifica igual/parecido/nuevo + detecta alcance oculto.
- `sugerido`: llega a Telegram con .md + PDF + diff.
- `aprobado/editado/rechazado`: feedback que re-entrena (aceptado tal cual / con edits / descartado + motivo).
- `congelado`: .md inmutable + PDF final. Todo cambio posterior = nueva versión o nuevo anexo.

Regla v2 vs anexo: mismo alcance (aclaración/negociación pre-firma) = `Presupuesto v2`. Nuevo alcance post-envío = `Anexo nuevo`.

## Fases

- Fase 1: Backend + PGDB (verdad, versionado, dedup, render).
- Fase 2: Telegram (dev).
- Fase 3: Frontend (cliente).
