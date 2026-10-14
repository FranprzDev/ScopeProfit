// Static copy for the landing page. Every fact here mirrors docs/mcp.md and README.md;
// do not add pricing, user counts, metrics or hosted URLs that the product does not have.

export const REPO_URL = 'https://github.com/FranprzDev/ScopeProfit';
export const MCP_DOCS_URL = `${REPO_URL}/blob/main/docs/mcp.md`;

/** Placeholder only: each deployment exposes the MCP server at `${PUBLIC_API_URL}/api/mcp`. */
export const MCP_ENDPOINT_PLACEHOLDER = 'https://api.<tu-dominio>/api/mcp';

export enum ToolKind {
  Read = 'read',
  Write = 'write',
  Destructive = 'destructive',
}

export interface Tool {
  name: string;
  kind: ToolKind;
  text: string;
  /** Extra words a visitor might type for this tool, used only by the tool finder on the landing. */
  keywords: string[];
}

export interface ToolGroup {
  title: string;
  description: string;
  tools: Tool[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Proyectos',
    description: 'Crear, encontrar y seguir el estado de cada relevamiento.',
    tools: [
      {
        name: 'list_projects',
        kind: ToolKind.Read,
        text: 'Lista tus proyectos con estado, resumen y cuántas preguntas bloqueantes quedan.',
        keywords: ['proyectos', 'listar', 'ver', 'todos', 'estado'],
      },
      {
        name: 'create_project',
        kind: ToolKind.Write,
        text: 'Crea un proyecto nuevo con un nombre y, opcional, el email del cliente.',
        keywords: ['crear', 'proyecto', 'empezar', 'alta'],
      },
      {
        name: 'get_project',
        kind: ToolKind.Read,
        text: 'Estado del proyecto y del agente, versiones del brief y del documento. Sirve para consultar el avance.',
        keywords: ['avance', 'estado', 'versión', 'consultar', 'proyecto'],
      },
      {
        name: 'archive_project',
        kind: ToolKind.Destructive,
        text: 'Archiva y bloquea un proyecto.',
        keywords: ['archivar', 'cerrar', 'borrar', 'bloquear'],
      },
    ],
  },
  {
    title: 'Lo que dijo el cliente',
    description: 'El material original queda guardado tal cual, para poder citarlo.',
    tools: [
      {
        name: 'add_client_input',
        kind: ToolKind.Write,
        text: 'Guarda texto del cliente y/o hasta 5 imágenes públicas (JPEG, PNG o WebP, hasta 10 MB) como mensajes citables.',
        keywords: [
          'brief',
          'cargar',
          'pegar',
          'capturas',
          'imágenes',
          'mensaje',
          'cliente',
          'dijo',
        ],
      },
      {
        name: 'get_conversation',
        kind: ToolKind.Read,
        text: 'Devuelve los mensajes guardados con su id, que es lo que cita cada requerimiento.',
        keywords: ['mensajes', 'conversación', 'citas', 'cliente', 'dijo'],
      },
    ],
  },
  {
    title: 'Diagnóstico y preguntas',
    description: 'Lo que falta definir antes de poder estimar.',
    tools: [
      {
        name: 'get_tldr',
        kind: ToolKind.Read,
        text: 'Resumen corto: requerimientos, preguntas bloqueantes principales, riesgos en rojo y rango total de horas.',
        keywords: ['resumen', 'horas', 'riesgos', 'rápido', 'estimación'],
      },
      {
        name: 'list_pending_questions',
        kind: ToolKind.Read,
        text: 'Preguntas abiertas. Las que bloquean la estimación impiden aprobar.',
        keywords: ['preguntas', 'abiertas', 'dudas', 'falta', 'pendientes', 'bloqueantes'],
      },
      {
        name: 'answer_question',
        kind: ToolKind.Write,
        text: 'Guarda la respuesta del cliente, cierra la pregunta y regenera el documento.',
        keywords: ['responder', 'respuesta', 'preguntas', 'dudas', 'cliente'],
      },
    ],
  },
  {
    title: 'Documento de alcance',
    description: 'La plantilla 7.1, editable sección por sección y exportable.',
    tools: [
      {
        name: 'get_scope_document',
        kind: ToolKind.Read,
        text: 'El documento en Markdown más el brief estructurado y su versión.',
        keywords: ['documento', 'alcance', 'leer', 'markdown', 'brief'],
      },
      {
        name: 'update_scope_section',
        kind: ToolKind.Write,
        text: 'Reemplaza una sección, la valida y regenera el documento. Usa la versión leída para no pisar cambios.',
        keywords: ['editar', 'sección', 'cambiar', 'corregir', 'redactar', 'alcance'],
      },
      {
        name: 'approve_scope',
        kind: ToolKind.Destructive,
        text: 'Aprueba la versión actual y, si está configurado el email, le manda PDF y DOCX al cliente.',
        keywords: ['aprobar', 'alcance', 'enviar', 'cliente', 'email', 'pdf', 'docx'],
      },
      {
        name: 'export_document',
        kind: ToolKind.Read,
        text: 'Link de descarga firmado y con vencimiento en PDF, DOCX o Markdown.',
        keywords: ['exportar', 'descargar', 'pdf', 'word', 'docx', 'markdown', 'link'],
      },
    ],
  },
  {
    title: 'Cambios después del alcance',
    description: 'Para que lo nuevo no entre como favor.',
    tools: [
      {
        name: 'log_change_request',
        kind: ToolKind.Write,
        text: 'Registra un pedido nuevo y lo clasifica como dentro del alcance, fuera del alcance o ambiguo.',
        keywords: ['cambio', 'nuevo', 'pedido', 'pidió', 'agregar', 'extra', 'fuera'],
      },
      {
        name: 'list_change_requests',
        kind: ToolKind.Read,
        text: 'Lista los pedidos de cambio de un proyecto.',
        keywords: ['cambios', 'pedidos', 'listar', 'historial'],
      },
    ],
  },
];

export const KIND_LABEL: Record<ToolKind, string> = {
  [ToolKind.Read]: 'lectura',
  [ToolKind.Write]: 'escritura',
  [ToolKind.Destructive]: 'pide confirmación',
};

function countTools(groups: ToolGroup[]): number {
  let count = 0;
  for (const group of groups) {
    count += group.tools.length;
  }
  return count;
}

export const TOOL_COUNT = countTools(TOOL_GROUPS);

/** The three stages of a scope, sized on the landing by how many MCP tools each one uses. */
export interface Stage {
  order: string;
  clause: string;
  tools: string[];
}

export const STAGES: Stage[] = [
  {
    order: 'Primero',
    clause:
      'cargás lo que dijo el cliente: tu asistente crea el proyecto y pega el brief y las URLs de sus capturas.',
    tools: ['create_project', 'add_client_input'],
  },
  {
    order: 'Después',
    clause:
      'se arma el alcance: lo redacta el modelo de tu asistente, sin otra clave de IA, o el agente del servidor (LangGraph + Gemini) con la clave de Gemini del dueño.',
    tools: ['get_conversation', 'update_scope_section', 'get_tldr', 'list_pending_questions'],
  },
  {
    order: 'Al final',
    clause:
      'cerrás dudas, revisás la plantilla 7.1, aprobás y descargás PDF y DOCX con un link firmado.',
    tools: ['answer_question', 'get_scope_document', 'approve_scope', 'export_document'],
  },
];

export const TOOL_FINDER_EXAMPLES = [
  'exportar en PDF',
  'el cliente pidió algo nuevo',
  'preguntas abiertas',
];
export const TOOL_FINDER_DEFAULT = 'aprobar el alcance';

export interface PhotoCredit {
  file: string;
  alt: string;
  title: string;
  creator: string | null;
  license: string;
  page: string;
}

/** Open-collection pictures of the surveyor's world (scoping is surveying). None shows ScopeProfit or its users. */
export const PHOTOS = {
  plat: {
    file: '/images/survey-plat.jpg',
    alt: 'Plano de mensura manuscrito: un texto a la izquierda y, a la derecha, los límites de una parcela dibujados a mano',
    title: 'Survey plat land grants',
    creator: null,
    license: 'CC0',
    page: 'https://www.rawpixel.com/image/8905250/image-faces-vintage-book',
  },
  map: {
    file: '/images/survey-map.jpg',
    alt: 'Mapa de 1866 que muestra hasta dónde llegaban los relevamientos públicos de tierras',
    title: 'Map of the United States and territories, shewing the extent of public surveys (1866)',
    creator: 'Jos. S. Wilson, Theodore Franks',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/w/index.php?curid=150439922',
  },
  surveyor: {
    file: '/images/surveyor.jpg',
    alt: 'Diorama de un agrimensor midiendo con un teodolito bajo una sombrilla',
    title: 'SAM PC 1 - Surveyor with Hildebrand theodolite diorama',
    creator: null,
    license: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/w/index.php?curid=8725431',
  },
  theodolite: {
    file: '/images/theodolite.jpg',
    alt: 'Teodolito antiguo de bronce y hierro en una vitrina de museo',
    title: 'Theodolite 1',
    creator: 'Brahmavadini',
    license: 'CC BY 4.0',
    page: 'https://commons.wikimedia.org/w/index.php?curid=190591138',
  },
} satisfies Record<string, PhotoCredit>;

export interface FaqEntry {
  question: string;
  answer: string;
}

export const TELEGRAM_FAQ: FaqEntry = {
  question: '¿Qué hacés desde el bot?',
  answer:
    'Creás y listás proyectos, mirás el resumen y el documento, mandás texto o imágenes, archivás y aprobás o rechazás con los botones del bot.',
};

/** Every question answered on the landing. The FAQPage structured data is built from this list only. */
export const FAQ_ENTRIES: FaqEntry[] = [TELEGRAM_FAQ];

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
