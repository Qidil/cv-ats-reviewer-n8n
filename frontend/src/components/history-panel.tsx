import { Link } from 'react-router-dom'
import { Clock, FileText, History } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const hasReview = cv.latestReviewId !== null
  const hasMatch = cv.latestMatchId !== null

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
          {hasMatch ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/matches/${cv.id}`}>Lihat Pekerjaan Cocok</Link>
            </Button>
          ) : hasReview ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/analysis/${cv.id}`}>Lihat Analisis</Link>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Belum dianalisis</span>
          )}
        </CardContent>
      </Card>
    </li>
  )
}

// Phase 20: diekstrak dari history.tsx (route /history dihapus) supaya bisa
// ditampilkan sebagai panel di samping alur Upload. Tinggi dibatasi +
// overflow-y-auto (scroll independen, berlaku semua breakpoint) supaya
// daftar CV panjang tidak memaksa scroll halaman penuh.
export function HistoryPanel() {
  const { items, isLoading, error } = useCvList()

  return (
    <Card className="max-h-[600px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" aria-hidden="true" />
          Riwayat
        </CardTitle>
        <CardDescription>Semua CV yang pernah diunggah.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {error !== null && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Gagal memuat</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada CV. Unggah CV pertama Anda untuk memulai analisis.
          </p>
        ) : (
          <ul className="grid gap-3">
            {items.map((cv) => (
              <HistoryItem key={cv.id} cv={cv} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
