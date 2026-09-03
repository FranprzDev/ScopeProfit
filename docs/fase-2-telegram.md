# Fase 2 — Telegram (developer)

Superficie dev. Itera drafts, recibe sugerencias IA, decide.

## Flujo

1. Dev pega contexto / edita draft en Telegram.
2. IA analiza (solo carga `clients/X.md` + módulos del proyecto) y devuelve sugerencia: resumen + qué es (arreglo/feature/modulo) + .md + PDF + diff vs versión previa.
3. Dev: `/aprobar` (congela y envía) / edita (sigue draft) / `/rechazar motivo` (feedback).
4. `/request-quote` = atajo que congela el draft actual a `Presupuesto vN` o `Anexo vN` y genera PDF final.

## Harness IA (preguntas necesarias)

- Gatillos alcance oculto: "sencillo, solo, rápido, panel, integrar, migrar, reporte". Ante gatillo, IA no sugiere, pregunta: actores, permisos, datos, integraciones, criterios de aceptación.
- Informa progreso al dev: "me falta X para definir feature Y".
- LLM agnóstico (Claude/GPT/Gemini u open). Salida siempre `.md` canónico para diff limpio.

## Conflictos

Si dev edita mientras IA sugiere, gana última edición dev y la sugerencia se marca `obsoleta`, no se pierde.
