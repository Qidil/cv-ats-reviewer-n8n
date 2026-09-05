import { useEffect, useState } from 'react'
import type { ReviewDetail } from '@/types/api'
import { api, ApiRequestError } from '@/lib/api'

interface UseReviewResult {
  review: ReviewDetail | null
  isLoading: boolean
  error: string | null
}

export function useReview(reviewId: number | null): UseReviewResult {
  const [review, setReview] = useState<ReviewDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Phase 18 (MIN-11): skip the fetch entirely for an invalid route id instead
    // of firing a request that the caller immediately discards.
    if (reviewId === null) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    api
      .getReview(reviewId)
      .then((result) => {
        if (!cancelled) {
          setReview(result)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Terjadi kesalahan. Silakan coba lagi.')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [reviewId])

  return { review, isLoading, error }
}
