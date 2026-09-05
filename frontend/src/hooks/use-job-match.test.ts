import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useJobMatch } from './use-job-match'
import type { CvListItem } from '@/types/api'

const { mockListCvs, mockGetJobMatch, mockGetReview } = vi.hoisted(() => ({
  mockListCvs: vi.fn(),
  mockGetJobMatch: vi.fn(),
  mockGetReview: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    listCvs: (...args: unknown[]) => mockListCvs(...args),
    getJobMatch: (...args: unknown[]) => mockGetJobMatch(...args),
    getReview: (...args: unknown[]) => mockGetReview(...args),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}))

beforeEach(() => {
  mockListCvs.mockReset()
  mockGetJobMatch.mockReset()
  mockGetReview.mockReset()
})

const baseCv: CvListItem = {
  id: 1,
  originalFilename: 'cv.pdf',
  createdAt: '2026-08-18T00:00:00.000Z',
  latestReviewId: 10,
  latestMatchId: 20,
}

describe('useJobMatch', () => {
  it('loads the stored report and job match when both ids are present', async () => {
    mockListCvs.mockResolvedValue([baseCv])
    mockGetJobMatch.mockResolvedValue({ id: 20, cvId: 1, matches: [], modelUsed: 'm', status: 'completed', errorMessage: null, createdAt: baseCv.createdAt })
    mockGetReview.mockResolvedValue({ id: 10, cvId: 1, targetJobId: null, overallScore: 70, atsChecks: [], weaknesses: [], suggestions: [], modelUsed: 'm', createdAt: baseCv.createdAt })

    const { result } = renderHook(() => useJobMatch(1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.jobMatch?.id).toBe(20)
    expect(result.current.report?.id).toBe(10)
  })

  it('surfaces an error instead of hanging when latestMatchId is set but latestReviewId is null (MIN-12)', async () => {
    mockListCvs.mockResolvedValue([{ ...baseCv, latestReviewId: null, latestMatchId: 20 }])

    const { result } = renderHook(() => useJobMatch(1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Data analisis untuk CV ini tidak lengkap. Coba unggah ulang CV.')
    expect(result.current.report).toBeNull()
    expect(result.current.jobMatch).toBeNull()
    expect(mockGetJobMatch).not.toHaveBeenCalled()
    expect(mockGetReview).not.toHaveBeenCalled()
  })
})
