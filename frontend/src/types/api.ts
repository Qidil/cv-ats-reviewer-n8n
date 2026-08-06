export type AtsCheckStatus = 'pass' | 'warn' | 'fail'
export type SuggestionPriority = 'high' | 'medium' | 'low'

export interface AtsCheck {
  id: string
  name: string
  status: AtsCheckStatus
  score: number
  detail: string
}

export interface Suggestion {
  id: string
  title: string
  description: string
  category: string
  priority: SuggestionPriority
}

export interface AnalyzeReport {
  id: number
  cvId: number
  overallScore: number
  atsChecks: AtsCheck[]
  weaknesses: string[]
  suggestions: Suggestion[]
  modelUsed: string
  createdAt: string
}

export interface ReviewDetail extends AnalyzeReport {
  approvalId: number | null
  rewriteId: number | null
}

export interface CvListItem {
  id: number
  originalFilename: string
  createdAt: string
  latestReviewId: number | null
}

export interface Approval {
  id: number
  reviewId: number
  approvedSuggestionIds: string[]
  approvedAt: string
}

export interface Rewrite {
  id: number
  reviewId: number
  approvalId: number
  rewrittenMarkdown: string
  postScore: number | null
  warnings: string[] | null
  postModelUsed: string | null
  createdAt: string
}

export interface ApiError {
  error: string
}

export type ExportFormat = 'pdf' | 'docx'
