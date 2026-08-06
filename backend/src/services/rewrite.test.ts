import { describe, expect, it } from 'vitest'
import { composeRewrite } from './rewrite.js'
import type { RewriteResult } from './n8n-proxy.js'

function baseResult(overrides: Partial<RewriteResult> = {}): RewriteResult {
  return {
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    raw: '# Budi\n\n## Pengalaman Kerja\n- Backend Developer (2021-2024)',
    postCheckModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    postCheckRaw: '{"postScore":84,"warnings":[]}',
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
