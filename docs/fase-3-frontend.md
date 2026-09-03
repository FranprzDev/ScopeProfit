# Fase 3 — Frontend (cliente)

Superficie cliente. Solo pide, no edita. Sin precios.

## UX (3 botones con ejemplos)

- **Arreglo:** "esto no anda / falta un dato" (ej: botón roto, campo faltante).
- **Nueva funcionalidad:** algo chico dentro de lo existente (ej: exportar CSV, aviso por mail).
- **Módulo:** algo grande nuevo (ej: panel admin, tienda, integración con otro sistema).

Cliente escribe simple. IA traduce a Feature/Modulo, pregunta lo faltante con lenguaje no técnico y avisa estado ("te falta contarme X").

## Links y permisos

- Link por documento: `/{proyecto}/{doc}?token=uuid`, read-only + formulario "pedir cambio". Expira 30 días, revocable.
- Cliente nunca ve .md crudo ni otros clientes. Solo su documento + su historial de pedidos.
- Todo pedido -> va a `en_analisis_IA` -> sugerencia a Telegram. Nada se publica sin ok dev.
