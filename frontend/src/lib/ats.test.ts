import { describe, expect, it } from 'vitest'
import { scoreZone, statusBadgeVariant, statusLabel } from './ats'

describe('scoreZone', () => {
  it('returns Baik for scores >= 80', () => {
    expect(scoreZone(80)).toEqual({ label: 'Baik', color: 'text-accent', bar: 'bg-accent' })
    expect(scoreZone(100)).toEqual({ label: 'Baik', color: 'text-accent', bar: 'bg-accent' })
  })

  it('returns Perlu Perbaikan for scores 50-79', () => {
    expect(scoreZone(50)).toEqual({ label: 'Perlu Perbaikan', color: 'text-warning', bar: 'bg-warning' })
    expect(scoreZone(79)).toEqual({ label: 'Perlu Perbaikan', color: 'text-warning', bar: 'bg-warning' })
  })

  it('returns Rendah for scores < 50', () => {
    expect(scoreZone(49)).toEqual({ label: 'Rendah', color: 'text-destructive', bar: 'bg-destructive' })
    expect(scoreZone(0)).toEqual({ label: 'Rendah', color: 'text-destructive', bar: 'bg-destructive' })
  })
})

describe('statusBadgeVariant', () => {
  it('maps pass to secondary', () => {
    expect(statusBadgeVariant('pass')).toBe('secondary')
  })

  it('maps warn to outline', () => {
    expect(statusBadgeVariant('warn')).toBe('outline')
  })

  it('maps fail to destructive', () => {
    expect(statusBadgeVariant('fail')).toBe('destructive')
  })
})

describe('statusLabel', () => {
  it('maps pass to Lolos', () => {
    expect(statusLabel('pass')).toBe('Lolos')
  })

  it('maps warn to Perlu Perhatian', () => {
    expect(statusLabel('warn')).toBe('Perlu Perhatian')
  })

  it('maps fail to Gagal', () => {
    expect(statusLabel('fail')).toBe('Gagal')
  })
})
