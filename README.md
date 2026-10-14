# Scope-to-Profit

**Scope copilot for freelancers and software agencies.** It turns a client's messy idea (loose text, screenshots, "I want something simple but…") into a formal, versioned scope brief and the fixed **template 7.1** document (Markdown, PDF and editable DOCX). There is no pricing or quoting: estimates are hour ranges only.

> **Source of truth:** `docs/scope-to-profit.md` (product scope). API reference: `/api/docs` on any deployment.

## What it produces

- requirements (functional / non-functional) with a verbatim source quote
- blocking questions
- risks with a traffic light
- scope (included / excluded / assumptions / acceptance criteria)
- hour-range estimate (no prices)
- next steps

## Architecture

```
REST clients · MCP hosts (ChatGPT, Claude, …) · Telegram
                │ HTTPS (Bearer API key / OAuth token)
                ▼
      FastAPI backend (apps/api) ── optional scope agent via Vercel AI Gateway
                │
           PostgreSQL (data + stored files)
```

- **Backend (`apps/api`)** — Python 3.12, FastAPI, SQLAlchemy 2 (async) + Alembic, Pydantic v2. Keeps the versioned brief, renders template 7.1 (reportlab PDF, python-docx DOCX), serves signed export links and runs the optional scope agent. Files are stored in PostgreSQL so the API runs on serverless hosts (Vercel) as well as on a server (Docker).
- **Landing (`apps/landing`)** — static Next.js marketing page.

## Quick start (local)

```bash
cd apps/api
uv sync
cp ../../.env.example .env        # fill DATABASE_URL, PUBLIC_API_URL, SIGNING_KEY, DATABASE_POOL, AGENT_MODE
set -a; . ./.env; set +a
uv run scopeprofit db upgrade     # applies Alembic migrations (adopts databases created by the old Prisma backend)
uv run scopeprofit keys create --email you@example.com --label local
uv run uvicorn scopeprofit.api.app:create_app --factory --port 3001
```

OpenAPI docs: <http://localhost:3001/api/docs>. Self-hosted alternative: `docker compose up -d --build` (PostgreSQL with daily backups, API, landing).

## Commands (`apps/api`)

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy                       # strict
TEST_DATABASE_URL=postgresql://… uv run pytest --cov
uv run scopeprofit keys list | create | revoke <id>
```

## Version status

- **v1 — delivered:** projects, structured versioned brief, AI agent, template 7.1, PDF/DOCX, approval and delivery.
- **v2 — delivered:** brief diff, change-request log and classification, strict domain types.
- **v3 pricing, quotes and maintenance — removed** (2026-10-14). Migration `0002` drops their tables.
- **Python backend — this release:** NestJS/Prisma replaced by FastAPI/SQLAlchemy with per-user data isolation.

## Docs

- `docs/scope-to-profit.md` — product concept and scope (source of truth)
- `docs/technical-plan.md` — original v1 technical plan (historical)
- `docs/production-launch-checklist.md` — production checklist
