import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UploadPage from './upload'

vi.mock('@/lib/api', () => ({
  api: {
    uploadCv: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

const file = new File(['dummy'], 'cv.pdf', { type: 'application/pdf' })

describe('UploadPage', () => {
  it('blocks submission when the target job description is empty (AC-03)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.upload(screen.getByLabelText('File CV (PDF)'), file)
    await user.click(screen.getByRole('button', { name: /Lanjut/i }))
    await user.click(screen.getByRole('button', { name: /Analisis CV/i }))

    expect(screen.getByRole('button', { name: /Analisis CV/i })).toBeDisabled()
  })

  it('allows submission with a job description', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.upload(screen.getByLabelText('File CV (PDF)'), file)
    await user.click(screen.getByRole('button', { name: /Lanjut/i }))
    await user.type(screen.getByLabelText('Deskripsi pekerjaan target'), 'Senior Frontend Engineer')
    await user.click(screen.getByRole('button', { name: /Analisis CV/i }))

    expect(screen.getByRole('button', { name: /Analisis CV/i })).not.toBeDisabled()
  })
})
