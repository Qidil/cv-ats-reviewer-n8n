import { useEffect, useState } from 'react'
import type { AnalyzeReport } from '@/types/api'
import { api, ApiRequestError } from '@/lib/api'

interface UseAnalysisResult {
  report: AnalyzeReport | null
  isLoading: boolean
  error: string | null
}

// tradeoff: one in-flight analysis promise per cvId at module scope so React
// StrictMode double-mount (dev) and page revisits share a single AI call
// instead of triggering duplicates. Cleared when the call settles.
const analysisInFlight = new Map<number, Promise<AnalyzeReport>>()

function runAnalysisOnce(cvId: number): Promise<AnalyzeReport> {
  const existing = analysisInFlight.get(cvId)
  if (existing !== undefined) return existing
  const promise = api.triggerAnalyze(cvId).finally(() => {
    analysisInFlight.delete(cvId)
  })
  analysisInFlight.set(cvId, promise)
  return promise
}

export function useAnalysis(cvId: number | null): UseAnalysisResult {
  const [report, setReport] = useState<AnalyzeReport | null>(null)
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
        if (cv !== undefined && cv.latestReviewId !== null) {
          const stored = await api.getReview(cv.latestReviewId)
          if (!cancelled) {
            setReport(stored)
            setIsLoading(false)
          }
          return
        }
        const fresh = await runAnalysisOnce(id)
        if (!cancelled) {
          setReport(fresh)
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

  return { report, isLoading, error }
}
