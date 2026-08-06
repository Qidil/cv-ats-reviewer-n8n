# PRD: CV ATS Reviewer

> **Version:** 1.0 | **Date:** 2026-08-05 | **Status:** Draft

## Document Role
- **Source of Truth:** Product scope, user intent, business rules, and success criteria
- **Primary Owner:** `brainstorm-prd`
- **Out of Scope:** API payload details, schema column definitions, code patterns, and implementation order

## Canonical Terminology
| Term | Meaning |
|------|---------|
| CV | Curriculum Vitae / resume uploaded by the user |
| Target Job Description | The user's own description of the job they are targeting with this CV (role, responsibilities, requirements); required input for every analysis. It may be a pasted JD or free text. |
| ATS | Applicant Tracking System — software that parses CVs against job postings |
| ATS Score | 0–100 score estimating how well the CV matches the Target Job Description |
| Analyze | AI pass producing ATS score, rule-level checks, weaknesses, and suggestions |
| Rewrite | AI pass producing a new CV version guided by approved suggestions |
| HITL | Human-in-the-loop — user approval step before any rewrite is generated |
| Failover chain | Sequence of free OpenRouter models tried in order on failure/429 |

---

## 1. Project Goal

Build a **local, single-user** tool that helps the owner improve their CV for a
specific job application. After uploading a CV, the tool asks the user to
describe the job they are targeting with it; the tool then analyzes the CV
against that target job description, reports an ATS-style score and concrete
weaknesses, then — only after the user approves specific suggestions — rewrites
the CV into an improved version that preserves all factual information. The ATS
result always reflects the fit between the CV and the described target job.

The long-term vision is a reliable, free, offline-first CV optimization
workflow powered by free OpenRouter models, with no paid API dependency. What
makes it different: full human control (nothing is rewritten without approval),
a clear ATS rule breakdown, and both PDF and DOCX output from the same workflow.

## 2. Target Users
| Persona | Description | Role |
|---------|-------------|------|
| Owner (Qidil) | The single local user applying to jobs | End User |

## 3. Problem Statement

Manually checking a CV against a job description is slow and biased. Free ATS
checkers are often limited, force account creation, or send CVs to third
parties. The user wants a private, local tool that tells them exactly what is
weak and rewrites the CV only when they explicitly approve. Existing online
solutions are not private, not free of rate-limit pain, and often rewrite
without consent or hallucinate facts.

## 4. Core Features
### MVP (Release 1)
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| FEAT-01 | CV Upload | Upload a PDF CV; backend extracts text (pdf-parse) | High |
| FEAT-02 | Target Job Description | After upload, the user describes the job they are targeting with this CV (role, responsibilities, requirements — pasted JD or free text); required for every analysis | High |
| FEAT-03 | ATS Analysis | AI generates overall score, rule-level checks, weaknesses, suggestions | High |
| FEAT-04 | Approval (HITL) | User selects which suggestions to approve before rewrite | High |
| FEAT-05 | CV Rewrite | AI rewrites CV preserving facts, following approved suggestions | High |
| FEAT-06 | Post-Check | One extra AI call scoring the rewritten CV + dropped-info warnings | Medium |
| FEAT-07 | Export | Download rewritten CV as PDF (pdfmake) and DOCX (docx) | High |
| FEAT-08 | History | Store CVs, analyses, approvals, rewrites locally in SQLite | Medium |

### Future Enhancements
- **FEAT-09:** Multiple CV versions diff view (before/after side-by-side)
- **FEAT-10:** ATS checker rule library curated by the user (add/edit rules)
- **FEAT-11:** OCR support for scanned (image-based) PDFs
- **FEAT-12:** Save JD templates for quick reuse
- **FEAT-13:** Cloud sync / multi-device (intentionally out of scope for v1)

## 5. Business Rules
- **BR-01:** A Target Job Description is **required**; analysis must not start without it, and it must be collected right after the CV is uploaded.
- **BR-02:** The ATS result (score, checks, weaknesses, suggestions) is computed as the fit between the CV and the Target Job Description; a different target job yields a different result.
- **BR-03:** CV file must be a valid, readable PDF; a failed parse blocks analysis with a clear error.
- **BR-04:** Rewrite only runs after at least one suggestion is approved; zero approvals = no rewrite.
- **BR-05:** Rewrite must preserve all facts from the original CV (no invented experience, dates, or skills).
- **BR-06:** If the original CV and rewritten CV differ, the post-check must flag removed/invented info as warnings.
- **BR-07:** Model failover: on HTTP 429 or error, use the next free model in the configured chain; the last model failing = workflow error.
- **BR-08:** Analysis output is structured JSON (score, checks, weaknesses, suggestions, model used).
- **BR-09:** Output language of rewrite follows the Target Job Description language unless user overrides.
- **BR-10:** No authentication in v1 — single-user local tool; no login, no rate limiting, no multi-tenancy.

## 6. User Flow
### Owner (single user)
1. Open the app and go to the **Upload** page.
2. Select a PDF CV; after it uploads, the app asks the user to describe the job they are targeting with this CV (role, responsibilities, requirements).
3. Submit the target job description (required); backend extracts text and calls the Analyze workflow.
4. See the **Analysis** page: ATS gauge (CV vs target job fit), rule-level checks, weaknesses, suggestions, model used.
5. On the **Approval** page, check the suggestions to apply; click "Setujui & Rewrite".
6. See the **Rewrite result**: rewritten CV (markdown), post-check score, dropped-info warnings.
7. Download the result as PDF or DOCX.
8. **Error scenario:** if all models fail or PDF is invalid, see a clear error and retry.

## 7. Design & Technical Requirements
- **Platform:** Web (local, single machine)
- **UI Reference:** Clean, modern, minimal SaaS dashboard (light, neutral palette)
- **Tech Stack:** React + Vite + TypeScript + Tailwind CSS (frontend); Express + TypeScript (backend); n8n workflows (AI orchestration only — webhooks + failover, no Code nodes); SQLite via `node:sqlite`
- **Integrations:** OpenRouter API (free models); n8n webhooks (`cv-analyze`, `cv-rewrite`); pdf-parse, pdfmake, docx

## 8. Non-Functional Requirements
| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-01 | Performance | Page load time | < 3 seconds |
| NFR-02 | Performance | AI analysis call completes | < 5 minutes (free models; timeout via N8N_TIMEOUT_MS) |
| NFR-03 | Security | OpenRouter API key never exposed to the browser | Local-only (backend) |
| NFR-04 | Security | Data stays local; no third-party data transmission beyond OpenRouter | Full |
| NFR-05 | Scalability | Concurrent users | 1 (single-user) |
| NFR-06 | Accessibility | Keyboard navigation for forms and checklists | Basic support |
| NFR-07 | Availability | Works offline except AI calls (no internet → analysis unavailable) | Documented |
| NFR-08 | Reliability | Model failure does not lose the original CV or analysis | Full |

## 9. Success Criteria (Minimum)
- [ ] User can upload a PDF, describe the targeted job, and get a complete ATS analysis report.
- [ ] User can approve suggestions and get a rewritten CV that preserves facts.
- [ ] Rewritten CV can be downloaded as both PDF and DOCX.
- [ ] Model failure triggers automatic failover to the next free model.
- [ ] All CVs/analyses/rewrites are stored locally in SQLite and browsable.

## 10. Acceptance Criteria
### FEAT-01: CV Upload
- **AC-01:** **Given** a valid PDF CV, **When** the user submits it, **Then** the backend extracts its text successfully.
- **AC-02:** **Given** an invalid or unreadable PDF, **When** the user submits it, **Then** a clear error is shown and no analysis starts.

### FEAT-02: Target Job Description
- **AC-03:** **Given** an uploaded CV and an empty target job description, **When** the user tries to submit, **Then** the form blocks submission with a validation message.
- **AC-04:** **Given** a CV and a target job description, **When** the analyze workflow completes, **Then** the ATS result (score, checks, weaknesses, suggestions) reflects the fit between the CV and that target job.

### FEAT-03: ATS Analysis
- **AC-05:** **Given** a CV and target job description, **When** the analyze workflow completes, **Then** the result contains overallScore (0–100), atsChecks[], weaknesses[], suggestions[], and modelUsed.
- **AC-06:** **Given** malformed model output, **When** the backend parses it, **Then** regex fallback extracts the JSON or a clear error is returned.

### FEAT-04: Approval (HITL)
- **AC-07:** **Given** an analysis result, **When** the user submits approvals, **Then** only approved suggestions are sent to the rewrite workflow.
- **AC-08:** **Given** no suggestion approved, **When** the user clicks rewrite, **Then** no rewrite is generated.

### FEAT-05: CV Rewrite
- **AC-09:** **Given** approved suggestions, **When** the rewrite workflow runs, **Then** the output preserves all original facts and applies only approved suggestions.

### FEAT-06: Post-Check
- **AC-10:** **Given** a rewritten CV, **When** post-check runs, **Then** it returns a new ATS score and a list of dropped-info warnings.

### FEAT-07: Export
- **AC-11:** **Given** a rewritten CV, **When** the user downloads, **Then** both PDF and DOCX files are generated from the same content.

### FEAT-08: History
- **AC-12:** **Given** past sessions, **When** the user opens history, **Then** CVs, analyses, approvals, and rewrites are listed and viewable.

## 11. Non-Goals / Out of Scope
- Cloud / multi-device sync
- OCR for scanned PDFs (v1)
- Paid AI models or user-supplied custom model keys (v1 uses free OpenRouter models only)
- ATS rule library editor (v1)
- Team/collaboration features
- Job application tracking (only CV optimization)
- Public/remote deployment
- Dark mode (v1 uses a light-only minimal palette per StyleGuide)

## 12. Assumptions
- Local machine has Node.js >= 22.5 (built-in `node:sqlite`) and internet access to OpenRouter.
- Free OpenRouter models remain available with the names in `OPENROUTER_FREE_MODELS`.
- CVs are text-based PDFs (not scanned images) for v1.
- The user will run n8n locally on port 5678 and the backend on port 3001.

## 13. User Stories
- **US-01:** As an **owner**, I want to upload my CV and describe the job I am targeting so that I get a fast ATS assessment tailored to that job.
- **US-02:** As an **owner**, I want to see a clear score and rule-level breakdown so that I understand my weakest areas.
- **US-03:** As an **owner**, I want to approve only some suggestions so that I keep control of my CV content.
- **US-04:** As an **owner**, I want a rewritten CV that keeps all my real facts so that no information is invented or lost.
- **US-05:** As an **owner**, I want PDF and DOCX downloads so that I can submit the CV anywhere.

## 14. Stakeholders
| Name/Role | Responsibility |
|-----------|----------------|
| Qidil | Product owner, sole end user, decision maker |
| AI team (Fachri, Akram, Firdaus, Ikhsan) | Architecture, UI, implementation, debugging perspectives |

## 15. Open Questions
| Question | Status | Owner |
|----------|--------|-------|
| Exact ATS scoring formula / rubric used by the prompt | Pending | Fachri (during workflow) |
| Prompt templates per model for consistency | Pending | Fachri (during workflow) |
| REST endpoint names & DB schema details | Pending | Fachri (during backend) |
| Should history be a full page or a simple list | Pending | Akram (during frontend) |

## Reading Guide for AI
- If this PRD conflicts with detailed implementation documents, the PRD wins on business intent and scope.
- If a term is ambiguous, prioritize the definition in `Canonical Terminology`.
- Use `Non-Goals / Out of Scope`, `Assumptions`, and `Open Questions` to avoid building more than necessary.
