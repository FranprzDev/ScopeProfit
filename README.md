# Scope-to-Profit

**Scope copilot for freelancers and software agencies, exposed as an MCP server.** It turns a client's messy idea (loose text, screenshots, "I want something simple but…") into a formal, versioned scope document that any AI agent can drive.

> **Source of truth:** `docs/scope-to-profit.md` (product scope v1/v2 and the current MCP-first architecture). MCP setup and tool reference: `docs/mcp.md`.

## What it produces

- requirements (functional / non-functional) with a verbatim source quote
- blocking questions
- risks with a traffic light
- scope (included / excluded / assumptions / acceptance criteria)
- hour-range estimate (no prices)
- next steps

All of it in the fixed **template 7.1**, exported to Markdown, PDF and editable DOCX.

## Architecture (MCP-first)

```
ChatGPT · Claude · Cursor · Grok bots · custom agents      Telegram (optional, professional)
                │  MCP (Streamable HTTP / stdio)                       │ webhook
                ▼                                                      ▼
        Backend API (NestJS) ── scope tools ── LangGraph agent (optional) ── PostgreSQL + persistent storage
```

- **MCP server (primary interface)** — `POST /api/mcp` (Streamable HTTP, stateless) and a stdio entrypoint for local hosts. 15 tools: `create_project`, `add_client_input` (text + image URLs), `get_tldr`, `get_scope_document`, `list_pending_questions`, `answer_question`, `update_scope_section`, `approve_scope`, `export_document`, `list_projects`, `archive_project`, `get_project`, `get_conversation`, `log_change_request`, `list_change_requests`.
- **Auth** — `Authorization: Bearer` with a ScopeProfit API key, or OAuth 2.1 (dynamic client registration + PKCE) for ChatGPT-style connectors. See `docs/mcp.md`.
- **Backend API** — the only component with database and file-system access. Keeps the versioned Brief (PostgreSQL), renders template 7.1 and the PDF/DOCX artifacts, and runs the optional server-side scope agent.
- **Telegram bot** — still supported for the professional (`/createproject`, `/projects`, `/tldr`, `/doc`, `/ask`, `/archive`, `/help`, approve/reject buttons). Talks only to `POST /api/telegram/webhook`.
- **Landing (`apps/landing`)** — static marketing page that explains the MCP-first product and how to connect each client. There is no web app anymore: the Next.js client chat (`apps/app`) was removed; the client conversation now happens in whatever agent uses the MCP server.

## Quick start (local)

```bash
pnpm install
cp .env.example .env              # fill DATABASE_URL, ENCRYPTION_KEY, TELEGRAM_AUTHORIZED_USER_IDS, PUBLIC_API_URL
pnpm --filter @scopeprofit/contracts run build
pnpm run db:migrate
pnpm --filter @scopeprofit/api run build
pnpm --filter @scopeprofit/api run mcp:keys create --telegram-id <your-telegram-id> --label local
pnpm run dev:api                  # MCP endpoint at http://localhost:3001/api/mcp
pnpm run dev:landing              # landing at http://localhost:3000
```

Then connect a client as described in `docs/mcp.md` (ChatGPT, Claude, Claude Code, Cursor, OpenAI Responses API, MCP Inspector, raw HTTP).

## Typical flow

1. `create_project` → `add_client_input` with the client's words and image URLs.
2. Either the host LLM drafts the scope with `update_scope_section` (every requirement must quote a stored message), or the server agent does it in the background (`analyze: true`, needs the owner's Gemini key).
3. `get_tldr` / `list_pending_questions` → `answer_question` until nothing blocks the estimate.
4. `get_scope_document` to review template 7.1 → `approve_scope` (emails PDF + DOCX to the client when Brevo is configured) → `export_document` for a signed download link.

## Stack

- **API:** NestJS 11 (Node 22, TypeScript), Prisma 6 + PostgreSQL 17
- **MCP:** xmcp 1.9 (file-based tools, Streamable HTTP + stdio) with the existing OAuth 2.1 authorization server
- **Agent (optional):** LangGraph + LangChain JS with Gemini; clarification gate via Vercel AI Gateway
- **Documents:** structured Brief → Markdown, `pdfkit` → PDF, `docx` → DOCX
- **Email:** Brevo (approved document delivery)
- **Bot:** grammY webhook with `secret_token`
- **Quality:** unit, integration, MCP (SDK client over xmcp HTTP) and e2e (HTTP, OAuth, stdio) tests on real PostgreSQL; separate backend and landing CI pipelines
- **Deploy:** Docker Compose with PostgreSQL and persistent volumes

## Commands

```bash
pnpm --filter @scopeprofit/api run lint
pnpm --filter @scopeprofit/api run typecheck
pnpm --filter @scopeprofit/api run test        # unit + integration + mcp + e2e (needs DATABASE_URL)
pnpm --filter @scopeprofit/api run build
pnpm --filter @scopeprofit/api run mcp:stdio   # local stdio server (needs SCOPEPROFIT_API_KEY)
pnpm run production:preflight
```

## Version status

- **v1 — delivered:** projects, Telegram, structured versioned Brief, AI agent, template 7.1, PDF/DOCX, approval and delivery.
- **v2 — delivered:** Brief diff, change-request log and classification, strict domain types.
- **v3 (pricing, quotes, maintenance) — API only.** Its UI lived in the removed web app; it is not exposed as MCP tools yet. See `docs/v3-api-access.md` for how to reach it today.
- **MCP-first — this release:** MCP server, API keys, OAuth for ChatGPT/Claude connectors, signed exports; web app removed, landing rewritten.

## Docs

- `docs/scope-to-profit.md` — product concept, scope and architecture (source of truth)
- `docs/mcp.md` — MCP tools, auth and client setup
- `docs/v3-api-access.md` — how to reach the v3 quote, rate-card and maintenance endpoints without a UI
- `docs/technical-plan.md` — original v1 technical plan (historical; the web client it describes was removed)
- `docs/production-launch-checklist.md` — production checklist
