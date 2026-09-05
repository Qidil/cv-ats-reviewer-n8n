import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MatchesPage from './matches'

const { mockUseJobMatch } = vi.hoisted(() => ({
  mockUseJobMatch: vi.fn(),
}))

vi.mock('@/hooks/use-job-match', () => ({
  useJobMatch: (...args: unknown[]) => mockUseJobMatch(...args),
}))

const report = {
  id: 5,
  cvId: 1,
  targetJobId: null,
  overallScore: 70,
  atsChecks: [
    { id: 'keyword', name: 'Keyword match', status: 'warn', score: 60, detail: 'Umum' },
  ],
  weaknesses: ['Tidak ada metrik'],
  suggestions: [
    { id: 'sug-1', title: 'Tambah metrik', description: 'Ganti deskripsi tugas dengan hasil terukur.', category: 'achievements', priority: 'high' },
  ],
  modelUsed: 'test-model',
  createdAt: '2026-08-18T00:00:00.000Z',
}

const jobMatch = {
  id: 9,
  cvId: 1,
  matches: [
    { title: 'Backend Engineer', reasons: ['Node.js', 'REST API'], matchScore: 88 },
    { title: 'DevOps Engineer', reasons: ['CI/CD'], matchScore: 74 },
  ],
  modelUsed: 'test-model',
  status: 'completed',
  errorMessage: null,
  createdAt: '2026-08-18T00:00:00.000Z',
}

function renderMatches() {
  return render(
    <MemoryRouter initialEntries={['/matches/1']}>
      <Routes>
        <Route path="/matches/:cvId" element={<MatchesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MatchesPage', () => {
  it('renders the ATS report and the job list', () => {
    mockUseJobMatch.mockReturnValue({ report, jobMatch, isLoading: false, error: null })
    renderMatches()

    expect(screen.getByText('Analisis ATS & Pekerjaan Cocok')).toBeDefined()
    expect(screen.getByText('Keyword match')).toBeDefined()
    expect(screen.getByText('Backend Engineer')).toBeDefined()
    expect(screen.getByText('DevOps Engineer')).toBeDefined()
    expect(screen.getByText('Node.js')).toBeDefined()
    expect(screen.getByText('88%')).toBeDefined()
  })

  it('shows the loading state while analyzing', () => {
    mockUseJobMatch.mockReturnValue({ report: null, jobMatch: null, isLoading: true, error: null })
    renderMatches()

    expect(screen.getByText(/Menganalisis CV & mencari pekerjaan cocok/i)).toBeDefined()
  })

  it('shows an error alert when the analysis fails', () => {
    mockUseJobMatch.mockReturnValue({ report: null, jobMatch: null, isLoading: false, error: 'Gagal memuat' })
    renderMatches()

    expect(screen.getByText('Analisis gagal')).toBeDefined()
    expect(screen.getByText('Gagal memuat')).toBeDefined()
  })

  it('renders a 3-tier badge (pass/warn/fail) based on matchScore (MIN-13)', () => {
    mockUseJobMatch.mockReturnValue({
      report,
      jobMatch: {
        ...jobMatch,
        matches: [
          { title: 'Backend Engineer', reasons: [], matchScore: 88 }, // pass (>= 60)
          { title: 'Junior Support', reasons: [], matchScore: 45 }, // warn (30-59)
          { title: 'Unrelated Role', reasons: [], matchScore: 12 }, // fail (< 30)
        ],
      },
      isLoading: false,
      error: null,
    })
    renderMatches()

    const badgeVariantFor = (label: string) => screen.getByText(label).closest('[data-slot="badge"]')?.getAttribute('data-variant')

    expect(badgeVariantFor('88%')).toBe('secondary')
    expect(badgeVariantFor('45%')).toBe('outline')
    expect(badgeVariantFor('12%')).toBe('destructive')
  })
})