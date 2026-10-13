# Repository typing conventions

- Use Prisma-generated enums for closed domain values; do not compare domain status strings to inline arrays.
- Do not introduce `any` in application or test code. Use the existing domain type, a Prisma payload type, a specific DTO, `unknown`, or a validated type guard.
- Run the relevant typecheck and tests after changing types.

# UI and landing work

- Any UI work (the landing in `apps/landing`, any public page, hero, section, restyle, polish or design review) must follow the `design-taste-frontend` skill (Taste Skill v2) installed in `.agents/skills/design-taste-frontend` (symlinked for Claude Code in `.claude/skills`). Load its `SKILL.md` before writing UI code and run its steps: brief and subject inventory, argument, `draw.mjs` direction, idea sentence, copy deck, build, `lint.mjs` + `inspect.mjs` gate, screenshot critique, motion layer, report.
- Run the scripts from the repo root, e.g. `node .agents/skills/design-taste-frontend/scripts/lint.mjs apps/landing/app` and `node .agents/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3000`. They need Node 22+ and a local Chrome/Chromium. Working files land in `.taste-skill/` (gitignored); commit the chosen direction and credits under `docs/design/` instead.
- The skill's house rules apply to every UI change (no eyebrows, gradients, resting shadows, monospace labels, index numbering, hairline rules, glass or icon-card grids). Keep the MCP-first product message; never invent customers, quotes, logos or metrics.
- Update the skill with `npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -y`; `skills-lock.json` pins its hash.
