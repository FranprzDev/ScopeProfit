# Landing design direction

The landing (`apps/landing`) follows the `design-taste-frontend` skill (Taste Skill v2, `.agents/skills/design-taste-frontend`). This file records the decisions so later UI work keeps them. Re-read it, and the skill, before changing the page.

## Brief

- Subject: ScopeProfit, an MCP server that turns a client's messy request into a versioned scope document (template 7.1) with verbatim-quoted requirements, blocking questions, risks with a traffic light and an hour range, never a price.
- Audience: freelancers and software agencies who already work inside ChatGPT, Claude, Cursor or their own agent.
- The one action: connect the MCP server (endpoint plus `sp_live_…` API key), documented in `docs/mcp.md`.
- Imagery that truly exists: no product screenshots, no photographs of our own. The product's own interface is shown as HTML fragments marked `data-ui`; real pictures come from open collections.

## Subject inventory

1. The name: scope to profit, closing the scope before quoting.
2. Requirements quote the client word for word; the server rejects a quote that does not match.
3. Blocking questions stop approval; red risks need mitigation.
4. The estimate is an hour range per module, never a price.
5. Fixed template 7.1, exported to Markdown, PDF and editable Word.
6. 15 MCP tools, each marked read, write or destructive.
7. API keys `sp_live_…`, stored as a hash, tied to an authorized professional email.
8. Works over Streamable HTTP and stdio; OAuth 2.1 consent screen for ChatGPT and Claude.
9. In Spanish, scoping is a _relevamiento_, the same word as a land survey.

## Argument (one claim per section)

| Section      | Claim                                                          | Proof on the page                                          |
| ------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Hero         | Close the scope before quoting, from the agent you already use | The headline and the supporting sentence                   |
| How it works | Three stages, one document                                     | The stage bar sized by the tools each stage uses           |
| What it does | Every requirement is quoted, gaps become blocking questions    | The statement with picture words and the four detail notes |
| The plat     | A scope does for a project what a survey plat does for land    | The survey plat, full width                                |
| Tools        | 15 tools, one per task, each marked by what it may change      | The full tool table                                        |
| Tool finder  | Your assistant picks the right tool for what you ask           | The live input over the real tool catalogue                |
| Connect      | One URL and one API key                                        | The endpoint and the setup steps and snippets per client   |
| Footer       | Every setting is documented step by step                       | The link to `docs/mcp.md`                                  |

## Direction (dealt by `draw.mjs`)

```bash
node .agents/skills/design-taste-frontend/scripts/draw.mjs --sector dev-tool \
  --brief "ScopeProfit: an MCP server that turns a client's messy request into a versioned scope document with quoted requirements, blocking questions, risks and an hour range, used from ChatGPT, Claude, Cursor or any agent" \
  --sections how-it-works,features,list,showcase,contact,footer --have product-ui --direction sentence-as-layout
```

- Options dealt: `type-only-statement`, `sentence-as-layout`, `dense-tiles`. Chosen: **`sentence-as-layout` (The sentence is the layout), seed 509174404**, because the product's core rule is a sentence that carries its evidence (a requirement with its verbatim quote), which is exactly this direction's device.
- Hero: Headline across two fields. Type: Libre Franklin 700 (display) over Source Serif 4 (text). Palette: cool grey `#eef0f3`, surface `#e2e5ea`, ink `#0b0c0e`, cobalt `#1f2de6`.
- Sections: how-it-works (Stages as one bar), features (Paragraph with picture words), list (Statement, table pushed right), showcase (Headline you can type), contact (Sentence, portrait, two links), footer (Invitation over a cropped name). Motion: colour by chapter.
- No redraws. Adaptations, all within the sheet's own rules:
  - The stage bar sizes segments by the number of MCP tools each stage uses, not by duration: we have no measured durations and the skill forbids invented metrics.
  - The "Connect" section has no dealt blueprint; it follows the direction's composition habit (a statement on the left six columns, its proof on the right).
  - No footage: no honest clip of scoping exists in the open collections; the moving picture is a slow drift on the survey plat.

## The idea

> On this page, **the client's own words, which every requirement must quote verbatim**, become **the picture words set inside the page's sentences**, and the survey plat (a _relevamiento_ fixing what is inside a parcel and what is not) is the one image that opens to full width.

The live thing: the tool finder. The visitor types what they would ask their assistant and sees which of the 15 real tools it would call (keyword match over the tool catalogue in `app/content.ts`, no AI, no invented output). Without script the prefilled query's matches are server-rendered.

## Pictures and credits

None of these shows ScopeProfit, its users or its output; they show the surveyor's world. Credits also sit in the page footer.

| File                            | Title                                                                                 | Creator                         | Licence   | Source                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- | --------- | --------------------------------------------------------------- |
| `public/images/survey-plat.jpg` | Survey plat land grants                                                               | unknown                         | CC0       | https://www.rawpixel.com/image/8905250/image-faces-vintage-book |
| `public/images/survey-map.jpg`  | Map of the United States and territories, shewing the extent of public surveys (1866) | Jos. S. Wilson, Theodore Franks | CC0       | https://commons.wikimedia.org/w/index.php?curid=150439922       |
| `public/images/theodolite.jpg`  | Theodolite 1                                                                          | Brahmavadini                    | CC BY 4.0 | https://commons.wikimedia.org/w/index.php?curid=190591138       |
| `public/images/surveyor.jpg`    | SAM PC 1 - Surveyor with Hildebrand theodolite diorama                                | unknown                         | CC BY 3.0 | https://commons.wikimedia.org/w/index.php?curid=8725431         |

Images were resized for the web (max 1600px wide); no other alteration.

## Sample content to confirm

- The `24–40 h` chip in the statement is an illustrative interface fragment, not a measured estimate.
- `https://api.<tu-dominio>/api/mcp` stays a placeholder until there is a public hosted endpoint.

## Gate

```bash
node .agents/skills/design-taste-frontend/scripts/lint.mjs apps/landing/app
pnpm --filter @scopeprofit/landing run build && pnpm --filter @scopeprofit/landing exec next start -p 3100
node .agents/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:3100
```
