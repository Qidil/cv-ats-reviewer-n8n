import { describe, expect, it } from 'vitest'
import { buildAnalyzeContext, composeRewrite } from './rewrite.js'
import type { Review } from '../db/repos.js'
import type { RewriteResult } from './n8n-proxy.js'

function baseResult(overrides: Partial<RewriteResult> = {}): RewriteResult {
  return {
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    raw: '# Budi\n\n## Pengalaman Kerja\n- Backend Developer (2021-2024)',
    finishReason: 'stop',
    postCheckModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    postCheckRaw: '{"postScore":84,"warnings":[]}',
    postCheckFinishReason: 'stop',
    ...overrides,
  }
}

describe('composeRewrite — rewrite record composition', () => {
  it('uses the rewrite raw output as rewrittenMarkdown', () => {
    const composed = composeRewrite(baseResult())
    expect(composed.rewrittenMarkdown).toBe(
      '# Budi\n\n## Pengalaman Kerja\n- Backend Developer (2021-2024)',
    )
  })

  it('parses postScore and warnings from the post-check output', () => {
    const composed = composeRewrite(
      baseResult({
        postCheckRaw: '{"postScore":84,"warnings":["Pendidikan tidak disertakan"]}',
      }),
    )
    expect(composed.postScore).toBe(84)
    expect(composed.warnings).toEqual(['Pendidikan tidak disertakan'])
  })

  it('keeps a postScore of 0 instead of treating it as missing', () => {
    const composed = composeRewrite(
      baseResult({ postCheckRaw: '{"postScore":0,"warnings":[]}' }),
    )
    expect(composed.postScore).toBe(0)
  })

  it('returns null postScore when the post-check output is missing', () => {
    const composed = composeRewrite(baseResult({ postCheckModel: null, postCheckRaw: null }))
    expect(composed.postScore).toBeNull()
    expect(composed.warnings).toEqual([])
    expect(composed.postModelUsed).toBeNull()
  })

  it('does not discard the rewrite when the post-check output is unparseable (NFR-08)', () => {
    const composed = composeRewrite(baseResult({ postCheckRaw: 'gibberish tanpa json' }))
    expect(composed.rewrittenMarkdown).toBeTruthy()
    expect(composed.postScore).toBeNull()
    expect(composed.warnings).toEqual([])
  })

  it('parses post-check JSON wrapped in a fenced block', () => {
    const composed = composeRewrite(
      baseResult({ postCheckRaw: 'Hasil:\n```json\n{"postScore":72,"warnings":["a"]}\n```' }),
    )
    expect(composed.postScore).toBe(72)
    expect(composed.warnings).toEqual(['a'])
  })

  it('clamps an out-of-range postScore into 0-100', () => {
    const composed = composeRewrite(
      baseResult({ postCheckRaw: '{"postScore":500,"warnings":[]}' }),
    )
    expect(composed.postScore).toBe(100)
  })

  it('carries the post-check model through as postModelUsed', () => {
    const composed = composeRewrite(baseResult())
    expect(composed.postModelUsed).toBe('nvidia/nemotron-3-nano-30b-a3b:free')
  })
})

function baseReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 1,
    cvId: 1,
    targetJobId: 1,
    overallScore: 72.5,
    atsChecks: [
      { id: 'keyword', name: 'Keyword match', status: 'warn', score: 60, detail: 'Missing: terraform' },
      { id: 'skills', name: 'Skills coverage', status: 'pass', score: 85, detail: 'ok' },
      { id: 'sections', name: 'Section completeness', status: 'fail', score: 40, detail: 'Tidak ada bagian Education' },
    ],
    weaknesses: ['Sedikit pencapaian terukur'],
    suggestions: [],
    modelUsed: 'nvidia/test:free',
    status: 'completed',
    errorMessage: null,
    createdAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildAnalyzeContext — analyze → rewrite context', () => {
  it('includes overallScore and only non-pass checks', () => {
    const context = buildAnalyzeContext(baseReview())
    expect(context).toContain('Skor keseluruhan analisis: 72.5')
    expect(context).toContain('Keyword match (warn, skor 60)')
    expect(context).toContain('Section completeness (fail, skor 40)')
    expect(context).not.toContain('Skills coverage')
  })

  it('includes weaknesses', () => {
    const context = buildAnalyzeContext(baseReview())
    expect(context).toContain('Kelemahan yang terdeteksi:')
    expect(context).toContain('- Sedikit pencapaian terukur')
  })

  it('omits check/weakness sections when there is nothing non-pass', () => {
    const context = buildAnalyzeContext(
      baseReview({
        atsChecks: [
          { id: 'keyword', name: 'Keyword match', status: 'pass', score: 90, detail: 'ok' },
        ],
        weaknesses: [],
      }),
    )
    expect(context).toContain('Skor keseluruhan analisis: 72.5')
    expect(context).not.toContain('Cek yang belum lolos:')
    expect(context).not.toContain('Kelemahan yang terdeteksi:')
  })
})
