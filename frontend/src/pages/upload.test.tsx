import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UploadPage from './upload'

const { mockUploadCv, mockListCvs } = vi.hoisted(() => ({
  mockUploadCv: vi.fn(),
  mockListCvs: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    uploadCv: mockUploadCv,
    // Phase 20: UploadPage kini selalu me-render <HistoryPanel /> di
    // sampingnya, yang memanggil listCvs() lewat useCvList().
    listCvs: mockListCvs,
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
    mockListCvs.mockReset()
    mockListCvs.mockResolvedValue([])
  })

  it('Mode A/B tampil langsung tanpa tombol Lanjut (Phase 20)', async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /Lanjut/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Mode A/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Mode B/i })).toBeDefined()
  })

  it('tombol Mode A/B bisa wrap teks & tidak overflow kotak (fix Phase 20)', () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    const modeAButton = screen.getByRole('button', { name: /Mode A/i })
    const modeBButton = screen.getByRole('button', { name: /Mode B/i })

    for (const button of [modeAButton, modeBButton]) {
      // whitespace-nowrap dari base Button ter-inherit ke teks anak jika
      // tidak di-override -> teks panjang tidak bisa wrap (overflow
      // horizontal). h-8 (size=default) juga harus di-override jadi h-auto,
      // kalau tidak konten 2 baris + p-6 overflow vertikal keluar kotak.
      expect(button.className).toContain('whitespace-normal')
      expect(button.className).not.toContain('whitespace-nowrap')
      expect(button.className).toContain('h-auto')
    }
  })

  it('menolak pilih mode sebelum file dipilih (Phase 20)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /Mode A/i }))

    expect(screen.getByText('Pilih file PDF terlebih dahulu.')).toBeInTheDocument()
    expect(mockUploadCv).not.toHaveBeenCalled()
  })

  it('blocks submission when the target job description is empty (AC-03)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.upload(screen.getByLabelText('File CV (PDF)'), file)
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
