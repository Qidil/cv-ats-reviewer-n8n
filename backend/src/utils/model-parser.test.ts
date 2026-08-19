import { describe, expect, it } from 'vitest'
import {
  parseAnalyzeReport,
  parseJobsReport,
  ModelParseError,
  describeAnalyzeFailure,
  describeJobsFailure,
  describeRewriteFailure,
} from './model-parser.js'

const VALID_REPORT = {
  overallScore: 72.5,
  atsChecks: [
    { id: 'keyword', name: 'Keyword match', status: 'warn', score: 60, detail: 'Missing: terraform' },
  ],
  weaknesses: ['weak'],
  suggestions: [
    { id: 'sug-1', title: 'Add metrics', description: 'Quantify achievements', category: 'achievements', priority: 'high' },
  ],
}

describe('parseAnalyzeReport', () => {
  it('parses clean JSON', () => {
    const parsed = parseAnalyzeReport(JSON.stringify(VALID_REPORT))
    expect(parsed).toEqual(VALID_REPORT)
  })

  it('parses JSON from a ```json fenced block', () => {
    const raw = `Berikut hasil analisis:\n\n\`\`\`json\n${JSON.stringify(VALID_REPORT)}\n\`\`\`\n\nSemoga membantu.`
    expect(parseAnalyzeReport(raw)).toEqual(VALID_REPORT)
  })

  it('parses JSON from a plain fenced block without json marker', () => {
    const raw = `\`\`\`\n${JSON.stringify(VALID_REPORT)}\n\`\`\``
    expect(parseAnalyzeReport(raw)).toEqual(VALID_REPORT)
  })

  it('falls back to regex extraction for malformed output', () => {
    const raw = `Ini teks bebas sebelum JSON. {"overallScore": 60, "weaknesses": ["a"], "suggestions": [], "atsChecks": []} dan teks aneh sesudahnya {rusak}`
    const parsed = parseAnalyzeReport(raw)
    expect(parsed.overallScore).toBe(60)
  })

  it('throws ModelParseError when nothing parseable', () => {
    expect(() => parseAnalyzeReport('gibberish tanpa json')).toThrow(ModelParseError)
    expect(() => parseAnalyzeReport('')).toThrow(ModelParseError)
  })

  it('normalizes out-of-range fields instead of trusting them', () => {
    const raw = JSON.stringify({
      overallScore: 500,
      atsChecks: [
        { id: 'keyword', name: 'K', status: 'wat', score: -10, detail: 'x' },
      ],
      weaknesses: [1, null, 'ok'],
      suggestions: [
        { id: 7, title: 'T', description: 'D', category: 'c', priority: 'urgent' },
      ],
    })
    const parsed = parseAnalyzeReport(raw)
    expect(parsed.overallScore).toBe(100)
    const check = parsed.atsChecks[0]
    expect(check?.score).toBe(0)
    expect(check?.status).toBe('warn')
    expect(parsed.weaknesses).toEqual(['ok'])
    const sug = parsed.suggestions[0]
    expect(sug?.id).toBe('sug-1')
    expect(sug?.priority).toBe('medium')
  })

  it('keeps an explicit overallScore of 0 instead of treating it as missing', () => {
    const parsed = parseAnalyzeReport(JSON.stringify({ ...VALID_REPORT, overallScore: 0 }))
    expect(parsed.overallScore).toBe(0)
  })

  it('returns null overallScore when the model provides none', () => {
    const parsed = parseAnalyzeReport(JSON.stringify({ ...VALID_REPORT, overallScore: undefined }))
    expect(parsed.overallScore).toBeNull()
  })

  it('throws ModelParseError for a valid JSON fragment without core fields (CR-18)', () => {
    const fragment = JSON.stringify({
      description: 'Buat dua sub-section berdasarkan pengalaman',
      suggestions: [{ title: 'T', description: 'D', category: 'c', priority: 'high' }],
    })
    expect(() => parseAnalyzeReport(fragment)).toThrow('Struktur laporan tidak lengkap')
  })

  it('normalizes deeply nested suggestion objects without throwing (CR-19)', () => {
    const raw = JSON.stringify({
      ...VALID_REPORT,
      suggestions: [
        { title: 'Nested', description: { deep: { very: ['a', { b: 1 }] } } },
        null,
        { title: 42, description: 'ok', category: 7, priority: 'low' },
      ],
    })
    const parsed = parseAnalyzeReport(raw)
    expect(parsed.suggestions).toHaveLength(3)
    expect(parsed.suggestions[0]).toMatchObject({ title: 'Nested', description: '', priority: 'medium' })
    expect(parsed.suggestions[1]).toMatchObject({ title: 'Saran 2' })
    expect(parsed.suggestions[2]).toMatchObject({ title: 'Saran 3', description: 'ok', priority: 'low' })
  })

  it('parses a report at the end of a very large preamble without truncation (CR-19)', () => {
    const preamble = 'lorem ipsum dolor sit amet '.repeat(20_000)
    const raw = `${preamble}\n${JSON.stringify(VALID_REPORT)}`
    const parsed = parseAnalyzeReport(raw)
    expect(parsed.overallScore).toBe(72.5)
    expect(parsed.atsChecks).toHaveLength(1)
  })

  it('throws a clean ModelParseError for invalid unicode escapes (\\uZZZZ) instead of crashing (CR-19)', () => {
    const raw = `{"overallScore": 60, "atsChecks": [], "weaknesses": ["\\uZZZZ broken"], "suggestions": []}`
    expect(() => parseAnalyzeReport(raw)).toThrow(ModelParseError)
  })

  it('keeps valid lone-surrogate escapes (\\uD800) inside strings (CR-19)', () => {
    const raw = `{"overallScore": 60, "atsChecks": [], "weaknesses": ["surrogate \\uD800 kept"], "suggestions": []}`
    const parsed = parseAnalyzeReport(raw)
    expect(parsed.overallScore).toBe(60)
    expect(parsed.weaknesses).toEqual(['surrogate \uD800 kept'])
  })
})

describe('describeAnalyzeFailure', () => {
  it('explains a token-limit finish reason', () => {
    const msg = describeAnalyzeFailure('', 'length')
    expect(msg).toContain('kehabisan token')
    expect(msg).toContain('model berbayar')
  })

  it('explains empty output from every model', () => {
    const msg = describeAnalyzeFailure('', 'stop')
    expect(msg).toContain('Semua model AI gagal')
  })

  it('explains unparseable output', () => {
    const msg = describeAnalyzeFailure('teks tanpa json', 'stop')
    expect(msg).toContain('tidak sesuai format')
  })

  it('treats a missing finish reason as a generic failure', () => {
    const msg = describeAnalyzeFailure('teks tanpa json', null)
    expect(msg).toContain('tidak sesuai format')
  })
})

describe('parseJobsReport', () => {
  it('parses the ATS report plus jobs[]', () => {
    const parsed = parseJobsReport(
      JSON.stringify({
        ...VALID_REPORT,
        jobs: [
          { title: 'Backend Engineer', reasons: ['Node.js', 'REST API'], matchScore: 88 },
          { title: 'DevOps Engineer', reasons: ['CI/CD'], matchScore: 74 },
        ],
      }),
    )
    expect(parsed.overallScore).toBe(72.5)
    expect(parsed.jobs).toEqual([
      { title: 'Backend Engineer', reasons: ['Node.js', 'REST API'], matchScore: 88 },
      { title: 'DevOps Engineer', reasons: ['CI/CD'], matchScore: 74 },
    ])
  })

  it('parses jobs from a fenced block', () => {
    const raw = `\`\`\`json\n${JSON.stringify({ ...VALID_REPORT, jobs: [{ title: 'Data Engineer', reasons: ['SQL'], matchScore: 80 }] })}\n\`\`\``
    expect(parseJobsReport(raw).jobs).toHaveLength(1)
  })

  it('normalizes malformed jobs entries and clamps matchScore', () => {
    const parsed = parseJobsReport(
      JSON.stringify({
        ...VALID_REPORT,
        jobs: [
          { title: 7, reasons: ['ok', null, 3], matchScore: 500 },
          { title: '', reasons: [], matchScore: -10 },
        ],
      }),
    )
    expect(parsed.jobs).toEqual([
      { title: '', reasons: ['ok'], matchScore: 100 },
      { title: '', reasons: [], matchScore: 0 },
    ])
  })

  it('returns an empty jobs list when jobs is missing or not an array', () => {
    expect(parseJobsReport(JSON.stringify(VALID_REPORT)).jobs).toEqual([])
    expect(parseJobsReport(JSON.stringify({ ...VALID_REPORT, jobs: 'nope' })).jobs).toEqual([])
  })

  it('throws ModelParseError when nothing parseable', () => {
    expect(() => parseJobsReport('gibberish tanpa json')).toThrow(ModelParseError)
    expect(() => parseJobsReport('')).toThrow(ModelParseError)
  })

  it('throws ModelParseError for a valid JSON continuation fragment without core fields (Phase 12)', () => {
    const fragment = JSON.stringify({
      description: 'Buat dua sub-section berdasarkan pengalaman',
      jobs: [{ title: 'Backend Engineer', reasons: ['Node.js'], matchScore: 88 }],
    })
    expect(() => parseJobsReport(fragment)).toThrow('Struktur laporan tidak lengkap')
  })
})

describe('describeJobsFailure', () => {
  it('explains a token-limit finish reason', () => {
    expect(describeJobsFailure('', 'length')).toContain('kehabisan token')
  })

  it('explains empty output from every model', () => {
    expect(describeJobsFailure('', 'stop')).toContain('Semua model AI gagal')
  })

  it('explains unparseable output', () => {
    expect(describeJobsFailure('teks tanpa json', 'stop')).toContain('tidak sesuai format')
  })
})

describe('describeRewriteFailure', () => {
  it('explains a token-limit finish reason', () => {
    expect(describeRewriteFailure('length')).toContain('kehabisan token')
  })

  it('explains a generic failure', () => {
    expect(describeRewriteFailure('stop')).toContain('gagal menulis ulang')
  })

  it('handles a missing finish reason', () => {
    expect(describeRewriteFailure(null)).toContain('gagal menulis ulang')
  })
})
