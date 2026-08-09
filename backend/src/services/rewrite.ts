import { parsePostCheckRaw } from '../utils/model-parser.js'
import type { Review } from '../db/repos.js'
import type { RewriteResult } from './n8n-proxy.js'

export interface ComposedRewrite {
  rewrittenMarkdown: string
  postScore: number | null
  warnings: string[]
  postModelUsed: string | null
}

// analyzeContext hanya berisi check non-pass (fail/warn) + weaknesses +
// overallScore (keputusan rapat 2026-08-09). Digunakan model rewrite sebagai
// konteks perbaikan agar hasil rewrite lebih baik saat di re-analyze.
export function buildAnalyzeContext(review: Review): string {
  const nonPassChecks = review.atsChecks.filter((check) => check.status !== 'pass')
  const lines: string[] = []
  lines.push(`Skor keseluruhan analisis: ${review.overallScore}`)
  if (nonPassChecks.length > 0) {
    lines.push('Cek yang belum lolos:')
    for (const check of nonPassChecks) {
      lines.push(`- ${check.name} (${check.status}, skor ${check.score}): ${check.detail}`)
    }
  }
  if (review.weaknesses.length > 0) {
    lines.push('Kelemahan yang terdeteksi:')
    for (const weakness of review.weaknesses) {
      lines.push(`- ${weakness}`)
    }
  }
  return lines.join('\n')
}

export function composeRewrite(result: RewriteResult): ComposedRewrite {
  const postCheck =
    result.postCheckRaw !== null ? parsePostCheckRaw(result.postCheckRaw) : null
  return {
    rewrittenMarkdown: result.raw,
    postScore: postCheck?.postScore ?? null,
    warnings: postCheck?.warnings ?? [],
    postModelUsed: result.postCheckModel,
  }
}
