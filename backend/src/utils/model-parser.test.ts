import { describe, expect, it } from 'vitest'
import {
  parseAnalyzeReport,
  ModelParseError,
  describeAnalyzeFailure,
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
