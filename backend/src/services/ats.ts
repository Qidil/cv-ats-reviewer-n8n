import type { AtsCheck, Suggestion, AtsCheckStatus } from '../db/repos.js'
import type { AnalyzeReport } from '../utils/model-parser.js'

export type CheckId = 'keyword' | 'skills' | 'sections' | 'formatting' | 'quantified' | 'readability'

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
  keywords: string[]
  sections: Record<CheckSection, boolean>
  bullets: string[]
}

type CheckSection = 'summary' | 'experience' | 'education' | 'skills'

const SECTION_HEADINGS: Record<CheckSection, string[]> = {
  summary: ['summary', 'professional summary', 'ringkasan', 'ringkasan profesional', 'profil', 'profile', 'about', 'tentang'],
  experience: ['experience', 'work experience', 'pengalaman', 'pengalaman kerja', 'employment', 'riwayat pekerjaan'],
  education: ['education', 'pendidikan', 'riwayat pendidikan', 'academic background'],
  skills: ['skills', 'technical skills', 'keahlian', 'kemampuan', 'skills & tools', 'core competencies', 'kompetensi'],
}

const ALL_SECTIONS: CheckSection[] = ['summary', 'experience', 'education', 'skills']

const WEIGHTS: Record<CheckId, number> = {
  keyword: 30,
  skills: 20,
  sections: 15,
  formatting: 10,
  quantified: 15,
  readability: 10,
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'we', 'with',
  'dan', 'dari', 'di', 'kami', 'ke', 'pada', 'sebagai', 'untuk', 'yang',
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
  return {
    cv,
    cvLower,
    jdLower,
    keywords: extractKeywords(jdLower),
    sections: detectSections(cvLower),
    bullets: extractBullets(cv),
  }
}

function checkKeyword(ctx: CheckContext): AtsCheck {
  if (ctx.keywords.length === 0) {
    return { id: 'keyword', name: 'Keyword match', status: 'fail', score: 0, detail: 'Deskripsi pekerjaan terlalu pendek untuk diekstrak kata kunci.' }
  }
  const matched = ctx.keywords.filter((keyword) => hasKeyword(ctx.cvLower, keyword))
  const score = Math.round((matched.length / ctx.keywords.length) * 100)
  const missing = ctx.keywords.filter((keyword) => !matched.includes(keyword))
  const detail =
    missing.length === 0
      ? `Semua ${matched.length} kata kunci JD ditemukan.`
      : `Belum ditemukan: ${missing.join(', ')}.`
  return { id: 'keyword', name: 'Keyword match', status: statusFor(score), score, detail }
}

function checkSkills(ctx: CheckContext): AtsCheck {
  const skillsLines = ctx.cv.split('\n')
  let inSkills = false
  let skillsText = ''
  for (const line of skillsLines) {
    const normalized = normalizeHeading(line)
    if (inSkills) {
      if (ALL_SECTIONS.some((section) => section !== 'skills' && SECTION_HEADINGS[section].includes(normalized))) {
        break
      }
      skillsText += ` ${line}`
    } else if (SECTION_HEADINGS.skills.includes(normalized)) {
      inSkills = true
    }
  }
  const skillsLower = skillsText.toLowerCase()
  if (!ctx.sections.skills || skillsLower.trim().length === 0) {
    return { id: 'skills', name: 'Skills coverage', status: 'fail', score: 0, detail: 'Tidak ditemukan bagian Skills pada CV.' }
  }
  const matched = ctx.keywords.filter((keyword) => hasKeyword(skillsLower, keyword))
  const score = Math.round((matched.length / Math.max(ctx.keywords.length, 1)) * 100)
  const missing = ctx.keywords.filter((keyword) => !matched.includes(keyword))
  const detail =
    missing.length === 0
      ? `Semua kata kunci JD tercantum di bagian Skills (${matched.length}).`
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

function checkFormatting(ctx: CheckContext): AtsCheck {
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(ctx.cv)
  const hasPhone = /\+?\d[\d\s().-]{7,}\d/.test(ctx.cv)
  const hasBullets = ctx.bullets.length > 0
  const wordCount = ctx.cv.split(/\s+/).filter(Boolean).length
  const reasonableLength = wordCount >= 50 && wordCount <= 1200

  const passed = [hasEmail, hasPhone, hasBullets, reasonableLength].filter(Boolean).length
  const score = Math.round((passed / 4) * 100)
  const issues: string[] = []
  if (!hasEmail) issues.push('email')
  if (!hasPhone) issues.push('nomor telepon')
  if (!hasBullets) issues.push('bullet points')
  if (!reasonableLength) issues.push('panjang dokumen di luar 1-2 halaman')
  const detail = issues.length === 0 ? 'Format mudah diparsing: email, telepon, bullet, dan panjang sesuai.' : `Perbaiki: ${issues.join(', ')}.`
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

const CHECK_BUILDERS: Record<CheckId, (ctx: CheckContext) => AtsCheck> = {
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

export function analyzeCv(cvText: string, targetJobDescription: string): AnalyzeResult {
  const ctx = buildContext(cvText, targetJobDescription)
  const checks = (Object.keys(CHECK_BUILDERS) as CheckId[]).map((id) => CHECK_BUILDERS[id](ctx))
  const overallScore = Math.round(
    checks.reduce((sum, check) => sum + check.score * WEIGHTS[check.id as CheckId], 0) / 100,
  )
  return {
    overallScore,
    atsChecks: checks,
    weaknesses: deriveWeaknesses(checks),
    suggestions: deriveSuggestions(checks),
  }
}

const CANONICAL_CHECK_IDS: CheckId[] = ['keyword', 'skills', 'sections', 'formatting', 'quantified', 'readability']

export interface ComposedReport extends AnalyzeReport {
  overallScore: number
}

export function composeReport(deterministic: AnalyzeResult, model: AnalyzeReport): ComposedReport {
  const modelChecks = new Map(model.atsChecks.map((check) => [check.id, check]))
  const atsChecks = CANONICAL_CHECK_IDS.map((id) => {
    const modelCheck = modelChecks.get(id)
    const deterministicCheck = deterministic.atsChecks.find((check) => check.id === id)
    return modelCheck ?? deterministicCheck
  }).filter((check): check is AtsCheck => check !== undefined)

  return {
    overallScore: model.overallScore ?? deterministic.overallScore,
    atsChecks,
    weaknesses: model.weaknesses.length > 0 ? model.weaknesses : deterministic.weaknesses,
    suggestions: model.suggestions.length > 0 ? model.suggestions : deterministic.suggestions,
  }
}
