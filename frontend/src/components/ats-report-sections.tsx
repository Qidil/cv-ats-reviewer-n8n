import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { scoreZone, statusBadgeVariant, statusLabel } from '@/lib/ats'
import type { AtsCheck, Suggestion } from '@/types/api'

// Phase 18 (MAJ-01): shared between Analysis (Mode A) and Matches (Mode B) pages —
// previously copy-pasted verbatim in both, risking visual/behavioral drift.

export function scoreValue(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function CheckRow({ check }: { check: AtsCheck }) {
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

export function AtsChecksCard({ checks }: { checks: AtsCheck[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemeriksaan ATS</CardTitle>
      </CardHeader>
      <CardContent>
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada pemeriksaan yang tersedia.</p>
        ) : (
          <ul className="grid gap-5">
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function WeaknessesCard({ weaknesses }: { weaknesses: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kelemahan</CardTitle>
      </CardHeader>
      <CardContent>
        {weaknesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada kelemahan yang terdeteksi.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            {weaknesses.map((weakness) => (
              <li key={weakness}>{weakness}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function SuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saran Perbaikan</CardTitle>
        <CardDescription>Saran untuk meningkatkan kualitas CV Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada saran yang tersedia.</p>
        ) : (
          <ul className="grid gap-4">
            {suggestions.map((suggestion) => (
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
  )
}
