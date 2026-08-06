import type { AtsCheck, AtsCheckStatus, Suggestion, SuggestionPriority } from '../db/repos.js'

export interface AnalyzeReport {
  overallScore: number | null
  atsChecks: AtsCheck[]
  weaknesses: string[]
  suggestions: Suggestion[]
}

export class ModelParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelParseError'
  }
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function parseOverallScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

function asStatus(value: unknown): AtsCheckStatus {
  return value === 'pass' || value === 'fail' ? value : 'warn'
}

function asPriority(value: unknown): SuggestionPriority {
  return value === 'high' || value === 'low' ? value : 'medium'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractFenced(raw: string): string | null {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match?.[1] ?? null
}

function extractBalancedObjects(raw: string): string[] {
  const candidates: string[] = []
  for (let start = 0; start < raw.length; start++) {
    if (raw[start] !== '{') continue
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < raw.length; i++) {
      const char = raw[i]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }
      if (char === '"') {
        inString = true
      } else if (char === '{') {
        depth++
      } else if (char === '}') {
        depth--
        if (depth === 0) {
          candidates.push(raw.slice(start, i + 1))
          start = i
          break
        }
      }
    }
  }
  return candidates
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function toChecks(value: unknown): AtsCheck[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    return {
      id: asString(record.id) || 'check',
      name: asString(record.name) || 'Check',
      status: asStatus(record.status),
      score: clampScore(record.score),
      detail: asString(record.detail),
    }
  })
}

function toWeaknesses(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function toSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const record = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    return {
      id: `sug-${index + 1}`,
      title: asString(record.title) || `Saran ${index + 1}`,
      description: asString(record.description),
      category: asString(record.category) || 'general',
      priority: asPriority(record.priority),
    }
  })
}

function normalizeReport(parsed: Record<string, unknown>): AnalyzeReport {
  return {
    overallScore: parseOverallScore(parsed.overallScore),
    atsChecks: toChecks(parsed.atsChecks),
    weaknesses: toWeaknesses(parsed.weaknesses),
    suggestions: toSuggestions(parsed.suggestions),
  }
}

export function parseAnalyzeReport(raw: string): AnalyzeReport {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ModelParseError('Model output kosong.')
  }

  const fenced = extractFenced(raw)
  if (fenced !== null) {
    const parsed = tryParseObject(fenced)
    if (parsed !== null) return normalizeReport(parsed)
  }

  for (const candidate of extractBalancedObjects(raw)) {
    const parsed = tryParseObject(candidate)
    if (parsed !== null) return normalizeReport(parsed)
  }

  throw new ModelParseError('Tidak ditemukan JSON yang valid pada output model.')
}

export interface PostCheckReport {
  postScore: number | null
  warnings: string[]
}

function normalizePostCheck(parsed: Record<string, unknown>): PostCheckReport {
  return {
    postScore: parseOverallScore(parsed.postScore),
    warnings: toWeaknesses(parsed.warnings),
  }
}

export function parsePostCheckRaw(raw: string): PostCheckReport {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { postScore: null, warnings: [] }
  }

  const fenced = extractFenced(raw)
  if (fenced !== null) {
    const parsed = tryParseObject(fenced)
    if (parsed !== null) return normalizePostCheck(parsed)
  }

  for (const candidate of extractBalancedObjects(raw)) {
    const parsed = tryParseObject(candidate)
    if (parsed !== null) return normalizePostCheck(parsed)
  }

  return { postScore: null, warnings: [] }
}
