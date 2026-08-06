import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useReview } from '@/hooks/use-review'
import { api, ApiRequestError } from '@/lib/api'
import { parseRouteId } from '@/lib/utils'

export default function ApprovalPage() {
  const { reviewId: rawReviewId } = useParams()
  const navigate = useNavigate()
  const reviewId = parseRouteId(rawReviewId)
  const { review, isLoading, error } = useReview(reviewId ?? 0)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function toggleSuggestion(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  async function handleRewrite() {
    if (reviewId === null || review === null || selectedIds.size === 0) {
      return
    }
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const { id: approvalId } = await api.approveSuggestions(reviewId, [...selectedIds])
      const rewrite = await api.triggerRewrite(approvalId)
      navigate(`/result/${rewrite.id}`)
    } catch (err) {
      setSubmitError(err instanceof ApiRequestError ? err.message : 'Terjadi kesalahan. Silakan coba lagi.')
      setIsSubmitting(false)
    }
  }

  if (reviewId === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center px-8 py-16">
        <Alert variant="destructive">
          <AlertTitle>ID tidak valid</AlertTitle>
          <AlertDescription>Parameter review pada alamat tidak dikenali.</AlertDescription>
        </Alert>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Kembali
            </Link>
          </Button>
        </div>
      </main>
    )
  }

  if (error !== null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center px-8 py-16">
        <Alert variant="destructive">
          <AlertTitle>Gagal memuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Kembali
            </Link>
          </Button>
        </div>
      </main>
    )
  }

  if (isLoading || review === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center gap-6 px-8 py-16">
        <Skeleton className="h-8 w-56" />
        <Card>
          <CardContent className="grid gap-5 py-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-8 py-16">
      <div>
        <Button asChild variant="ghost" className="mb-4">
          <Link to={`/analysis/${review.cvId}`}>
            <ArrowLeft aria-hidden="true" />
            Kembali ke Analisis
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Setujui Saran Perbaikan</h1>
        <p className="text-sm text-muted-foreground">
          Centang saran yang ingin diterapkan pada CV. Minimal satu saran wajib dipilih.
        </p>
      </div>

      {submitError !== null && (
        <Alert variant="destructive">
          <AlertTitle>Gagal</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {review.rewriteId !== null && (
        <Alert>
          <AlertTitle>Sudah ada hasil rewrite</AlertTitle>
          <AlertDescription>
            Analisis ini sudah pernah ditulis ulang. Lihat hasilnya di halaman hasil, atau
            lakukan rewrite baru dengan memilih saran di bawah.
          </AlertDescription>
        </Alert>
      )}

      {review.suggestions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Tidak ada saran yang tersedia untuk disetujui.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Saran</CardTitle>
            <CardDescription>
              {selectedIds.size} dari {review.suggestions.length} saran dipilih.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {review.suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <label
                    htmlFor={`suggestion-${suggestion.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      id={`suggestion-${suggestion.id}`}
                      checked={selectedIds.has(suggestion.id)}
                      onCheckedChange={(checked) => toggleSuggestion(suggestion.id, checked === true)}
                      disabled={isSubmitting}
                      className="mt-0.5"
                    />
                    <span className="grid gap-1">
                      <span className="font-medium text-foreground">{suggestion.title}</span>
                      <span className="text-sm text-muted-foreground">{suggestion.description}</span>
                      <span className="text-xs font-medium uppercase tracking-wide text-secondary">
                        {suggestion.category} · {suggestion.priority}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {review.rewriteId !== null && (
          <Button asChild variant="outline">
            <Link to={`/result/${review.rewriteId}`}>Lihat Hasil</Link>
          </Button>
        )}
        <Button
          onClick={handleRewrite}
          disabled={selectedIds.size === 0 || isSubmitting || review.suggestions.length === 0}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Menulis ulang CV…
            </>
          ) : (
            <>
              Setujui & Rewrite
              <Sparkles aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </main>
  )
}
