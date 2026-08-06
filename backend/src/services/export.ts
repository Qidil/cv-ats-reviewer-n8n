import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pdfmake, { type Content } from 'pdfmake'
import { Document, Packer, Paragraph, TextRun } from 'docx'

export type ExportFormat = 'pdf' | 'docx'

export interface ExportResult {
  buffer: Buffer
  contentType: string
  filename: string
}

type PdfDocumentDefinitions = Parameters<typeof pdfmake.createPdf>[0]

export type Block =
  | { kind: 'heading1'; text: string }
  | { kind: 'heading2'; text: string }
  | { kind: 'heading3'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'empty' }

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []
  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      blocks.push({ kind: 'empty' })
    } else if (/^#\s+/.test(line)) {
      blocks.push({ kind: 'heading1', text: line.replace(/^#\s+/, '') })
    } else if (/^##\s+/.test(line)) {
      blocks.push({ kind: 'heading2', text: line.replace(/^##\s+/, '') })
    } else if (/^###\s+/.test(line)) {
      blocks.push({ kind: 'heading3', text: line.replace(/^###\s+/, '') })
    } else if (/^\s*[-*]\s+/.test(line)) {
      blocks.push({ kind: 'bullet', text: line.replace(/^\s*[-*]\s+/, '') })
    } else {
      blocks.push({ kind: 'paragraph', text: line.trim() })
    }
  }
  return blocks
}

const ROBOTO_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'node_modules',
  'pdfmake',
  'build',
  'fonts',
  'Roboto',
)

function configurePdfFonts(): void {
  pdfmake.setLocalAccessPolicy((filePath: string) =>
    path.resolve(filePath).startsWith(path.resolve(ROBOTO_DIR)),
  )
  pdfmake.setUrlAccessPolicy(() => false)
  pdfmake.setFonts({
    Roboto: {
      normal: path.join(ROBOTO_DIR, 'Roboto-Regular.ttf'),
      bold: path.join(ROBOTO_DIR, 'Roboto-Medium.ttf'),
      italics: path.join(ROBOTO_DIR, 'Roboto-Italic.ttf'),
      bolditalics: path.join(ROBOTO_DIR, 'Roboto-MediumItalic.ttf'),
    },
  })
}

let fontsConfigured = false

function ensurePdfFonts(): void {
  if (fontsConfigured) return
  configurePdfFonts()
  fontsConfigured = true
}

function toPdf(blocks: Block[]): PdfDocumentDefinitions {
  const content: Content[] = []
  for (const block of blocks) {
    if (block.kind === 'heading1') {
      content.push({ text: block.text, fontSize: 16, bold: true, margin: [0, 8, 0, 2] })
    } else if (block.kind === 'heading2') {
      content.push({ text: block.text, fontSize: 12, bold: true, margin: [0, 6, 0, 2] })
    } else if (block.kind === 'heading3') {
      content.push({ text: block.text, fontSize: 11, bold: true, margin: [0, 5, 0, 1] })
    } else if (block.kind === 'bullet') {
      content.push({ text: `\u2022 ${block.text}`, fontSize: 10, margin: [10, 1, 0, 1] })
    } else if (block.kind === 'paragraph') {
      content.push({ text: block.text, fontSize: 10, margin: [0, 1, 0, 1] })
    } else {
      content.push({ text: '', margin: [0, 2, 0, 2] })
    }
  }
  return {
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111111' },
    content,
  }
}

async function toDocx(blocks: Block[]): Promise<Buffer> {
  const paragraphs: Paragraph[] = []
  for (const block of blocks) {
    if (block.kind === 'heading1') {
      paragraphs.push(
        new Paragraph({
          heading: 'Title',
          children: [new TextRun({ text: block.text, bold: true, size: 32 })],
        }),
      )
    } else if (block.kind === 'heading2') {
      paragraphs.push(
        new Paragraph({
          heading: 'Heading2',
          children: [new TextRun({ text: block.text, bold: true, size: 24 })],
        }),
      )
    } else if (block.kind === 'heading3') {
      paragraphs.push(
        new Paragraph({
          heading: 'Heading3',
          children: [new TextRun({ text: block.text, bold: true, size: 22 })],
        }),
      )
    } else if (block.kind === 'bullet') {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: block.text, size: 20 })],
        }),
      )
    } else if (block.kind === 'paragraph') {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: block.text, size: 20 })] }))
    } else {
      paragraphs.push(new Paragraph({ children: [] }))
    }
  }
  const document = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children: paragraphs,
      },
    ],
  })
  return Packer.toBuffer(document)
}

export async function exportRewrite(
  rewrittenMarkdown: string,
  format: ExportFormat,
): Promise<ExportResult> {
  const blocks = parseMarkdown(rewrittenMarkdown)
  if (format === 'pdf') {
    ensurePdfFonts()
    const document = toPdf(blocks)
    const buffer = await pdfmake.createPdf(document).getBuffer()
    return { buffer, contentType: 'application/pdf', filename: 'cv-rewritten.pdf' }
  }
  const buffer = await toDocx(blocks)
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: 'cv-rewritten.docx',
  }
}
