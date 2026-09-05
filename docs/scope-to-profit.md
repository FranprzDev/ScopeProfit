# SCOPE-TO-PROFIT
### El copiloto comercial y de rentabilidad para freelancers y agencias de software
Documento de concepto, producto y estrategia inicial — 1 de septiembre de 2026
*Fuente de verdad — foco en docs para proyecto nuevo, pricing liviano*

> **Estado:** Draft v0.8 — fuente de verdad `scope-to-profit.md` | **Foco v1:** Cliente (Next.js) ↔ Backend (Agente IA) ↔ Vos (Telegram) → DB + filesystem persistente Brief → doc 7.1

> **Arquitectura v1:** 3 apps — `Telegram Bot (tu interfaz)` + `Next.js Frontend (chat cliente)` + `Backend API (donde vive el agente IA) + DB + filesystem persistente`. Telegram y Next.js **nunca tocan la DB directo**, todo pasa por Backend API.

**Índice rápido:** [1. Idea](#1-la-idea) · [2. Problema](#2-el-problema) · [3. Usuario](#3-usuario-inicial) · [4. Flujo](#4-flujo-principal) · [5. Diferenciales](#5-funciones-diferenciales) · [7. MVP](#7-mvp-ajustado) · [8. Producto entrada](#8-producto-de-entrada) · [11. Venta](#11-venta-inicial) · [14. Plan 30d](#14-plan-de-30-días-ajustado)

---

## 1. LA IDEA

Scope-to-Profit transforma **ideas desordenadas que trae un cliente** en **un doc formal que permite diagnosticar correctamente** qué sistema te están pidiendo — sin que tengas que estar presente en la primera ronda de preguntas.

Entrada: audios, WhatsApps, docs, imágenes, videos, texto — todo lo que el cliente tira desordenado.
Salida: un doc de proyecto claro (plantilla manual v1) y un Brief versionado en PostgreSQL con:

- requerimientos claros (qué quiere realmente)
- preguntas pendientes (qué falta entender del sistema)
- riesgos y ambigüedades
- alcance (incluidos / excluidos / supuestos / criterios de aceptación)
- cuestiones interesantes del sistema (actores, permisos, datos, integraciones, reglas)
- estimación en rango (orientativa, no precio final)
- próximos pasos

No es otro generador de textos con IA. Es un **formalizer + diagnosticador**: ordena el caos para que puedas entender todas las cuestiones del sistema antes de cotizar o construir.

**Foco v1 acordado:** poder llevar ideas desordenadas a algo formal y diagnosticable con una sola plantilla manual fija. Pricing/rentabilidad y control de cambios quedan para v1.1+.

**Terminología v1:** `docs` = documento único del proyecto generado con plantilla 7.1. `Alcance` es la sección 5 dentro de ese doc. `Propuesta` es el PDF exportado del doc. Al aprobar, el cliente recibe automáticamente el PDF y un DOCX editable.

Promesa principal:
> "Traé el desorden del cliente, llevátelo formalizado y diagnosticado para entender qué sistema te piden realmente."

## 2. EL PROBLEMA

Los freelancers y agencias suelen:
- cotizar desde el entusiasmo y no desde datos
- olvidar integraciones, migraciones, soporte y carga de datos
- aceptar frases ambiguas como "es algo sencillo"
- enviar propuestas diferentes cada vez
- perder tiempo haciendo relevamientos repetidos
- aceptar cambios de alcance sin cobrarlos
- no comparar horas estimadas contra horas reales
- repetir los mismos errores en cada proyecto

El costo no es solamente administrativo. Es margen perdido.

## 3. USUARIO INICIAL

Primer segmento recomendado: freelancers y agencias pequeñas de software que venden proyectos a medida, con equipos de 1 a 15 personas y entre 2 y 20 presupuestos mensuales.

Perfil ideal:
- ya tiene clientes
- cotiza por proyecto o por alcance
- usa WhatsApp, Telegram, email o documentos
- sufrió al menos un proyecto mal cotizado
- no necesita un ERP completo
- está dispuesto a pagar por ahorrar tiempo y proteger margen

**Usuario 0 — uso propio:** el equipo fundador usa la misma plantilla 7.1 para sus propios clientes. Cuando te viene un cliente nuevo, lo cargás como un proyecto más y generás el doc. Dogfooding obligatorio: si no te sirve a vos, no sirve para vender.

No comenzar con grandes empresas.

## 4. FLUJO PRINCIPAL

| Paso | Nombre | Qué hace | Estado v1 |
|------|--------|----------|-----------|
| 1 | **INGRESO** | **Cliente → Next.js chat** (texto, imagen, audio, video) tira ideas desordenadas · **Vos → Telegram** ves/creás proyectos y también mandás texto/imagen/audio/video | ✅ v1 — Telegram recibe todo tipo de media |
| 2 | **RELEVAMIENTO SIN VOS** | **Agente IA en el medio:** filtra preguntas boludas de entrada, hace solo las necesarias (RF/RNF + dominio/contexto), va mejorando el TLDR en vivo para que el cliente defina qué quiere y qué le aporta valor — sin que tengas que estar presente | ✅ v1 |
| 3 | **ANÁLISIS / DIAGNÓSTICO** | Formaliza y diagnostica cuestiones interesantes del sistema: RF, RNF, actores/permisos, integraciones, datos, pantallas, reglas, dominio, riesgos, supuestos | ✅ v1 |
| 4 | **ALCANCE** | Genera versión editable: incluidos / excluidos / supuestos / criterios | ✅ **Core v1** |
| 5 | **ESTIMACIÓN** | Rango por módulos (liviana, solo horas, sin precio/margen) | ✅ v1 liviana |
| 6 | **DOC + BRIEF** | Genera doc único con plantilla 7.1 → exporta PDF/DOCX + guarda Brief actualizado en filesystem persistente (todo versionado) | ✅ v1 |
| 7 | **CAMBIOS** | Compara nuevo pedido vs alcance → change request | ⏳ v1.1 |
| 8 | **APRENDIZAJE** | Compara estimado vs real | ⏳ v1.1 |
| 9 | **DOCS AVANZADOS (futuro)** | Diagramas flujo / secuencia / actividades / proceso (BPMN/UML) desde el Brief | 🔮 roadmap |

## 5. FUNCIONES DIFERENCIALES

### 5.1 Detector de alcance oculto — CORE DIFERENCIADOR v1
No es un prompt genérico. Es base de conocimiento por tipo de proyecto: "panel admin" → checklist de 8 preguntas (roles, permisos, ABM, reportes, exports, logs, etc.). Cada requerimiento vago dispara preguntas específicas. *No copiable con un prompt.*
> Diferenciador: checklist curada + trazabilidad a cita textual. Si no hay cita, no se marca como incluido.

### 5.2 Trazabilidad con cita textual — DIFERENCIADOR v1
Cada fila de requerimientos (7.1 §2) exige fuente: "dijo: ...". Si la IA no encuentra cita, genera pregunta en §3 en vez de inventar. Esto evita alucinación y es auditable por el cliente.

### 5.3 Semáforo de riesgo accionable — DIFERENCIADOR v1
No es solo color. Cada 🔴/🟡 bloquea explícitamente la estimación (§3 ¿Bloquea estimación? = Sí) y sugiere supuesto para desbloquear. El doc no se puede marcar "aprobado" con 🔴 sin supuesto.

### 5.4 Versionado y diff de alcance — DIFERENCIADOR v1.1
Cada cambio genera diff de incluidos/excluidos. El cliente ve qué salió y qué entró. Base para cobrar cambios sin discutir.

### 5.5 Detector de scope creep — v1.1
Compara nuevo pedido vs alcance aprobado (5.4) y genera change request con impacto en horas.

### 5.6 Memoria personal de estimación — POST-MVP
Aprende de proyectos cerrados del profesional, no de promedios genéricos. Requiere historial.

### 5.7 Rentabilidad real — POST-MVP
Compara precio cobrado, horas, costos externos, retrabajo, reuniones, soporte y cambios no cobrados.

*Sacado de v1: recomendación de precio mínimo y tres alternativas comerciales → roadmap futuro, no diferenciador de docs.*

## 6. QUÉ HACE LA IA Y QUÉ NO

La IA puede (v1) — **agente que vive en el Backend** y trabaja sin vos presente:
- lee mensajes/archivos que llegan vía Backend desde Next.js (cliente) y Telegram (vos) — texto, imágenes, audios, videos, docs
- saca preguntas boludas de entrada / filtra ruido y repeticiones
- elicia RF + RNF + contexto/dominio relevante para el proyecto
- va mejorando el TLDR del proyecto en vivo (resumen que ves en Telegram por proyecto)
- hace solo preguntas necesarias para que el cliente defina qué quiere y qué le aporta valor
- ordena requisitos en la plantilla 7.1 con cita textual
- detecta alcance oculto y contradicciones
- redacta doc con secciones 1-7 y explica riesgos con semáforo

La IA NO hace en v1:
- no inventa requisitos sin cita o archivo (deja vacío y genera pregunta)
- no calcula precio/margen/impuestos
- conversa con el cliente, hace preguntas y actualiza el borrador sin tu presencia; no confirma ni entrega el alcance final sin tu aprobación desde Telegram

El sistema controla de forma determinística (v1) — todo en Backend:
- Backend es el único que habla con DB y filesystem: cada mensaje/archivo de Telegram y Next.js entra por `POST /api/telegram/webhook` y `POST /api/chat` y se guarda en DB + archivo en filesystem persistente, Brief versionado
- versionado del doc (v0.1, v0.2...)
- estados del proyecto (`draft` → `in_review` → `changes_requested` → `approved` → `delivered` → `archived`)
- validación de plantilla completa (campos obligatorios de 7.1)
- cómputo de rango horas (suma simple, sin fórmulas de margen)

Queda para v1.1+ determinístico: horas reales, margen, rentabilidad, permisos avanzados.

**Futuro (no v1):** desde el Brief enriquecido + imágenes, el Backend genera diagramas de flujo, secuencia, actividades y BPMN — por ahora solo PM (texto plano + info adicional).

La IA propone. El profesional decide.

## 7. MVP (ajustado)

**v1 — Solo docs del proyecto nuevo:**

| # | Feature | Nota |
|---|---------|------|
| 1 | Login del cliente | Email con magic link; la sesión identifica al cliente y no requiere contraseña |
| 2 | Crear proyecto | Se crea desde Telegram, genera link Next.js para el cliente |
| 3 | **Frontend Next.js — chat cliente** | Cliente chatea desordenado, sin fricción |
| 4 | **Telegram — tu interfaz** | Vos gestionás todos tus proyectos desde Telegram. `/projects` devuelve **un botón por proyecto** (InlineKeyboard) |
| 5 | Pegar conversación / audio / doc (alt) | Por si ya tenés el WhatsApp y no usó el chat |
| 6 | **Agente IA intermedio** | Saca preguntas estúpidas, filtra, y va mejorando el TLDR en vivo |
| 7 | Formalización: requerimientos + riesgos/preguntas | Con trazabilidad a cita textual |
| 8 | Alcance editable | incluidos / excluidos / supuestos / criterios |
| 9 | Estimación por módulos | *rango liviano, sin margen complejo* |
| 10 | Generación de doc con plantilla 7.1 → PDF/DOCX | Listo para decirle al cliente / enviar |

**→ v1.1:**
- [ ] Registro de horas estimadas y reales
- [ ] Comparación final estimado/real
- [ ] Docs avanzados: diagramas flujo/secuencia/actividades/BPMN desde Brief + filesystem persistente

**Dejar para después (roadmap):**
`Jira/Trello/Slack` · `facturación/pagos` · `marketplace` · `múltiples modelos complejos` · `automatización total` · `3 alternativas comerciales`

**Arquitectura v1 (3 apps que conviven — Telegram nunca toca DB directo):**
- `Telegram Bot` → tu interfaz, recibe texto/imagen/audio/video, comandos, botones por proyecto → **solo habla con Backend API** (`POST /api/telegram/webhook`)
- `Next.js Frontend` → chat cliente por link `/p/<uuid>`, también texto/imagen/audio/video → **solo habla con Backend API** (`POST /api/chat`)
- `Backend API (donde vive el agente IA) + DB + filesystem persistente` → único con acceso a DB y filesystem, guarda todo, mantiene Brief y docs versionados por proyecto, alimenta a ambos UIs; el Brief es la fuente de verdad enriquecida (texto plano + imágenes + RF/RNF + dominio). La ruta raíz del filesystem debe ser configurable y estar montada en almacenamiento persistente en producción; no se puede usar un disco efímero.

### 7.4 Stack técnico y memoria v1

- `Next.js` es el Frontend del cliente.
- `NestJS` es el Backend y contiene el módulo del agente.
- `LangGraph + LangChain JS` implementan el harness, el flujo y las herramientas del agente.
- El acceso a modelos se realiza mediante una configuración de gateway/proveedor intercambiable. La lógica del agente recibe `AI_MODEL`, `AI_GATEWAY_BASE_URL` y las credenciales por entorno, sin acoplarse a un modelo concreto.
- `PostgreSQL` es la memoria persistente y la fuente de verdad del producto: usuarios, proyectos, mensajes, Brief, requisitos, preguntas, riesgos, alcance, estados, auditoría y checkpoints de LangGraph.
- La memoria de conversación actual usa un checkpointer por `thread_id`; la memoria persistente usa el Brief estructurado y versionado por proyecto. Ambas viven en PostgreSQL.
- El filesystem persistente almacena únicamente archivos binarios y artefactos generados: multimedia, documentos recibidos, Markdown, PDF y DOCX.
- `RAG`, `pgvector` y una vector database quedan fuera de v1. Se evaluarán solo si aparece una necesidad concreta de búsqueda semántica entre muchos proyectos o documentos.

### 7.1 Plantilla Manual v1 (concreta — no abstracta)

> **Objetivo:** el MVP usa **una sola plantilla fija**. No hay editor de plantillas en v1. Después cada usuario podrá hacer su propio docs.

**Estructura fija del doc generado (PDF/Markdown):**

**Portada:** Proyecto / Cliente / Fecha / Versión 0.1 / Autor

**1. Resumen ejecutivo (5 líneas máximo)**
- Objetivo del cliente en 1 frase
- Problema principal a resolver
- Solución propuesta en 2 líneas
- Qué se entrega y qué no (1 línea)

**2. Requerimientos identificados (formalización de ideas)**
| ID | Descripción formalizada | Tipo | Prioridad | Fuente (cita textual desordenada) | Cuestión interesante del sistema |
|----|-------------------------|------|-----------|-----------------------------------|----------------------------------|
| R1 | ... | Funcional / Regla / Dato / Integración | Must / Should | "cliente dijo: ..." | Ej: implica permisos por rol |

**3. Preguntas pendientes (para desbloquear alcance)**
| # | Pregunta | Por qué importa | ¿Bloquea estimación? |
|---|----------|----------------|---------------------|
| P1 | ¿Quién carga los datos iniciales? | Define migración | Sí |

**4. Riesgos y ambigüedades + Semáforo**
| # | Riesgo / Ambigüedad | Impacto | Mitigación / Supuesto | Semáforo |
|---|---------------------|---------|----------------------|----------|
| R1 | "panel admin" sin definir roles | Alto | Suponer 2 roles hasta validar | 🔴 |

**5. Alcance editable (core)**
- **Incluidos:** lista bullet chequeable
- **Excluidos:** lista bullet explícita (ej: carga de datos, soporte post-lanzamiento)
- **Supuestos:** lista (ej: cliente provee diseño, hosting a cargo del cliente)
- **Criterios de aceptación:** por módulo (ej: "login funciona con email+pass y recupera contraseña")

**6. Estimación rango liviana**
| Módulo | Horas min | Horas max | Qué puede mover el rango |
|--------|-----------|-----------|--------------------------|
| Auth | 8 | 14 | Si pide SSO |
| ... | ... | ... | ... |
| **Total** | **X** | **Y** | + buffer incertidumbre |

Sin cálculo de margen/impuestos en v1. Solo total horas rango.

**7. Próximos pasos**
- [ ] Validar preguntas P1-P3
- [ ] Aprobar alcance v0.1
- [ ] Confirmar fecha y entregables

**Regla v1:** la IA rellena esta plantilla. El usuario solo edita texto. No hay customización de secciones en v1 — eso va a "cada uno pueda hacer su propio docs" en v1.1+.

### 7.2 Comandos Telegram v1

- `/createproject <nombre>` → crea proyecto, genera `https://tu-app.com/p/<uuid>`, responde con botón `🔗 Abrir chat cliente` + `📋 Copiar link`
- `/projects` → **lista con un botón por proyecto** (1 fila = 1 proyecto). Ej: `🟡 Ecommerce LaTienda — 3 preguntas pendientes` / `🟢 Landing Acme — listo para enviar`. Al tocar abre detalle: TLDR actual, semáforo, botones `Ver doc`, `Editar doc`, `Copiar link cliente`, `Aprobar`, `Rechazar`, `Gestionar link`, `Archivar`
  - Implementación: `sendMessage` con `reply_markup: { inline_keyboard: [[{text: "Ecommerce LaTienda", callback_data: "project:open:abc123"}]] }` — `callback_data` debe ser breve (1–64 bytes) y el Backend debe validar que el callback pertenece al profesional autorizado.
- `/tldr <id>` → muestra TLDR actualizado del proyecto (mejorado por agente)
- `/doc <id>` → renderiza doc 7.1 actual del proyecto en Telegram + link PDF
- `/ask <id> <pregunta>` → inyecta pregunta manual al chat del cliente
- `/archive <id>` → archiva proyecto
- `/help` → muestra los comandos, botones y una explicación breve del flujo de revisión y aprobación

> Telegram recibe **texto, imágenes, audios, videos y docs** — todo se guarda en DB y archivo en filesystem persistente y alimenta el Brief. Comodidad: no tenés que estar presente para la primera ronda de preguntas boludas.

#### 7.2.1 Botones y flujos de supervisión

Telegram usa un `InlineKeyboardMarkup` adjunto a los mensajes del bot. Los botones de acción usan `callback_data`; al pulsarlos, Telegram envía un `callback_query` al webhook del Backend. El Backend debe responder siempre con `answerCallbackQuery` para cerrar el estado de carga del botón y luego actualizar el mensaje mediante `editMessageText` o `editMessageReplyMarkup`.

Ejemplo de detalle de proyecto:

```json
{
  "inline_keyboard": [
    [
      { "text": "📄 Ver borrador", "callback_data": "project:doc:abc123" },
      { "text": "✏️ Editar doc", "callback_data": "project:edit:abc123" }
    ],
    [
      { "text": "✅ Aprobar", "callback_data": "project:approve:abc123" },
      { "text": "↩️ Rechazar", "callback_data": "project:reject:abc123" }
    ],
    [
      { "text": "🔗 Gestionar link", "callback_data": "project:link:abc123" },
      { "text": "🗃 Archivar", "callback_data": "project:archive:abc123" }
    ]
  ]
}
```

El flujo de aprobación es:

1. El profesional pulsa `Aprobar`.
2. El bot muestra un segundo botón de confirmación con la versión exacta del documento.
3. El Backend valida usuario, proyecto, estado y versión actual.
4. El Backend registra quién aprobó, cuándo y qué versión aprobó.
5. El proyecto pasa a `aprobado`.
6. El Backend genera o actualiza el PDF final y el DOCX editable correspondiente.
7. El sistema envía automáticamente al cliente el PDF y el DOCX editable.

La aprobación es la confirmación del alcance y la orden de entrega. No existe un botón posterior separado para enviar el PDF o el DOCX.

El flujo de rechazo es:

1. El profesional pulsa `Rechazar`.
2. El bot muestra `Pedir cambios al agente` y `Cancelar`.
3. Si pide cambios, el bot solicita una observación breve mediante el siguiente mensaje del profesional.
4. El Backend agrega esa observación al contexto del proyecto y solicita al agente una nueva revisión completa.
5. El proyecto vuelve a `borrador` y conserva la versión rechazada en el historial.

La edición manual usa un botón `Editar doc` que abre una URL HTTPS firmada con una duración de 10 días. La URL incluye un token con proyecto, usuario, permisos, vencimiento y nonce; no incluye datos sensibles. El Backend valida la firma, el vencimiento, el nonce y que el usuario de Telegram sea un profesional autorizado antes de crear una sesión de edición. El cliente nunca recibe esta URL ni una firma con permisos de profesional. Cualquier profesional autorizado puede editar todas las partes del documento.

Al guardar una edición manual, el Backend persiste una nueva versión y envía al agente el documento completo actualizado junto con el Brief, mensajes y archivos vigentes. El agente revisa consistencia, detecta contradicciones y agrega preguntas o sugerencias faltantes; no sobrescribe silenciosamente la edición manual.

La gestión del link del cliente también se realiza con botones:

- `🔗 Regenerar link` — invalida el token anterior y crea uno nuevo;
- `🚫 Revocar acceso` — deja el link inutilizable;
- `⏱ Establecer vencimiento` — solicita una fecha/hora y revoca automáticamente al vencer;
- `↩️ Cancelar` — vuelve al detalle del proyecto.

Por defecto, el link no vence. Aunque pueda compartirse, el cliente debe iniciar sesión para participar y quedar identificado. El Backend debe comprobar proyecto, cuenta, sesión y estado del link en cada operación.

La autorización de Telegram no se limita a un único usuario. El Backend recibe desde entorno una lista de IDs autorizados, por ejemplo `TELEGRAM_AUTHORIZED_USER_IDS=123456789,987654321`, y la duración de las URLs firmadas se configura con `ADMIN_EDIT_URL_TTL_DAYS=10`. Ningún ID se hardcodea en el código.

Las acciones de botones deben ser idempotentes: pulsar dos veces `Aprobar`, `Rechazar` o `Revocar` no debe duplicar versiones ni producir estados inválidos. Las operaciones destructivas o irreversibles siempre requieren confirmación secundaria.

Referencia técnica: [Telegram Bot API — InlineKeyboardButton, CallbackQuery y métodos de edición](https://core.telegram.org/bots/api#inlinekeyboardbutton).

### 7.3 Contrato del Chat Cliente

El chat cliente es una vista colaborativa del relevamiento. El cliente conversa con el agente y ve en la misma pantalla la conversación y el borrador del documento 7.1 actualizado en vivo.

El cliente puede mejorar el borrador de dos formas:

1. editar manualmente las partes habilitadas del documento, aunque el flujo esperado es hacerlo principalmente mediante el chat;
2. proponer cambios, correcciones o información adicional mediante el chat.

Cuando el cliente propone cambios por chat, el agente incorpora el contexto al Brief, vuelve a generar el documento completo y revisa qué preguntas, contradicciones o sugerencias todavía faltan para aclarar el alcance. Cuando el profesional edita el documento manualmente, el sistema envía al agente el documento completo actualizado junto con toda la información vigente del proyecto para que lo revise, mantenga la consistencia con el Brief y agregue las preguntas o sugerencias que todavía hagan falta.

El agente puede trabajar y conversar sin la presencia del profesional. La aprobación del profesional no bloquea el relevamiento ni la edición del borrador: desde Telegram, el profesional confirma cuándo el alcance está listo para pasar de borrador a enviado o aprobado y ordena la entrega automática del documento/PDF final y del DOCX editable.

El acceso requiere una cuenta iniciada para identificar al cliente. El link puede compartirse, pero no habilita participación anónima. Por defecto no vence; el profesional puede revocarlo o establecerle un vencimiento mediante un comando de Telegram.

El cliente no ve información interna del profesional, como margen, rentabilidad, costos internos o razonamiento privado del agente.

## 8. PRODUCTO DE ENTRADA

Para venderlo rápidamente no conviene empezar con una suscripción abstracta. Oferta inicial:
> "Subí una conversación con tu cliente y recibí el doc del proyecto con alcance, riesgos y preguntas — listo para enviar."

Resultado entregado (v1 — un único doc con plantilla 7.1):
- resumen ejecutivo
- requerimientos con fuente (cita)
- preguntas pendientes bloqueantes
- riesgos + semáforo
- alcance (incluidos / excluidos / supuestos / criterios)
- estimación en rango horas (orientativa, sin precio)
- próximos pasos

No incluye en v1: precio final, margen, rentabilidad.

Esto permite cobrar desde el principio y aprender con casos reales del proyecto nuevo.

## 9. MODELO DE NEGOCIO (simplificado v1)

- Plan individual: para freelancers
- Plan equipo: para agencias pequeñas

*Sacado de v1: Configuración inicial (importación tarifas/plantillas) y Servicio premium (revisión presupuestos). Pasan a roadmap.*

La ventaja no está en cobrar por generar un PDF. Está en convertirse en el historial de alcance y docs del negocio.

## 10. MARKETING

Posicionamiento: "No pierdas plata por aceptar proyectos mal definidos."

Mensajes de contenido (alineados a docs, no a pricing):
- "El cliente pidió una web sencilla. Mirá todo lo que faltaba definir."
- "5 frases que esconden alcance no cotizado."
- "La checklist de 12 exclusiones que te salva de regalar trabajo."
- "El costo invisible de las reuniones y correcciones."
- "Cómo saber si un proyecto está bien definido antes de cotizar."

Lead magnet v1: checklist gratuita "¿Tu alcance está completo? 20 preguntas antes de enviar la propuesta" (reemplaza calculadora de precio)

Oferta de validación: "Analizo una conversación con tu cliente y te devuelvo el doc de alcance con lo que falta definir."

Canales iniciales: LinkedIn, comunidades de freelancers, grupos de agencias, contenido corto con casos numéricos, contacto directo personalizado, alianzas con contadores y consultores de negocios digitales.

## 11. VENTA INICIAL

No vender a todo el mundo. Contactar profesionales que ya hayan publicado o comentado sobre problemas de clientes, presupuestos o alcance.

Mensaje:
> "Estoy probando una herramienta que analiza conversaciones con clientes y detecta alcance oculto para armar los docs del proyecto. ¿Te puedo analizar gratis un proyecto que hayas cotizado recientemente?"

La conversación busca descubrir: cómo cotiza hoy, qué errores repite, cuánto tarda, cuánto trabajo no cobra, qué ocurre cuando el cliente cambia el alcance.

Objetivo de validación: 10 entrevistas, 5 análisis reales, 3 usuarios recurrentes, 1 piloto pago.

## 12. MÉTRICAS IMPORTANTES

No medir solamente registros. Medir:
- tiempo para crear doc con plantilla 7.1 (minutos desde conversación pegada hasta PDF)
- cantidad de preguntas detectadas por doc
- cantidad de riesgos con semáforo por doc
- mejora de completitud: % de docs con incluidos/excluidos/supuestos llenos
- docs enviados / aprobados por cliente

Medir desde v1.1 (no v1):
- diferencia entre horas estimadas y reales
- cambios de alcance detectados (scope creep)
- margen por proyecto

Métrica principal v1: "Tiempo para tener doc de alcance claro" + "Preguntas/riesgos detectados por proyecto"
Métrica principal post-MVP: "Margen protegido por proyecto."

## 13. RIESGOS

- Convertirse en otro generador genérico → enfocarse en alcance y docs, no en generar texto bonito.
- Prometer estimaciones exactas → usar rangos, supuestos y explicación de incertidumbre (pricing liviano ayuda).
- Pedir demasiados datos antes de dar valor → entregar análisis inicial rápido y preguntar progresivamente.
- Mercado demasiado amplio → empezar con freelancers y agencias pequeñas.
- Que el usuario no cargue horas reales → hacer el registro extremadamente simple (Telegram/audio/cierre semanal) — v1.1.

## 14. PLAN DE 30 DÍAS (ajustado a plantilla manual)

Días 1–3: crear landing con oferta "subí conversación → recibí doc" + checklist lead magnet (no calculadora)
Días 4–7: analizar manualmente 5 conversaciones reales y rellenar plantilla 7.1 a mano (validar que cierra)
Días 8–14: construir flujo ingreso → análisis → doc editable con plantilla 7.1 → export PDF
Días 15–21: probar con 5 freelancers o agencias (medir tiempo hasta doc y preguntas detectadas)
Días 22–26: pulir detector de alcance oculto y trazabilidad con citas (si v1 validado, no horas reales)
Días 27–30: cerrar primer piloto pago y documentar el caso con doc antes/después

## 15. VISIÓN

Scope-to-Profit puede convertirse en el sistema operativo comercial de una agencia pequeña:
- entiende pedidos
- evita proyectos mal definidos
- protege el alcance
- genera propuestas/docs
- controla cambios
- mide rentabilidad
- mejora futuras decisiones

La idea no es ayudar a programar más rápido. La idea es ayudar a decidir: "¿Este proyecto conviene, cuánto vale realmente y cómo evito perder plata?" — empezando por tener los docs del proyecto nuevo claros desde el día 1.
