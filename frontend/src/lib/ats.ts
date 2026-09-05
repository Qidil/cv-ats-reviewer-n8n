import type { AtsCheckStatus } from '@/types/api'

export interface ScoreZone {
  label: string
  color: 'text-accent' | 'text-warning' | 'text-destructive'
  bar: 'bg-accent' | 'bg-warning' | 'bg-destructive'
}

export function scoreZone(score: number): ScoreZone {
  if (score >= 80) {
    return { label: 'Baik', color: 'text-accent', bar: 'bg-accent' }
  }
  if (score >= 50) {
    return { label: 'Perlu Perbaikan', color: 'text-warning', bar: 'bg-warning' }
  }
  return { label: 'Rendah', color: 'text-destructive', bar: 'bg-destructive' }
}

// Phase 19 (Impeccable): "pass" memakai varian "accent" (hijau) — selaras
// dengan zona skor ATS (hijau >=80), bukan "secondary" (biru) seperti
// sebelumnya, yang membuat status Lolos tidak konsisten dengan skor.
export function statusBadgeVariant(status: AtsCheckStatus): 'accent' | 'outline' | 'destructive' {
  if (status === 'pass') return 'accent'
  if (status === 'warn') return 'outline'
  return 'destructive'
}

export function statusLabel(status: AtsCheckStatus): string {
  if (status === 'pass') return 'Lolos'
  if (status === 'warn') return 'Perlu Perhatian'
  return 'Gagal'
}
