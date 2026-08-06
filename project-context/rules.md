# Coding Standards (Rules)

## Document Role
- **Source of Truth:** Coding standards, AI behavior constraints, and implementation security rules
- **Primary Owner:** `brainstorm-rules`
- **Out of Scope:** Product scope decisions (PRD), schema design (schema.md), endpoint payload contracts (api.md), and task sequencing (Task.md)

---

## 1. AI Persona & Tech Stack

> You are an expert developer in: TypeScript, React (Vite), Tailwind CSS v4, shadcn/ui, Express, Node.js built-in `node:sqlite`, pdf-parse, n8n.

**Prioritize:**
- TypeScript everywhere (frontend + backend) — hard rule, see architecture.md
- Strict TypeScript with modern options (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`)
- Functional React components + hooks; Tailwind utility classes; shadcn/ui components customized via CSS variables
- Backend ATS logic deterministic in TypeScript; LLM only for the semantic side
- Parsing of model output via regex fallback in the backend
- SQL via `node:sqlite` (`DatabaseSync`) with prepared statements
- `tsx` for dev execution, `tsc` for builds

**Avoid:**
- Any JavaScript in application code (except tool-required config defaults like `eslint.config.mjs`)
- **n8n Code nodes** (they execute JavaScript — violates TypeScript-only rule)
- `any`, `enum` (use `as const`), class components
- Storing ATS/parsing logic inside n8n
- Calling the LLM directly from the frontend (backend is the only proxy)

---

## 2. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables & Functions | camelCase | `extractCvText`, `isLoading` |
| React Components | PascalCase | `ReportView`, `UploadPage` |
| Files & Folders | kebab-case | `cv-analyze.ts`, `report-view.tsx` |
| React hooks | `use` + PascalCase | `useAnalysis` |
| Types/Interfaces | PascalCase (no `I` prefix) | `AnalyzeReport`, `AtsCheck` |
| CSS/Tailwind tokens | kebab-case | `--color-primary` |
| Database Tables | snake_case, singular per schema.md | `target_jobs`, `reviews` |
| JSON keys (wire) | camelCase | `overallScore`, `modelUsed` |
| Env vars | SCREAMING_SNAKE | `N8N_URL`, `OPENROUTER_FREE_MODELS` |
| n8n node names | Title Case | `CV Analyze Webhook`, `HTTP Failover 1` |
| Event handlers | `handle` prefix | `handleSubmit`, `handleApprove` |
| Boolean | `is/has/can` prefix | `isLoading`, `hasApprovals` |

---

## 3. Code Style & Quality

- **TypeScript:** Strict mode. Avoid `any` and `enum` (use `as const`).
- **Types:** `type` over `interface` by default; interface only for extensible public API contracts. Prefer discriminated unions for status fields.
- **Console.log:** Forbidden in production. Use a proper logger (or silent in v1 — no stray logs).
- **Error Handling:** `try-catch` required for async/await operations. Use early returns (guard clauses).
- **Else after return:** FORBIDDEN — use the early return pattern.
- **Import order:** builtin → external → internal → relative → types
- **Max function length:** ~50 lines; extract helpers when exceeded.
- **Comments:** Minimal; no `//` noise comments. Comments explain "why", not "what".
- **JSON parsing from models:** always via an explicit parse function with a runtime guard; never trust model output shape directly.
- **Dependency ladder:** Reuse existing code first, then Node standard library, then installed dependencies — and only then add new dependencies.
- **Intentional simplification:** Mark with a `tradeoff:` comment that states the ceiling and upgrade trigger.
- **Never simplify:** trust-boundary validation, data-loss protection (BR-05 facts preservation), accessibility basics, or explicitly requested behavior.

```typescript
// ✅ CORRECT — early return + guard
function parseScore(raw: unknown): number {
  if (typeof raw !== 'number') return 0;
  if (raw < 0 || raw > 100) return 0;
  return raw;
}

// ❌ WRONG — deep nesting
function parseScore(raw: unknown): number {
  if (typeof raw === 'number') {
    if (raw >= 0 && raw <= 100) {
      return raw;
    }
  }
  return 0;
}
```

---

## 4. Security Rules

> **MANDATORY:** Before writing code involving user input, file upload, or database access — check at least these 4 items and explain them briefly: input validation, secret/token protection, safe queries, and access control.

- **Auth:** No authentication in v1 (single-user local tool, BR-10). Webhooks are open on localhost.
- **Input Sanitization:** Validate all input before processing. Upload must be a PDF (reject otherwise, 415); target job description required (400).
- **Environment Variables:** Never hardcode secrets, URLs, or config. All env vars exist in `.env.example` (PORT, N8N_URL, N8N_ANALYZE_PATH, N8N_REWRITE_PATH, DB_PATH, OPENROUTER_FREE_MODELS, N8N_TIMEOUT_MS).
- **Query Security:** Always use prepared statements / parameterized queries with `node:sqlite`. NEVER concatenate user input into SQL.
- **XSS:** Avoid `dangerouslySetInnerHTML`. The frontend renders structured JSON report data (no raw HTML from models).
- **CORS:** Dev CORS limited to the frontend origin (`http://localhost:<frontend-port>`). Never use `*`.
- **File size limits:** Enforce a max upload size on `POST /api/cvs` (multipart).
- **Dependencies:** Run `npm audit` before every release. Block HIGH severity.

---

## 5. AI Behavior Rules

- **Comment Language:** English (codebase comments) — match surrounding code.
- **Error Messages (user-facing):** Indonesian (single-user Indonesian app).
- **When Ambiguous:** Ask the user first; do not assume. (User explicitly requires confirmation after each `project-context` file and after each phase.)
- **When Errors Happen:** Analyze error logs / execution data first. Do not guess.
- **New Package Installation:** Ask permission first; state the reason.
- **Out-of-Scope Modifications:** Forbidden without confirmation (e.g. editing files outside the named task scope).
- **Complex Implementations:** Show a plan/rationale before implementing.
- **Phase workflow (per Task.md):** after each phase → user manual review → user confirmation → run skill `spec-compliance` → `code-review` → done → ask confirmation again before next phase.

## Rule Priority
- **Priority Order:** Security → correctness → data protection → consistency → maintainability → convenience
- If two rules seem to conflict, choose the higher-priority rule and note the trade-off.
- If a local exception is needed, mark it clearly with a `tradeoff:` comment and explain the upgrade trigger.

---

## 6. Git Workflow

**Conventional Commits** — required for all commits (commit notes in Indonesian per developer-config).

| Type | When |
|------|------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Maintenance (update deps, config) |
| `docs:` | Documentation changes |
| `refactor:` | Code restructuring without feature/bug change |
| `style:` | Formatting (no logic changes) |
| `test:` | Add or fix tests |
| `perf:` | Performance improvement |
| `ci:` | CI/CD config changes |

**Example:** `feat(n8n): tambah workflow analisis CV dengan failover 3 model`

**Branch naming:** `feature/[feature-name]`, `fix/[bug-name]`, `chore/[task-name]`

**Other:**
- Only commit when the user explicitly asks.
- `.codebase-memory/` graph binaries: do not commit by default (user preference), keep `merge=ours` in `.gitattributes`.
- `data/` (SQLite) is gitignored.

---

## 7. Linter, Formatter & Testing

- **ESLint:** Flat config (v9+; v10 terinstall). Rules: `eslint:recommended`, `@typescript-eslint/recommended` (+ strict rules from StyleGuide).
- **Prettier:** `semi: false` (or true per Prettier default — lock once at setup), `singleQuote: true`, `tabWidth: 2`, `printWidth: 80`.
- **.editorconfig:** `charset=utf-8`, `end_of_line=lf`, `insert_final_newline=true`.
- **Test Framework:** **Vitest** (backend unit/integration) + **React Testing Library** (frontend components).
- **Minimum Coverage:** 70% for core logic (ATS engine, parsers); backend API endpoints covered via supertest.
- **Test Requirement:** Yes — core deterministic logic (ATS checks, regex parser, export) must have tests before implementation (TDD where practical).
- **Verification:** After completing a task, run lint + typecheck (`npm run lint`, `npm run typecheck`).

---

## [FORBIDDEN]

> Check this list before writing any code. Violating even one item = code rejected.

| # | Forbidden | Why |
|---|-----------|-----|
| F-01 | NEVER use `any` (TypeScript) | Destroys type safety |
| F-02 | NEVER hardcode secrets, URLs, or config — use env vars | Security & portability |
| F-03 | NEVER concatenate user input into SQL/query — use prepared statements | SQL Injection |
| F-04 | NEVER use JavaScript in backend/frontend application code | TypeScript-only rule |
| F-05 | NEVER add n8n Code nodes to workflows | Code node = JavaScript only |
| F-06 | NEVER put ATS/parsing logic inside n8n | Parsing belongs in backend TS |
| F-07 | NEVER use `console.log` / `print` in production code | Info leaks, noise |
| F-08 | NEVER call the LLM directly from the frontend | Backend is the only proxy |
| F-09 | NEVER use `dangerouslySetInnerHTML` | XSS risk |

## Assumptions & Exceptions
- **Assumption:** single-user local tool; no multi-tenant, no auth, no rate limiting in v1 (BR-10).
- **Exception (temporary):** n8n returns raw model output and is the only place external model calls happen — this keeps AI logic out of TypeScript services, per architecture.md.
- **Exception (temporary):** regex fallback is used for model JSON parsing until a parser library or structured-output mode is adopted (track in bug-log.md if it causes issues).
