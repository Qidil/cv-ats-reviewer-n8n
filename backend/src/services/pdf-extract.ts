import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDFParse } from 'pdf-parse'

const require = createRequire(import.meta.url)
const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

const IGNORED_OPEN = '[IGNORED]'
const IGNORED_CLOSE = '[/IGNORED]'
const WHITE_THRESHOLD = 230
const SPACE_THRESHOLD_FACTOR = 0.3

export interface PdfExtractResult {
  text: string
  source: 'pdfjs' | 'pdf-parse'
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  const hexDigits = match?.[1]
  if (hexDigits === undefined) return null
  const value = Number.parseInt(hexDigits, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

// Phase 12: hanya teks yang fill color-nya mendekati putih yang diabaikan
// (dibungkus [IGNORED]...[/IGNORED]) — taktik ATS teks tersembunyi/watermark.
// Semua warna lain (hitam, abu-abu, biru, merah, dll.) dibiarkan terbaca tanpa
// penanda (perilaku default; tidak ada aturan khusus).
function isIgnored(args: unknown[]): boolean {
  const first = args[0]
  if (typeof first === 'string' && first.startsWith('#')) {
    const rgb = hexToRgb(first)
    return rgb !== null && Math.min(rgb[0], rgb[1], rgb[2]) > WHITE_THRESHOLD
  }
  if (Array.isArray(first)) {
    if (first.length === 3) {
      const [r, g, b] = first as number[]
      return Math.min(r ?? 0, g ?? 0, b ?? 0) * 255 > WHITE_THRESHOLD
    }
    if (first.length === 4) {
      const [c, m, y, k] = first as number[]
      const r = 255 * (1 - (c ?? 0)) * (1 - (k ?? 0))
      const g = 255 * (1 - (m ?? 0)) * (1 - (k ?? 0))
      const b = 255 * (1 - (y ?? 0)) * (1 - (k ?? 0))
      return Math.min(r, g, b) > WHITE_THRESHOLD
    }
  }
  if (typeof first === 'number') {
    return first * 255 > WHITE_THRESHOLD
  }
  return false
}

async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  try {
    const nameByFn: Record<number, string> = {}
    for (const [name, id] of Object.entries(OPS)) {
      nameByFn[id as number] = name
    }
    const pages: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      let ignored = false
      let out = ''
      let prevX: number | null = null
      let prevY: number | null = null
      let fontSize = 12
      for (let i = 0; i < ops.fnArray.length; i++) {
        const opId = ops.fnArray[i]
        const name = opId === undefined ? undefined : nameByFn[opId]
        const args = ops.argsArray[i]
        if (name === undefined || args === undefined) continue
        if (name === 'setFont') {
          const size = args[1]
          if (typeof size === 'number') fontSize = size
        } else if (name === 'setFillRGBColor' || name === 'setFillColor' || name === 'setFillGray' || name === 'setFillCMYKColor') {
          ignored = isIgnored(args)
        } else if (name === 'setTextMatrix') {
          prevX = args[4] as number
          prevY = args[5] as number
        } else if (name === 'moveText' || name === 'setLeadingMoveText') {
          const tx = args[0] as number
          const ty = args[1] as number
          const nx: number = (prevX ?? 0) + tx
          const ny: number = (prevY ?? 0) + ty
          if (prevY !== null && Math.abs(ny - prevY) > 1) out += '\n'
          else if (prevX !== null && prevY !== null && tx > fontSize * SPACE_THRESHOLD_FACTOR && Math.abs(ny - prevY) <= 1) out += ' '
          prevX = nx
          prevY = ny
        } else if (name === 'nextLine') {
          out += '\n'
        } else if (name === 'showText') {
          let text = ''
          const glyphs = args[0]
          if (Array.isArray(glyphs)) {
            for (const glyph of glyphs) {
              if (typeof glyph === 'object' && glyph !== null && typeof (glyph as { unicode?: unknown }).unicode === 'string') {
                text += (glyph as { unicode: string }).unicode
              }
            }
          }
          if (text.length > 0) out += ignored ? `${IGNORED_OPEN}${text}${IGNORED_CLOSE}` : text
        } else if (name === 'showSpacedText') {
          let text = ''
          const chunks = args[0]
          if (Array.isArray(chunks)) {
            for (const chunk of chunks) {
              if (typeof chunk === 'number') {
                if (chunk < 0) text += ' '
              } else if (Array.isArray(chunk)) {
                text += chunk
                  .map((g) => (typeof g === 'object' && g !== null ? ((g as { unicode?: unknown }).unicode as string) ?? '' : ''))
                  .join('')
              }
            }
          }
          if (text.length > 0) out += ignored ? `${IGNORED_OPEN}${text}${IGNORED_CLOSE}` : text
        }
      }
      pages.push(out)
    }
    return pages.join('\n')
  } finally {
    await doc.destroy()
  }
}

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  return result.text
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    const text = await extractWithPdfjs(buffer)
    if (text.trim().length > 0) return { text, source: 'pdfjs' }
  } catch {
    // fall through to pdf-parse
  }
  const text = await extractWithPdfParse(buffer)
  return { text, source: 'pdf-parse' }
}