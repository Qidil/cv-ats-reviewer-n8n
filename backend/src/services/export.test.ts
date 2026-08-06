import { describe, expect, it } from 'vitest'
import { exportRewrite, parseMarkdown } from './export.js'

const SAMPLE_MARKDOWN = [
  '# Budi Sudirman',
  '',
  '## Pengalaman Kerja',
  '- Backend Developer (2021-2024): Meningkatkan performa API 30%',
  '- Junior Developer (2019-2021): REST API untuk 3 produk',
  '',
  '### Projek',
  '- Sistem ATS internal',
  '',
  '## Pendidikan',
  '- S1 Teknik Informatika, Universitas Indonesia',
  '',
  '## Keahlian',
  '- Node.js, TypeScript, SQL',
].join('\n')

describe('parseMarkdown', () => {
  it('classifies headings, bullets, paragraphs and empty lines', () => {
    const blocks = parseMarkdown(SAMPLE_MARKDOWN)
    expect(blocks[0]).toEqual({ kind: 'heading1', text: 'Budi Sudirman' })
    expect(blocks[1]).toEqual({ kind: 'empty' })
    expect(blocks[2]).toEqual({ kind: 'heading2', text: 'Pengalaman Kerja' })
    expect(blocks[3]).toEqual({
      kind: 'bullet',
      text: 'Backend Developer (2021-2024): Meningkatkan performa API 30%',
    })
    expect(blocks[4]).toEqual({
      kind: 'bullet',
      text: 'Junior Developer (2019-2021): REST API untuk 3 produk',
    })
  })

  it('detects level-3 headings', () => {
    const blocks = parseMarkdown('### Projek\n')
    expect(blocks[0]).toEqual({ kind: 'heading3', text: 'Projek' })
  })

  it('keeps the 6-level hierarchy distinct', () => {
    const blocks = parseMarkdown('# A\n## B\n### C\n- D\n\nE')
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading1',
      'heading2',
      'heading3',
      'bullet',
      'empty',
      'paragraph',
    ])
  })

  it('treats a plain line as a paragraph', () => {
    const blocks = parseMarkdown('Seorang backend engineer.')
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: 'Seorang backend engineer.' })
  })
})

describe('exportRewrite', () => {
  it('generates a valid PDF buffer with the right content type', async () => {
    const result = await exportRewrite(SAMPLE_MARKDOWN, 'pdf')
    expect(result.contentType).toBe('application/pdf')
    expect(result.filename).toBe('cv-rewritten.pdf')
    expect(result.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(result.buffer.length).toBeGreaterThan(1000)
  })

  it('generates a valid DOCX buffer (zip container) with the right content type', async () => {
    const result = await exportRewrite(SAMPLE_MARKDOWN, 'docx')
    expect(result.contentType).toContain('wordprocessingml')
    expect(result.filename).toBe('cv-rewritten.docx')
    expect(result.buffer.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(result.buffer.length).toBeGreaterThan(1000)
  })

  it('keeps both formats byte-distinct for the same markdown source (AC-11)', async () => {
    const pdf = await exportRewrite(SAMPLE_MARKDOWN, 'pdf')
    const docx = await exportRewrite(SAMPLE_MARKDOWN, 'docx')
    expect(pdf.buffer.equals(docx.buffer)).toBe(false)
  })
})
