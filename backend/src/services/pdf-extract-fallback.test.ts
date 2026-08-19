import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  OPS: {},
  getDocument: () => ({
    promise: Promise.reject(new Error('forced pdfjs failure')),
  }),
}))

import { extractPdfText } from './pdf-extract.js'
import { makePdf } from './pdf-test-utils.js'

describe('extractPdfText fallback', () => {
  it('falls back to pdf-parse when pdfjs fails', async () => {
    const result = await extractPdfText(makePdf('BT /F1 12 Tf 72 720 Td (Budi Sudirman) Tj ET'))
    expect(result.source).toBe('pdf-parse')
    expect(result.text).toContain('Budi Sudirman')
  })
})