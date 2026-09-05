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

export function useJobMatch(cvId: number | null): UseJobMatchResult {
  const [report, setReport] = useState<AnalyzeReport | null>(null)
  const [jobMatch, setJobMatch] = useState<JobMatch | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Phase 18 (MIN-11): skip the fetch entirely for an invalid route id instead
    // of firing a request that the caller immediately discards.
    if (cvId === null) return
    const id = cvId
    let cancelled = false
    setIsLoading(true)
    setError(null)

    async function load() {
      try {
        const cvs = await api.listCvs()
        const cv = cvs.find((item) => item.id === id)
        if (cv !== undefined && cv.latestMatchId !== null) {
          // Phase 18 (MIN-12): latestMatchId set but latestReviewId null is an
          // inconsistent data state (they are always inserted together for Mode
          // B) — surface it as an error instead of an infinite loading skeleton.
          if (cv.latestReviewId === null) {
            if (!cancelled) {
              setError('Data analisis untuk CV ini tidak lengkap. Coba unggah ulang CV.')
              setIsLoading(false)
            }
            return
          }
          const storedMatch = await api.getJobMatch(cv.latestMatchId)
          const storedReview = await api.getReview(cv.latestReviewId)
          if (!cancelled) {
            setJobMatch(storedMatch)
            setReport(storedReview)
            setIsLoading(false)
          }
          return
        }
        const fresh = await runJobsOnce(id)
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