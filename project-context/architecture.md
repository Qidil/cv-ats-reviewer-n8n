# Architecture

Project: cv-ats-reviewer-n8n
Last updated: 2026-08-05

## Purpose

A local, single-user tool that analyzes a CV against a job description (JD),
reports ATS (Applicant Tracking System) weaknesses, and — after human approval —
rewrites the CV. AI inference runs on free OpenRouter models via n8n workflows.

## System Overview

```
+-------------------+       +------------------+       +-------------------+
|  React (Vite)     |       |  Express API     |       |  n8n              |
|  :5173            |       |  :3001           |       |  :5678            |
|  - Upload form    |  API  |  - REST endpoints|  HTTP |  - Webhook trigger|
|  - Analysis view  |<----->|  - SQLite storage|------>|  - AI failover     |
|  - Approval view  |       |  - PDF/DOCX      |       |  - OpenRouter call |
|  - Rewrite result |       |    export        |       |  - JSON parse      |
+-------------------+       +------------------+       +-------------------+
```

Key rule: **the frontend only talks to Express**. It never calls n8n or
OpenRouter directly. This avoids CORS issues and never exposes the OpenRouter
API key to the browser.

## Components

| Component | Stack | Port | Role |
|---|---|---|---|
| frontend | React + Vite + **TypeScript** + Tailwind | 5173 | UI: upload, analysis, approval, rewrite result |
| backend | Express (**TypeScript**) | 3001 | REST API, SQLite, **ATS logic (deterministic)**, n8n proxy, PDF/DOCX export |
| n8n | n8n workflows | 5678 | **AI orchestration only**: webhooks + failover chain + raw model output |
| AI | OpenRouter (free models) | — | CV analysis and rewrite inference |
| DB | SQLite (node:sqlite) | — | Local persistence |

## TypeScript Policy

The entire codebase is **TypeScript**: frontend (React+TS), backend (Express+TS).
This includes all ATS logic (keyword matching, section detection, JSON parsing,
score composition). **No JavaScript is written by hand anywhere.**

Constraint: the n8n **Code node executes JavaScript** (ES2018+) — it cannot run
TypeScript. To keep the "TypeScript everywhere" rule, the n8n workflows contain
**no Code nodes**. All parsing and deterministic logic lives in the backend
(TypeScript); n8n is limited to webhook + HTTP Request nodes (failover chain)
that return the raw model output back to the backend.

## AI Strategy (failover chain)

Three free models are tried in priority order. If a model returns HTTP 429
(rate limit) or any error, the next model in the chain is used.

Order (configurable via `OPENROUTER_FREE_MODELS`):
1. `nvidia/nemotron-3-ultra-550b-a55b:free`
2. `openai/gpt-oss-120b:free`
3. `nvidia/nemotron-3-nano-30b-a3b:free`

Implemented in n8n as sequential HTTP Request nodes to
`https://openrouter.ai/api/v1/chat/completions`, each configured with
`onError: continueErrorOutput` so a failure flows to the next model.
All nodes use the `openRouterApi` credential ("OpenRouter account").

## Core Flow

1. **Upload** — User uploads a PDF CV and enters a mandatory target job
   description (role, responsibilities, requirements).
2. **Analyze** — Backend extracts text from PDF (pdf-parse), saves the CV,
   then calls n8n webhook `cv-analyze`. **Backend (TS)** runs the deterministic
   ATS checks (keyword overlap, section completeness) and sends them with the
   CV + JD to n8n. n8n runs the failover chain and returns the **raw model
   output**. **Backend (TS)** parses the model output (regex fallback),
   merges deterministic + LLM checks, and composes the report: overall ATS
   score, rule-level checks, weaknesses, suggestions, model used.
3. **Approval (HITL)** — Backend persists the analysis. User reviews
   suggestions in the frontend and approves a subset.
4. **Rewrite** — Backend calls n8n webhook `cv-rewrite` with CV + JD +
   approved suggestions. n8n runs the failover chain (rewrite call, then one
   post-check call) and returns raw outputs. **Backend (TS)** parses and
   merges them into the rewritten markdown + post-check score + dropped-info
   warnings.
5. **Export** — Backend generates the rewritten CV as PDF (pdfmake) and DOCX
   (docx) for download.

## Data Storage

SQLite local file at `./data/app.db`, accessed only through the Express
backend using Node's built-in `node:sqlite` (`DatabaseSync`) — no native
compile step required (Node >= 22.5). n8n does not access the database.

## Deployment

Local development only (no deployment target defined).

## Build Order

1. n8n workflow `CV ATS Analyze` (webhook + failover chain, no Code nodes)
2. n8n workflow `CV ATS Rewrite` (webhook + failover chain, no Code nodes)
3. Backend Express (TypeScript: DB, REST, ATS logic, proxy, export)
4. Frontend React (TypeScript, 4 pages)
5. Publish workflows + export workflow JSON to `n8n/workflows/`
6. End-to-end integration test, re-index codebase-memory, commit

## Open Questions

- None currently. Decisions locked in meeting (2026-08-05).
