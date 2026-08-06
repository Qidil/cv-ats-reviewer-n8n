import { useParams, Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalysis } from '@/hooks/use-analysis'
import { scoreZone, statusBadgeVariant, statusLabel } from '@/lib/ats'
import { parseRouteId } from '@/lib/utils'
import type { AtsCheck } from '@/types/api'

function scoreValue(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function CheckRow({ check }: { check: AtsCheck }) {
  const zone = scoreZone(check.score)
  return (
    <li className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-foreground">{check.name}</span>
        <Badge variant={statusBadgeVariant(check.status)}>{statusLabel(check.status)}</Badge>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={`h-full rounded-full ${zone.bar}`}
          style={{ width: `${scoreValue(check.score)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className={`font-medium ${zone.color}`}>{scoreValue(check.score)}</span>
        {check.detail.length > 0 ? ` — ${check.detail}` : ''}
      </p>
    </li>
  )
}

export default function AnalysisPage() {
  const { cvId: rawCvId } = useParams()
  const cvId = parseRouteId(rawCvId)
  const { report, isLoading, error } = useAnalysis(cvId ?? 0)

  if (cvId === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center px-8 py-16">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>ID tidak valid</AlertTitle>
          <AlertDescription>Parameter analisis pada alamat tidak dikenali.</AlertDescription>
        </Alert>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Kembali ke Upload
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
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Analisis gagal</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Kembali ke Upload
            </Link>
          </Button>
        </div>
      </main>
    )
  }

  if (isLoading || report === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center gap-6 px-8 py-16">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Menganalisis CV… model AI dapat memakan waktu beberapa menit.
        </div>
        <Card>
          <CardContent className="grid gap-6 py-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-1.5 w-full" />
            <div className="grid gap-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  const overall = scoreValue(report.overallScore)
  const zone = scoreZone(report.overallScore)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-8 py-16">
      <div>
        <Button asChild variant="ghost" className="mb-4">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Upload baru
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Hasil Analisis ATS</h1>
        <p className="text-sm text-muted-foreground">
          Model: {report.modelUsed}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skor Kecocokan</CardTitle>
          <CardDescription>Cocokkan CV dengan deskripsi pekerjaan target.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-baseline gap-3">
            <span className={`text-5xl font-bold tracking-tight ${zone.color}`}>{overall}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <Badge>{zone.label}</Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${overall}%` }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pemeriksaan ATS</CardTitle>
        </CardHeader>
        <CardContent>
          {report.atsChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada pemeriksaan yang tersedia.</p>
          ) : (
            <ul className="grid gap-5">
              {report.atsChecks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kelemahan</CardTitle>
        </CardHeader>
        <CardContent>
          {report.weaknesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada kelemahan yang terdeteksi.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {report.weaknesses.map((weakness) => (
                <li key={weakness}>{weakness}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saran Perbaikan</CardTitle>
          <CardDescription>Saran yang dapat Anda setujui pada langkah berikutnya.</CardDescription>
        </CardHeader>
        <CardContent>
          {report.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada saran yang tersedia.</p>
          ) : (
            <ul className="grid gap-4">
              {report.suggestions.map((suggestion) => (
                <li key={suggestion.id} className="grid gap-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-foreground">{suggestion.title}</span>
                    <Badge variant="outline">{suggestion.priority}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild>
          <Link to={`/approval/${report.id}`}>Lanjut ke Persetujuan</Link>
        </Button>
      </div>
    </main>
  )
}
