import { describe, expect, it } from 'vitest'
import { extractPdfText } from './pdf-extract.js'
import { makePdf } from './pdf-test-utils.js'

describe('extractPdfText', () => {
  it('extracts plain black text without markers', async () => {
    const result = await extractPdfText(makePdf('BT /F1 12 Tf 72 720 Td (Budi Sudirman) Tj ET'))
    expect(result.text).toContain('Budi Sudirman')
    expect(result.text).not.toContain('[IGNORED]')
  })

  it('wraps white text with [IGNORED] markers', async () => {
    const result = await extractPdfText(makePdf('BT 1 1 1 rg /F1 12 Tf 72 720 Td (WHITE HIDDEN) Tj ET'))
    expect(result.text).toContain('[IGNORED]WHITE HIDDEN[/IGNORED]')
  })

  it('keeps black and colored text outside the markers', async () => {
    const content = 'BT /F1 12 Tf 72 720 Td (Black Text) Tj 0.9 0 0 rg (Red Text) Tj 1 1 1 rg (White Text) Tj 0 0 0 rg (Back Black) Tj ET'
    const result = await extractPdfText(makePdf(content))
    expect(result.text).toContain('Black Text')
    expect(result.text).toContain('Red Text')
    expect(result.text).not.toContain('[IGNORED]Red Text[/IGNORED]')
    expect(result.text).toContain('[IGNORED]White Text[/IGNORED]')
    expect(result.text).toContain('Back Black')
  })
})