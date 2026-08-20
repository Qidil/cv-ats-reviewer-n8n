import type { AtsCheck, Suggestion, AtsCheckStatus } from '../db/repos.js'
import type { AnalyzeReport } from '../utils/model-parser.js'
import type { TypographyMetadata, LayoutMetadata } from './pdf-extract.js'

export type CheckId = 'keyword' | 'skills' | 'sections' | 'formatting' | 'quantified' | 'readability'

export interface PdfMetadata {
  typography: TypographyMetadata | null
  layout: LayoutMetadata | null
}

export interface AnalyzeResult {
  overallScore: number
  atsChecks: AtsCheck[]
  weaknesses: string[]
  suggestions: Suggestion[]
}

interface CheckContext {
  cv: string
  cvLower: string
  jdLower: string
  allKeywords: string[]
  sections: Record<CheckSection, boolean>
  bullets: string[]
  skillsText: string
  summaryText: string
}

type CheckSection = 'summary' | 'experience' | 'education' | 'skills'

const SECTION_HEADINGS: Record<CheckSection, string[]> = {
  summary: ['summary', 'professional summary', 'ringkasan', 'ringkasan profesional', 'profil', 'profile', 'about', 'tentang'],
  experience: ['experience', 'work experience', 'pengalaman', 'pengalaman kerja', 'employment', 'riwayat pekerjaan'],
  education: ['education', 'pendidikan', 'riwayat pendidikan', 'academic background'],
  skills: ['skills', 'technical skills', 'keahlian', 'kemampuan', 'skills & tools', 'core competencies', 'kompetensi'],
}

const ALL_SECTIONS: CheckSection[] = ['summary', 'experience', 'education', 'skills']

// Phase 14 — typography & layout rules. Kelompok 1 (tipografi) hanya menghasilkan
// saran dan TIDAK memengaruhi skor; Kelompok 2 (layout) memberi penalti −15.
const TITLE_SIZE_MIN = 14
const TITLE_SIZE_MAX = 16
const BODY_SIZE_MIN = 10
const BODY_SIZE_MAX = 12
const LINE_SPACING_MIN = 1.0
const LINE_SPACING_MAX = 1.15
const MARGIN_IDEAL_PT = 72
const MARGIN_TOLERANCE_PT = 18
const STYLE_OVERUSE_RATIO = 0.3
const KNOWN_SERIF = new Set([
  'times', 'times new roman', 'georgia', 'garamond', 'palatino', 'cambria',
  'book antiqua', 'century schoolbook', 'didot', 'hoefler text', 'liberation serif',
])

const WEIGHTS: Record<CheckId, number> = {
  keyword: 40,
  skills: 20,
  sections: 15,
  formatting: 10,
  quantified: 10,
  readability: 5,
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'we', 'with',
  'dan', 'dari', 'di', 'kami', 'kita', 'ke', 'pada', 'sebagai', 'untuk', 'yang',
  'adalah', 'akan', 'telah', 'sedang', 'agar', 'dalam', 'tentang', 'antara',
  'setelah', 'sebelum', 'serta', 'atau', 'juga', 'hanya', 'semua', 'setiap',
  'mencari', 'seorang', 'dengan', 'tim', 'kandidat', 'memiliki', 'membutuhkan',
  'bergabung', 'bekerja', 'berpengalaman', 'minimal', 'tahun', 'mampu', 'dapat',
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeHeading(line: string): string {
  return line.trim().replace(/^#+\s*/, '').replace(/[*_]+/g, '').replace(/:+$/, '').trim().toLowerCase()
}

function detectSections(cvLower: string): Record<CheckSection, boolean> {
  const result = {
    summary: false,
    experience: false,
    education: false,
    skills: false,
  } as Record<CheckSection, boolean>
  for (const line of cvLower.split('\n')) {
    const normalized = normalizeHeading(line)
    for (const section of ALL_SECTIONS) {
      if (!result[section] && SECTION_HEADINGS[section].includes(normalized)) {
        result[section] = true
      }
    }
  }
  return result
}

function extractBullets(cv: string): string[] {
  return cv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*•·]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
}

function extractKeywords(jdLower: string): string[] {
  const tokens = jdLower.match(/[a-z0-9][a-z0-9+.#-]*/g) ?? []
  const unique = new Set<string>()
  for (const token of tokens) {
    const cleaned = token.replace(/[.]+$/, '')
    if (cleaned.length >= 2 && !STOPWORDS.has(cleaned) && !/^\d+$/.test(cleaned)) {
      unique.add(cleaned)
    }
  }
  return [...unique]
}

function extractPhrases(jdLower: string): string[] {
  const tokens = jdLower.match(/[a-z0-9][a-z0-9+.#-]*/g) ?? []
  const phrases = new Set<string>()
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]
    const b = tokens[i + 1]
    if (a === undefined || b === undefined) continue
    const aClean = a.replace(/[.]+$/, '')
    const bClean = b.replace(/[.]+$/, '')
    if (
      aClean.length >= 2 &&
      bClean.length >= 2 &&
      !STOPWORDS.has(aClean) &&
      !STOPWORDS.has(bClean) &&
      !/^\d+$/.test(aClean) &&
      !/^\d+$/.test(bClean)
    ) {
      phrases.add(`${aClean} ${bClean}`)
    }
  }
  return [...phrases]
}

function extractSectionText(cv: string, target: CheckSection): string {
  const parts: string[] = []
  let inSection = false
  for (const line of cv.split('\n')) {
    const normalized = normalizeHeading(line)
    if (inSection) {
      if (ALL_SECTIONS.some((section) => section !== target && SECTION_HEADINGS[section].includes(normalized))) {
        break
      }
      parts.push(line.trim())
    } else if (SECTION_HEADINGS[target].includes(normalized)) {
      inSection = true
    }
  }
  return parts.join(' ').toLowerCase()
}

function countSkillItems(skillsText: string): number {
  return skillsText
    .split(/[,\n|•·-]/)
    .map((item) => item.trim().replace(/^[-*•·|]\s*/, ''))
    .filter((item) => item.length >= 2)
    .length
}

function hasKeyword(cvLower: string, keyword: string): boolean {
  return new RegExp(`(?<![\\w])${escapeRegExp(keyword)}(?![\\w])`).test(cvLower)
}

function statusFor(score: number): AtsCheckStatus {
  if (score >= 80) return 'pass'
  if (score >= 60) return 'warn'
  return 'fail'
}

function buildContext(cv: string, jd: string): CheckContext {
  const cvLower = cv.toLowerCase()
  const jdLower = jd.toLowerCase()
  const keywords = extractKeywords(jdLower)
  const phrases = extractPhrases(jdLower)
  return {
    cv,
    cvLower,
    jdLower,
    allKeywords: [...keywords, ...phrases],
    sections: detectSections(cvLower),
    bullets: extractBullets(cv),
    skillsText: extractSectionText(cv, 'skills'),
    summaryText: extractSectionText(cv, 'summary'),
  }
}

function checkKeyword(ctx: CheckContext): AtsCheck {
  if (ctx.allKeywords.length === 0) {
    if (ctx.jdLower.trim().length === 0) {
      return { id: 'keyword', name: 'Keyword match', status: 'warn', score: 0, detail: 'Tanpa deskripsi pekerjaan (Mode B), relevansi kata kunci dinilai oleh model.' }
    }
    return { id: 'keyword', name: 'Keyword match', status: 'fail', score: 0, detail: 'Deskripsi pekerjaan terlalu pendek untuk diekstrak kata kunci.' }
  }
  const matched = ctx.allKeywords.filter((keyword) => hasKeyword(ctx.cvLower, keyword))
  const missing = ctx.allKeywords.filter((keyword) => !matched.includes(keyword))
  let earned = 0
  for (const keyword of matched) {
    if (hasKeyword(ctx.skillsText, keyword)) earned += 1.2
    else if (hasKeyword(ctx.summaryText, keyword)) earned += 1.1
    else earned += 1
  }
  const score = Math.min(100, Math.round((earned / (ctx.allKeywords.length * 1.2)) * 100))
  const detail =
    missing.length === 0
      ? `Semua ${matched.length} kata kunci/frasa JD ditemukan.`
      : `Belum ditemukan: ${missing.join(', ')}.`
  return { id: 'keyword', name: 'Keyword match', status: statusFor(score), score, detail }
}

function checkSkills(ctx: CheckContext): AtsCheck {
  const skillsLower = ctx.skillsText
  if (!ctx.sections.skills || skillsLower.trim().length === 0) {
    return { id: 'skills', name: 'Skills coverage', status: 'fail', score: 0, detail: 'Tidak ditemukan bagian Skills pada CV.' }
  }
  if (ctx.allKeywords.length === 0) {
    return { id: 'skills', name: 'Skills coverage', status: 'warn', score: 0, detail: 'Tanpa deskripsi pekerjaan (Mode B), cakupan skills dinilai oleh model.' }
  }
  const matched = ctx.allKeywords.filter((keyword) => hasKeyword(skillsLower, keyword))
  const missing = ctx.allKeywords.filter((keyword) => !matched.includes(keyword))
  let score = Math.round((matched.length / Math.max(ctx.allKeywords.length, 1)) * 100)
  const skillItems = countSkillItems(skillsLower)
  const bonus = skillItems >= 15 ? 5 : skillItems >= 10 ? 3 : 0
  score = Math.min(100, score + bonus)
  const detail =
    missing.length === 0
      ? `Semua kata kunci/frasa JD tercantum di bagian Skills (${matched.length}).`
      : `Skills section belum memuat: ${missing.join(', ')}.`
  return { id: 'skills', name: 'Skills coverage', status: statusFor(score), score, detail }
}

function checkSections(ctx: CheckContext): AtsCheck {
  const missing = ALL_SECTIONS.filter((section) => !ctx.sections[section])
  const score = Math.round(((ALL_SECTIONS.length - missing.length) / ALL_SECTIONS.length) * 100)
  const detail =
    missing.length === 0
      ? 'Semua bagian standar (Summary, Experience, Education, Skills) ditemukan.'
      : `Bagian yang belum ada: ${missing.join(', ')}.`
  return { id: 'sections', name: 'Section completeness', status: statusFor(score), score, detail }
}

function checkFormatting(ctx: CheckContext, metadata?: PdfMetadata | null): AtsCheck {
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(ctx.cv)
  const hasPhone = /\+?\d[\d\s().-]{7,}\d/.test(ctx.cv)
  const hasBullets = ctx.bullets.length > 0
  const wordCount = ctx.cv.split(/\s+/).filter(Boolean).length
  const reasonableLength = wordCount >= 50 && wordCount <= 1200

  const passed = [hasEmail, hasPhone, hasBullets, reasonableLength].filter(Boolean).length
  let score = Math.round((passed / 4) * 100)
  const issues: string[] = []
  if (!hasEmail) issues.push('email')
  if (!hasPhone) issues.push('nomor telepon')
  if (!hasBullets) issues.push('bullet points')
  if (!reasonableLength) issues.push('panjang dokumen di luar 1-2 halaman')
  const lines = ctx.cv.split('\n')
  const hasTable = lines.some((line) => (line.match(/\|/g) ?? []).length >= 2)
  const hasTabLayout = lines.filter((line) => line.includes('\t')).length >= 2
  if (hasTable) {
    score = Math.max(0, score - 15)
    issues.push('tabel/multi-kolom (berisiko gagal parsing)')
  }
  if (hasTabLayout) {
    score = Math.max(0, score - 10)
    issues.push('layout bertab/kolom (berisiko gagal parsing)')
  }

  // Phase 14 — layout rules (Kelompok 2): penalti skor formatting.
  const layoutAvailable = metadata?.layout !== undefined && metadata.layout !== null
  if (layoutAvailable) {
    const layout = metadata?.layout
    if (layout !== undefined && layout !== null && layout.columnCount >= 2) {
      score = Math.max(0, score - 15)
      issues.push('format 2 kolom (penalti -15)')
    }
    if (layout !== undefined && layout !== null && layout.hasGraphics) {
      score = Math.max(0, score - 15)
      issues.push('grafik/progress bar untuk skill (penalti -15)')
    }
  }

  // Phase 14 — N/A: metadata tipografi/layout tidak tersedia (pdf-parse fallback
  // atau CV diunggah sebelum Phase 14). Tanpa penalti; status DIPAKSA warn.
  const na = metadata === undefined || metadata === null || metadata.typography === null || metadata.layout === null
  const detail =
    issues.length === 0
      ? 'Format mudah diparsing: email, telepon, bullet, dan panjang sesuai.'
      : `Perbaiki: ${issues.join(', ')}.`
  if (na) {
    return {
      id: 'formatting',
      name: 'Formatting / parse-safety',
      status: 'warn',
      score,
      detail: `${detail} Tipografi/Layout: tidak dapat dinilai (N/A).`,
    }
  }
  return { id: 'formatting', name: 'Formatting / parse-safety', status: statusFor(score), score, detail }
}

function checkQuantified(ctx: CheckContext): AtsCheck {
  if (ctx.bullets.length === 0) {
    return { id: 'quantified', name: 'Quantified achievements', status: 'fail', score: 0, detail: 'Tidak ada bullet points untuk dinilai metriknya.' }
  }
  const quantified = ctx.bullets.filter((bullet) => /\d/.test(bullet))
  const score = Math.round((quantified.length / ctx.bullets.length) * 100)
  const detail = `${quantified.length} dari ${ctx.bullets.length} bullet mengandung angka/metrik.`
  return { id: 'quantified', name: 'Quantified achievements', status: statusFor(score), score, detail }
}

function checkReadability(ctx: CheckContext): AtsCheck {
  const hasSummary = ctx.sections.summary
  const hasBullets = ctx.bullets.length > 0
  const avgBulletWords =
    ctx.bullets.length === 0
      ? 0
      : ctx.bullets.reduce((sum, bullet) => sum + bullet.split(/\s+/).filter(Boolean).length, 0) / ctx.bullets.length
  const conciseBullets = avgBulletWords <= 25
  const wordCount = ctx.cv.split(/\s+/).filter(Boolean).length
  const reasonableLength = wordCount >= 50 && wordCount <= 1200

  const passed = [hasSummary, hasBullets, conciseBullets, reasonableLength].filter(Boolean).length
  const score = Math.round((passed / 4) * 100)
  const issues: string[] = []
  if (!hasSummary) issues.push('professional summary')
  if (!hasBullets) issues.push('bullet points')
  if (!conciseBullets) issues.push('bullet terlalu panjang')
  if (!reasonableLength) issues.push('panjang dokumen tidak wajar')
  const detail = issues.length === 0 ? 'Keterbacaan baik: ada summary, bullet ringkas, dan panjang sesuai.' : `Perbaiki: ${issues.join(', ')}.`
  return { id: 'readability', name: 'Readability', status: statusFor(score), score, detail }
}

const CHECK_BUILDERS: Record<CheckId, (ctx: CheckContext, metadata?: PdfMetadata | null) => AtsCheck> = {
  keyword: checkKeyword,
  skills: checkSkills,
  sections: checkSections,
  formatting: checkFormatting,
  quantified: checkQuantified,
  readability: checkReadability,
}

const SUGGESTION_META: Record<CheckId, { title: string; category: string; description: (detail: string) => string }> = {
  keyword: {
    title: 'Tambahkan kata kunci dari deskripsi pekerjaan',
    category: 'keywords',
    description: (detail) => `Cerminkan istilah JD secara persis. ${detail}`,
  },
  skills: {
    title: 'Perkuat bagian Skills dengan istilah dari JD',
    category: 'skills',
    description: (detail) => `Tuliskan kemampuan yang diminta JD minimal satu kali di bagian Skills. ${detail}`,
  },
  sections: {
    title: 'Lengkapi bagian standar CV',
    category: 'structure',
    description: (detail) => `Gunakan heading standar (Summary, Experience, Education, Skills). ${detail}`,
  },
  formatting: {
    title: 'Perbaiki format agar mudah diparsing ATS',
    category: 'format',
    description: (detail) => `Pastikan email, nomor telepon, bullet, dan panjang dokumen sesuai. ${detail}`,
  },
  quantified: {
    title: 'Tambahkan pencapaian terukur (metrik)',
    category: 'achievements',
    description: () => 'Ganti deskripsi tugas dengan hasil yang terukur, misalnya persentase atau jumlah.',
  },
  readability: {
    title: 'Perbaiki keterbacaan ringkasan dan bullet',
    category: 'readability',
    description: (detail) => `Ringkas kalimat dan gunakan bullet yang jelas. ${detail}`,
  },
}

function priorityFor(score: number): Suggestion['priority'] {
  if (score < 40) return 'high'
  if (score < 60) return 'medium'
  return 'low'
}

function deriveSuggestions(checks: AtsCheck[]): Suggestion[] {
  return checks
    .filter((check) => check.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((check, index) => {
      const meta = SUGGESTION_META[check.id as CheckId]
      return {
        id: `sug-${index + 1}`,
        title: meta.title,
        description: meta.description(check.detail),
        category: meta.category,
        priority: priorityFor(check.score),
      }
    })
}

function deriveWeaknesses(checks: AtsCheck[]): string[] {
  return checks
    .filter((check) => check.score < 80)
    .map((check) => `${check.name} ${check.score}/100 — ${check.detail}`)
}

const RECOMMENDED_SANS = new Set(['arial', 'calibri', 'helvetica'])

function isKnownSerifFamily(family: string): boolean {
  return KNOWN_SERIF.has(family.toLowerCase())
}

function isRecommendedSans(family: string): boolean {
  return RECOMMENDED_SANS.has(family.toLowerCase())
}

export interface TypographyFindings {
  suggestions: Suggestion[]
  summary: string
}

// Phase 14 — Kelompok 1 (tipografi): murni saran, tidak menurunkan skor.
export function deriveTypographyFindings(metadata: PdfMetadata | null | undefined): TypographyFindings {
  const suggestions: Suggestion[] = []
  const notes: string[] = []
  const typo = metadata?.typography
  if (typo === null || typo === undefined) {
    return { suggestions, summary: '' }
  }
  const push = (id: string, title: string, description: string, note: string, priority: Suggestion['priority'] = 'low') => {
    suggestions.push({ id, title, description, category: 'format', priority })
    notes.push(note)
  }

  const bodyFamily = typo.fonts.find((f) => !f.isBold && !f.isItalic && f.size === typo.bodySize)?.family
  const hasMultipleFamilies = typo.fontFamilies.length > 1

  if (hasMultipleFamilies) {
    push(
      'typo-font-count',
      'Gunakan satu font utama',
      `CV memakai ${typo.fontFamilies.length} font: ${typo.fontFamilies.join(', ')}. Pilih satu font sans-serif (mis. Arial, Calibri, Helvetica).`,
      `${typo.fontFamilies.length} font berbeda`,
    )
  }
  if (bodyFamily !== undefined && !hasMultipleFamilies && !isRecommendedSans(bodyFamily)) {
    const detail = isKnownSerifFamily(bodyFamily)
      ? `Font isi (${bodyFamily}) termasuk serif. Font sans-serif seperti Arial, Calibri, atau Helvetica lebih aman untuk ATS.`
      : `Font isi (${bodyFamily}) kurang direkomendasikan. Gunakan font sans-serif seperti Arial, Calibri, atau Helvetica.`
    push(
      'typo-font-family',
      'Gunakan font sans-serif',
      detail,
      `font non-sans (${bodyFamily})`,
    )
  }
  if (typo.titleSize !== null && (typo.titleSize < TITLE_SIZE_MIN || typo.titleSize > TITLE_SIZE_MAX)) {
    push(
      'typo-title-size',
      'Sesuaikan ukuran nama/judul',
      `Ukuran font nama/judul saat ini ${typo.titleSize}pt. Disarankan 14–16pt.`,
      `ukuran judul ${typo.titleSize}pt (ideal 14–16)`,
    )
  }
  if (typo.bodySize !== null && (typo.bodySize < BODY_SIZE_MIN || typo.bodySize > BODY_SIZE_MAX)) {
    push(
      'typo-body-size',
      'Sesuaikan ukuran teks isi',
      `Ukuran teks isi saat ini ${typo.bodySize}pt. Disarankan 10–12pt (idealnya 10–11pt).`,
      `ukuran isi ${typo.bodySize}pt (ideal 10–12)`,
    )
  }
  if (typo.lineSpacing !== null && (typo.lineSpacing < LINE_SPACING_MIN || typo.lineSpacing > LINE_SPACING_MAX)) {
    push(
      'typo-line-spacing',
      'Periksa line-spacing',
      `Line-spacing terukur ${typo.lineSpacing}. Disarankan 1.0–1.15 agar ringkas dan mudah dibaca.`,
      `line-spacing ${typo.lineSpacing} (ideal 1.0–1.15)`,
    )
  }
  if (typo.margins !== null) {
    const m = typo.margins
    const within = (value: number) => value >= MARGIN_IDEAL_PT - MARGIN_TOLERANCE_PT && value <= MARGIN_IDEAL_PT + MARGIN_TOLERANCE_PT
    if (!within(m.left) || !within(m.right) || !within(m.top) || !within(m.bottom)) {
      push(
        'typo-margins',
        'Sesuaikan margin halaman',
        `Margin terukur (kiri ${m.left}, kanan ${m.right}, atas ${m.top}, bawah ${m.bottom}pt). Disarankan sekitar 1 inci (72pt).`,
        'margin tidak 1 inci',
      )
    }
  }
  if (typo.boldRatio !== null && typo.boldRatio > STYLE_OVERUSE_RATIO) {
    push(
      'typo-bold-overuse',
      'Kurangi penggunaan bold berlebihan',
      `${Math.round(typo.boldRatio * 100)}% teks isi dicetak tebal. Gunakan bold hanya untuk judul, nama, dan pencapaian terukur.`,
      `bold ${Math.round(typo.boldRatio * 100)}% (maks 30%)`,
      'medium',
    )
  }
  if (typo.italicRatio !== null && typo.italicRatio > STYLE_OVERUSE_RATIO) {
    push(
      'typo-italic-overuse',
      'Kurangi penggunaan italic berlebihan',
      `${Math.round(typo.italicRatio * 100)}% teks isi dicetak miring. Gunakan italic hanya untuk sub-judul atau jabatan.`,
      `italic ${Math.round(typo.italicRatio * 100)}% (maks 30%)`,
      'medium',
    )
  }
  if (typo.titleSize !== null && typo.titleSize !== typo.bodySize && !typo.fonts.some((f) => f.size === typo.titleSize && f.isBold)) {
    push(
      'typo-bold-underuse',
      'Tebalkan nama dan judul bagian',
      'Nama dan judul bagian belum dicetak tebal. Bold membantu recruiter/ATS menemukan struktur CV.',
      'judul belum bold',
    )
  }
  return { suggestions, summary: notes.length > 0 ? `Tipografi: ${notes.join('; ')}.` : '' }
}

// Phase 14 — tempel saran tipografi & ringkasan ke report hasil compose.
export function attachTypographyNotes(report: ComposedReport, metadata: PdfMetadata | null | undefined): ComposedReport {
  if (metadata === null || metadata === undefined) {
    return report
  }
  const findings = deriveTypographyFindings(metadata)
  const existingIds = new Set(report.suggestions.map((s) => s.id))
  const extra = findings.suggestions.filter((s) => !existingIds.has(s.id))
  const atsChecks = report.atsChecks.map((check) => {
    if (check.id !== 'formatting' || findings.summary.length === 0) {
      return check
    }
    const detail = check.detail.includes('Tipografi:') ? check.detail : `${check.detail} ${findings.summary}`
    return { ...check, detail }
  })
  return { ...report, suggestions: [...report.suggestions, ...extra], atsChecks }
}

function computeWeightedScore(checks: AtsCheck[]): number {
  const known = checks.filter((check) => check.id in WEIGHTS)
  if (known.length === 0) return 0
  const totalWeight = known.reduce((sum, check) => sum + WEIGHTS[check.id as CheckId], 0)
  return Math.round(known.reduce((sum, check) => sum + check.score * WEIGHTS[check.id as CheckId], 0) / totalWeight)
}

export function analyzeCv(cvText: string, targetJobDescription: string, metadata?: PdfMetadata | null): AnalyzeResult {
  const ctx = buildContext(cvText, targetJobDescription)
  const checks = (Object.keys(CHECK_BUILDERS) as CheckId[]).map((id) => CHECK_BUILDERS[id](ctx, metadata))
  const overallScore = computeWeightedScore(checks)
  const suggestions = deriveSuggestions(checks)

  return {
    overallScore,
    atsChecks: checks,
    weaknesses: deriveWeaknesses(checks),
    suggestions,
  }
}

const CANONICAL_CHECK_IDS: CheckId[] = ['keyword', 'skills', 'sections', 'formatting', 'quantified', 'readability']

// Trust the model overallScore only when it agrees with the WEIGHTS rubric:
// the gap against the weighted composite of its own checks must not exceed RUBRIC_TOLERANCE.
const RUBRIC_TOLERANCE = 15

export interface ComposedReport extends AnalyzeReport {
  overallScore: number
}

export interface ComposeOptions {
  // Phase 14: ketika metadata tipografi/layout tersedia, model buta terhadap
  // layout → check formatting diambil dari deterministic agar penalti layout
  // (2 kolom, grafis) dan saran tipografi tetap tampil.
  preferDeterministicFormatting?: boolean
}

export function composeReport(deterministic: AnalyzeResult, model: AnalyzeReport, options?: ComposeOptions): ComposedReport {
  const modelChecks = new Map(model.atsChecks.map((check) => [check.id, check]))
  const preferDeterministicFormatting = options?.preferDeterministicFormatting === true
  const atsChecks = CANONICAL_CHECK_IDS.map((id) => {
    const modelCheck = modelChecks.get(id)
    const deterministicCheck = deterministic.atsChecks.find((check) => check.id === id)
    if (preferDeterministicFormatting && id === 'formatting') {
      return deterministicCheck ?? modelCheck
    }
    return modelCheck ?? deterministicCheck
  }).filter((check): check is AtsCheck => check !== undefined)

  const modelOwnChecks = CANONICAL_CHECK_IDS.map((id) => modelChecks.get(id)).filter((check): check is AtsCheck => check !== undefined)
  const modelComposite = computeWeightedScore(modelOwnChecks)
  const modelScore = model.overallScore
  const modelScoreValid = modelScore !== null && Math.abs(modelScore - modelComposite) <= RUBRIC_TOLERANCE

  // Phase 14, code review: saat check formatting diambil dari deterministic
  // (model buta layout), overallScore dihitung dari composed checks yang SAMA
  // dengan yang ditampilkan, agar penalti layout (2 kolom/grafis) ikut tercermin
  // di skor keseluruhan — tidak memakai skor model yang tidak melihat layout.
  const overallScore = preferDeterministicFormatting ? computeWeightedScore(atsChecks) : modelScoreValid ? modelScore : deterministic.overallScore

  return {
    overallScore,
    atsChecks,
    weaknesses: model.weaknesses.length > 0 ? model.weaknesses : deterministic.weaknesses,
    suggestions: model.suggestions.length > 0 ? model.suggestions : deterministic.suggestions,
  }
}
