import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UploadPage from './upload'

const { mockUploadCv } = vi.hoisted(() => ({
  mockUploadCv: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    uploadCv: mockUploadCv,
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
  beforeEach(() => {
    mockUploadCv.mockReset()
  })
  it('blocks submission when the target job description is empty (AC-03)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.upload(screen.getByLabelText('File CV (PDF)'), file)
    await user.click(screen.getByRole('button', { name: /Lanjut/i }))
    await user.click(screen.getByRole('button', { name: /Mode A/i }))

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
    await user.click(screen.getByRole('button', { name: /Mode A/i }))
    await user.type(screen.getByLabelText('Deskripsi pekerjaan target'), 'Senior Frontend Engineer')
    await user.click(screen.getByRole('button', { name: /Analisis CV/i }))

    expect(screen.getByRole('button', { name: /Analisis CV/i })).not.toBeDisabled()
  })

  it('submits without a job description in Mode B', async () => {
    mockUploadCv.mockResolvedValue({ id: 7 })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.upload(screen.getByLabelText('File CV (PDF)'), file)
    await user.click(screen.getByRole('button', { name: /Lanjut/i }))
    await user.click(screen.getByRole('button', { name: /Mode B/i }))

    expect(mockUploadCv).toHaveBeenCalledWith(file, '')
  })

  it('highlights the drop zone while dragging a file over it', async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    const zone = screen.getByLabelText('Area unggah CV: klik atau seret file PDF ke sini')

    fireEvent.dragEnter(zone)
    expect(screen.getByText('Lepaskan di sini')).toBeInTheDocument()

    fireEvent.dragLeave(zone)
    expect(screen.queryByText('Lepaskan di sini')).not.toBeInTheDocument()
  })

  it('accepts a dropped PDF file', async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    const zone = screen.getByLabelText('Area unggah CV: klik atau seret file PDF ke sini')
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })

    expect(screen.getByText(file.name)).toBeInTheDocument()
  })
})
