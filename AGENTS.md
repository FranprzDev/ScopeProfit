# Repository typing conventions

- Backend (`apps/api`, Python): every closed domain is a `StrEnum` in `scopeprofit/enums.py`; do not compare status strings to inline literals or lists.
- Do not introduce `Any` (Python) or `any` (TypeScript). Use the domain model, a Pydantic model, `object` plus a validated narrowing, or a precise type.
- `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest --cov` must pass in `apps/api` (mypy runs in strict mode).
- Landing (`apps/landing`, TypeScript): run its lint, typecheck and build after changing types.

# UI and landing work

- Any UI work (the landing in `apps/landing`, any public page, hero, section, restyle, polish or design review) must follow the `design-taste-frontend` skill (Taste Skill v2) installed in `.agents/skills/design-taste-frontend` (symlinked for Claude Code in `.claude/skills`). Load its `SKILL.md` before writing UI code and run its steps: brief and subject inventory, argument, `draw.mjs` direction, idea sentence, copy deck, build, `lint.mjs` + `inspect.mjs` gate, screenshot critique, motion layer, report.
- Run the scripts from the repo root, e.g. `node .agents/skills/design-taste-frontend/scripts/lint.mjs apps/landing/app` and `node .agents/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3000`. They need Node 22+ and a local Chrome/Chromium. Working files land in `.taste-skill/` (gitignored); commit the chosen direction and credits under `docs/design/` instead.
- The skill's house rules apply to every UI change (no eyebrows, gradients, resting shadows, monospace labels, index numbering, hairline rules, glass or icon-card grids). Keep the MCP-first product message; never invent customers, quotes, logos or metrics.
- Update the skill with `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -y`; `skills-lock.json` pins its hash.
