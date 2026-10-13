// Static copy for the landing page. Every fact here mirrors docs/mcp.md and README.md;
// do not add pricing, user counts, metrics or hosted URLs that the product does not have.

export const REPO_URL = 'https://github.com/FranprzDev/ScopeProfit';
export const MCP_DOCS_URL = `${REPO_URL}/blob/main/docs/mcp.md`;

/** Placeholder only: each deployment exposes the MCP server at `${PUBLIC_API_URL}/api/mcp`. */
export const MCP_ENDPOINT_PLACEHOLDER = 'https://api.<tu-dominio>/api/mcp';

export type ToolKind = 'read' | 'write' | 'destructive';

export interface ToolGroup {
  title: string;
  description: string;
  tools: { name: string; kind: ToolKind; text: string }[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Proyectos',
    description: 'Crear, encontrar y seguir el estado de cada relevamiento.',
    tools: [
      {
        name: 'list_projects',
        kind: 'read',
        text: 'Lista tus proyectos con estado, resumen y cuántas preguntas bloqueantes quedan.',
      },
      {
        name: 'create_project',
        kind: 'write',
        text: 'Crea un proyecto nuevo con un nombre y, opcional, el email del cliente.',
      },
      {
        name: 'get_project',
        kind: 'read',
        text: 'Estado del proyecto y del agente, versiones del brief y del documento. Sirve para consultar el avance.',
      },
      {
        name: 'archive_project',
        kind: 'destructive',
        text: 'Archiva y bloquea un proyecto.',
      },
    ],
  },
  {
    title: 'Lo que dijo el cliente',
    description: 'El material original queda guardado tal cual, para poder citarlo.',
    tools: [
      {
        name: 'add_client_input',
        kind: 'write',
        text: 'Guarda texto del cliente y/o hasta 5 imágenes públicas (JPEG, PNG o WebP, hasta 10 MB) como mensajes citables.',
      },
      {
        name: 'get_conversation',
        kind: 'read',
        text: 'Devuelve los mensajes guardados con su id, que es lo que cita cada requerimiento.',
      },
    ],
  },
  {
    title: 'Diagnóstico y preguntas',
    description: 'Lo que falta definir antes de poder estimar.',
    tools: [
      {
        name: 'get_tldr',
        kind: 'read',
        text: 'Resumen corto: requerimientos, preguntas bloqueantes principales, riesgos en rojo y rango total de horas.',
      },
      {
        name: 'list_pending_questions',
        kind: 'read',
        text: 'Preguntas abiertas. Las que bloquean la estimación impiden aprobar.',
      },
      {
        name: 'answer_question',
        kind: 'write',
        text: 'Guarda la respuesta del cliente, cierra la pregunta y regenera el documento.',
      },
    ],
  },
  {
    title: 'Documento de alcance',
    description: 'La plantilla 7.1, editable sección por sección y exportable.',
    tools: [
      {
        name: 'get_scope_document',
        kind: 'read',
        text: 'El documento en Markdown más el brief estructurado y su versión.',
      },
      {
        name: 'update_scope_section',
        kind: 'write',
        text: 'Reemplaza una sección, la valida y regenera el documento. Usa la versión leída para no pisar cambios.',
      },
      {
        name: 'approve_scope',
        kind: 'destructive',
        text: 'Aprueba la versión actual y, si está configurado el email, le manda PDF y DOCX al cliente.',
      },
      {
        name: 'export_document',
        kind: 'read',
        text: 'Link de descarga firmado y con vencimiento en PDF, DOCX o Markdown.',
      },
    ],
  },
  {
    title: 'Cambios después del alcance',
    description: 'Para que lo nuevo no entre como favor.',
    tools: [
      {
        name: 'log_change_request',
        kind: 'write',
        text: 'Registra un pedido nuevo y lo clasifica como dentro del alcance, fuera del alcance o ambiguo.',
      },
      {
        name: 'list_change_requests',
        kind: 'read',
        text: 'Lista los pedidos de cambio de un proyecto.',
      },
    ],
  },
];

export const KIND_LABEL: Record<ToolKind, string> = {
  read: 'lectura',
  write: 'escritura',
  destructive: 'pide confirmación',
};

export const TELEGRAM_COMMANDS = [
  '/createproject',
  '/projects',
  '/tldr',
  '/doc',
  '/ask',
  '/archive',
  '/help',
];

export const CLAUDE_CODE_SNIPPET = `claude mcp add --transport http scopeprofit \\
  ${MCP_ENDPOINT_PLACEHOLDER} \\
  --header "Authorization: Bearer sp_live_..."`;

export const API_KEY_SNIPPET = `pnpm --filter @scopeprofit/api run build
pnpm --filter @scopeprofit/api run mcp:keys create \\
  --telegram-id <tu-telegram-id> --label chatgpt`;

export const STDIO_SNIPPET = `{
  "mcpServers": {
    "scopeprofit": {
      "command": "node",
      "args": ["/ruta/a/ScopeProfit/apps/api/dist/src/mcp-stdio.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "ENCRYPTION_KEY": "...",
        "TELEGRAM_AUTHORIZED_USER_IDS": "123456789",
        "STORAGE_ROOT": "/ruta/a/storage",
        "PUBLIC_API_URL": "https://api.<tu-dominio>",
        "SCOPEPROFIT_API_KEY": "sp_live_..."
      }
    }
  }
}`;

export const BRIDGE_SNIPPET = `npx mcp-remote ${MCP_ENDPOINT_PLACEHOLDER} \\
  --header "Authorization: Bearer sp_live_..."`;

export const CURL_SNIPPET = `curl -s ${MCP_ENDPOINT_PLACEHOLDER} \\
  -H "Authorization: Bearer sp_live_..." \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

export const SDK_SNIPPET = `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'mi-agente', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('${MCP_ENDPOINT_PLACEHOLDER}'), {
    requestInit: { headers: { Authorization: \`Bearer \${process.env.SCOPEPROFIT_API_KEY}\` } },
  }),
);
const { tools } = await client.listTools();`;
