import { parsePostCheckRaw } from '../utils/model-parser.js'
import type { RewriteResult } from './n8n-proxy.js'

export interface ComposedRewrite {
  rewrittenMarkdown: string
  postScore: number | null
  warnings: string[]
  postModelUsed: string | null
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
