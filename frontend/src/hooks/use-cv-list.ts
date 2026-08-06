import { useEffect, useState } from 'react'
import type { CvListItem } from '@/types/api'
import { api, ApiRequestError } from '@/lib/api'

interface UseCvListResult {
  items: CvListItem[]
  isLoading: boolean
  error: string | null
}

export function useCvList(): UseCvListResult {
  const [items, setItems] = useState<CvListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    api
      .listCvs()
      .then((result) => {
        if (!cancelled) {
          setItems(result)
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
  }, [])

  return { items, isLoading, error }
}
