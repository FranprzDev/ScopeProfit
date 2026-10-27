# ScopeProfit MCP server

ScopeProfit runs as a [Model Context Protocol](https://modelcontextprotocol.io) server. Any MCP host (ChatGPT, Claude, Cursor, a Grok/xAI bot, an internal agent built with the OpenAI or Anthropic SDK, etc.) can create scoping projects, feed in what the client said, read and edit the template 7.1 document, approve it and export PDF/DOCX.

- **Remote:** Streamable HTTP at `POST {PUBLIC_API_URL}/api/mcp` (stateless, JSON responses).
- **Local:** stdio, `pnpm --filter @scopeprofit/api run mcp:stdio`.
- **Implementation:** xmcp 1.9 file-based tools with the NestJS HTTP adapter and stdio runtime. The official TypeScript SDK supplies the existing OAuth middleware; code is in `apps/api/src/modules/mcp/`.

## Tools

| Tool                     | Kind        | What it does                                                                                                     |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `list_projects`          | read        | Projects with status, TLDR and blocking-question count (archived hidden unless asked).                           |
| `create_project`         | write       | New project (`name`, optional `client_email`).                                                                   |
| `get_project`            | read        | Lifecycle + agent status, brief/document versions, counts. Use it to poll.                                       |
| `add_client_input`       | write       | Client text and/or public image URLs (JPEG/PNG/WebP, ≤10 MB, ≤5), stored verbatim as citable messages.           |
| `get_conversation`       | read        | Stored messages with ids (needed to cite requirement sources).                                                   |
| `get_tldr`               | read        | Summary, requirement count, top blocking questions, red risks, total hour range.                                 |
| `list_pending_questions` | read        | Open questions; `blocksEstimate=true` blocks approval.                                                           |
| `answer_question`        | write       | Stores the client's answer as a message, removes the question, regenerates the document.                         |
| `get_scope_document`     | read        | Template 7.1 rendered as Markdown + structured brief + `briefVersion`.                                           |
| `update_scope_section`   | write       | Replaces one section (optimistic lock on `expected_version`), validates it, saves a document draft.              |
| `approve_scope`          | destructive | Approves the current document version without email by default; explicit send_to_client:true delivers via Brevo. |
| `export_document`        | write       | Signed, expiring download URL for `pdf`, `docx` or `md`; can regenerate and persist the document.                |
| `archive_project`        | destructive | Archives (locks) a project.                                                                                      |
| `log_change_request`     | write       | Logs a post-scope change, classified `in_scope` / `out_of_scope` / `ambiguous`.                                  |
| `list_change_requests`   | read        | Change requests of a project.                                                                                    |

Domain errors come back as tool results with `isError: true` and a stable code (`VERSION_CONFLICT`, `PROJECT_LOCKED`, `ESTIMATE_BLOCKED`, `INVALID_REQUIREMENT_SOURCE`, …) so the model can recover. Tools carry `readOnlyHint` / `destructiveHint` annotations so hosts can skip or require confirmation.

### Two ways to fill the scope

1. **Host LLM drafts the scope** (no extra AI key): call `add_client_input` with `analyze: false`, then fill sections with `update_scope_section`. Requirements are rejected unless `source` is an exact quote of the message referenced by `sourceMessageId`.
2. **Server-side agent** (LangGraph + Gemini, as in v1): keep `analyze: true`; the background worker re-diagnoses the project. Requires the owner's Gemini key (`mcp:keys set-ai-key`) and `AI_GATEWAY_API_KEY`. Poll `get_project` until `agentStatus` is `idle`.

## Authentication

Every request needs `Authorization: Bearer <token>`. Two token types are accepted:

- **API key** (`sp_live_…`) — for agents, SDKs, Claude Code, Claude connectors with request headers, the OpenAI Responses API, etc.
- **OAuth 2.1 access token** (`sp_at_…`) — for hosts that only support OAuth (ChatGPT). The server is its own authorization server: dynamic client registration (`/register`), PKCE (`S256`) authorization code flow (`/authorize` → consent page → `/token`), refresh-token rotation and revocation (`/revoke`). Discovery: `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server`. On the consent page the professional pastes an API key; the OAuth grant is bound to that key, so revoking the key cuts every connector that used it.

Manage API keys from a trusted server shell. This local CLI provisions the professional role; it is not a public registration endpoint. Knowing an email or requesting a magic link does not grant this role. API keys and OAuth still authenticate every MCP request. To remove a professional's access, revoke their keys or change their role in the installation; removing an environment entry is no longer an access-control mechanism:

```bash
pnpm --filter @scopeprofit/api run build
pnpm --filter @scopeprofit/api run mcp:keys create --email you@example.com --label chatgpt
pnpm --filter @scopeprofit/api run mcp:keys list
pnpm --filter @scopeprofit/api run mcp:keys revoke <key-id>
SCOPEPROFIT_AI_KEY=<gemini-key> pnpm --filter @scopeprofit/api run mcp:keys set-ai-key --email you@example.com
```

Only SHA-256 hashes of keys and tokens are stored.

## Connecting clients

Replace `https://api.example.com` with your `PUBLIC_API_URL`.

### ChatGPT (developer mode / Apps)

ChatGPT custom connectors support OAuth or no auth (no static header field), so use OAuth:

1. In ChatGPT open **Settings → Apps & Connectors → Advanced** and enable **Developer mode** (paid plan; on Business/Enterprise/Edu a workspace admin must allow custom connectors). Labels change between ChatGPT releases; look for "Create" / "Add custom connector".
2. Create a connector: name `ScopeProfit`, MCP server URL `https://api.example.com/api/mcp`, authentication **OAuth**. Leave client id/secret empty: ChatGPT registers itself via `/register`.
3. ChatGPT opens the ScopeProfit consent page: paste an API key created with `mcp:keys create` and click **Allow access**.
4. In a chat, enable the connector and ask, for example: _"Create a ScopeProfit project for Acme's booking app and add this client brief: …"_.

### Claude (claude.ai / Claude Desktop connectors)

**Settings → Connectors → Add custom connector**, URL `https://api.example.com/api/mcp`. Either leave OAuth on (same consent page as ChatGPT) or, where your plan offers **Request headers**, set `Authorization: Bearer sp_live_…`.

### Claude Code

```bash
claude mcp add --transport http scopeprofit https://api.example.com/api/mcp \
  --header "Authorization: Bearer sp_live_..."
```

### Claude Desktop / Cursor / any stdio host (local)

Runs the tools in-process against your database:

```json
{
  "mcpServers": {
    "scopeprofit": {
      "command": "node",
      "args": ["/path/to/ScopeProfit/apps/api/dist/src/mcp-stdio.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "ENCRYPTION_KEY": "...",
        "STORAGE_ROOT": "/path/to/storage",
        "PUBLIC_API_URL": "https://api.example.com",
        "SCOPEPROFIT_API_KEY": "sp_live_..."
      }
    }
  }
}
```

To use the remote server from a stdio-only host, bridge it: `npx mcp-remote https://api.example.com/api/mcp --header "Authorization: Bearer sp_live_..."`.

### OpenAI Responses API / Agents SDK

```ts
const response = await openai.responses.create({
  model: process.env.OPENAI_MODEL!, // any model that supports remote MCP tools
  tools: [
    {
      type: 'mcp',
      server_label: 'scopeprofit',
      server_url: 'https://api.example.com/api/mcp',
      headers: { Authorization: `Bearer ${process.env.SCOPEPROFIT_API_KEY}` },
      require_approval: 'never',
    },
  ],
  input: 'List my ScopeProfit projects with blocking questions.',
});
```

### Generic MCP client (TypeScript SDK)

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(
  new StreamableHTTPClientTransport(new URL('https://api.example.com/api/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.SCOPEPROFIT_API_KEY}` } },
  }),
);
const { tools } = await client.listTools();
```

### Raw HTTP

```bash
curl -s https://api.example.com/api/mcp \
  -H "Authorization: Bearer sp_live_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### MCP Inspector

`npx @modelcontextprotocol/inspector` → transport _Streamable HTTP_, URL `https://api.example.com/api/mcp`, header `Authorization: Bearer sp_live_…` (or the stdio command above).

## Deployment requirements

- The API must be reachable **directly** over HTTPS at `PUBLIC_API_URL` (e.g. `https://api.example.com`). OAuth discovery and endpoints live at the origin root (`/.well-known/*`, `/authorize`, `/token`, `/register`, `/revoke`, `/oauth/consent`), so the API needs its own origin (there is no web app proxying `/api/*` anymore).
- Behind a reverse proxy set `TRUST_PROXY_HOPS` (usually `1`) so rate limits see client IPs.
- `STORAGE_ROOT` must be a persistent volume (uploads and generated PDF/DOCX).
- Optional: `MCP_RATE_LIMIT_PER_MINUTE` (default 120 per IP), `MCP_EXPORT_URL_TTL_MINUTES` (default 60), `DIAGRAM_STYLE` (default `clean`; set `sketch` for hand-drawn pencil-style diagrams in exported PDF/DOCX documents).
- Image URLs are fetched server-side with SSRF guards (public addresses only, https only, ≤3 redirects, ≤10 MB, image content types, re-validated with `sharp`). `MCP_ALLOW_HTTP_IMAGE_URLS` / `MCP_ALLOW_PRIVATE_IMAGE_URLS` exist for local testing only; never enable them in production.

## Approval is separate from delivery

`approve_scope` defaults to approval only: it locks the reviewed document and returns export links without emailing anyone. Pass `send_to_client: true` only after the professional confirms delivery and the client email. Existing clients relying on the old implicit email behavior must now set this flag explicitly. API keys and OAuth do not themselves authorize client communication. REST document approval behavior is unchanged.

## Optional quotation validity

The scope document can include a professional's commercial validity policy without
calculating a price. Use `update_scope_section` with `section: "quoteValidity"` and
`value: {"issuedOn": "2026-10-26", "days": 7}`. The issuance date must be explicit;
exporting the same brief again never starts a new validity period. Seven days is
an example policy, not a default for every professional. Any whole duration from
1 to 3650 days is supported. Set `value: null` to remove the section from an
editable brief.

The section appears in the Markdown, PDF and DOCX scope exports. It explains that
a quotation depends on the professional's availability and project workload;
after expiry it must be quoted again and the price may rise or fall. It never
changes prices automatically or changes an accepted quotation. Existing briefs
without this field keep their current output. Approved, delivered and archived
projects retain the existing edit lock. AI reanalysis preserves the policy set
by the professional instead of inventing or replacing it.

This is a commercial note in the scope document, not a price calculation,
a quotation acceptance workflow, or a change to the legacy v3 quote endpoints.

## Implementation and build

The 15 scope tools are file-based xmcp modules in `apps/api/src/modules/mcp/tools`. HTTP uses the xmcp NestJS adapter behind the existing bearer/OAuth middleware; stdio runs the same compiled tools after verifying `SCOPEPROFIT_API_KEY`. Domain services and Prisma remain unchanged. `export_document` is marked as a write because it can regenerate and persist a document.

`pnpm --filter @scopeprofit/api run build` runs Prisma generation, xmcp compilation and TypeScript compilation. Keep the generated `apps/api/.xmcp/adapter` directory alongside `dist` when deploying outside Docker. It is a build artifact, not committed source. OAuth grants are bound to the MCP resource URL and require the scope permission. Older tokens without the correct resource need a fresh connector authorization; API keys remain valid. Browser requests with a present invalid Origin are rejected; non-browser clients may omit Origin. HTTP request context is isolated per request; the stdio process binds one authenticated professional for its entire lifetime. Never mount that stdio context in a shared HTTP process.

## Drafts and export files

Updating a section or answering a question saves the brief and a document snapshot in one transaction. The document version still advances, but PDF/DOCX are not rendered while filling sections. `get_scope_document` returns the current Markdown preview without writing export files. Background reanalysis also saves a draft instead of rendering exports.

The first export or download materializes the saved snapshot. A Markdown-only export writes only Markdown; a PDF or DOCX export builds and stores all three formats together. Later exports reuse those files without creating another document version. A failed export leaves the draft intact and can be retried. Historical downloads use their saved snapshot, not the current brief. Approval still validates the selected current version and locks the project; emailing an approved scope generates its attachments if needed.
