# ATS Reference

Project: cv-ats-reviewer-n8n
Last updated: 2026-08-05
Source: websearch + gitmcp research (references listed at the end)

## Purpose

Reference for building the ATS analysis feature: how Applicant Tracking
Systems actually work, ATS-friendly rules, and real implementation patterns
(rule-based and LLM-based) to inform the n8n workflow prompts and scoring.

## 1. Definition

> **Applicant Tracking System (Dunia Kerja)** — Perangkat lunak atau sistem
> komputer yang dipakai perusahaan untuk mengelola dan menyaring lamaran kerja
> secara otomatis. Berfungsi memindai isi CV atau resume berdasarkan kata
> kunci (keywords) yang sesuai dengan kualifikasi pekerjaan. Pelamar sering
> menyesuaikan format dokumen mereka agar mudah dibaca oleh sistem ini, atau
> disebut **ATS-friendly**.

## 2. How ATS Works (4 stages)

1. **Resume Parsing** — Extract text from the CV and categorize into fields:
   contact info, work history, education, skills. Poor formatting (columns,
   tables, images, text boxes, headers/footers) causes parsing errors that
   lose information.
2. **Keyword Matching** — Compare parsed CV text against the job description
   (JD). Hard skills, tools, certifications, job titles, and industry terms
   from the JD carry weight. Legacy systems use exact/stem matching;
   modern systems use semantic/NLP matching.
3. **Scoring & Ranking** — Each resume gets a match score; candidates are
   ranked and filtered. Required keywords weigh more than preferred ones.
   Placement matters: skills in a dedicated Skills section score higher than
   the same skill buried in an old role's bullet.
4. **Filtering** — Only top-ranked resumes reach the recruiter.

Key stat: up to 75% of resumes are rejected by ATS before a human reads them;
~95-98% of Fortune 500 companies use an ATS.

## 3. ATS-Friendly Best Practices (for the rewrite/check rubric)

### Formatting (parsing safety)
- Single-column layout; no multi-column, tables, text boxes, graphics, or icons.
- Standard section headings: "Skills", "Work Experience", "Education" (creative
  headings are not recognized).
- Standard fonts (Arial / Times New Roman), 10-12pt, 1-2 pages.
- No contact info in header/footer zones.
- .docx parses most reliably; PDF is fine if generated from a word processor
  (not from Canva/design tools, which embed text as image layers).

### Keywords
- Mirror the exact JD language (if JD says "cross-functional collaboration",
  use that phrase, not "team coordination").
- Include acronyms + full terms once, e.g. "Search Engine Optimization (SEO)".
- Avoid keyword stuffing; coverage in context beats density.
- Spell out required skills at least once in context (Skills section + a bullet).

### Content quality (modern ATS + recruiter)
- Outcome-led bullets with metrics ("Reduced costs by 23%"), tools used, and
  scope — not duty-only task lists.
- Reverse-chronological experience, consistent Month Year dates.
- A short professional summary (2-4 lines) with role, years, domains, and a
  proof point; no fluffy adjectives.
- 60-70% of bullets quantified.

## 4. Real Implementation Patterns (from GitHub)

### Pattern A — Rule-based keyword matching (Sydulamin/CV-ATS-Checker, FastAPI + spaCy)
- Extract keywords from resume and JD: unigrams (alpha, minus stopwords),
  noun chunks, and named entities (ORG/PRODUCT/FAC).
- Synonym map for normalization ("aws" = "amazon web services", "k8s" =
  "kubernetes", "ci/cd" = "continuous integration", ...).
- Exact overlap first, then fuzzy matching (`difflib.get_close_matches`,
  cutoff ~0.88) then semantic similarity (spaCy word vectors cosine; fallback
  to `SequenceMatcher` string similarity).
- Section weighting: skills & experience weighted higher.
- Format check: missing sections, email, phone, bullet points.
- Output: fit score, matched/missing keywords, fuzzy matches, format warnings.

### Pattern B — Weighted composite score (srbhr/Resume-Matcher, ats.py)
- Three sub-scores, weighted composite:
  - `keyword_match` — 55%
  - `skills_coverage` (resume technical skills vs JD required/preferred) — 25%
  - `section_completeness` (Summary, Experience, Education, Skills present) — 20%
- Whole-word regex matching (`(?<!\w)keyword(?!\w)`) against lowercased text.
- Recommendations generated from sub-score thresholds (e.g. keyword < 60 →
  "Add these high-priority missing keywords").

### Pattern C — LLM-based ATS score (btseytlin/hr-breaker)
- LLM returns sub-scores: `keyword_score`, `experience_score`,
  `education_score`, `overall_fit_score`, plus `disqualified` flag.
- Issue text (looks_professional, ATS issues) combined with numeric scores.

### Pattern D — LLM optimizer (ed-donner/llm_engineering, ATS_Resume_Optimizer)
- LLM returns `matched` / `added` / `missing` keywords,
  `ats_score_before` and `ats_score_after` (0-100), and `changes_made`.

## 5. Implications for This Project

- **Engine language: TypeScript.** All ATS logic runs in the backend
  (Express, TypeScript): keyword matching, section detection, JSON parsing
  (regex fallback), and score composition. The frontend is also TypeScript.
- **n8n has no Code nodes.** The n8n Code node only executes JavaScript
  (ES2018+), which violates the "TypeScript everywhere" rule. So n8n
  workflows are limited to Webhook + HTTP Request (failover chain) nodes and
  return **raw model output**; the backend does all parsing and scoring in TS.
- Our AI (free OpenRouter models) provides the **semantic** side (fuzzy
  matching, format/readability judgment, weaknesses, suggestions, rewrite).
  The backend provides the **deterministic** side (Pattern B style) at zero
  API cost.
- The ATS score should be a **structured composite** so the frontend can
  render a gauge + breakdown (Pattern B style).
- Suggested ATS sub-checks for the report (`atsChecks[]`):
  1. Keyword match (mirror JD terms, exact phrasing)
  2. Skills coverage (required vs preferred)
  3. Section completeness (Summary, Experience, Education, Skills)
  4. Formatting / parse-safety (single column, standard headings, no images/tables)
  5. Quantified achievements (metrics in bullets)
  6. Readability (summary quality, length, clarity)
- Each check: `id`, `name`, `status` (pass/warn/fail), `score`, `detail`.
- `overallScore` = weighted composite of sub-check scores (weights locked at
  build time).
- `weaknesses[]` and `suggestions[]` derive from the lowest-scoring checks.
- Rewrite must preserve facts (BR-05) and follow the ATS-friendly rubric above
  without keyword stuffing (readable to a human recruiter).
- Output JSON shape (from PRD AC-05): `overallScore`, `atsChecks[]`,
  `weaknesses[]`, `suggestions[]`, `modelUsed`.

## References

- SoundCV — ATS Scanner Complete Guide 2026 (https://www.soundcv.com/blog/ats-scanner)
- CVShape — ATS Guide 2026 (https://www.cvshape.com/ats-guide)
- SimpleCVBuilder — How ATS Parses Your CV (2026) (https://www.simplecvbuilder.com/blog/resume-keywords-ats-parsing)
- HiringMessage — How ATS Resume Checkers Work (2025) (https://hiringmessage.com/resources/how-ats-works/)
- 22Skills — How ATS Software Works (2026) (https://www.22skills.com/blog/how-ats-software-works)
- BestJobSearchAPPs — ATS Resume Guide 2026 (https://bestjobsearchapps.com/articles/en/ats-resume-guide-2026-format-keywords-and-best-practices-to-beat-applicant-tracking-systems)
- Resume Optimizer Pro — 20 ATS Resume Tips (2026) (https://resumeoptimizerpro.com/blog/ats-friendly-resume-tips)
- NeuraCV — ATS Resume Best Practices 2026 (https://neuracv.com/resources/blog/stay-ahead-with-top-2026-resume-trends-and-ats-best-practices)
- GitHub: Sydulamin/CV-ATS-Checker (https://github.com/Sydulamin/CV-ATS-Checker)
- GitHub: srbhr/Resume-Matcher — apps/backend/app/services/ats.py (https://github.com/srbhr/Resume-Matcher)
- GitHub: btseytlin/hr-breaker — src/hr_breaker/agents/combined_reviewer.py (https://github.com/btseytlin/hr-breaker)
- GitHub: ed-donner/llm_engineering — ATS_Resume_Optimizer (https://github.com/ed-donner/llm_engineering)
