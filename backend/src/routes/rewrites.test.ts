import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import type { DatabaseSync } from 'node:sqlite'
import { initDb, openDb } from '../db/connection.js'
import { N8nProxyError } from '../services/n8n-proxy.js'
import { createApp } from '../index.js'

vi.mock('../services/n8n-proxy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/n8n-proxy.js')>()
  return { ...actual, analyzeCv: vi.fn(), rewriteCv: vi.fn() }
})

vi.mock('../services/export.js', () => ({
  exportRewrite: vi.fn(),
}))

import { analyzeCv as mockAnalyzeCv, rewriteCv as mockRewriteCv } from '../services/n8n-proxy.js'
import { exportRewrite as mockExportRewrite } from '../services/export.js'

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
    { "title": "Add metrics", "description": "Add numbers to bullets", "category": "achievements", "priority": "high" }
  ]
}
\`\`\``

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

let db: DatabaseSync

beforeEach(() => {
  db = openDb(':memory:')
  initDb(db)
  vi.mocked(mockAnalyzeCv).mockReset()
  vi.mocked(mockRewriteCv).mockReset()
  vi.mocked(mockExportRewrite).mockReset()
})

afterEach(() => {
  db.close()
})

async function createApproval(description = 'Backend Engineer at TechCo'): Promise<number> {
  vi.mocked(mockAnalyzeCv).mockResolvedValue({ model: 'nvidia/test:free', raw: MODEL_RAW, finishReason: 'stop' })
  const upload = await request(createApp(db))
    .post('/api/cvs')
    .attach('cv', makePdf('Budi Sudirman Skills: node, typescript Experience: Backend 2021-2024'), {
      filename: 'cv.pdf',
      contentType: 'application/pdf',
    })
    .field('targetJobTitle', 'Backend Engineer')
    .field('targetJobDescription', description)
  const cvId = upload.body.id as number
  const analyze = await request(createApp(db)).post(`/api/cvs/${cvId}/analyze`)
  const reviewId = analyze.body.id as number
  const approve = await request(createApp(db))
    .post(`/api/reviews/${reviewId}/approve`)
    .send({ approvedSuggestionIds: ['sug-1'] })
  return approve.body.id as number
}

describe('POST /api/approvals/:approvalId/rewrite', () => {
  it('calls the proxy, composes and returns the rewrite record (200)', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '# Budi\n\n## Pengalaman Kerja\n- Backend Developer (2021-2024)',
      finishReason: 'stop',
      postCheckModel: 'nvidia/post:free',
      postCheckRaw: '{"postScore":80,"warnings":[]}',
      postCheckFinishReason: 'stop',
    })
    const approvalId = await createApproval()

    const res = await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      approvalId,
      rewrittenMarkdown: '# Budi\n\n## Pengalaman Kerja\n- Backend Developer (2021-2024)',
      postScore: 80,
      warnings: [],
      postModelUsed: 'nvidia/post:free',
    })
    expect(vi.mocked(mockRewriteCv)).toHaveBeenCalledWith(
      expect.objectContaining({
        cvId: expect.any(Number),
        targetJobDescription: 'Backend Engineer at TechCo',
        originalCv: expect.any(String),
        approvedSuggestions: expect.arrayContaining([expect.objectContaining({ id: 'sug-1' })]),
        format: 'chronological',
        analyzeContext: expect.stringContaining('Skor keseluruhan analisis: 78'),
      }),
    )
  })

  it('passes the requested format through to the proxy', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '# Budi',
      finishReason: 'stop',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    await request(createApp(db))
      .post(`/api/approvals/${approvalId}/rewrite`)
      .send({ format: 'combination' })
    expect(vi.mocked(mockRewriteCv)).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'combination' }),
    )
  })

  it('falls back to chronological for an unknown format', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '# Budi',
      finishReason: 'stop',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    await request(createApp(db))
      .post(`/api/approvals/${approvalId}/rewrite`)
      .send({ format: 'bogus' })
    expect(vi.mocked(mockRewriteCv)).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'chronological' }),
    )
  })

  it('builds analyzeContext from the review checks and weaknesses', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '# Budi',
      finishReason: 'stop',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    const payload = vi.mocked(mockRewriteCv).mock.calls.at(-1)?.[0]
    expect(payload?.analyzeContext).toContain('Keyword match')
    expect(payload?.analyzeContext).toContain('Skor keseluruhan analisis')
  })

  it('keeps the rewrite when the post-check output is missing (NFR-08)', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '# Budi',
      finishReason: 'stop',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    const res = await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    expect(res.status).toBe(200)
    expect(res.body.postScore).toBeNull()
    expect(res.body.postModelUsed).toBeNull()
  })

  it('returns 502 when the proxy fails', async () => {
    vi.mocked(mockRewriteCv).mockRejectedValue(new N8nProxyError('n8n down'))
    const approvalId = await createApproval()
    const res = await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    expect(res.status).toBe(502)
  })

  it('returns 502 with a specific message when the rewrite model runs out of tokens (ERROR-01)', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '',
      finishReason: 'length',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    const res = await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('kehabisan token')
  })

  it('returns 502 with a fallback message when the rewrite output is empty', async () => {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '',
      finishReason: 'stop',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    const res = await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('gagal menulis ulang')
  })

  it('returns 404 for an unknown approval', async () => {
    const res = await request(createApp(db)).post('/api/approvals/999/rewrite')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/rewrites/:rewriteId/export', () => {
  async function createStoredRewrite(): Promise<number> {
    vi.mocked(mockRewriteCv).mockResolvedValue({
      model: 'nvidia/rewrite:free',
      raw: '# Budi',
      finishReason: 'stop',
      postCheckModel: null,
      postCheckRaw: null,
      postCheckFinishReason: null,
    })
    const approvalId = await createApproval()
    const res = await request(createApp(db)).post(`/api/approvals/${approvalId}/rewrite`)
    return res.body.id as number
  }

  it('returns a PDF download for format=pdf', async () => {
    const rewriteId = await createStoredRewrite()
    vi.mocked(mockExportRewrite).mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4 mock'),
      contentType: 'application/pdf',
      filename: 'cv-rewritten.pdf',
    })
    const res = await request(createApp(db)).get(`/api/rewrites/${rewriteId}/export?format=pdf`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.body).toBeInstanceOf(Buffer)
    expect(res.body.toString('latin1')).toContain('%PDF-1.4')
  })

  it('returns a DOCX download for format=docx', async () => {
    const rewriteId = await createStoredRewrite()
    vi.mocked(mockExportRewrite).mockResolvedValue({
      buffer: Buffer.from('PK mock docx'),
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'cv-rewritten.docx',
    })
    const res = await request(createApp(db)).get(`/api/rewrites/${rewriteId}/export?format=docx`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('wordprocessingml')
  })

  it('returns 400 for an unsupported format', async () => {
    const rewriteId = await createStoredRewrite()
    const res = await request(createApp(db)).get(`/api/rewrites/${rewriteId}/export?format=txt`)
    expect(res.status).toBe(400)
  })

  it('returns 400 when the format is missing', async () => {
    const rewriteId = await createStoredRewrite()
    const res = await request(createApp(db)).get(`/api/rewrites/${rewriteId}/export`)
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown rewrite', async () => {
    const res = await request(createApp(db)).get('/api/rewrites/999/export?format=pdf')
    expect(res.status).toBe(404)
  })
})
