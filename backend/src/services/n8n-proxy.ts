import http from 'node:http'
import https from 'node:https'

export interface AnalyzePayload {
  cvId: number
  cvText: string
  targetJobDescription: string
}

export type AnalyzeResult = {
  model: string
  raw: string
  // ERROR-01: finish_reason model terakhir (mis. "length") agar backend dapat
  // melaporkan error spesifik saat model kehabisan token.
  finishReason: string | null
}

export type RewriteFormat = 'chronological' | 'combination' | 'functional'

export interface RewritePayload {
  cvId: number
  targetJobDescription: string
  originalCv: string
  approvedSuggestions: unknown[]
  format: RewriteFormat
  analyzeContext: string
}

export type RewriteResult = {
  model: string
  raw: string
  finishReason: string | null
  postCheckModel: string | null
  postCheckRaw: string | null
  postCheckFinishReason: string | null
}

export class N8nProxyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'N8nProxyError'
  }
}

// Worst-case chain: rewrite (5 x 60s) + post-check (5 x 60s) = 600s.
const DEFAULT_TIMEOUT_MS = 600_000

function n8nTimeoutMs(): number {
  const raw = process.env.N8N_TIMEOUT_MS
  const value = raw === undefined ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS
}

function n8nWebhookUrl(path: string): string {
  const base = process.env.N8N_URL ?? 'http://localhost:5678'
  return `${base.replace(/\/$/, '')}/webhook/${path}`
}

export async function analyzeCv(payload: AnalyzePayload): Promise<AnalyzeResult> {
  const data = await postWebhook<AnalyzeResult>(
    process.env.N8N_ANALYZE_PATH ?? 'cv-analyze',
    payload,
    (data): data is AnalyzeResult =>
      typeof data.model === 'string' &&
      typeof data.raw === 'string' &&
      (data.finishReason === undefined ||
        data.finishReason === null ||
        typeof data.finishReason === 'string'),
  )
  return {
    model: data.model,
    raw: data.raw,
    finishReason: typeof data.finishReason === 'string' ? data.finishReason : null,
  }
}

export async function rewriteCv(payload: RewritePayload): Promise<RewriteResult> {
  const data = await postWebhook<RewriteResult>(
    process.env.N8N_REWRITE_PATH ?? 'cv-rewrite',
    payload,
    (data): data is RewriteResult =>
      typeof data.model === 'string' &&
      typeof data.raw === 'string' &&
      (data.finishReason === undefined ||
        data.finishReason === null ||
        typeof data.finishReason === 'string') &&
      (data.postCheckModel === undefined ||
        data.postCheckModel === null ||
        typeof data.postCheckModel === 'string') &&
      (data.postCheckRaw === undefined ||
        data.postCheckRaw === null ||
        typeof data.postCheckRaw === 'string') &&
      (data.postCheckFinishReason === undefined ||
        data.postCheckFinishReason === null ||
        typeof data.postCheckFinishReason === 'string'),
  )
  return {
    model: data.model,
    raw: data.raw,
    finishReason: typeof data.finishReason === 'string' ? data.finishReason : null,
    postCheckModel: data.postCheckModel ?? null,
    postCheckRaw: data.postCheckRaw ?? null,
    postCheckFinishReason:
      typeof data.postCheckFinishReason === 'string' ? data.postCheckFinishReason : null,
  }
}

async function postWebhook<T extends Record<string, unknown>>(
  path: string,
  payload: unknown,
  validate: (data: Record<string, unknown>) => data is T,
): Promise<T> {
  const url = new URL(n8nWebhookUrl(path))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), n8nTimeoutMs())
  try {
    const response = await request(url, JSON.stringify(payload), controller.signal)
    const data = (await response.json()) as Record<string, unknown>
    if (!validate(data)) {
      throw new N8nProxyError('Respons webhook n8n tidak sesuai kontrak.')
    }
    return data
  } catch (error) {
    if (error instanceof N8nProxyError) throw error
    if (error instanceof SyntaxError) {
      throw new N8nProxyError('Respons webhook n8n tidak sesuai kontrak.')
    }
    throw new N8nProxyError('Gagal terhubung ke n8n.')
  } finally {
    clearTimeout(timeout)
  }
}

interface HttpResponse {
  status: number
  json(): Promise<unknown>
}

// Uses node:http/https instead of the global fetch (undici) so the request is
// not cut off by undici's 5-minute default headersTimeout/bodyTimeout. The
// AbortController above remains the single, configurable timeout.
function request(
  url: URL,
  body: string,
  signal: AbortSignal,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
        signal,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            reject(new N8nProxyError(`Webhook n8n gagal (HTTP ${status}).`))
            return
          }
          const text = Buffer.concat(chunks).toString('utf8')
          let parsed: unknown
          try {
            parsed = text === '' ? {} : JSON.parse(text)
          } catch (error) {
            reject(error)
            return
          }
          resolve({ status, json: async () => parsed })
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}
