import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeCv, rewriteCv, N8nProxyError } from './n8n-proxy.js'

const VALID_BODY = { model: 'nvidia/nemotron-3-ultra-550b-a55b:free', raw: '{"overallScore":10}' }

function mockFetchOnce(response: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('analyzeCv — n8n webhook proxy', () => {
  it('posts the payload to the webhook URL built from N8N_URL and N8N_ANALYZE_PATH', async () => {
    vi.stubEnv('N8N_URL', 'http://n8n.example.com/')
    vi.stubEnv('N8N_ANALYZE_PATH', 'cv-analyze')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_BODY,
    })
    vi.stubGlobal('fetch', fetchMock)

    const payload = { cvId: 1, cvText: 'Budi\nPekerjaan', targetJobDescription: 'Backend' }
    await analyzeCv(payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://n8n.example.com/webhook/cv-analyze')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual(payload)
  })

  it('falls back to localhost and the default path when env vars are unset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_BODY,
    })
    vi.stubGlobal('fetch', fetchMock)

    await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://localhost:5678/webhook/cv-analyze')
  })

  it('returns { model, raw } on a successful response', async () => {
    mockFetchOnce(VALID_BODY)
    const result = await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })
    expect(result).toEqual(VALID_BODY)
  })

  it('throws N8nProxyError when the workflow returns a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      }),
    )
    await expect(
      analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('throws N8nProxyError when the response does not match the { model, raw } contract', async () => {
    mockFetchOnce({ model: 42 })
    await expect(
      analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('wraps a network failure as N8nProxyError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(
      analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('uses N8N_TIMEOUT_MS when set, otherwise the default 600s timeout', async () => {
    vi.stubEnv('N8N_TIMEOUT_MS', '5000')
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    mockFetchOnce(VALID_BODY)
    await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })

    const schedule = timeoutSpy.mock.calls.find((args) => args[1] === 5000)
    expect(schedule).toBeDefined()
    timeoutSpy.mockRestore()
  })
})

const REWRITE_BODY = {
  model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  raw: '# Budi\n\nPengalaman',
  postCheckModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
  postCheckRaw: '{"postScore":80,"warnings":[]}',
}

function mockFetchJson(response: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    }),
  )
}

describe('rewriteCv — n8n rewrite webhook proxy', () => {
  it('posts payload to N8N_REWRITE_PATH with approvedSuggestions', async () => {
    vi.stubEnv('N8N_URL', 'http://n8n.example.com/')
    vi.stubEnv('N8N_REWRITE_PATH', 'cv-rewrite')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => REWRITE_BODY,
    })
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      cvId: 7,
      targetJobDescription: 'Backend',
      originalCv: 'CV asli',
      approvedSuggestions: [{ id: 'sug-1', title: 'Add metrics' }],
    }
    await rewriteCv(payload)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://n8n.example.com/webhook/cv-rewrite')
    expect(JSON.parse(init.body as string)).toEqual(payload)
  })

  it('returns model, raw and post-check fields on success', async () => {
    mockFetchJson(REWRITE_BODY)
    const result = await rewriteCv({
      cvId: 7,
      targetJobDescription: 'JD',
      originalCv: 'CV',
      approvedSuggestions: [],
    })
    expect(result).toEqual(REWRITE_BODY)
  })

  it('normalizes missing post-check fields to null instead of failing', async () => {
    mockFetchJson({ model: 'm', raw: '# CV' })
    const result = await rewriteCv({
      cvId: 7,
      targetJobDescription: 'JD',
      originalCv: 'CV',
      approvedSuggestions: [],
    })
    expect(result.postCheckModel).toBeNull()
    expect(result.postCheckRaw).toBeNull()
  })

  it('throws N8nProxyError on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    await expect(
      rewriteCv({ cvId: 7, targetJobDescription: 'JD', originalCv: 'CV', approvedSuggestions: [] }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('throws N8nProxyError when raw is missing', async () => {
    mockFetchJson({ model: 'm', postCheckRaw: '{}' })
    await expect(
      rewriteCv({ cvId: 7, targetJobDescription: 'JD', originalCv: 'CV', approvedSuggestions: [] }),
    ).rejects.toThrow(N8nProxyError)
  })
})
