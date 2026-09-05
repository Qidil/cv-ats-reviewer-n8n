import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AtsChecksCard, SuggestionsCard, WeaknessesCard, scoreValue } from '@/components/ats-report-sections'
import { RouteErrorState } from '@/components/route-error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalysis } from '@/hooks/use-analysis'
import { scoreZone } from '@/lib/ats'
import { parseRouteId } from '@/lib/utils'

export default function AnalysisPage() {
  const { cvId: rawCvId } = useParams()
  const cvId = parseRouteId(rawCvId)
  const { report, isLoading, error } = useAnalysis(cvId)

  if (cvId === null) {
    return (
      <RouteErrorState
        title="ID tidak valid"
        description="Parameter analisis pada alamat tidak dikenali."
        backLabel="Kembali ke Upload"
      />
    )
  }

  if (error !== null) {
    return <RouteErrorState title="Analisis gagal" description={error} backLabel="Kembali ke Upload" />
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col gap-6 px-8 py-16">
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

      {/* Phase 20: kolom kanan (Kelemahan + Saran) di sebelah kanan mulai
          md: (768px); bertumpuk urutan asli di mobile. */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-6">
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
          <AtsChecksCard checks={report.atsChecks} />
        </div>

        <div className="flex flex-col gap-6">
          <WeaknessesCard weaknesses={report.weaknesses} />
          <SuggestionsCard suggestions={report.suggestions} />
        </div>
      </div>
    </main>
  )
}
