import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { initDb, openDb } from '../db/connection.js'
import { getCvById } from '../db/repos.js'
import { N8nProxyError } from '../services/n8n-proxy.js'
import { makePdf, makePdfWith } from '../services/pdf-test-utils.js'
import { createApp } from '../index.js'

vi.mock('../services/n8n-proxy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/n8n-proxy.js')>()
  return { ...actual, analyzeCv: vi.fn(), matchJobs: vi.fn() }
})

import { analyzeCv as mockAnalyzeCv, matchJobs as mockMatchJobs } from '../services/n8n-proxy.js'

const MODEL_RAW = `Berikut laporan ATS CV:
\`\`\`json
{
  "overallScore": 78,
  "atsChecks": [
    { "id": "keyword", "name": "Keyword match", "status": "warn", "score": 60, "detail": "Missing: terraform" },
    { "id": "skills", "name": "Skills coverage", "status": "pass", "score": 85, "detail": "ok" },
    { "id": "sections", "name": "Section completeness", "status": "pass", "score": 90, "detail": "ok" },
    { "id": "formatting", "name": "Formatting", "status": "pass", "score": 88, "detail": "ok" },
    { "id": "quantified", "name": "Quantified achievements", "status": "warn", "score": 55, "detail": "add metrics" },
    { "id": "readability", "name": "Readability", "status": "pass", "score": 80, "detail": "ok" }
  ],
  "weaknesses": ["Few quantified achievements"],
  "suggestions": [
    { "title": "Add metrics", "description": "Add numbers to bullets", "category": "achievements", "priority": "high" },
    { "title": "Add keywords", "description": "Mirror JD terms", "category": "keywords", "priority": "medium" }
  ]
}
\`\`\``

const JOBS_RAW = `\`\`\`json
{
  "overallScore": 81,
  "atsChecks": [
    { "id": "keyword", "name": "Keyword match", "status": "pass", "score": 82, "detail": "strong technical vocabulary" },
    { "id": "skills", "name": "Skills coverage", "status": "pass", "score": 80, "detail": "good" },
    { "id": "sections", "name": "Section completeness", "status": "pass", "score": 90, "detail": "ok" },
    { "id": "formatting", "name": "Formatting", "status": "pass", "score": 88, "detail": "ok" },
    { "id": "quantified", "name": "Quantified achievements", "status": "warn", "score": 55, "detail": "add metrics" },
    { "id": "readability", "name": "Readability", "status": "pass", "score": 80, "detail": "ok" }
  ],
  "weaknesses": ["Few quantified achievements"],
  "suggestions": [
    { "title": "Add metrics", "description": "Add numbers", "category": "achievements", "priority": "high" }
  ],
  "jobs": [
    { "title": "Backend Engineer", "reasons": ["Node.js", "REST API"], "matchScore": 88 },
    { "title": "DevOps Engineer", "reasons": ["CI/CD"], "matchScore": 74 }
  ]
}
\`\`\``

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  initDb(db)
  vi.mocked(mockAnalyzeCv).mockReset()
  vi.mocked(mockMatchJobs).mockReset()
})

afterEach(() => {
  db.close()
})

async function uploadCv(description = 'Backend Engineer at TechCo'): Promise<number> {
  const res = await request(createApp(db))
    .post('/api/cvs')
    .attach('cv', makePdf('Budi Sudirman Software Engineer Experience: X Education: S1 Skills: node'), {
      filename: 'cv.pdf',
      contentType: 'application/pdf',
    })
    .field('targetJobTitle', 'Backend Engineer')
    .field('targetJobDescription', description)
  return res.body.id as number
}

describe('POST /api/cvs', () => {
  it('uploads a valid PDF and returns 201 { id }', async () => {
    const res = await request(createApp(db))
      .post('/api/cvs')
      .attach('cv', makePdf('Budi Sudirman Software Engineer'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      })
      .field('targetJobDescription', 'Backend Engineer at TechCo')

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.any(Number) })
  })

  it('returns 400 when no file is attached', async () => {
    const res = await request(createApp(db)).post('/api/cvs').field('targetJobDescription', 'Backend Engineer')
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTypeOf('string')
  })

  it('returns 415 when the file is not a PDF', async () => {
    const res = await request(createApp(db))
      .post('/api/cvs')
      .attach('cv', Buffer.from('plain text, not a pdf'), {
        filename: 'cv.txt',
        contentType: 'text/plain',
      })
      .field('targetJobDescription', 'Backend Engineer')
    expect(res.status).toBe(415)
  })

  it('returns 201 when targetJobDescription is missing (Mode B upload)', async () => {
    const res = await request(createApp(db))
      .post('/api/cvs')
      .attach('cv', makePdf('Budi Sudirman'), { filename: 'cv.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(201)
  })

  it('returns 400 when the upload exceeds the size limit', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024)
    big.fill(32)
    const res = await request(createApp(db))
      .post('/api/cvs')
      .attach('cv', big, { filename: 'cv.pdf', contentType: 'application/pdf' })
      .field('targetJobDescription', 'Backend Engineer')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/cvs', () => {
  it('lists CVs with computed latestReviewId', async () => {
    const cvId = await uploadCv()
    const res = await request(createApp(db)).get('/api/cvs')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toEqual({
      id: cvId,
      originalFilename: 'cv.pdf',
      createdAt: expect.any(String),
      latestReviewId: null,
      latestMatchId: null,
    })
  })
})

describe('POST /api/cvs/:cvId/analyze', () => {
  it('returns 200 with the composed report', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW, finishReason: 'stop' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: expect.any(Number),
      cvId,
      targetJobId: expect.any(Number),
      overallScore: 64,
      atsChecks: expect.arrayContaining([expect.objectContaining({ id: 'keyword' })]),
      weaknesses: ['Few quantified achievements'],
      suggestions: expect.arrayContaining([expect.objectContaining({ id: 'sug-1', title: 'Add metrics' })]),
      modelUsed: 'nvidia/test:free',
      createdAt: expect.any(String),
    })
    expect(res.body.atsChecks).toHaveLength(6)
  })

  it('returns 404 when the CV does not exist', async () => {
    const res = await request(createApp(db)).post('/api/cvs/999/analyze')
    expect(res.status).toBe(404)
  })

  it('returns 502 when the proxy fails', async () => {
    vi.mocked(mockAnalyzeCv).mockRejectedValue(new N8nProxyError('n8n down'))
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(502)
  })

  it('returns 502 when the model output cannot be parsed', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: 'tidak ada json', finishReason: 'stop' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(502)
  })

  it('returns 502 with a specific message when the model runs out of tokens (ERROR-01)', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: '', finishReason: 'length' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('kehabisan token')
  })

  it('returns 502 with a fallback message when the output is empty', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: '', finishReason: 'stop' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('Semua model AI gagal')
  })
})

describe('GET /api/reviews/:reviewId', () => {
  it('returns 200 with approvalId/rewriteId null', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW, finishReason: 'stop' })
    const cvId = await uploadCv()
    const analyze = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    const reviewId = analyze.body.id as number

    const res = await request(createApp(db)).get(`/api/reviews/${reviewId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(reviewId)
    expect(res.body.cvId).toBe(cvId)
    expect(res.body.targetJobId).toBeTypeOf('number')
    expect(res.body.approvalId).toBeNull()
    expect(res.body.rewriteId).toBeNull()
  })

  it('returns 404 for an unknown review', async () => {
    const res = await request(createApp(db)).get('/api/reviews/999')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/cvs/:cvId/jobs (Mode B)', () => {
  it('returns 200 with review + jobMatch and stores both records', async () => {
    vi.mocked(mockMatchJobs).mockResolvedValue({ model: 'nvidia/test:free', raw: JOBS_RAW, finishReason: 'stop' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/jobs`)
    expect(res.status).toBe(200)
    expect(res.body.review).toMatchObject({
      id: expect.any(Number),
      cvId,
      overallScore: 72,
      targetJobId: null,
      modelUsed: 'nvidia/test:free',
    })
    expect(res.body.jobMatch).toMatchObject({
      id: expect.any(Number),
      cvId,
      matches: [
        { title: 'Backend Engineer', reasons: ['Node.js', 'REST API'], matchScore: 88 },
        { title: 'DevOps Engineer', reasons: ['CI/CD'], matchScore: 74 },
      ],
      modelUsed: 'nvidia/test:free',
      status: 'completed',
      errorMessage: null,
    })
    expect(res.body.review.atsChecks).toHaveLength(6)
  })

  it('returns 404 when the CV does not exist', async () => {
    const res = await request(createApp(db)).post('/api/cvs/999/jobs')
    expect(res.status).toBe(404)
  })

  it('returns 502 when the proxy fails', async () => {
    vi.mocked(mockMatchJobs).mockRejectedValue(new N8nProxyError('n8n down'))
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/jobs`)
    expect(res.status).toBe(502)
  })

  it('returns 502 with a jobs-specific message when the output cannot be parsed', async () => {
    vi.mocked(mockMatchJobs).mockResolvedValue({ model: 'nvidia/test:free', raw: '', finishReason: 'length' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/jobs`)
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('saran pekerjaan')
  })

  it('returns 502 when the model returns a continuation fragment without core fields (Phase 12)', async () => {
    const fragment = JSON.stringify({
      description: 'Buat dua sub-section berdasarkan pengalaman',
      jobs: [{ title: 'Backend Engineer', reasons: ['Node.js'], matchScore: 88 }],
    })
    vi.mocked(mockMatchJobs).mockResolvedValue({ model: 'nvidia/test:free', raw: fragment, finishReason: 'stop' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/jobs`)
    expect(res.status).toBe(502)
  })

  it('returns 502 when the parsed report has an empty jobs list (Phase 12)', async () => {
    const raw = JSON.stringify({
      overallScore: 81,
      atsChecks: [
        { id: 'keyword', name: 'Keyword match', status: 'pass', score: 82, detail: 'x' },
        { id: 'skills', name: 'Skills coverage', status: 'pass', score: 80, detail: 'x' },
        { id: 'sections', name: 'Section completeness', status: 'pass', score: 90, detail: 'x' },
        { id: 'formatting', name: 'Formatting', status: 'pass', score: 88, detail: 'x' },
        { id: 'quantified', name: 'Quantified achievements', status: 'warn', score: 55, detail: 'x' },
        { id: 'readability', name: 'Readability', status: 'pass', score: 80, detail: 'x' },
      ],
      weaknesses: [],
      suggestions: [],
      jobs: [],
    })
    vi.mocked(mockMatchJobs).mockResolvedValue({ model: 'nvidia/test:free', raw, finishReason: 'stop' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/jobs`)
    expect(res.status).toBe(502)
  })
})

describe('GET /api/job-matches/:matchId', () => {
  it('returns the stored job match', async () => {
    vi.mocked(mockMatchJobs).mockResolvedValue({ model: 'nvidia/test:free', raw: JOBS_RAW, finishReason: 'stop' })
    const cvId = await uploadCv()
    const jobs = await request(createApp(db)).post(`/api/cvs/${cvId}/jobs`)
    const matchId = jobs.body.jobMatch.id as number

    const res = await request(createApp(db)).get(`/api/job-matches/${matchId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(matchId)
    expect(res.body.cvId).toBe(cvId)
    expect(res.body.matches).toHaveLength(2)
    expect(res.body.modelUsed).toBe('nvidia/test:free')
  })

  it('returns 404 for an unknown match', async () => {
    const res = await request(createApp(db)).get('/api/job-matches/999')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/reviews/:reviewId/approve (rewrite flow disabled)', () => {
  it('returns 404 when the approvals router is not mounted', async () => {
    const res = await request(createApp(db))
      .post('/api/reviews/999/approve')
      .send({ approvedSuggestionIds: ['sug-1'] })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/approvals/:approvalId (rewrite flow disabled)', () => {
  it('returns 404 for any approval id', async () => {
    const res = await request(createApp(db)).get('/api/approvals/999')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/rewrites/:rewriteId (rewrite flow disabled)', () => {
  it('returns 404 for any rewrite id', async () => {
    const res = await request(createApp(db)).get('/api/rewrites/999')
    expect(res.status).toBe(404)
  })
})

describe('Phase 14 — typography & layout integration', () => {
  function twoColumnPdf(): Buffer {
    const content = [
      'BT /F1 24 Tf 72 740 Td (Budi Sudirman) Tj ET',
      'BT /F2 12 Tf 72 720 Td (budi@mail.com 081234567890) Tj ET',
      'BT /F2 12 Tf 72 700 Td (- Led team shipping apis) Tj ET',
      'BT /F2 12 Tf 340 740 Td (Skills: node typescript docker) Tj ET',
      'BT /F2 12 Tf 340 720 Td (- git ci cd kubernetes) Tj ET',
      'BT /F2 12 Tf 340 700 Td (- postgres redis aws) Tj ET',
    ].join('\n')
    return makePdfWith(content, { fonts: ['Times-Roman', 'Helvetica'] })
  }

  async function uploadTwoColumnCv(): Promise<number> {
    const res = await request(createApp(db))
      .post('/api/cvs')
      .attach('cv', twoColumnPdf(), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      })
      .field('targetJobTitle', 'Backend Engineer')
      .field('targetJobDescription', 'Backend Engineer at TechCo')
    return res.body.id as number
  }

  it('stores typography + layout metadata for a two-column PDF (SC-07)', async () => {
    const cvId = await uploadTwoColumnCv()
    const cv = getCvById(db, cvId)
    expect(cv?.typographyJson).not.toBeNull()
    expect(cv?.typographyJson?.layout?.columnCount).toBeGreaterThanOrEqual(2)
    expect(cv?.typographyJson?.typography?.fontFamilies.length).toBe(2)
  })

  it('report carries the deterministic 2-column penalty and typography suggestions (SC-07)', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW, finishReason: 'stop' })
    const cvId = await uploadTwoColumnCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)

    expect(res.status).toBe(200)
    const formatting = res.body.atsChecks.find((check: { id: string }) => check.id === 'formatting')
    expect(formatting?.detail).toContain('format 2 kolom (penalti -15)')
    expect(res.body.suggestions.some((s: { id: string }) => s.id.startsWith('typo-'))).toBe(true)
  })
})
