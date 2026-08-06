import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ApprovalPage from './approval'

vi.mock('@/lib/api', () => ({
  api: {
    approveSuggestions: vi.fn(),
    triggerRewrite: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('@/hooks/use-review', () => ({
  useReview: () => ({
    review: {
      id: 1,
      cvId: 1,
      overallScore: 60,
      atsChecks: [],
      weaknesses: [],
      suggestions: [
        { id: 'sug-1', title: 'Tambah metrik', description: 'Ganti deskripsi tugas dengan hasil terukur.', category: 'achievements', priority: 'high' },
      ],
      modelUsed: 'test-model',
      createdAt: '2026-08-06T00:00:00.000Z',
      approvalId: null,
      rewriteId: null,
    },
    isLoading: false,
    error: null,
  }),
}))

function renderApproval() {
  return render(
    <MemoryRouter initialEntries={['/approval/1']}>
      <Routes>
        <Route path="/approval/:reviewId" element={<ApprovalPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ApprovalPage', () => {
  it('disables rewrite when no suggestion is approved (AC-08)', () => {
    renderApproval()
    expect(screen.getByRole('button', { name: /Setujui & Rewrite/i })).toBeDisabled()
  })
})
