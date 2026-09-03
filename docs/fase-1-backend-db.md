# Fase 1 — Backend + PGDB

Capa base local-first. Cualquier dev: `compose up` y trabaja.

## Modelo

- `Proyecto (id, name, client_ref, created_at)`
- `Presupuesto (id, proyecto_id, version, estado, md_path, pdf_path)`
- `Anexo (id, presupuesto_id, version, estado, md_path, pdf_path)`
- `Modulo (name, date, general_description, quantity_features)`
- `Feature (name, description, date, objectives[]) -> modulo_id`
- `Feedback (doc_ref, veredicto: aceptado/editado/rechazado, diff, motivo, scope: global|cliente)`

Regla Feature vs Modulo:
- Feature = 1 objetivo, 1-3 criterios de aceptación. Ej: "exportar CSV", "login con Google", "recuperar contraseña".
- Modulo = 3+ features o integra actores/permisos/datos externos. Ej: "panel admin", "integrar MercadoPago", "migración de datos". Si `quantity_features >= 3` o toca permisos/integraciones -> es Modulo, se descompone en features.

Dedup: nuevo pedido se compara -> `igual (iterar ahí) / parecido (sugerir merge) / nuevo (crear draft)`. Nunca duplica documento en curso, avisa.

## Archivos (espejo de DB, versionables)

- `clients.md` (índice: name -> archivo) + `clients/{name}.md` con frontmatter: `name, contact, tone, glossary[], context, history[]`.
- `proyectos/{pid}/presupuestos/{bid}-v{n}.md` + `anexos/{aid}-v{n}.md`.
- Versión = snapshot inmutable. Draft = `v0-next` mutable hasta congelar. Diff + restore por archivo.

## DX local

- `docker compose up`: api + pgdb + worker IA (stub) + render md->pdf.
- `.env.example` + `seed/` con 1 cliente, 1 proyecto, 1 modulo ejemplo.
- Salida fase: CRUD + historial + `POST /render` (.md -> PDF simple legible).
