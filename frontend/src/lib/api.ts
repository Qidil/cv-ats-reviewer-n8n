import type {
  AnalyzeReport,
  Approval,
  ApiError,
  CvListItem,
  ExportFormat,
  JobMatch,
  JobsReport,
  ReviewDetail,
  Rewrite,
  RewriteFormat,
} from '@/types/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export class ApiRequestError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    throw new ApiRequestError('Tidak dapat terhubung ke server. Pastikan backend berjalan.', 0)
  }

  if (!response.ok) {
    let message = `Terjadi kesalahan (${response.status}).`
    try {
      const body = (await response.json()) as ApiError
      if (typeof body.error === 'string' && body.error.length > 0) {
        message = body.error
      }
    } catch {
      // fall back to generic message when the body is not JSON
    }
    throw new ApiRequestError(message, response.status)
  }

  return (await response.json()) as T
}

function createFormData(cv: File, targetJobDescription: string, targetJobTitle?: string): FormData {
  const formData = new FormData()
  formData.append('cv', cv, cv.name)
  formData.append('targetJobDescription', targetJobDescription)
  if (targetJobTitle !== undefined && targetJobTitle.trim().length > 0) {
    formData.append('targetJobTitle', targetJobTitle.trim())
  }
  return formData
}

export const api = {
  uploadCv(
    cv: File,
    targetJobDescription: string,
    targetJobTitle?: string,
  ): Promise<{ id: number }> {
    return request('/api/cvs', {
      method: 'POST',
      body: createFormData(cv, targetJobDescription, targetJobTitle),
    })
  },

  triggerAnalyze(cvId: number): Promise<AnalyzeReport> {
    return request(`/api/cvs/${cvId}/analyze`, { method: 'POST' })
  },

  getReview(reviewId: number): Promise<ReviewDetail> {
    return request(`/api/reviews/${reviewId}`)
  },

  triggerJobs(cvId: number): Promise<JobsReport> {
    return request(`/api/cvs/${cvId}/jobs`, { method: 'POST' })
  },

  getJobMatch(matchId: number): Promise<JobMatch> {
    return request(`/api/job-matches/${matchId}`)
  },

  approveSuggestions(reviewId: number, approvedSuggestionIds: string[]): Promise<{ id: number }> {
    return request(`/api/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedSuggestionIds }),
    })
  },

  triggerRewrite(approvalId: number, format: RewriteFormat = 'chronological'): Promise<Rewrite> {
    return request(`/api/approvals/${approvalId}/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    })
  },

  listCvs(): Promise<CvListItem[]> {
    return request('/api/cvs')
  },

  getApproval(approvalId: number): Promise<Approval> {
    return request(`/api/approvals/${approvalId}`)
  },

  getRewrite(rewriteId: number): Promise<Rewrite> {
    return request(`/api/rewrites/${rewriteId}`)
  },

  getExportUrl(rewriteId: number, format: ExportFormat): string {
    return `${API_BASE_URL}/api/rewrites/${rewriteId}/export?format=${format}`
  },
}
