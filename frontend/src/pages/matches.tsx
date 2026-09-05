import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Briefcase, Loader2 } from 'lucide-react'
import { AtsChecksCard, SuggestionsCard, WeaknessesCard, scoreValue } from '@/components/ats-report-sections'
import { RouteErrorState } from '@/components/route-error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useJobMatch } from '@/hooks/use-job-match'
import { scoreZone, statusBadgeVariant } from '@/lib/ats'
import { parseRouteId } from '@/lib/utils'
import type { JobMatchItem } from '@/types/api'

// Phase 18 (MIN-13): 3-tier badge (pass/warn/fail), consistent with AtsCheck status.
function jobMatchStatus(score: number): 'pass' | 'warn' | 'fail' {
  if (score >= 60) return 'pass'
  if (score >= 30) return 'warn'
  return 'fail'
}

function JobRow({ job }: { job: JobMatchItem }) {
  const zone = scoreZone(job.matchScore)
  return (
    <li className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium text-foreground">{job.title}</span>
        <Badge variant={statusBadgeVariant(jobMatchStatus(job.matchScore))}>
          {scoreValue(job.matchScore)}%
        </Badge>
      </div>
      {job.reasons.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {job.reasons.map((reason, index) => (
            <li key={`${job.title}-${index}`}>{reason}</li>
          ))}
        </ul>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${scoreValue(job.matchScore)}%` }} />
      </div>
    </li>
  )
}

export default function MatchesPage() {
  const { cvId: rawCvId } = useParams()
  const cvId = parseRouteId(rawCvId)
  const { report, jobMatch, isLoading, error } = useJobMatch(cvId)

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

  if (isLoading || report === null || jobMatch === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center gap-6 px-8 py-16">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Menganalisis CV & mencari pekerjaan cocok… model AI dapat memakan waktu beberapa menit.
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analisis ATS & Pekerjaan Cocok</h1>
        <p className="text-sm text-muted-foreground">
          Model: {report.modelUsed}
        </p>
      </div>

      {/* Phase 20: kolom kanan (Kelemahan + Saran + Pekerjaan Cocok) di
          sebelah kanan mulai md: (768px); bertumpuk urutan asli di mobile. */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Skor Kualitas CV</CardTitle>
              <CardDescription>Penilaian umum tanpa deskripsi pekerjaan target.</CardDescription>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="size-4" aria-hidden="true" />
                Pekerjaan Cocok
              </CardTitle>
              <CardDescription>Saran posisi yang sesuai dengan profil CV Anda.</CardDescription>
            </CardHeader>
            <CardContent>
              {jobMatch.matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada pekerjaan yang tersedia.</p>
              ) : (
                <ul className="grid gap-5">
                  {jobMatch.matches.map((job, index) => (
                    <JobRow key={`${job.title}-${index}`} job={job} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
