import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ApprovalPage from './approval'

const { mockTriggerRewrite, mockApproveSuggestions } = vi.hoisted(() => ({
  mockTriggerRewrite: vi.fn(),
  mockApproveSuggestions: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    approveSuggestions: mockApproveSuggestions,
    triggerRewrite: mockTriggerRewrite,
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
  beforeEach(() => {
    mockTriggerRewrite.mockReset()
    mockApproveSuggestions.mockReset()
  })

  it('disables rewrite when no suggestion is approved (AC-08)', () => {
    renderApproval()
    expect(screen.getByRole('button', { name: /Setujui & Rewrite/i })).toBeDisabled()
  })

  it('shows the CV format selector with chronological as default (REWRITE-02)', () => {
    renderApproval()
    expect(screen.getByLabelText('Format CV ATS')).toBeDefined()
    expect(screen.getByText('Kronologis')).toBeDefined()
  })

  it('sends the selected format to triggerRewrite (REWRITE-02)', async () => {
    mockApproveSuggestions.mockResolvedValue({ id: 9 })
    mockTriggerRewrite.mockResolvedValue({
      id: 10,
      reviewId: 1,
      approvalId: 9,
      rewrittenMarkdown: '# Budi',
      postScore: null,
      warnings: null,
      postModelUsed: null,
      createdAt: '2026-08-09T00:00:00.000Z',
    })
    renderApproval()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('combobox', { name: 'Format CV ATS' }))
    fireEvent.click(await screen.findByText('Kombinasi'))
    fireEvent.click(screen.getByRole('button', { name: /Setujui & Rewrite/i }))

    await waitFor(() => {
      expect(mockApproveSuggestions).toHaveBeenCalledWith(1, ['sug-1'])
      expect(mockTriggerRewrite).toHaveBeenCalledWith(9, 'combination')
    })
  })
})
