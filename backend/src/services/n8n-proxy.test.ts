import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeCv, rewriteCv, N8nProxyError } from './n8n-proxy.js'

interface HttpCall {
  url: URL
  options: Record<string, unknown>
  body: string
}

interface EmitterLike {
  on(event: string, cb: (arg?: unknown) => void): void
  emit(event: string, arg?: unknown): void
}

type MockRes = EmitterLike & { statusCode: number }
type Responder = (req: EmitterLike, res: MockRes) => void

const httpState = vi.hoisted(() => ({
  calls: [] as HttpCall[],
  setResponder: ((responder: Responder) => {
    httpResponder = responder
  }) as (responder: Responder) => void,
}))

let httpResponder: Responder = (_req, res) => {
  res.statusCode = 200
  res.emit('data', Buffer.from('{}'))
  res.emit('end')
}

vi.mock('node:http', () => {
  function emitter(): EmitterLike {
    const listeners: Record<string, Array<(arg?: unknown) => void>> = {}
    return {
      on(event, cb) {
        ;(listeners[event] ??= []).push(cb)
      },
      emit(event, arg) {
        for (const cb of listeners[event] ?? []) cb(arg)
      },
    }
  }

  return {
    default: {
      request(
        url: URL,
        options: Record<string, unknown>,
        callback?: (res: MockRes) => void,
      ): EmitterLike {
        const res = emitter() as MockRes
        res.statusCode = 200
        if (callback) callback(res)
        const req = emitter()
        let body = ''
        ;(req as unknown as { write(chunk: string): void }).write = (chunk) => {
          body += chunk
        }
        ;(req as unknown as { end(): void }).end = () => {
          httpState.calls.push({ url, options, body })
          httpResponder(req, res)
        }
        return req
      },
    },
  }
})

function respondOk(response: unknown, status = 200): void {
  httpState.setResponder((_req, res) => {
    res.statusCode = status
    res.emit('data', Buffer.from(JSON.stringify(response)))
    res.emit('end')
  })
}

function respondFailure(error: Error): void {
  httpState.setResponder((req) => {
    req.emit('error', error)
  })
}

const VALID_BODY = {
  model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  raw: '{"overallScore":10}',
  finishReason: 'stop',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  httpState.calls.length = 0
  httpResponder = (_req, res) => {
    res.statusCode = 200
    res.emit('data', Buffer.from('{}'))
    res.emit('end')
  }
})

describe('analyzeCv — n8n webhook proxy', () => {
  it('posts the payload to the webhook URL built from N8N_URL and N8N_ANALYZE_PATH', async () => {
    vi.stubEnv('N8N_URL', 'http://n8n.example.com/')
    vi.stubEnv('N8N_ANALYZE_PATH', 'cv-analyze')
    respondOk(VALID_BODY)

    const payload = { cvId: 1, cvText: 'Budi\nPekerjaan', targetJobDescription: 'Backend' }
    await analyzeCv(payload)

    expect(httpState.calls).toHaveLength(1)
    const call = httpState.calls[0]!
    expect(call.url.href).toBe('http://n8n.example.com/webhook/cv-analyze')
    expect(call.options.method).toBe('POST')
    expect(call.options.headers).toMatchObject({ 'content-type': 'application/json' })
    expect(JSON.parse(call.body)).toEqual(payload)
  })

  it('falls back to localhost and the default path when env vars are unset', async () => {
    respondOk(VALID_BODY)
    await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })

    expect(httpState.calls[0]!.url.href).toBe('http://localhost:5678/webhook/cv-analyze')
  })

  it('returns { model, raw, finishReason } on a successful response', async () => {
    respondOk(VALID_BODY)
    const result = await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })
    expect(result).toEqual(VALID_BODY)
  })

  it('normalizes a missing finishReason to null', async () => {
    respondOk({ model: 'm', raw: '{}' })
    const result = await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })
    expect(result.finishReason).toBeNull()
  })

  it('throws N8nProxyError when the workflow returns a non-2xx status', async () => {
    respondOk({}, 502)
    await expect(
      analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('throws N8nProxyError when the response does not match the { model, raw } contract', async () => {
    respondOk({ model: 42 })
    await expect(
      analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('wraps a network failure as N8nProxyError', async () => {
    respondFailure(new Error('ECONNREFUSED'))
    await expect(
      analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('uses N8N_TIMEOUT_MS when set, otherwise the default 600s timeout', async () => {
    vi.stubEnv('N8N_TIMEOUT_MS', '5000')
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    respondOk(VALID_BODY)
    await analyzeCv({ cvId: 1, cvText: 'CV', targetJobDescription: 'JD' })

    const schedule = timeoutSpy.mock.calls.find((args) => args[1] === 5000)
    expect(schedule).toBeDefined()
    timeoutSpy.mockRestore()
  })
})

const REWRITE_BODY = {
  model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  raw: '# Budi\n\nPengalaman',
  finishReason: 'stop',
  postCheckModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
  postCheckRaw: '{"postScore":80,"warnings":[]}',
  postCheckFinishReason: 'stop',
}

describe('rewriteCv — n8n rewrite webhook proxy', () => {
  it('posts payload to N8N_REWRITE_PATH with approvedSuggestions', async () => {
    vi.stubEnv('N8N_URL', 'http://n8n.example.com/')
    vi.stubEnv('N8N_REWRITE_PATH', 'cv-rewrite')
    respondOk(REWRITE_BODY)

    const payload = {
      cvId: 7,
      targetJobDescription: 'Backend',
      originalCv: 'CV asli',
      approvedSuggestions: [{ id: 'sug-1', title: 'Add metrics' }],
      format: 'chronological' as const,
      analyzeContext: 'Skor keseluruhan analisis: 78',
    }
    await rewriteCv(payload)

    const call = httpState.calls[0]!
    expect(call.url.href).toBe('http://n8n.example.com/webhook/cv-rewrite')
    expect(JSON.parse(call.body)).toEqual(payload)
  })

  it('returns model, raw and post-check fields on success', async () => {
    respondOk(REWRITE_BODY)
    const result = await rewriteCv({
      cvId: 7,
      targetJobDescription: 'JD',
      originalCv: 'CV',
      approvedSuggestions: [],
      format: 'chronological',
      analyzeContext: '',
    })
    expect(result).toEqual(REWRITE_BODY)
  })

  it('normalizes missing post-check fields and finish reasons to null', async () => {
    respondOk({ model: 'm', raw: '# CV' })
    const result = await rewriteCv({
      cvId: 7,
      targetJobDescription: 'JD',
      originalCv: 'CV',
      approvedSuggestions: [],
      format: 'chronological',
      analyzeContext: '',
    })
    expect(result.postCheckModel).toBeNull()
    expect(result.postCheckRaw).toBeNull()
    expect(result.finishReason).toBeNull()
    expect(result.postCheckFinishReason).toBeNull()
  })

  it('throws N8nProxyError on non-2xx response', async () => {
    respondOk({}, 500)
    await expect(
      rewriteCv({
        cvId: 7,
        targetJobDescription: 'JD',
        originalCv: 'CV',
        approvedSuggestions: [],
        format: 'chronological',
        analyzeContext: '',
      }),
    ).rejects.toThrow(N8nProxyError)
  })

  it('throws N8nProxyError when raw is missing', async () => {
    respondOk({ model: 'm', postCheckRaw: '{}' })
    await expect(
      rewriteCv({
        cvId: 7,
        targetJobDescription: 'JD',
        originalCv: 'CV',
        approvedSuggestions: [],
        format: 'chronological',
        analyzeContext: '',
      }),
    ).rejects.toThrow(N8nProxyError)
  })
})
