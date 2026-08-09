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

function checkFormatting(ctx: CheckContext): AtsCheck {
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

function computeWeightedScore(checks: AtsCheck[]): number {
  const known = checks.filter((check) => check.id in WEIGHTS)
  if (known.length === 0) return 0
  const totalWeight = known.reduce((sum, check) => sum + WEIGHTS[check.id as CheckId], 0)
  return Math.round(known.reduce((sum, check) => sum + check.score * WEIGHTS[check.id as CheckId], 0) / totalWeight)
}

export function analyzeCv(cvText: string, targetJobDescription: string): AnalyzeResult {
  const ctx = buildContext(cvText, targetJobDescription)
  const checks = (Object.keys(CHECK_BUILDERS) as CheckId[]).map((id) => CHECK_BUILDERS[id](ctx))
  const overallScore = computeWeightedScore(checks)
  return {
    overallScore,
    atsChecks: checks,
    weaknesses: deriveWeaknesses(checks),
    suggestions: deriveSuggestions(checks),
  }
}

const CANONICAL_CHECK_IDS: CheckId[] = ['keyword', 'skills', 'sections', 'formatting', 'quantified', 'readability']

// Trust the model overallScore only when it agrees with the WEIGHTS rubric:
// the gap against the weighted composite of its own checks must not exceed RUBRIC_TOLERANCE.
const RUBRIC_TOLERANCE = 15

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

  const modelOwnChecks = CANONICAL_CHECK_IDS.map((id) => modelChecks.get(id)).filter((check): check is AtsCheck => check !== undefined)
  const modelComposite = computeWeightedScore(modelOwnChecks)
  const modelScore = model.overallScore
  const modelScoreValid = modelScore !== null && Math.abs(modelScore - modelComposite) <= RUBRIC_TOLERANCE

  return {
    overallScore: modelScoreValid ? modelScore : deterministic.overallScore,
    atsChecks,
    weaknesses: model.weaknesses.length > 0 ? model.weaknesses : deterministic.weaknesses,
    suggestions: model.suggestions.length > 0 ? model.suggestions : deterministic.suggestions,
  }
}
