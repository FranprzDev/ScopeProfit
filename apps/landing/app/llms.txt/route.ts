/**
 * llms.txt (https://llmstxt.org): a Markdown brief for AI crawlers and agents.
 * Every fact here mirrors README.md, docs/mcp.md and app/docs/page.tsx.
 */
export const dynamic = 'force-static';

const BODY = `# ScopeProfit

> ScopeProfit is an open-source MCP server that gives AI agents the tools to turn client requests into a clear scope document and a quote with your own rates, exportable to PDF and Word. There is no web UI: the product is the MCP itself.

A public hosted instance is available. You connect your agent (ChatGPT, Claude, Claude Code, Cursor or any MCP client) to the remote MCP endpoint, authorize it, and the agent gains 20 tools for scoping and quoting projects. Self-hosting with Docker Compose is also supported.

## Docs

- [Developer documentation](https://scopeprofit.vercel.app/docs): what it is, how to connect, the 20 tools with real examples, typical flow, known limits
- [GitHub repository](https://github.com/FranprzDev/ScopeProfit): source code (MIT-style open source), README and docs/mcp.md
- [MCP setup guide](https://github.com/FranprzDev/ScopeProfit/blob/main/docs/mcp.md): per-client recipes (ChatGPT OAuth, Claude connector, Claude Code header, local stdio) and the eight-call quickstart

## Connect

- MCP endpoint (Streamable HTTP): https://scopeprofit-mcp.franutn23.workers.dev/api/mcp
- Auth: OAuth 2.1 (dynamic client registration + PKCE) for ChatGPT and Claude connectors, or an API key as "Authorization: Bearer sp_live_..."; API keys are issued by the installation operator
- Projects are isolated per account; the server is stateless (POST JSON, no SSE sessions)

## Tools

create_project, list_projects, get_project, archive_project, add_client_input, get_input_image, get_tldr, list_pending_questions, answer_question, get_scope_document, update_scope_section, approve_scope, export_document, log_change_request, list_change_requests, get_conversation, get_quote, save_quote, export_quote, decide_quote

## Typical flow

1. create_project with a title
2. add_client_input with the client's request (plain language, optional image URLs)
3. get_tldr and list_pending_questions, then answer_question until nothing is pending
4. get_scope_document to review; adjust with update_scope_section
5. approve_scope to lock the reviewed version (returns a signed Markdown link)
6. export_document (pdf or docx) for a signed download link
7. save_quote with lines and payment milestones, export_quote, then decide_quote when the client answers

Change requests after approval go through log_change_request; scope edits use expected_version for optimistic concurrency. Signed download links expire (default 60 minutes): request a fresh one with export_document or export_quote.
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}
