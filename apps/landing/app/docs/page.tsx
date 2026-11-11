import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import { SitePath } from '@/lib/site';
import { REPO_URL } from '../content';
import s from './docs.module.css';

export const metadata: Metadata = {
  ...buildPageMetadata(SitePath.Docs),
  title: 'Documentación | ScopeProfit',
  description:
    'Cómo conectar tu agente de IA al MCP de ScopeProfit: endpoint, API key, OAuth con ChatGPT y Claude, las 20 tools con ejemplos reales, el flujo típico y los límites conocidos.',
};

export const dynamic = 'force-static';

const WORKER_URL = 'https://scopeprofit-mcp.franutn23.workers.dev/api/mcp';

type Kind = 'read' | 'write' | 'destructive';

interface ToolDoc {
  name: string;
  kind: Kind;
  description: string;
  example: string;
}

/** Every description and example below mirrors docs/mcp.md and apps/api/src/modules/mcp/registry.ts. */
const TOOLS: ToolDoc[] = [
  {
    name: 'create_project',
    kind: 'write',
    description: 'Crea un proyecto (solo necesita un título). Devuelve el id.',
    example: '{ "title": "Sitio institucional para Cafetería Andina" }',
  },
  {
    name: 'list_projects',
    kind: 'read',
    description: 'Lista tus proyectos con id, título, estado del scope y de la cotización.',
    example: '{}',
  },
  {
    name: 'get_project',
    kind: 'read',
    description: 'Detalle del proyecto; puede incluir inputs y change requests.',
    example: '{ "project_id": "<id>", "include": "inputs,change_requests" }',
  },
  {
    name: 'archive_project',
    kind: 'destructive',
    description: 'Archiva el proyecto. Pedí confirmación explícita del usuario antes de llamarla.',
    example: '{ "project_id": "<id>" }',
  },
  {
    name: 'add_client_input',
    kind: 'write',
    description: 'Agrega un mensaje del cliente. Re-analiza y devuelve el estado del scope.',
    example:
      '{ "project_id": "<id>", "content": "Necesitamos una web con catálogo de 40 productos, en español, para fin de mes." }',
  },
  {
    name: 'get_input_image',
    kind: 'read',
    description: 'Devuelve una imagen adjuntada a un input, en base64.',
    example: '{ "project_id": "<id>", "input_id": "<id>" }',
  },
  {
    name: 'get_tldr',
    kind: 'read',
    description: 'Resumen accionable: estado, pendientes, próximo paso.',
    example: '{ "project_id": "<id>" }',
  },
  {
    name: 'list_pending_questions',
    kind: 'read',
    description: 'Preguntas que el análisis marcó como abiertas.',
    example: '{ "project_id": "<id>" }',
  },
  {
    name: 'answer_question',
    kind: 'write',
    description: 'Responde una pregunta pendiente (con control de concurrencia).',
    example:
      '{ "project_id": "<id>", "question_id": "<id>", "answer": "El tono es cercano pero profesional", "expected_version": 3 }',
  },
  {
    name: 'get_scope_document',
    kind: 'read',
    description: 'Documento de alcance completo en Markdown; opcionalmente con imágenes.',
    example: '{ "project_id": "<id>", "include_images": true }',
  },
  {
    name: 'update_scope_section',
    kind: 'write',
    description: 'Reemplaza una sección del scope y re-analiza.',
    example:
      '{ "project_id": "<id>", "section": "assumptions", "content": "El cliente provee textos y fotos", "expected_version": 4 }',
  },
  {
    name: 'approve_scope',
    kind: 'write',
    description: 'Aprueba el alcance y devuelve un link Markdown firmado. Bloquea el proyecto.',
    example: '{ "project_id": "<id>", "expected_version": 5 }',
  },
  {
    name: 'export_document',
    kind: 'write',
    description: 'Exporta el alcance a PDF o Word y devuelve un link firmado.',
    example: '{ "project_id": "<id>", "format": "pdf", "version": 5 }',
  },
  {
    name: 'log_change_request',
    kind: 'write',
    description: 'Registra un pedido de cambio después de la aprobación.',
    example:
      '{ "project_id": "<id>", "description": "El cliente agregó una sección de blog", "affected_section": "included" }',
  },
  {
    name: 'list_change_requests',
    kind: 'read',
    description: 'Lista los change requests del proyecto, con filtro opcional por estado.',
    example: '{ "project_id": "<id>", "status": "pending" }',
  },
  {
    name: 'get_conversation',
    kind: 'read',
    description: 'Historial de mensajes cliente/agente, en orden cronológico.',
    example: '{ "project_id": "<id>", "limit": 50 }',
  },
  {
    name: 'get_quote',
    kind: 'read',
    description: 'La cotización vigente del proyecto, o una por id.',
    example: '{ "project_id": "<id>" }',
  },
  {
    name: 'save_quote',
    kind: 'write',
    description: 'Crea o reemplaza el borrador de cotización (líneas + hitos de pago).',
    example:
      '{ "project_id": "<id>", "currency": "USD", "lines": [{ "description": "Landing page", "amount": 400 }], "milestones": [{ "name": "Anticipo", "amount": 350 }] }',
  },
  {
    name: 'export_quote',
    kind: 'write',
    description: 'Exporta la cotización a PDF o Word y devuelve un link firmado.',
    example: '{ "quote_id": "<id>", "format": "pdf" }',
  },
  {
    name: 'decide_quote',
    kind: 'write',
    description: 'Marca el borrador como aceptado o rechazado. Acción terminal.',
    example: '{ "quote_id": "<id>", "decision": "accepted" }',
  },
];

const KIND_LABEL: Record<Kind, string> = {
  read: 'lectura',
  write: 'escritura',
  destructive: 'destructiva',
};

function kindClass(kind: Kind): string {
  if (kind === 'read') return `${s.kind} ${s.kindRead}`;
  if (kind === 'write') return `${s.kind} ${s.kindWrite}`;
  return `${s.kind} ${s.kindDestructive}`;
}

export default function DocsPage() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link className={s.brand} href="/">
          ScopeProfit
        </Link>
        <Link className={s.back} href="/">
          ← Volver al inicio
        </Link>
      </header>

      <main className={s.main}>
        <section>
          <h1 className={s.title}>Documentación</h1>
          <p className={s.lead}>
            Todo lo que necesita tu agente de IA para conectarse a ScopeProfit: el endpoint del MCP,
            la autenticación, las 20 tools con ejemplos reales y el flujo típico de trabajo.
          </p>
        </section>

        <section className={s.section}>
          <h2>Qué es ScopeProfit</h2>
          <p>
            ScopeProfit es un MCP server open source que le da a tu agente de IA (ChatGPT, Claude,
            Claude Code o cualquier cliente MCP) las herramientas para convertir pedidos de clientes
            en un alcance claro y un presupuesto con tus tarifas. No tiene interfaz propia: el
            producto es el MCP. Vos le contás al agente lo que pidió el cliente; el agente analiza,
            pregunta lo que falta, redacta el scope, lo exporta a PDF o Word y arma la cotización.
            Los links de descarga firmados los compartís vos con tu cliente.
          </p>
        </section>

        <section className={s.section}>
          <h2>Conectar tu agente</h2>
          <p>El endpoint MCP (Streamable HTTP) de la instancia pública es:</p>
          <pre className={s.pre}>
            <code>{WORKER_URL}</code>
          </pre>
          <p>
            Hay dos formas de autenticarte. En ambas, los proyectos quedan aislados por cuenta: tu
            agente solo ve tus proyectos.
          </p>

          <h3>API key</h3>
          <p>
            Pedile una key al operador de la instalación (el comando del operador es{' '}
            <code>mcp:keys create &quot;tu-email&quot; --label &quot;ChatGPT&quot;</code>). Tiene el
            formato <code>sp_live_&lt;32 bytes hex&gt;</code> y viaja como{' '}
            <code>Authorization: Bearer sp_live_…</code>. Compartila solo con tus propios agentes.
          </p>

          <h3>ChatGPT (OAuth)</h3>
          <ol>
            <li>Settings → Apps → Advanced settings → activá Developer mode.</li>
            <li>Create app → completá el nombre y la URL del MCP de arriba.</li>
            <li>
              El servidor usa OAuth 2.1 con registro dinámico: al conectar, tu cliente se registra
              solo y te pide autorización.
            </li>
            <li>
              En la pantalla de consentimiento pegás tu API key (<code>sp_live_…</code>) una sola
              vez. Después el acceso usa tokens <code>sp_at_…</code>, que expiran y se revocan con
              un logout.
            </li>
          </ol>

          <h3>Claude (OAuth)</h3>
          <ol>
            <li>Settings → Connectors → Add custom connector.</li>
            <li>Nombre: ScopeProfit. Remote MCP server URL: la de arriba.</li>
            <li>Add → autorizá con tu API key en la pantalla de consentimiento.</li>
          </ol>

          <h3>Claude Code</h3>
          <pre className={s.pre}>
            <code>{`claude mcp add scopeprofit --transport http \\
  ${WORKER_URL} \\
  --header "Authorization: Bearer sp_live_TU_KEY"`}</code>
          </pre>

          <h3>stdio (autoservicio)</h3>
          <p>
            Si corrés tu propia instancia, podés conectar por stdio con el repo clonado:{' '}
            <code>npx tsx apps/api/src/modules/mcp/stdio.ts</code>, con{' '}
            <code>SCOPEPROFIT_API_KEY</code> y <code>DATABASE_URL</code> en el entorno. El paso a
            paso completo está en <a href={`${REPO_URL}/blob/main/docs/mcp.md`}>docs/mcp.md</a>.
          </p>
        </section>

        <section className={s.section}>
          <h2>Las 20 tools</h2>
          <p>
            Todas las tools están en inglés (nombres, descripciones y errores) para que cualquier
            agente las entienda, pero el contenido puede ser en cualquier idioma. Cada ejemplo
            muestra el JSON real de argumentos.
          </p>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Tipo</th>
                <th>Qué hace</th>
                <th>Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((tool) => (
                <tr key={tool.name}>
                  <td>
                    <code>{tool.name}</code>
                  </td>
                  <td>
                    <span className={kindClass(tool.kind)}>{KIND_LABEL[tool.kind]}</span>
                  </td>
                  <td>{tool.description}</td>
                  <td>
                    <code>{tool.example}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={s.section}>
          <h2>Flujo típico</h2>
          <ol>
            <li>
              <code>create_project</code> con el nombre del trabajo.
            </li>
            <li>
              <code>add_client_input</code> con el pedido del cliente, en lenguaje natural (podés
              adjuntar imágenes con <code>image_url</code>).
            </li>
            <li>
              <code>get_tldr</code> para ver qué falta y cuál es el próximo paso.
            </li>
            <li>
              <code>list_pending_questions</code> y <code>answer_question</code> hasta que no queden
              pendientes (si la conversación avanza, <code>get_tldr</code> o{' '}
              <code>get_scope_document</code> te dan la versión vigente para{' '}
              <code>expected_version</code>).
            </li>
            <li>
              <code>get_scope_document</code> para revisar el alcance y ajustarlo con{' '}
              <code>update_scope_section</code> si hace falta.
            </li>
            <li>
              <code>approve_scope</code> cuando esté cerrado: devuelve un link Markdown firmado para
              compartir.
            </li>
            <li>
              <code>export_document</code> (pdf o docx) para la versión final.
            </li>
            <li>
              <code>save_quote</code> con líneas e hitos de pago, <code>export_quote</code> para el
              PDF o Word, y <code>decide_quote</code> cuando el cliente responde.
            </li>
          </ol>
          <p>
            Si el cliente pide un cambio después de la aprobación: <code>log_change_request</code>{' '}
            lo registra y <code>update_scope_section</code> crea una versión nueva del documento.
            También podés dejar el registro conversado con <code>add_client_input</code> y{' '}
            <code>get_conversation</code>.
          </p>
        </section>

        <section className={s.section}>
          <h2>Límites conocidos</h2>
          <ul>
            <li>
              Rate limit: 120 requests por minuto por IP (configurable). Al superarlo responde 429
              con <code>RATE_LIMITED</code> y un cuerpo JSON.
            </li>
            <li>
              Los links firmados de descarga vencen (por defecto a los 60 minutos, configurable): un
              link vencido responde 410 <code>EXPIRED</code> y uno inexistente 404{' '}
              <code>INVALID</code>. Generá un link nuevo con <code>export_document</code> o{' '}
              <code>export_quote</code>.
            </li>
            <li>
              Aprobar el scope bloquea el proyecto: ya no acepta inputs ni ediciones de scope. Los
              cambios van por <code>log_change_request</code>.
            </li>
            <li>
              Las escrituras del scope usan <code>expected_version</code> como control de
              concurrencia; si no coincide responde <code>VERSION_CONFLICT</code> con la versión
              actual para reintentar.
            </li>
            <li>
              Imágenes: hasta 5 por input, máximo 10 MB cada una, y las URLs deben ser https
              públicas accesibles desde el servidor (se descargan en el backend).
            </li>
            <li>
              Hay una sola cotización por proyecto: <code>save_quote</code> la crea o reemplaza
              mientras esté en borrador. <code>decide_quote</code> es terminal: después de aceptar o
              rechazar no se puede editar ni reexportar.
            </li>
            <li>
              El servidor es stateless: cada request viaja completo (endpoint <code>/api/mcp</code>{' '}
              con POST JSON, sin sesiones SSE).
            </li>
            <li>
              Errores: cuerpo JSON <code>{'{ "error": { "code", "message" } }'}</code>. Códigos
              frecuentes: <code>UNAUTHORIZED</code> (falta la key), <code>NOT_FOUND</code>,{' '}
              <code>VERSION_CONFLICT</code>, <code>QUOTE_NOT_DRAFT</code>, <code>RATE_LIMITED</code>
              . El mensaje siempre indica cómo seguir.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
