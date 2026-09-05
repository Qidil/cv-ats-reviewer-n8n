import { useParams, Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Download } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorState } from '@/components/route-error-state'
import { useRewrite } from '@/hooks/use-rewrite'
import { api } from '@/lib/api'
import { scoreZone } from '@/lib/ats'
import { parseRouteId } from '@/lib/utils'

export default function ResultPage() {
  const { rewriteId: rawRewriteId } = useParams()
  const rewriteId = parseRouteId(rawRewriteId)
  const { rewrite, isLoading, error } = useRewrite(rewriteId)

  if (rewriteId === null) {
    return (
      <RouteErrorState
        title="ID tidak valid"
        description="Parameter hasil pada alamat tidak dikenali."
      />
    )
  }

  if (error !== null) {
    return <RouteErrorState title="Gagal memuat" description={error} />
  }

  if (isLoading || rewrite === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center gap-6 px-8 py-16">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-1.5 w-32" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  const postScore = rewrite.postScore
  const zone = postScore === null ? null : scoreZone(postScore)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" className="mb-4">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Beranda
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">CV Hasil Rewrite</h1>
          <p className="text-sm text-muted-foreground">
            Model post-check: {rewrite.postModelUsed ?? '—'}
          </p>
        </div>
      </div>

      {postScore !== null && zone !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Skor Setelah Rewrite</CardTitle>
            <CardDescription>Hasil pemeriksaan otomatis pada CV yang ditulis ulang.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-baseline gap-3">
              <span className={`text-5xl font-bold tracking-tight ${zone.color}`}>
                {Math.round(postScore)}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
              <Badge>{zone.label}</Badge>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={`h-full rounded-full ${zone.bar}`}
                style={{ width: `${Math.max(0, Math.min(100, Math.round(postScore)))}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {rewrite.warnings !== null && rewrite.warnings.length > 0 && (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Perhatian</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {rewrite.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {postScore !== null && zone !== null && zone.label === 'Baik' && (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>CV Anda siap digunakan</AlertTitle>
          <AlertDescription>Skor setelah rewrite masuk kategori baik.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            Rewrite berhasil
          </CardTitle>
          <CardDescription>
            CV telah ditulis ulang sesuai format yang dipilih. Unduh hasilnya dalam
            format PDF atau DOCX.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <a href={api.getExportUrl(rewrite.id, 'pdf')} download>
              <Download aria-hidden="true" />
              Unduh PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={api.getExportUrl(rewrite.id, 'docx')} download>
              <Download aria-hidden="true" />
              Unduh DOCX
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
