import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HistoryPanel } from './history-panel'
import type { CvListItem } from '@/types/api'

const { mockUseCvList } = vi.hoisted(() => ({
  mockUseCvList: vi.fn(),
}))

vi.mock('@/hooks/use-cv-list', () => ({
  useCvList: (...args: unknown[]) => mockUseCvList(...args),
}))

function renderHistoryPanel(items: CvListItem[] = []) {
  mockUseCvList.mockReturnValue({ items, isLoading: false, error: null })
  return render(
    <MemoryRouter>
      <HistoryPanel />
    </MemoryRouter>,
  )
}

describe('HistoryPanel (Phase 20: diekstrak dari history.tsx, route /history dihapus)', () => {
  it('shows only the match button when a job match exists (Mode B contains the full analysis)', () => {
    renderHistoryPanel([
      {
        id: 1,
        originalFilename: 'cv.pdf',
        createdAt: '2026-08-18T00:00:00.000Z',
        latestReviewId: 5,
        latestMatchId: 9,
      },
    ])

    expect(screen.queryByRole('link', { name: 'Lihat Analisis' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Lihat Pekerjaan Cocok' })).toBeDefined()
  })

  it('shows only the analysis button when no job match exists', () => {
    renderHistoryPanel([
      {
        id: 2,
        originalFilename: 'cv2.pdf',
        createdAt: '2026-08-18T00:00:00.000Z',
        latestReviewId: 6,
        latestMatchId: null,
      },
    ])

    expect(screen.getByRole('link', { name: 'Lihat Analisis' })).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Lihat Pekerjaan Cocok' })).toBeNull()
  })

  it('shows only the match button when no review exists', () => {
    renderHistoryPanel([
      {
        id: 3,
        originalFilename: 'cv3.pdf',
        createdAt: '2026-08-18T00:00:00.000Z',
        latestReviewId: null,
        latestMatchId: 11,
      },
    ])

    expect(screen.queryByRole('link', { name: 'Lihat Analisis' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Lihat Pekerjaan Cocok' })).toBeDefined()
  })

  it('shows the empty-state message when there are no CVs', () => {
    renderHistoryPanel([])

    expect(screen.getByText(/Belum ada CV/i)).toBeInTheDocument()
  })

  it('shows an error alert when loading fails', () => {
    mockUseCvList.mockReturnValue({ items: [], isLoading: false, error: 'Terjadi kesalahan koneksi' })
    render(
      <MemoryRouter>
        <HistoryPanel />
      </MemoryRouter>,
    )

    expect(screen.getByText('Gagal memuat')).toBeInTheDocument()
    expect(screen.getByText('Terjadi kesalahan koneksi')).toBeInTheDocument()
  })
})
