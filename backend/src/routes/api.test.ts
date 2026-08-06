import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { initDb, openDb } from '../db/connection.js'
import { insertRewrite } from '../db/repos.js'
import { N8nProxyError } from '../services/n8n-proxy.js'
import { createApp } from '../index.js'

vi.mock('../services/n8n-proxy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/n8n-proxy.js')>()
  return { ...actual, analyzeCv: vi.fn() }
})

import { analyzeCv as mockAnalyzeCv } from '../services/n8n-proxy.js'

function makePdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

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

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  initDb(db)
  vi.mocked(mockAnalyzeCv).mockReset()
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

  it('returns 400 when targetJobDescription is missing', async () => {
    const res = await request(createApp(db))
      .post('/api/cvs')
      .attach('cv', makePdf('Budi Sudirman'), { filename: 'cv.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(400)
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
    })
  })
})

describe('POST /api/cvs/:cvId/analyze', () => {
  it('returns 200 with the composed report', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: expect.any(Number),
      cvId,
      overallScore: 78,
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
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: 'tidak ada json' })
    const cvId = await uploadCv()
    const res = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    expect(res.status).toBe(502)
  })
})

describe('GET /api/reviews/:reviewId', () => {
  it('returns 200 with approvalId/rewriteId null', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW })
    const cvId = await uploadCv()
    const analyze = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    const reviewId = analyze.body.id as number

    const res = await request(createApp(db)).get(`/api/reviews/${reviewId}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(reviewId)
    expect(res.body.approvalId).toBeNull()
    expect(res.body.rewriteId).toBeNull()
  })

  it('returns 404 for an unknown review', async () => {
    const res = await request(createApp(db)).get('/api/reviews/999')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/reviews/:reviewId/approve', () => {
  async function createReview(): Promise<number> {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW })
    const cvId = await uploadCv()
    const analyze = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    return analyze.body.id as number
  }

  it('stores only the approved suggestion ids', async () => {
    const reviewId = await createReview()
    const res = await request(createApp(db))
      .post(`/api/reviews/${reviewId}/approve`)
      .send({ approvedSuggestionIds: ['sug-1'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: expect.any(Number) })

    const approvalId = res.body.id as number
    const approval = await request(createApp(db)).get(`/api/approvals/${approvalId}`)
    expect(approval.status).toBe(200)
    expect(approval.body.approvedSuggestionIds).toEqual(['sug-1'])
  })

  it('returns 400 for an empty id list', async () => {
    const reviewId = await createReview()
    const res = await request(createApp(db))
      .post(`/api/reviews/${reviewId}/approve`)
      .send({ approvedSuggestionIds: [] })
    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown suggestion ids', async () => {
    const reviewId = await createReview()
    const res = await request(createApp(db))
      .post(`/api/reviews/${reviewId}/approve`)
      .send({ approvedSuggestionIds: ['sug-99'] })
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown review', async () => {
    const res = await request(createApp(db))
      .post('/api/reviews/999/approve')
      .send({ approvedSuggestionIds: ['sug-1'] })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/approvals/:approvalId', () => {
  it('returns 404 for an unknown approval', async () => {
    const res = await request(createApp(db)).get('/api/approvals/999')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/rewrites/:rewriteId', () => {
  it('returns 200 with a stored rewrite', async () => {
    vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW })
    const cvId = await uploadCv()
    const analyze = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
    const reviewId = analyze.body.id as number
    const approve = await request(createApp(db))
      .post(`/api/reviews/${reviewId}/approve`)
      .send({ approvedSuggestionIds: ['sug-1'] })
    const approvalId = approve.body.id as number

    const rewriteId = insertRewrite(db, {
      reviewId,
      approvalId,
      rewrittenMarkdown: '# Rewritten',
      postScore: 84,
      warnings: ['Removed 1 education detail'],
      postModelUsed: 'nvidia/post:free',
    })

    const res = await request(createApp(db)).get(`/api/rewrites/${rewriteId}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: rewriteId,
      reviewId,
      approvalId,
      rewrittenMarkdown: '# Rewritten',
      postScore: 84,
      warnings: ['Removed 1 education detail'],
      postModelUsed: 'nvidia/post:free',
    })
  })

  it('returns 404 for an unknown rewrite', async () => {
    const res = await request(createApp(db)).get('/api/rewrites/999')
    expect(res.status).toBe(404)
  })
})
