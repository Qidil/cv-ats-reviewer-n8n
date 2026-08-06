import { Link } from 'react-router-dom'
import { ArrowLeft, Clock, History, FileText } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCvList } from '@/hooks/use-cv-list'
import type { CvListItem } from '@/types/api'

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function HistoryItem({ cv }: { cv: CvListItem }) {
  const reviewTarget = cv.latestReviewId === null ? null : `/approval/${cv.latestReviewId}`

  return (
    <li>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="size-4" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <span className="font-medium text-foreground">{cv.originalFilename}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" aria-hidden="true" />
                {formatDate(cv.createdAt)}
              </span>
            </div>
          </div>
          {reviewTarget !== null ? (
            <Button asChild variant="outline" size="sm">
              <Link to={reviewTarget}>Lihat Analisis</Link>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Belum dianalisis</span>
          )}
        </CardContent>
      </Card>
    </li>
  )
}

export default function HistoryPage() {
  const { items, isLoading, error } = useCvList()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-8 py-16">
      <div>
        <Button asChild variant="ghost" className="mb-4">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Upload baru
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Riwayat</h1>
        <p className="text-sm text-muted-foreground">Semua CV yang pernah diunggah.</p>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>Gagal memuat</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="grid gap-4 py-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" aria-hidden="true" />
              Belum ada CV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unggah CV pertama Anda untuk memulai analisis.
            </p>
            <div className="mt-4">
              <Button asChild>
                <Link to="/">Unggah CV</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {items.map((cv) => (
            <HistoryItem key={cv.id} cv={cv} />
          ))}
        </ul>
      )}
    </main>
  )
}
