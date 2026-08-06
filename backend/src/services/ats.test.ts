import { describe, expect, it } from 'vitest'
import { analyzeCv, composeReport } from './ats.js'
import type { AnalyzeReport } from '../utils/model-parser.js'

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
})
