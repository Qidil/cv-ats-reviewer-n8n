import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HistoryPage from './history'
import type { CvListItem } from '@/types/api'

const { mockUseCvList } = vi.hoisted(() => ({
  mockUseCvList: vi.fn(),
}))

vi.mock('@/hooks/use-cv-list', () => ({
  useCvList: (...args: unknown[]) => mockUseCvList(...args),
}))

function renderHistory(items: CvListItem[] = []) {
  mockUseCvList.mockReturnValue({ items, isLoading: false, error: null })
  return render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  it('shows separate analysis and match buttons when both exist (AC: History dua link)', () => {
    renderHistory([
      {
        id: 1,
        originalFilename: 'cv.pdf',
        createdAt: '2026-08-18T00:00:00.000Z',
        latestReviewId: 5,
        latestMatchId: 9,
      },
    ])

    expect(screen.getByRole('link', { name: 'Lihat Analisis' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Lihat Pekerjaan Cocok' })).toBeDefined()
  })

  it('shows only the analysis button when no job match exists', () => {
    renderHistory([
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
    renderHistory([
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
})