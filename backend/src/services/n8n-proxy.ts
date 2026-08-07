export interface AnalyzePayload {
  cvId: number
  cvText: string
  targetJobDescription: string
}

export type AnalyzeResult = {
  model: string
  raw: string
}

export interface RewritePayload {
  cvId: number
  targetJobDescription: string
  originalCv: string
  approvedSuggestions: unknown[]
}

export type RewriteResult = {
  model: string
  raw: string
  postCheckModel: string | null
  postCheckRaw: string | null
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
      typeof data.model === 'string' && typeof data.raw === 'string',
  )
  return { model: data.model, raw: data.raw }
}

export async function rewriteCv(payload: RewritePayload): Promise<RewriteResult> {
  const data = await postWebhook<RewriteResult>(
    process.env.N8N_REWRITE_PATH ?? 'cv-rewrite',
    payload,
    (data): data is RewriteResult =>
      typeof data.model === 'string' &&
      typeof data.raw === 'string' &&
      (data.postCheckModel === undefined ||
        data.postCheckModel === null ||
        typeof data.postCheckModel === 'string') &&
      (data.postCheckRaw === undefined ||
        data.postCheckRaw === null ||
        typeof data.postCheckRaw === 'string'),
  )
  return {
    model: data.model,
    raw: data.raw,
    postCheckModel: data.postCheckModel ?? null,
    postCheckRaw: data.postCheckRaw ?? null,
  }
}

async function postWebhook<T extends Record<string, unknown>>(
  path: string,
  payload: unknown,
  validate: (data: Record<string, unknown>) => data is T,
): Promise<T> {
  const url = n8nWebhookUrl(path)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), n8nTimeoutMs())
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new N8nProxyError(`Webhook n8n gagal (HTTP ${response.status}).`)
    }
    const data = (await response.json()) as Record<string, unknown>
    if (!validate(data)) {
      throw new N8nProxyError('Respons webhook n8n tidak sesuai kontrak.')
    }
    return data
  } catch (error) {
    if (error instanceof N8nProxyError) throw error
    throw new N8nProxyError('Gagal terhubung ke n8n.')
  } finally {
    clearTimeout(timeout)
  }
}
