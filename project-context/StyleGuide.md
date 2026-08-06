# Style Guide

Project: cv-ats-reviewer-n8n
Last updated: 2026-08-05
Applies to: TypeScript (backend + frontend), React, CSS/Tailwind, SQL.
Design language: **Minimalism + Flat Design (Swiss Modernism 2.0)** — derived
from the `ui-ux-pro-max` database for the "Resume / CV Builder" product type.

## Language & TypeScript policy

- Everything is written in **TypeScript** — frontend and backend. This is a
  hard rule (see architecture.md "TypeScript Policy").
- No JavaScript files except generated config defaults where a tool demands it
  (e.g. `eslint.config.mjs`; `vite.config.ts` is TS so prefer it).
- **No n8n Code nodes.** n8n Code nodes execute JavaScript; workflows must not
  contain them (webhook + HTTP Request only).

## Tooling

- Node.js `>=22.5.0` (for built-in `node:sqlite`).
- npm for package management.
- `tsx` for running TypeScript directly in dev; `tsc` for builds.
- ESLint + Prettier for formatting/linting.
- Strict TypeScript config: `strict: true`, `noUncheckedIndexedAccess: true`,
  `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`,
  `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`.

## Naming conventions

| Item | Convention | Example |
|---|---|---|
| Files (TS/TSX) | kebab-case, lowercase | `cv-analyze.ts`, `report-view.tsx` |
| Components | PascalCase | `ReportView.tsx` |
| React hooks | `use` + PascalCase | `useAnalysis.ts` |
| Functions/variables | camelCase | `extractCvText()` |
| Types/interfaces | PascalCase, no `I` prefix | `AnalyzeReport`, `AtsCheck` |
| CSS/Tailwind tokens | kebab-case | `--color-primary` |
| SQL tables/columns | snake_case | `overall_score`, `target_jobs` |
| JSON keys (wire) | camelCase | `overallScore`, `modelUsed` |
| Env vars | SCREAMING_SNAKE | `N8N_URL`, `OPENROUTER_FREE_MODELS` |
| n8n node names | Title Case | `CV Analyze Webhook`, `HTTP Failover 1` |

## TypeScript rules

- `type` over `interface` by default; use `interface` only for public API
  contracts that may be extended.
- Prefer discriminated unions over optional `status`-guards where possible.
- No `any`. Use `unknown` then narrow. `noImplicitAny` enforced.
- Use `as const` and literal union types for status fields
  (`'completed' | 'failed'`).
- No unused imports or locals (ESLint `@typescript-eslint/no-unused-vars`).
- Prefer `satisfies` over `as` for object-literal type checking.
- Read-only collections: `ReadonlyArray<T>` / `readonly T[]` where safe.
- JSON parsing from models: define an explicit parse function with a guard;
  never trust model output shape directly (regex fallback per architecture.md).

---

## Frontend Design Language: Minimalism (Swiss)

Source: `ui-ux-pro-max` — product "Resume / CV Builder"
(primary: **Minimalism + Flat Design**; secondary: **Swiss Modernism 2.0**,
Trust & Authority). Frontend styling is implemented with Tailwind CSS v4 +
shadcn/ui, using a three-layer token system (primitive → semantic → component)
per the `design-system` skill. No hardcoded hex in components.

### Core principles

1. **White space is the design.** Generous spacing (8px base unit, multiples of
   8); essential elements only — cut anything decorative.
2. **Grid-based geometry.** 12-column layout, clear type hierarchy, alignment
   over ornament.
3. **High contrast, flat.** Near-monochrome palette, single accent, no
   gradients, no drop shadows (depth via spacing + borders, not shadows).
4. **Typography-driven.** Type carries the hierarchy; font weight 400–700 only.
5. **Subtle motion.** Hover/transition 150–250ms ease; fast loading; no
   decorative animation. Respect `prefers-reduced-motion`.
6. **Accessibility:** WCAG AA (4.5:1 body). Focus rings always visible.

### Color tokens (Tailwind `@theme`)

Primitives and semantic aliases (from Resume/CV Builder palette):

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#1E3A5F` | Professional navy — primary buttons, active nav |
| `--color-primary-foreground` | `#FFFFFF` | Text on primary |
| `--color-secondary` | `#2563EB` | Section accent, links, secondary actions |
| `--color-accent` | `#16A34A` | Success green — positive ATS zones, confirm |
| `--color-background` | `#F8FAFC` | Page background |
| `--color-foreground` | `#0F172A` | Main text |
| `--color-card` | `#FFFFFF` | Card / surface |
| `--color-card-foreground` | `#0F172A` | Card text |
| `--color-muted` | `#E9EEF5` | Muted surface (wells, inputs) |
| `--color-muted-foreground` | `#64748B` | Secondary text, placeholders |
| `--color-border` | `#CBD5E1` | Hairline borders, dividers |
| `--color-destructive` | `#DC2626` | Errors, destructive actions |
| `--color-warning` | `#F59E0B` | Amber — medium ATS zone (50–79) |

ATS score zones (semantic): **green ≥ 80**, **amber 50–79**, **red < 50**.

### Typography

- **Minimal Swiss** pairing: single family **Inter** (300–700) for headings
  and body — ultimate simplicity, weight-varied hierarchy.
  Tailwind: `fontFamily.sans = ['Inter', 'sans-serif']`.
- Base: 16px, line-height 1.5; headings tight leading (1.1–1.25), letter-spacing
  `-0.01em` on large headings. Body text never < 12px.

### Spacing, radius, effects

| Token | Value | Note |
|---|---|---|
| `--spacing-base` | 8px grid | All spacing is a multiple of 8 |
| `--radius` | 0–6px | Sharp, flat; shadcn default `--radius` small |
| `--shadow` | none | No drop shadows (flat); hierarchy via spacing/borders |
| `--transition` | 150–250ms ease | Hover, focus, state changes only |

### Layout rules

- `max-width` content container ~`720px` for the workflow; center the flow
  (Upload → Analysis → Approval → Result).
- Single accent per screen: primary CTA only; secondary actions muted.
- Forms: visible labels (no placeholder-only), error inline next to field,
  loading feedback on submit (BR: model calls are slow).
- Status/score displays: gauge + breakdown list; color is never the sole
  signal (also label text + icon), per ui-ux-pro-max chart/data rules.

### Component conventions

- Components from shadcn/ui where available (Button, Card, Input, Textarea,
  Select, Alert, Progress, Skeleton, Badge, Tabs); customize via CSS variables
  (design tokens), not via bespoke class overrides.
- Function components only; no class components.
- Props typed with named exported types.
- Hooks: one concern per hook; keep hooks in `hooks/`.
- Data fetching via a typed API client in `lib/` (no raw `fetch` in components).
- Tailwind utility classes only; no inline `style=` except dynamic values.
- Errors surfaced to the user in the UI; never swallowed silently.

---

## Project structure

```
/ (root)
  package.json          # root scripts (dev, dev:backend, dev:frontend, build, start, n8n:run)
  .env.example          # env template (PORT, N8N_URL, DB_PATH, OPENROUTER_FREE_MODELS, ...)
  backend/              # Express + TypeScript
    src/
      index.ts          # server bootstrap
      db/               # node:sqlite connection + schema init
      routes/           # REST handlers (cvs, reviews, approvals, rewrites)
      services/         # pdf-parse, ats logic, n8n proxy, export
      types/            # shared types + wire shapes
      utils/            # regex parser, json guard helpers
    test/
  frontend/             # React + Vite + TypeScript + Tailwind
    src/
      components/
      pages/            # upload, analyze, approval, results
      hooks/
      lib/              # api client
      types/
  n8n/                  # exported workflow JSON files
    workflows/
  data/                 # SQLite db (gitignored)
```

## SQL conventions

- Use `node:sqlite` (`DatabaseSync`), prepared statements always.
- Foreign keys on; UTC ISO-8601 timestamps as TEXT.
- JSON persisted as TEXT in `*_json` columns; serialize in the service layer.
- Migrations: `CREATE TABLE IF NOT EXISTS` at startup (v1, no framework).

## Documentation & git

- Docs in English; chat/commit notes in Indonesian (per developer-config.json).
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`.
- `.codebase-memory/` artifacts are gitignored content-wise (merge=ours), do
  not commit graph binaries by default.
