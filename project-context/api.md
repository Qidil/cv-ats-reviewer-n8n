# API

Project: cv-ats-reviewer-n8n
Last updated: 2026-08-05
Base URL (dev): `http://localhost:3001`
n8n webhook base: `http://localhost:5678/webhook/{path}`

## Conventions

- Backend exposes a REST JSON API; the React frontend calls only the backend.
- The backend is the only component that talks to n8n (proxy role).
- All request/response bodies are JSON unless noted (upload is `multipart/form-data`).
- Errors use `{ "error": "<message>" }` with proper HTTP status codes.
- No authentication in v1 (single-user local tool, BR-10).

---

## Frontend → Backend (REST)

### Upload CV + target job description

`POST /api/cvs`

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| cv | file (PDF) | yes | The CV to analyze (PDF) |
| targetJobTitle | string | no | Optional role/title label |
| targetJobDescription | string | yes | User's description of the targeted job |

Responses:
- `201` → `{ "id": <cvId> }`
- `400` → missing file or missing targetJobDescription
- `415` → file is not a PDF

Behavior:
- Backend extracts text via `pdf-parse` (BR-03), stores `cvs` + `target_jobs`.
- Returns only the id; analysis is triggered by a separate call.
- UI note: the frontend may present upload and target-job-description as two
  steps (per PRD user flow), but both are submitted in this single request.

### Trigger analysis

`POST /api/cvs/:cvId/analyze`

Body: none.

Behavior:
- Backend calls n8n webhook `cv-analyze` with `{ cvId, cvText, targetJobDescription }`.
- n8n runs the failover chain and returns raw model output.
- Backend parses (regex fallback), composes the report, stores `reviews`.
- Waits synchronously and returns the report.

Responses:
- `200` → analyze report (see Report shape below)
- `404` → cvId not found
- `502` → all models failed (BR-07 exhausted)

### Get analysis report

`GET /api/reviews/:reviewId`

Responses:
- `200` → stored analyze report + `id`, `cvId`, `createdAt`, plus nullable
  `approvalId` and `rewriteId` (ids of the latest approval / rewrite rows for
  this review, if any — enables history traversal per AC-12)
- `404` → not found

### Approve suggestions

`POST /api/reviews/:reviewId/approve`

Body:
```json
{ "approvedSuggestionIds": ["sug-1", "sug-3"] }
```

Responses:
- `200` → `{ "id": <approvalId> }`
- `400` → empty/unknown suggestion ids
- `404` → review not found

Behavior:
- Stores `approvals.approved_suggestions_json` (BR-04 / AC-07).

### Trigger rewrite

`POST /api/approvals/:approvalId/rewrite`

Body: none.

Behavior:
- Backend calls n8n webhook `cv-rewrite` with
  `{ cvId, targetJobDescription, originalCv, approvedSuggestions }`.
- n8n returns raw rewritten output.
- Backend stores `rewrites` (rewritten_markdown), runs a deterministic
  post-check, stores `post_score` / warnings.
- Returns the rewrite record.

Responses:
- `200` → rewrite record (see Rewrite shape below)
- `404` → approval not found
- `502` → all models failed

### Export rewritten CV

`GET /api/rewrites/:rewriteId/export?format=pdf|docx`

Responses:
- `200` → file download (PDF or DOCX)
- `400` → unsupported format
- `404` → rewrite not found

### List CVs

`GET /api/cvs`

Responses:
- `200` → `[ { id, originalFilename, createdAt, latestReviewId } ]`

Note: `latestReviewId` is **computed** (id of the most recent `reviews` row for
that `cv_id`), not a column stored in `cvs`.

### Get approval

`GET /api/approvals/:approvalId`

Responses:
- `200` → stored approval: `{ id, reviewId, approvedSuggestionIds, approvedAt }`
- `404` → not found

### Get rewrite

`GET /api/rewrites/:rewriteId`

Responses:
- `200` → stored rewrite record (see Rewrite shape below, minus fields that are
  null on failed post-check)
- `404` → not found

---

## Backend → n8n (webhooks)

n8n workflows are stateless: webhook in → raw model output out.
No Code nodes. Failover handled inside n8n via HTTP Request chain.

### Analyze webhook

Path: `/webhook/cv-analyze` (N8N_ANALYZE_PATH)

Request body (from backend):
```json
{
  "cvId": 1,
  "cvText": "<extracted text>",
  "targetJobDescription": "<user provided>"
}
```

Response (raw model output):
```json
{
  "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "raw": "<model text output>"
}
```
- Backend parses `raw` with regex fallback; n8n does not parse.

### Rewrite webhook

Path: `/webhook/cv-rewrite` (N8N_REWRITE_PATH)

Request body (from backend):
```json
{
  "cvId": 1,
  "targetJobDescription": "<user provided>",
  "originalCv": "<cv_text>",
  "approvedSuggestions": ["<approved suggestion objects>"]
}
```

Response (raw model output):
```json
{
  "model": "<model id>",
  "raw": "<rewritten markdown>",
  "postCheckModel": "<model id used by post-check>",
  "postCheckRaw": "<raw post-check JSON output>"
}
```
- The rewrite call and the post-check call each run their own failover chain
  (BR-07); `postCheckModel` / `postCheckRaw` are the outputs of the post-check
  chain. The backend composes the final rewrite record from `raw` +
  `postCheckRaw` (Task 5.3).

---

## Report shape (analyze)

```json
{
  "id": 1,
  "cvId": 1,
  "overallScore": 72.5,
  "atsChecks": [
    {
      "id": "keyword",
      "name": "Keyword match",
      "status": "warn",
      "score": 60,
      "detail": "Missing: 'terraform', 'CI/CD'"
    }
  ],
  "weaknesses": [],
  "suggestions": [
    {
      "id": "sug-1",
      "title": "Add quantified achievements",
      "description": "Replace 'improved performance' with a metric.",
      "category": "achievements",
      "priority": "high"
    }
  ],
  "modelUsed": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "createdAt": "2026-08-05T00:00:00.000Z"
}
```

`atsChecks` ids: `keyword`, `skills`, `sections`, `formatting`,
`quantified`, `readability` (6 checks).

---

## Rewrite shape

```json
{
  "id": 1,
  "reviewId": 1,
  "approvalId": 1,
  "rewrittenMarkdown": "# <rewritten CV markdown>",
  "postScore": 84.0,
  "warnings": ["Removed 2 education details not in approved suggestions"],
  "postModelUsed": "nvidia/nemotron-3-nano-30b-a3b:free",
  "createdAt": "2026-08-05T00:00:00.000Z"
}
```

---

## Error codes

| Code | Meaning |
|---|---|
| 400 | Bad request (missing/invalid fields) |
| 404 | Resource not found |
| 415 | Unsupported media type (non-PDF upload) |
| 502 | All AI models failed (failover exhausted) |
| 500 | Internal error |
