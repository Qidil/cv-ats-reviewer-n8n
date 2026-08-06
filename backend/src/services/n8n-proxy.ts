export interface AnalyzePayload {
  cvId: number
  cvText: string
  targetJobDescription: string
}

export interface AnalyzeResult {
  model: string
  raw: string
}

export class N8nProxyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'N8nProxyError'
  }
}

const DEFAULT_TIMEOUT_MS = 300_000

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
  const url = n8nWebhookUrl(process.env.N8N_ANALYZE_PATH ?? 'cv-analyze')
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
    const data = (await response.json()) as { model?: unknown; raw?: unknown }
    if (typeof data.model !== 'string' || typeof data.raw !== 'string') {
      throw new N8nProxyError('Respons webhook n8n tidak sesuai kontrak { model, raw }.')
    }
    return { model: data.model, raw: data.raw }
  } catch (error) {
    if (error instanceof N8nProxyError) throw error
    throw new N8nProxyError('Gagal terhubung ke n8n.')
  } finally {
    clearTimeout(timeout)
  }
}
