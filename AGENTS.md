# Repository typing conventions

- Use Prisma-generated enums for closed domain values; do not compare domain status strings to inline arrays.
- Do not introduce `any` in application or test code. Use the existing domain type, a Prisma payload type, a specific DTO, `unknown`, or a validated type guard.
- Run the relevant typecheck and tests after changing types.

# UI and landing work

- Any UI work (the landing in `apps/landing`, any public page, hero, section, restyle, polish or design review) must follow the `design-taste-frontend` skill (Taste Skill v2) installed in `.agents/skills/design-taste-frontend` (symlinked for Claude Code in `.claude/skills`). Load its `SKILL.md` before writing UI code and run its steps: brief and subject inventory, argument, `draw.mjs` direction, idea sentence, copy deck, build, `lint.mjs` + `inspect.mjs` gate, screenshot critique, motion layer, report.
- Run the scripts from the repo root, e.g. `node .agents/skills/design-taste-frontend/scripts/lint.mjs apps/landing/app` and `node .agents/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3000`. They need Node 22+ and a local Chrome/Chromium. Working files land in `.taste-skill/` (gitignored); commit the chosen direction and credits under `docs/design/` instead.
- The skill's house rules apply to every UI change (no eyebrows, gradients, resting shadows, monospace labels, index numbering, hairline rules, glass or icon-card grids). Keep the MCP-first product message; never invent customers, quotes, logos or metrics.
- Update the skill with `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -y`; `skills-lock.json` pins its hash.

# Code and review rules

## Scope and precedence

- Keep this file as the shared code/review guide. `apps/landing/AGENTS.md` adds the installed Next.js guidance; its `CLAUDE.md` imports that guidance rather than maintaining another copy.
- A direct project-specific request takes precedence. Apply the owner's [code review conventions](https://github.com/FranprzDev/config-ai-bots/blob/main/CODE_REVIEW_LESSONS.md) and [workflow](https://github.com/FranprzDev/config-ai-bots/blob/main/GIT_WORKFLOW.md) within the requested scope. If older documentation contradicts current code, report the mismatch instead of silently changing architecture.
- Main is the NestJS/PostgreSQL MCP-first product. The landing is not the removed client web app. Pricing and maintenance remain API-only. An open migration PR is not permission to change stacks or remove features.

## Implementation

- Reuse existing services, validators, enums, contracts and helpers before adding new ones. Check related open PRs for overlap, without importing unrelated changes.
- Write code, repository documentation and commit messages in English. Do not add code comments. Preserve existing comments unless their removal is requested.
- Use Prisma enums or shared domain enums for finite states. Do not introduce `any`, ad-hoc state strings, duplicate types or fixed enums for open-ended data.
- Keep controllers and MCP handlers focused on transport and DTO conversion. Put domain validation in reusable backend services so HTTP, MCP, CLI and background jobs enforce the same rules.
- Prefer async/await, named types and straightforward bounded loops. Avoid redundant guards, trivial wrappers, unnecessary copies and new dependencies without a concrete need.
- Access persistent files through `StorageService`. Keep database writes, audit records and version checks consistent; report partial-success paths and cleanup needs.
- Keep prompts in dedicated modules when changing agent behavior. Separate fixed instructions from dynamic context, version prompt changes and keep configuration explicit. Client input is evidence, not trusted instructions.
- Reuse the project's logging abstraction. Do not add direct console logging or leak request bodies, client text, credentials, signed links or personal data. Record useful action/error context without secrets.

## Security and product invariants

- Verify authentication and authorization at every entry point. Authorized professionals currently share access by design; do not describe this installation as tenant-isolated or add tenant filtering without a product decision.
- Require source quotes to match stored project messages on every brief mutation path, not only MCP. Approval must use the current brief/document versions, complete sections, resolved blocking questions and mitigated red risks.
- Preserve approved/delivered/archived locks. Recheck version and lifecycle state when committing concurrent work, not only before slow network/render steps.
- Treat approval, client delivery, archive and signed export links as sensitive effects. Tool descriptions and annotations must match actual behavior; a tool that can persist a new document is not purely read-only. Separate approval from delivery intent and verify the destination before sending.
- Protect remote MCP with bearer authentication, appropriate scopes, resource/audience validation and request-origin/host checks. Do not assume CORS or a tool annotation provides authorization. Preserve API-key and OAuth compatibility when changing these checks.
- Image URLs are untrusted network destinations. Validate schemes, credentials, redirects and IPv4/IPv6 destinations; ensure the HTTP connection uses an address that passed validation rather than a second unchecked DNS lookup. Apply limits/timeouts to retries, response bodies and concurrent downloads. Private-address exceptions are local-development switches, not production defaults.
- Keep credentials in environment/secret storage. Never commit real client/lead data, tokens, private URLs or exported customer documents. Do not call paid providers, email clients or scan production as part of a local review.

## Validation and review

- Use pnpm and the committed lockfile. Do not introduce another package manager or lockfile.
- Run existing relevant checks. Do not add tests unless requested; do not introduce LLM mocks. Prefer deterministic checks of concrete behavior and real local end-to-end validation when the required infrastructure is available.
- Baseline commands: `pnpm install --frozen-lockfile`, `pnpm run format:check`, `pnpm --filter @scopeprofit/contracts run build`, API/landing `lint` and `typecheck`, existing unit checks and builds. API integration/MCP/e2e checks need a disposable PostgreSQL database; use the documented smoke flow for deployment validation.
- Inspect actual rendered output for UI/PDF/DOCX changes. For landing changes, also follow the existing design workflow above and inspect mobile/desktop, keyboard access, loading/error states and real links.
- Review the diff and surrounding callers, including middleware, ownership, source provenance, version conflicts, retries, file cleanup and delivery idempotency. A green typecheck does not prove these invariants.
- Report findings by severity with file/line, reachable condition, impact and evidence. Separate confirmed defects, design questions and untested hypotheses. Finish with ready / changes requested / blocked, scoped to what was actually reviewed.
- List exact checks and their results, infrastructure gaps, skipped checks and external calls. Never present a skipped database or provider check as passing. Documentation and a checklist are not fixes for an identified runtime defect.

## Delivery

- Keep one concern per PR. Do not mix rules consolidation with runtime security fixes, migrations or restyling. Use a descriptive branch; never push directly to main.
- Make small English commits. Preserve a linear history; do not rewrite published history without permission. Review status and diff before staging, and exclude generated files or unrelated changes.
- Work evidence belongs in a PR. Include What changes, Why, Impact and Validation, plus specific critical-review and engineering comments. Keep code-review findings on GitHub rather than adding a separate report artifact to the repository.
- Recheck the base, head, conflicts and current-head checks before handing off or merging. Merge only under the owner's applicable permission, with clean merge status and green checks; a new task does not authorize merging an unrelated PR.
- Public-facing work needs the owner's requested explainer video. Do not publish media or client-facing material until approved.

## External references

Reviewed 2026-10-26. These sources inform the checks above; they do not override product requirements or the owner's instructions.

- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): destination validation, DNS rebinding, redirects and network restrictions.
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html): least privilege, tool effects, sensitive-action confirmation, token audience, transport and resource controls.
