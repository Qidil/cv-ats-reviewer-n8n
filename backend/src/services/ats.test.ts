import { describe, expect, it } from 'vitest'
import { analyzeCv, composeReport, deriveTypographyFindings, attachTypographyNotes } from './ats.js'
import type { PdfMetadata } from './ats.js'
import type { AnalyzeReport } from '../utils/model-parser.js'
import type { AtsCheck } from '../db/repos.js'

const SAMPLE_CV = [
  'Aidhil Prima Abdiguna',
  'aidhil@email.com',
  '+6281234567890',
  '',
  'Summary',
  'Backend developer dengan 5 tahun pengalaman di Node.js dan TypeScript.',
  '',
  'Skills',
  '- Node.js',
  '- TypeScript',
  '- SQL',
  '- Docker',
  '',
  'Experience',
  '- Backend Developer at PT Maju (2021-2024): Meningkatkan performa API sebesar 30%.',
  '- Junior Developer at PT Cepat (2019-2021): Membangun REST API untuk 3 produk.',
  '',
  'Education',
  '- S1 Teknik Informatika, Universitas Indonesia (2015-2019)',
].join('\n')

const SAMPLE_JD =
  'Kami mencari React, TypeScript, Node.js, SQL, Docker, dan Kubernetes untuk tim backend.'

const ALL_CHECK_IDS = ['keyword', 'skills', 'sections', 'formatting', 'quantified', 'readability']

describe('analyzeCv — deterministic ATS engine', () => {
  it('returns exactly the 6 defined checks', () => {
    const result = analyzeCv(SAMPLE_CV, SAMPLE_JD)
    expect(result.atsChecks.map((c) => c.id)).toEqual(ALL_CHECK_IDS)
    for (const check of result.atsChecks) {
      expect(check.name).toBeTruthy()
      expect(['pass', 'warn', 'fail']).toContain(check.status)
      expect(check.score).toBeGreaterThanOrEqual(0)
      expect(check.score).toBeLessThanOrEqual(100)
      expect(typeof check.detail).toBe('string')
    }
  })

  it('flags missing JD keywords in the keyword check', () => {
    const result = analyzeCv(SAMPLE_CV, SAMPLE_JD)
    const keyword = result.atsChecks.find((c) => c.id === 'keyword')
    expect(keyword).toBeDefined()
    expect(keyword!.score).toBeLessThan(100)
    expect(keyword!.detail).toMatch(/react/i)
    expect(keyword!.detail).toMatch(/kubernetes/i)
  })

  it('scores sections below 100 when a standard section is missing', () => {
    const cvWithoutEducation = SAMPLE_CV.replace(/Education[\s\S]*$/, '').trim()
    const result = analyzeCv(cvWithoutEducation, SAMPLE_JD)
    const sections = result.atsChecks.find((c) => c.id === 'sections')
    expect(sections).toBeDefined()
    expect(sections!.score).toBeLessThan(100)
    expect(sections!.detail).toMatch(/education/i)
  })

  it('flags formatting issues when contact info is missing', () => {
    const noContact = SAMPLE_CV.replace(/aidhil@email\.com\n\+6281234567890\n\n/, '')
    const result = analyzeCv(noContact, SAMPLE_JD)
    const formatting = result.atsChecks.find((c) => c.id === 'formatting')
    expect(formatting).toBeDefined()
    expect(formatting!.score).toBeLessThan(100)
  })

  it('rewards quantified bullets in the quantified check', () => {
    const metricCv = [
      'Summary',
      'Engineer.',
      'Skills',
      '- React',
      'Experience',
      '- Cut load time by 30%.',
      '- Built 3 microservices.',
      '- Wrote tests.',
    ].join('\n')
    const plainCv = metricCv.replace('Cut load time by 30%.', 'Cut load time.').replace('Built 3 microservices.', 'Built microservices.')
    const quantified = analyzeCv(metricCv, SAMPLE_JD).atsChecks.find((c) => c.id === 'quantified')
    const noneQuantified = analyzeCv(plainCv, SAMPLE_JD).atsChecks.find((c) => c.id === 'quantified')
    expect(quantified!.score).toBeGreaterThan(noneQuantified!.score)
  })

  it('keeps the composite score bounded between 0 and 100', () => {
    const empty = analyzeCv('', SAMPLE_JD)
    const perfect = analyzeCv(SAMPLE_CV, SAMPLE_JD)
    expect(empty.overallScore).toBeGreaterThanOrEqual(0)
    expect(empty.overallScore).toBeLessThanOrEqual(100)
    expect(perfect.overallScore).toBeGreaterThanOrEqual(0)
    expect(perfect.overallScore).toBeLessThanOrEqual(100)
  })

  it('derives weaknesses and suggestions from the lowest-scoring checks', () => {
    const result = analyzeCv(SAMPLE_CV, SAMPLE_JD)
    expect(Array.isArray(result.weaknesses)).toBe(true)
    expect(Array.isArray(result.suggestions)).toBe(true)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of result.suggestions) {
      expect(suggestion.id).toMatch(/^sug-\d+$/)
      expect(['high', 'medium', 'low']).toContain(suggestion.priority)
      expect(suggestion.title).toBeTruthy()
      expect(suggestion.description).toBeTruthy()
      expect(suggestion.category).toBeTruthy()
    }
    const failing = result.atsChecks.filter((c) => c.score < 80)
    expect(result.weaknesses.length).toBeGreaterThanOrEqual(failing.length > 0 ? 1 : 0)
  })

  it('accepts a job description with no keyword tokens without crashing', () => {
    const result = analyzeCv(SAMPLE_CV, '!!!')
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
  })

  it('uses Mode B fallback wording for keyword/skills checks when the JD is empty', () => {
    const result = analyzeCv(SAMPLE_CV, '')
    const keyword = result.atsChecks.find((c) => c.id === 'keyword')
    const skills = result.atsChecks.find((c) => c.id === 'skills')
    expect(keyword!.detail).toMatch(/Mode B/)
    expect(keyword!.status).toBe('warn')
    expect(skills!.detail).toMatch(/Mode B/)
    expect(skills!.status).toBe('warn')
  })
})

describe('analyzeCv — QUALITY-01 refinements', () => {
  it('matches multiword phrases as a unit, not as separate tokens', () => {
    const jd = 'Kami membutuhkan developer dengan keahlian data visualization dan stakeholder management.'
    const cvPhrase = SAMPLE_CV.replace('- Docker', '- Docker\n- Data Visualization')
    const cvSeparated = SAMPLE_CV.replace('- Docker', '- Docker\n- Data dan Visualization')

    const withPhrase = analyzeCv(cvPhrase, jd).atsChecks.find((c) => c.id === 'keyword')
    const separated = analyzeCv(cvSeparated, jd).atsChecks.find((c) => c.id === 'keyword')

    expect(withPhrase!.detail).not.toMatch(/data visualization/i)
    expect(separated!.detail).toMatch(/data visualization/i)
  })

  it('scores keyword placement in Skills/Summary higher than elsewhere', () => {
    const jd = 'Membutuhkan ruby.'
    const cvInSkills = SAMPLE_CV.replace('- Docker', '- Docker\n- Ruby')
    const cvInExperience = SAMPLE_CV.replace('30%.', '30%. Ruby dipakai untuk build pipeline.')

    const skillsScore = analyzeCv(cvInSkills, jd).atsChecks.find((c) => c.id === 'keyword')!.score
    const elsewhereScore = analyzeCv(cvInExperience, jd).atsChecks.find((c) => c.id === 'keyword')!.score

    expect(skillsScore).toBeGreaterThan(elsewhereScore)
    expect(skillsScore).toBe(100)
  })

  it('rewards a Skills section with many listed skills', () => {
    const jd = 'Membutuhkan python dan golang.'
    const cvFewSkills = ['Summary', 'Engineer.', 'Skills', '- Python', '- Go', 'Experience', '- Do things.'].join('\n')
    const manySkills = Array.from({ length: 15 }, (_, i) => (i === 0 ? 'Python' : `Skill${i + 1}`)).join(', ')
    const cvManySkills = ['Summary', 'Engineer.', 'Skills', manySkills, 'Experience', '- Do things.'].join('\n')

    const fewScore = analyzeCv(cvFewSkills, jd).atsChecks.find((c) => c.id === 'skills')!.score
    const manyScore = analyzeCv(cvManySkills, jd).atsChecks.find((c) => c.id === 'skills')!.score

    expect(manyScore).toBeGreaterThan(fewScore)
    expect(fewScore).toBe(50)
    expect(manyScore).toBe(55)
  })

  it('penalizes table and tab layouts for parse safety', () => {
    const tableCv = SAMPLE_CV + '\n| Skill | Level |\n| Node.js | Expert |'
    const tabCv = SAMPLE_CV + '\nName\tRole\nAidhil\tDev'

    const normalScore = analyzeCv(SAMPLE_CV, SAMPLE_JD).atsChecks.find((c) => c.id === 'formatting')!.score
    const tableScore = analyzeCv(tableCv, SAMPLE_JD).atsChecks.find((c) => c.id === 'formatting')!.score
    const tabScore = analyzeCv(tabCv, SAMPLE_JD).atsChecks.find((c) => c.id === 'formatting')!.score

    expect(tableScore).toBeLessThan(normalScore)
    expect(tabScore).toBeLessThan(normalScore)
  })
})

describe('composeReport', () => {
  const deterministic = analyzeCv(SAMPLE_CV, SAMPLE_JD)

  function modelReport(overallScore: number | null): AnalyzeReport {
    return {
      overallScore,
      atsChecks: [],
      weaknesses: [],
      suggestions: [],
    }
  }

  it('keeps a legitimate model score of 0', () => {
    const report = composeReport(deterministic, modelReport(0))
    expect(report.overallScore).toBe(0)
  })

  it('falls back to the deterministic score when the model provides none', () => {
    const report = composeReport(deterministic, modelReport(null))
    expect(report.overallScore).toBe(deterministic.overallScore)
  })

  it('rejects a model score that contradicts its own per-check scores (rubric validation)', () => {
    const ids = ['keyword', 'skills', 'sections', 'formatting', 'quantified', 'readability'] as const
    const lowChecks: AtsCheck[] = ids.map((id) => ({ id, name: id, status: 'fail', score: 30, detail: 'x' }))
    const report = composeReport(deterministic, { overallScore: 95, atsChecks: lowChecks, weaknesses: [], suggestions: [] })
    expect(report.overallScore).toBe(deterministic.overallScore)
  })

  it('accepts a model score consistent with its per-check scores', () => {
    const ids = ['keyword', 'skills', 'sections', 'formatting', 'quantified', 'readability'] as const
    const highChecks: AtsCheck[] = ids.map((id) => ({ id, name: id, status: 'pass', score: 90, detail: 'x' }))
    const report = composeReport(deterministic, { overallScore: 90, atsChecks: highChecks, weaknesses: [], suggestions: [] })
    expect(report.overallScore).toBe(90)
  })
})

describe('Phase 14 — typography & layout rules', () => {
  const cleanMetadata: PdfMetadata = {
    typography: {
      fonts: [
        { name: 'Helvetica', family: 'Helvetica', isBold: false, isItalic: false, size: 11, charCount: 100 },
        { name: 'Helvetica Bold', family: 'Helvetica', isBold: true, isItalic: false, size: 16, charCount: 20 },
      ],
      fontFamilies: ['Helvetica'],
      fontSizes: [11, 16],
      bodySize: 11,
      titleSize: 16,
      lineSpacing: 1.1,
      margins: { left: 72, right: 72, top: 72, bottom: 72 },
      boldRatio: 0.05,
      italicRatio: 0,
    },
    layout: { columnCount: 1, hasGraphics: false, graphics: [] },
  }

  it('forces formatting status warn with N/A detail when metadata is missing (pdf-parse fallback / pre-Phase-14 CV)', () => {
    const result = analyzeCv(SAMPLE_CV, SAMPLE_JD, null)
    const formatting = result.atsChecks.find((c) => c.id === 'formatting')!
    expect(formatting.status).toBe('warn')
    expect(formatting.detail).toContain('N/A')
  })

  it('does not apply layout penalties when metadata is missing', () => {
    const noMetadata = analyzeCv(SAMPLE_CV, SAMPLE_JD, null)
    const withMetadata = analyzeCv(SAMPLE_CV, SAMPLE_JD, cleanMetadata)
    const noScore = noMetadata.atsChecks.find((c) => c.id === 'formatting')!.score
    const cleanScore = withMetadata.atsChecks.find((c) => c.id === 'formatting')!.score
    expect(noScore).toBe(cleanScore)
  })

  it('penalizes two-column layout with -15', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      layout: { columnCount: 2, hasGraphics: false, graphics: [] },
    }
    const cleanScore = analyzeCv(SAMPLE_CV, SAMPLE_JD, cleanMetadata).atsChecks.find((c) => c.id === 'formatting')!.score
    const twoColScore = analyzeCv(SAMPLE_CV, SAMPLE_JD, metadata).atsChecks.find((c) => c.id === 'formatting')!.score
    expect(twoColScore).toBe(Math.max(0, cleanScore - 15))
  })

  it('penalizes graphics / progress bars with -15', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      layout: { columnCount: 1, hasGraphics: true, graphics: ['constructPath'] },
    }
    const cleanScore = analyzeCv(SAMPLE_CV, SAMPLE_JD, cleanMetadata).atsChecks.find((c) => c.id === 'formatting')!.score
    const graphicScore = analyzeCv(SAMPLE_CV, SAMPLE_JD, metadata).atsChecks.find((c) => c.id === 'formatting')!.score
    expect(graphicScore).toBe(Math.max(0, cleanScore - 15))
  })

  it('stacks both layout penalties', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      layout: { columnCount: 2, hasGraphics: true, graphics: ['constructPath'] },
    }
    const cleanScore = analyzeCv(SAMPLE_CV, SAMPLE_JD, cleanMetadata).atsChecks.find((c) => c.id === 'formatting')!.score
    const bothScore = analyzeCv(SAMPLE_CV, SAMPLE_JD, metadata).atsChecks.find((c) => c.id === 'formatting')!.score
    expect(bothScore).toBe(Math.max(0, cleanScore - 30))
  })

  it('derives typography suggestions without lowering the score (suggestions only)', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      typography: {
        ...cleanMetadata.typography!,
        fonts: [
          { name: 'Arial', family: 'Arial', isBold: false, isItalic: false, size: 9, charCount: 100 },
          { name: 'Times New Roman', family: 'Times New Roman', isBold: false, isItalic: false, size: 18, charCount: 30 },
        ],
        fontFamilies: ['Arial', 'Times New Roman'],
        fontSizes: [9, 18],
        bodySize: 9,
        titleSize: 18,
        lineSpacing: 1.6,
        margins: { left: 40, right: 90, top: 120, bottom: 30 },
        boldRatio: 0.4,
        italicRatio: 0.5,
      },
    }
    const findings = deriveTypographyFindings(metadata)
    const ids = findings.suggestions.map((s) => s.id)
    expect(ids).toContain('typo-font-count')
    expect(ids).toContain('typo-body-size')
    expect(ids).toContain('typo-title-size')
    expect(ids).toContain('typo-line-spacing')
    expect(ids).toContain('typo-margins')
    expect(ids).toContain('typo-bold-overuse')
    expect(ids).toContain('typo-italic-overuse')
    expect(findings.summary.length).toBeGreaterThan(0)
  })

  it('does not emit typography suggestions for a compliant CV', () => {
    const findings = deriveTypographyFindings(cleanMetadata)
    expect(findings.suggestions).toEqual([])
    expect(findings.summary).toBe('')
  })

  it('flags a single serif family with the font-family suggestion', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      typography: {
        ...cleanMetadata.typography!,
        fonts: [
          { name: 'Times New Roman', family: 'Times New Roman', isBold: false, isItalic: false, size: 11, charCount: 100 },
        ],
        fontFamilies: ['Times New Roman'],
      },
    }
    const findings = deriveTypographyFindings(metadata)
    expect(findings.suggestions.map((s) => s.id)).toContain('typo-font-family')
  })

  it('attachTypographyNotes appends typography suggestions and summary to a composed report', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      typography: {
        ...cleanMetadata.typography!,
        boldRatio: 0.45,
        italicRatio: 0,
      },
    }
    const deterministic = analyzeCv(SAMPLE_CV, SAMPLE_JD, metadata)
    const report = attachTypographyNotes(composeReport(deterministic, { overallScore: 80, atsChecks: [], weaknesses: [], suggestions: [] }, { preferDeterministicFormatting: true }), metadata)
    expect(report.suggestions.some((s) => s.id === 'typo-bold-overuse')).toBe(true)
    const formatting = report.atsChecks.find((c) => c.id === 'formatting')!
    expect(formatting.detail).toContain('Tipografi:')
  })

  it('composeReport prefers deterministic formatting when preferDeterministicFormatting is set', () => {
    const metadata: PdfMetadata = {
      ...cleanMetadata,
      layout: { columnCount: 2, hasGraphics: true, graphics: ['constructPath'] },
    }
    const deterministic = analyzeCv(SAMPLE_CV, SAMPLE_JD, metadata)
    const detFormatting = deterministic.atsChecks.find((c) => c.id === 'formatting')!
    const modelChecks: AtsCheck[] = [
      { id: 'keyword', name: 'Keyword match', status: 'pass', score: 90, detail: 'x' },
      { id: 'skills', name: 'Skills coverage', status: 'pass', score: 90, detail: 'x' },
      { id: 'sections', name: 'Section completeness', status: 'pass', score: 90, detail: 'x' },
      { id: 'formatting', name: 'Formatting', status: 'pass', score: 99, detail: 'model blind' },
      { id: 'quantified', name: 'Quantified achievements', status: 'pass', score: 90, detail: 'x' },
      { id: 'readability', name: 'Readability', status: 'pass', score: 90, detail: 'x' },
    ]
    const report = composeReport(deterministic, { overallScore: 90, atsChecks: modelChecks, weaknesses: [], suggestions: [] }, { preferDeterministicFormatting: true })
    const formatting = report.atsChecks.find((c) => c.id === 'formatting')!
    expect(formatting.score).toBe(detFormatting.score)
    expect(formatting.score).not.toBe(99)
  })
})
