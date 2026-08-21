import { describe, expect, it } from 'vitest'
import { extractPdfText } from './pdf-extract.js'
import { makePdf, makePdfWith } from './pdf-test-utils.js'

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

describe('extractPdfText — Phase 14 typography & layout metadata', () => {
  it('extracts font families, sizes, body/title size, and margins', async () => {
    const content = [
      'BT /F1 16 Tf 72 740 Td (Budi Sudirman) Tj ET',
      'BT /F2 11 Tf 72 720 Td (Backend Engineer) Tj ET',
      'BT /F2 11 Tf 72 700 Td (Experienced developer) Tj ET',
      'BT /F2 11 Tf 72 680 Td (Second line here) Tj ET',
      'BT /F3 9 Tf 72 660 Td (Small note) Tj ET',
    ].join('\n')
    const result = await extractPdfText(makePdfWith(content, { fonts: ['Helvetica-Bold', 'Helvetica', 'Arial'] }))
    expect(result.source).toBe('pdfjs')
    expect(result.typography).not.toBeNull()
    expect(result.typography?.fontFamilies).toEqual(expect.arrayContaining(['Helvetica', 'Arial']))
    expect(result.typography?.bodySize).toBe(11)
    expect(result.typography?.titleSize).toBe(16)
    expect(result.typography?.fontSizes).toEqual([9, 11, 16])
    expect(result.typography?.margins?.left).toBe(72)
    expect(result.typography?.margins?.top).toBeCloseTo(52, 0)
    expect(result.layout?.columnCount).toBe(1)
    expect(result.layout?.hasGraphics).toBe(false)
  })

  it('detects a two-column layout from x-position clusters', async () => {
    const content = [
      'BT /F1 12 Tf 72 740 Td (Left col line one) Tj ET',
      'BT /F1 12 Tf 72 720 Td (Left col line two) Tj ET',
      'BT /F1 12 Tf 72 700 Td (Left col line three) Tj ET',
      'BT /F1 12 Tf 340 740 Td (Right col line one) Tj ET',
      'BT /F1 12 Tf 340 720 Td (Right col line two) Tj ET',
      'BT /F1 12 Tf 340 700 Td (Right col line three) Tj ET',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.layout?.columnCount).toBeGreaterThanOrEqual(2)
  })

  it('detects graphics (filled bar shapes) in the layout', async () => {
    const content = [
      'BT /F1 12 Tf 72 720 Td (Progress bars) Tj ET',
      'q 1 0 0 1 72 600 cm 0 0 300 6 re f Q',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.layout?.hasGraphics).toBe(true)
    expect(result.layout?.graphics).toContain('constructPath')
  })

  it('does not count a thin stroke/underline line as graphics', async () => {
    const content = [
      'BT /F1 12 Tf 72 720 Td (Section header) Tj ET',
      'q 1 0 0 1 72 700 cm 0 0 300 2 re S Q',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.layout?.hasGraphics).toBe(false)
  })

  it('does not count a filled square (non-bar) as graphics', async () => {
    const content = [
      'BT /F1 12 Tf 72 720 Td (Bullet dot) Tj ET',
      'q 1 0 0 1 72 700 cm 0 0 6 6 re f Q',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.layout?.hasGraphics).toBe(false)
  })

  it('does not treat a right-aligned header contact as a two-column layout', async () => {
    const content = [
      'BT /F1 16 Tf 72 740 Td (Budi Sudirman) Tj ET',
      'BT /F1 9 Tf 340 744 Td (budi@mail.com) Tj ET',
      'BT /F1 9 Tf 340 728 Td (+62 812 3456 7890) Tj ET',
      'BT /F1 11 Tf 72 700 Td (Pengalaman) Tj ET',
      'BT /F1 11 Tf 72 680 Td (bekerja di perusahaan X) Tj ET',
      'BT /F1 11 Tf 72 660 Td (Pendidikan) Tj ET',
      'BT /F1 11 Tf 72 640 Td (S1 Teknik Informatika) Tj ET',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.layout?.columnCount).toBe(1)
  })

  it('returns null typography/layout metadata for pdf-parse fallback (empty pdfjs text)', async () => {
    const result = await extractPdfText(makePdf(''))
    expect(result.source).toBe('pdf-parse')
    expect(result.typography).toBeNull()
    expect(result.layout).toBeNull()
  })

  it('Phase 15: does not count a near-full-width thin filled rule (Word section divider) as graphics', async () => {
    const content = [
      'BT /F1 12 Tf 72 720 Td (Section title) Tj ET',
      'q 1 0 0 1 72 700 cm 0 0 454 0.48 re f Q',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.layout?.hasGraphics).toBe(false)
  })

  it('Phase 15: ignores artifact runs at the origin or outside the page when computing margins', async () => {
    const content = [
      'BT /F1 12 Tf 0 0 Td (Ghost at origin) Tj ET',
      'BT /F1 12 Tf 700 900 Td (Ghost off page) Tj ET',
      'BT /F1 12 Tf 72 720 Td (Real content) Tj ET',
    ].join('\n')
    const result = await extractPdfText(makePdf(content))
    expect(result.typography?.margins?.left).toBe(72)
    expect(result.typography?.margins?.top).toBeCloseTo(72, 0)
  })
})