import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions, OPS, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDFParse } from 'pdf-parse'

const require = createRequire(import.meta.url)
const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

const IGNORED_OPEN = '[IGNORED]'
const IGNORED_CLOSE = '[/IGNORED]'
const WHITE_THRESHOLD = 230
const SPACE_THRESHOLD_FACTOR = 0.3
const LINE_Y_TOLERANCE = 1
const LINE_SPACING_MIN_RATIO = 0.5
const LINE_SPACING_MAX_RATIO = 3
const COLUMN_GAP_THRESHOLD = 50
const COLUMN_MIN_LINES_PER_CLUSTER = 2
const COLUMN_SHARED_LINES_MIN = 2
const COLUMN_SPAN_MIN_RATIO = 0.5
const GRAPHIC_BAR_ASPECT_RATIO = 3
// Phase 15: garis pemisah section Word adalah filled rectangle tipis & hampir
// selebar halaman (mis. 454pt × 0,48pt, rasio ~945). Ia bukan skill bar. Abaikan
// bentuk TERISI yang (a) terlalu tipis (garis pemisah) atau (b) hampir selebar
// halaman (rule horizontal) — keduanya bukan progress bar/skill bar.
const GRAPHIC_BAR_MIN_THICKNESS = 1.5
const GRAPHIC_BAR_MAX_WIDTH_RATIO = 0.6

export interface FontRunInfo {
  name: string
  family: string
  isBold: boolean
  isItalic: boolean
  size: number
  charCount: number
}

export interface TypographyMetadata {
  fonts: FontRunInfo[]
  fontFamilies: string[]
  fontSizes: number[]
  bodySize: number | null
  titleSize: number | null
  lineSpacing: number | null
  margins: { left: number; right: number; top: number; bottom: number } | null
  boldRatio: number | null
  italicRatio: number | null
}

export interface LayoutMetadata {
  columnCount: number
  hasGraphics: boolean
  graphics: string[]
}

export interface PdfExtractResult {
  text: string
  source: 'pdfjs' | 'pdf-parse'
  typography: TypographyMetadata | null
  layout: LayoutMetadata | null
}

interface TextRun {
  text: string
  x: number
  y: number
  fontSize: number
  fontId: string | null
  ignored: boolean
}

// Phase 14, code review: garis tipis (stroke) seperti underline atau garis
// pemisah section umum di CV bersih dan tidak menandakan skill bar. Hanya
// bentuk TERISI (fill) yang menyerupai bar yang dihitung sebagai grafis.
const GRAPHIC_OP_NAMES = new Set([
  'paintXObject',
  'paintImageMaskXObject',
  'beginInlineImage',
  'paintSolidColorImageMask',
  'shadingFill',
  'rawFillPath',
])

const FILL_OP_TYPES = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke])

function pathLooksLikeBar(segments: unknown, pageWidth: number): boolean {
  if (!Array.isArray(segments)) return false
  const points: { x: number; y: number }[] = []
  for (const seg of segments) {
    if (seg === null || typeof seg !== 'object') continue
    const vals = Object.values(seg as Record<string, unknown>).filter((v): v is number => typeof v === 'number')
    for (let i = 0; i + 2 < vals.length; i += 3) {
      if (vals[i] === OPS.closePath) break
      const x = vals[i + 1]
      const y = vals[i + 2]
      if (x === undefined || y === undefined) continue
      points.push({ x, y })
    }
  }
  if (points.length < 3) return false
  const minX = Math.min(...points.map((p) => p.x))
  const maxX = Math.max(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const maxY = Math.max(...points.map((p) => p.y))
  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return false
  // Phase 15: garis pemisah section (tipis) atau rule hampir selebar halaman
  // bukan skill bar → abaikan.
  if (height < GRAPHIC_BAR_MIN_THICKNESS) return false
  if (width > GRAPHIC_BAR_MAX_WIDTH_RATIO * pageWidth) return false
  return width >= height * GRAPHIC_BAR_ASPECT_RATIO || height >= width * GRAPHIC_BAR_ASPECT_RATIO
}

const FONT_STYLE_RE = /-?(Bold|Italic|Oblique|Black|Heavy|DemiBold|SemiBold|ExtraBold|Medium|Light|Regular|MT|PSMT|Ital|Roman)-?/gi

function classifyFont(name: string): { family: string; isBold: boolean; isItalic: boolean } {
  const clean = name.replace(/^[A-Z]{6}\+/, '')
  const isBold = /\b(bold|black|heavy|demibold|semibold|extrabold|medium)\b/i.test(clean)
  const isItalic = /\b(italic|oblique)\b/i.test(clean)
  const family = clean.replace(FONT_STYLE_RE, '').trim()
  return { family: family || clean, isBold, isItalic }
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

function groupRunsByLine(runs: TextRun[]): { y: number; runs: TextRun[] }[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y)
  const lines: { y: number; runs: TextRun[] }[] = []
  for (const run of sorted) {
    const line = lines.find((l) => Math.abs(l.y - run.y) <= LINE_Y_TOLERANCE)
    if (line) line.runs.push(run)
    else lines.push({ y: run.y, runs: [run] })
  }
  return lines
}

function computeLineSpacing(lines: { y: number; runs: TextRun[] }[]): number | null {
  const ratios: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1]
    const curr = lines[i]
    if (prev === undefined || curr === undefined) continue
    const gap = prev.y - curr.y
    const size = Math.max(prev.runs[0]?.fontSize ?? 10, curr.runs[0]?.fontSize ?? 10)
    if (size <= 0) continue
    const ratio = gap / size
    if (ratio >= LINE_SPACING_MIN_RATIO && ratio <= LINE_SPACING_MAX_RATIO) ratios.push(ratio)
  }
  if (ratios.length === 0) return null
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return Math.round(avg * 100) / 100
}

function computeMargins(
  lines: { y: number; runs: TextRun[] }[],
  pageWidth: number,
  pageHeight: number,
): { left: number; right: number; top: number; bottom: number } | null {
  if (lines.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let found = false
  for (const line of lines) {
    for (const run of line.runs) {
      // Phase 15: abaikan run artefak yang runtuh ke koordinat (0,0) atau di luar
      // batas halaman (terjadi pada PDF export Word). Run asli tak pernah di
      // x=0/y=0 atau di luar MediaBox.
      if (run.x <= 0 || run.y <= 0 || run.x > pageWidth || run.y > pageHeight) continue
      found = true
      const w = run.text.length * run.fontSize * 0.5
      minX = Math.min(minX, run.x)
      maxX = Math.max(maxX, run.x + w)
      minY = Math.min(minY, run.y)
      maxY = Math.max(maxY, run.y)
    }
  }
  if (!found) return null
  return {
    left: Math.round(minX * 10) / 10,
    right: Math.round((pageWidth - maxX) * 10) / 10,
    top: Math.round((pageHeight - maxY) * 10) / 10,
    bottom: Math.round(minY * 10) / 10,
  }
}

function detectColumns(lines: { y: number; runs: TextRun[] }[]): number {
  if (lines.length < COLUMN_MIN_LINES_PER_CLUSTER) return 1
  const samples: { x: number; line: number }[] = []
  lines.forEach((line, lineIndex) => {
    for (const run of line.runs) samples.push({ x: run.x, line: lineIndex })
  })
  samples.sort((a, b) => a.x - b.x)
  const clusters: { maxX: number; lines: Set<number> }[] = []
  for (const sample of samples) {
    const last = clusters[clusters.length - 1]
    if (last !== undefined && sample.x - last.maxX <= COLUMN_GAP_THRESHOLD) {
      last.maxX = Math.max(last.maxX, sample.x)
      last.lines.add(sample.line)
    } else {
      clusters.push({ maxX: sample.x, lines: new Set([sample.line]) })
    }
  }
  const significant = clusters.filter((cluster) => cluster.lines.size >= COLUMN_MIN_LINES_PER_CLUSTER)
  if (significant.length < 2) return 1

  // Code review: kontak rata kanan di header, tanggal rata kanan, atau garis
  // pemisah menempati baris mereka sendiri dan tidak berbagi baseline dengan
  // teks body. Layout dua kolom ASLI menaruh teks kiri-kanan pada baris yang
  // SAMA (baseline sejajar) dan mencakup span vertikal yang sebanding. Dua
  // klaster hanya dianggap kolom bila memenuhi kedua syarat itu.
  const primary = significant.reduce((a, b) => (b.lines.size > a.lines.size ? b : a))
  const primaryYs = [...primary.lines].map((i) => lines[i]?.y ?? 0)
  const primarySpan = Math.max(...primaryYs) - Math.min(...primaryYs)
  if (primarySpan <= 0) return 1
  for (const cluster of significant) {
    if (cluster === primary) continue
    const sharedLines = [...cluster.lines].filter((line) => primary.lines.has(line)).length
    if (sharedLines < COLUMN_SHARED_LINES_MIN) continue
    const clusterYs = [...cluster.lines].map((i) => lines[i]?.y ?? 0)
    const clusterSpan = Math.max(...clusterYs) - Math.min(...clusterYs)
    if (clusterSpan / primarySpan >= COLUMN_SPAN_MIN_RATIO) {
      return Math.max(2, significant.length)
    }
  }
  return 1
}

function describeFont(name: string): string {
  const cls = classifyFont(name)
  const parts: string[] = [cls.family]
  if (cls.isBold) parts.push('Bold')
  if (cls.isItalic) parts.push('Italic')
  return parts.join(' ')
}

async function extractWithPdfjs(buffer: Buffer): Promise<{ text: string; typography: TypographyMetadata; layout: LayoutMetadata }> {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: VerbosityLevel.ERRORS }).promise
  try {
    const nameByFn: Record<number, string> = {}
    for (const [name, id] of Object.entries(OPS)) {
      nameByFn[id as number] = name
    }
    const pages: string[] = []
    const allRuns: TextRun[] = []
    const graphics: string[] = []
    const fontNameById = new Map<string, string>()
    let pageWidth = 612
    let pageHeight = 792
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: 1 })
      pageWidth = viewport.width
      pageHeight = viewport.height
      const ops = await page.getOperatorList()
      let ignored = false
      let out = ''
      let prevX: number | null = null
      let prevY: number | null = null
      let fontSize = 12
      let fontId: string | null = null
      const pageRuns: TextRun[] = []
      for (let i = 0; i < ops.fnArray.length; i++) {
        const opId = ops.fnArray[i]
        const name = opId === undefined ? undefined : nameByFn[opId]
        const args = ops.argsArray[i]
        if (name === undefined || args === undefined) continue
        if (name === 'beginText') {
          prevX = null
          prevY = null
        } else if (name === 'setFont') {
          const size = args[1]
          if (typeof size === 'number') fontSize = size
          if (typeof args[0] === 'string') fontId = args[0]
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
          if (text.length > 0) {
            pageRuns.push({ text, x: prevX ?? 0, y: prevY ?? 0, fontSize, fontId, ignored })
            out += ignored ? `${IGNORED_OPEN}${text}${IGNORED_CLOSE}` : text
          }
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
          if (text.length > 0) {
            pageRuns.push({ text, x: prevX ?? 0, y: prevY ?? 0, fontSize, fontId, ignored })
            out += ignored ? `${IGNORED_OPEN}${text}${IGNORED_CLOSE}` : text
          }
        } else if (name === 'constructPath') {
          const opType = args[0]
          if (typeof opType !== 'number' || !FILL_OP_TYPES.has(opType)) continue
          if (pathLooksLikeBar(args[1], pageWidth)) graphics.push(name)
        } else if (GRAPHIC_OP_NAMES.has(name)) {
          graphics.push(name)
        }
      }
      for (const run of pageRuns) {
        if (!run.fontId || fontNameById.has(run.fontId)) continue
        const fontObj = page.commonObjs.get(run.fontId) as { name?: string } | undefined
        fontNameById.set(run.fontId, fontObj?.name ? describeFont(fontObj.name) : 'Unknown')
      }
      allRuns.push(...pageRuns)
      pages.push(out)
    }

    const visibleRuns = allRuns.filter((r) => !r.ignored)
    const fontInfo = new Map<string, FontRunInfo>()
    for (const run of visibleRuns) {
      const name = run.fontId ? (fontNameById.get(run.fontId) ?? 'Unknown') : 'Unknown'
      const cls = classifyFont(name)
      const key = `${name}|${run.fontSize}`
      const existing = fontInfo.get(key)
      if (existing) existing.charCount += run.text.length
      else fontInfo.set(key, { name, family: cls.family, isBold: cls.isBold, isItalic: cls.isItalic, size: run.fontSize, charCount: run.text.length })
    }

    const fonts = [...fontInfo.values()].sort((a, b) => b.charCount - a.charCount)
    const fontFamilies = [...new Set(fonts.map((f) => f.family))]
    const fontSizes = [...new Set(fonts.map((f) => f.size))].sort((a, b) => a - b)
    const bodyFont = fonts.find((f) => !f.isBold && !f.isItalic && !f.name.includes('Unknown'))
    const bodySize = bodyFont ? bodyFont.size : (fontSizes[fontSizes.length - 1] ?? null)
    const titleSize = fontSizes[fontSizes.length - 1] ?? null

    const nonTitleRuns = visibleRuns.filter((r) => bodySize === null || Math.abs(r.fontSize - bodySize) <= 0.5)
    const totalNonTitleChars = nonTitleRuns.reduce((a, r) => a + r.text.length, 0)
    let boldChars = 0
    let italicChars = 0
    for (const run of nonTitleRuns) {
      const name = run.fontId ? (fontNameById.get(run.fontId) ?? 'Unknown') : 'Unknown'
      const cls = classifyFont(name)
      if (cls.isBold) boldChars += run.text.length
      if (cls.isItalic) italicChars += run.text.length
    }

    const lines = groupRunsByLine(visibleRuns)
    const typography: TypographyMetadata = {
      fonts,
      fontFamilies,
      fontSizes,
      bodySize,
      titleSize,
      lineSpacing: computeLineSpacing(lines),
      margins: computeMargins(lines, pageWidth, pageHeight),
      boldRatio: totalNonTitleChars > 0 ? Math.round((boldChars / totalNonTitleChars) * 1000) / 1000 : null,
      italicRatio: totalNonTitleChars > 0 ? Math.round((italicChars / totalNonTitleChars) * 1000) / 1000 : null,
    }
    const layout: LayoutMetadata = {
      columnCount: detectColumns(lines),
      hasGraphics: graphics.length > 0,
      graphics: [...new Set(graphics)],
    }
    return { text: pages.join('\n'), typography, layout }
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
    const { text, typography, layout } = await extractWithPdfjs(buffer)
    if (text.trim().length > 0) return { text, source: 'pdfjs', typography, layout }
  } catch {
    // fall through to pdf-parse
  }
  const text = await extractWithPdfParse(buffer)
  return { text, source: 'pdf-parse', typography: null, layout: null }
}