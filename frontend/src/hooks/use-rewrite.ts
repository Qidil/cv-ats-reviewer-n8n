import { useEffect, useState } from 'react'
import type { Rewrite } from '@/types/api'
import { api, ApiRequestError } from '@/lib/api'

interface UseRewriteResult {
  rewrite: Rewrite | null
  isLoading: boolean
  error: string | null
}

export function useRewrite(rewriteId: number | null): UseRewriteResult {
  const [rewrite, setRewrite] = useState<Rewrite | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Phase 18 (MIN-11): skip the fetch entirely for an invalid route id instead
    // of firing a request that the caller immediately discards.
    if (rewriteId === null) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    api
      .getRewrite(rewriteId)
      .then((result) => {
        if (!cancelled) {
          setRewrite(result)
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
  }, [rewriteId])

  return { rewrite, isLoading, error }
}
