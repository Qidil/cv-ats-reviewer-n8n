import { useEffect, useState } from 'react'
import type { AnalyzeReport, JobMatch, JobsReport } from '@/types/api'
import { api, ApiRequestError } from '@/lib/api'

interface UseJobMatchResult {
  report: AnalyzeReport | null
  jobMatch: JobMatch | null
  isLoading: boolean
  error: string | null
}

// tradeoff: one in-flight jobs analysis promise per cvId at module scope so React
// StrictMode double-mount (dev) and page revisits share a single AI call
// instead of triggering duplicates. Cleared when the call settles.
const jobsInFlight = new Map<number, Promise<JobsReport>>()

function runJobsOnce(cvId: number): Promise<JobsReport> {
  const existing = jobsInFlight.get(cvId)
  if (existing !== undefined) return existing
  const promise = api.triggerJobs(cvId).finally(() => {
    jobsInFlight.delete(cvId)
  })
  jobsInFlight.set(cvId, promise)
  return promise
}

export function useJobMatch(cvId: number): UseJobMatchResult {
  const [report, setReport] = useState<AnalyzeReport | null>(null)
  const [jobMatch, setJobMatch] = useState<JobMatch | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    async function load() {
      try {
        const cvs = await api.listCvs()
        const cv = cvs.find((item) => item.id === cvId)
        if (cv !== undefined && cv.latestMatchId !== null) {
          const storedMatch = await api.getJobMatch(cv.latestMatchId)
          const storedReview =
            cv.latestReviewId !== null ? await api.getReview(cv.latestReviewId) : null
          if (!cancelled) {
            setJobMatch(storedMatch)
            setReport(storedReview)
            setIsLoading(false)
          }
          return
        }
        const fresh = await runJobsOnce(cvId)
        if (!cancelled) {
          setReport(fresh.review)
          setJobMatch(fresh.jobMatch)
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Terjadi kesalahan. Silakan coba lagi.')
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [cvId])

  return { report, jobMatch, isLoading, error }
}