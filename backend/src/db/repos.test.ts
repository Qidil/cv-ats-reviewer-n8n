import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, initDb } from './connection.js'
import {
  insertCv,
  getCvById,
  listCvs,
  insertTargetJob,
  getTargetJobById,
  insertReview,
  getReviewById,
  insertApproval,
  getApprovalById,
  getLatestApprovalByReviewId,
  insertRewrite,
  getRewriteById,
  getRewriteByReviewId,
  getRewriteByApprovalId,
  insertJobMatch,
  getJobMatchById,
  getLatestJobMatchByCvId,
  type Suggestion,
} from './repos.js'

let db: DatabaseSync | undefined
let dir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cv-ats-repos-'))
  db = openDb(join(dir, 'test.db'))
  initDb(db)
})

afterEach(() => {
  db?.close()
  db = undefined
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = undefined
  }
})

function seedCv(): number {
  return insertCv(db!, { originalFilename: 'cv.pdf', cvText: 'Rizky Pratama. React, TypeScript.' })
}

describe('cvs repository', () => {
  it('inserts a cv and reads it back by id', () => {
    const id = seedCv()
    const cv = getCvById(db!, id)
    expect(cv).toBeDefined()
    expect(cv?.originalFilename).toBe('cv.pdf')
    expect(cv?.cvText).toContain('React')
    expect(cv?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns undefined for a missing cv', () => {
    expect(getCvById(db!, 999)).toBeUndefined()
  })

  it('stores and reads back typographyJson metadata (Phase 14)', () => {
    const id = insertCv(db!, {
      originalFilename: 'cv.pdf',
      cvText: 'Rizky Pratama.',
      typographyJson: {
        typography: {
          fonts: [{ name: 'Helvetica', family: 'Helvetica', isBold: false, isItalic: false, size: 11, charCount: 12 }],
          fontFamilies: ['Helvetica'],
          fontSizes: [11],
          bodySize: 11,
          titleSize: null,
          lineSpacing: 1.2,
          margins: { left: 72, right: 72, top: 52, bottom: 72 },
          boldRatio: 0.1,
          italicRatio: 0,
        },
        layout: { columnCount: 1, hasGraphics: false, graphics: [] },
      },
    })
    const cv = getCvById(db!, id)
    expect(cv?.typographyJson?.typography?.fontFamilies).toEqual(['Helvetica'])
    expect(cv?.typographyJson?.typography?.lineSpacing).toBe(1.2)
    expect(cv?.typographyJson?.layout?.columnCount).toBe(1)
    expect(cv?.typographyJson?.layout?.hasGraphics).toBe(false)
  })

  it('lists cvs with computed latestReviewId', () => {
    const cvId = seedCv()
    const targetJobId = insertTargetJob(db!, { cvId, title: 'Frontend Engineer', description: 'React, TypeScript' })
    const reviewA = insertReview(db!, {
      cvId,
      targetJobId,
      overallScore: 60,
      atsChecks: [],
      weaknesses: ['x'],
      suggestions: [],
      modelUsed: 'model-a',
    })
    const reviewB = insertReview(db!, {
      cvId,
      targetJobId,
      overallScore: 80,
      atsChecks: [],
      weaknesses: [],
      suggestions: [],
      modelUsed: 'model-b',
    })

    expect(listCvs(db!)).toEqual([
      expect.objectContaining({
        id: cvId,
        originalFilename: 'cv.pdf',
        latestReviewId: reviewB,
        latestMatchId: null,
      }),
    ])
    expect(listCvs(db!)[0]?.latestReviewId).not.toBe(reviewA)
  })

  it('computes latestMatchId when a job match exists', () => {
    const cvId = seedCv()
    const matchId = insertJobMatch(db!, { cvId, matches: [{ title: 'Backend Engineer', reasons: ['Node.js'], matchScore: 88 }], modelUsed: 'm' })
    expect(listCvs(db!)[0]?.latestMatchId).toBe(matchId)
  })
})

describe('target_jobs repository', () => {
  it('inserts a target job and reads it back', () => {
    const cvId = seedCv()
    const id = insertTargetJob(db!, { cvId, title: 'Backend Dev', description: 'Node.js, SQLite' })
    const job = getTargetJobById(db!, id)
    expect(job).toMatchObject({ id, cvId, title: 'Backend Dev', description: 'Node.js, SQLite' })
  })
})

describe('reviews repository', () => {
  it('stores and returns JSON columns round-trip', () => {
    const cvId = seedCv()
    const targetJobId = insertTargetJob(db!, { cvId, title: null, description: 'JD text' })
    const id = insertReview(db!, {
      cvId,
      targetJobId,
      overallScore: 72.5,
      atsChecks: [{ id: 'keyword', name: 'Keyword match', status: 'warn', score: 60, detail: 'Missing: terraform' }],
      weaknesses: ['weak'],
      suggestions: [{ id: 'sug-1', title: 'Quantify', description: 'Add metric', category: 'achievements', priority: 'high' }],
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    })
    const review = getReviewById(db!, id)
    expect(review).toMatchObject({
      id,
      cvId,
      targetJobId,
      overallScore: 72.5,
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      status: 'completed',
      errorMessage: null,
    })
    expect(review?.atsChecks).toEqual([
      { id: 'keyword', name: 'Keyword match', status: 'warn', score: 60, detail: 'Missing: terraform' },
    ])
    expect(review?.weaknesses).toEqual(['weak'])
    expect(review?.suggestions[0]?.priority).toBe('high')
  })

  it('stores a Mode B review with null target_job_id', () => {
    const cvId = seedCv()
    const id = insertReview(db!, {
      cvId,
      targetJobId: null,
      overallScore: 64,
      atsChecks: [],
      weaknesses: ['weak'],
      suggestions: [],
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    })
    const review = getReviewById(db!, id)
    expect(review).toMatchObject({ id, cvId, targetJobId: null, overallScore: 64, status: 'completed' })
  })
})

describe('job_matches repository', () => {
  it('stores matches and reads them back', () => {
    const cvId = seedCv()
    const matches = [
      { title: 'Backend Engineer', reasons: ['Node.js', 'REST API'], matchScore: 88 },
      { title: 'DevOps Engineer', reasons: ['CI/CD'], matchScore: 74 },
    ]
    const id = insertJobMatch(db!, { cvId, matches, modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free' })
    const match = getJobMatchById(db!, id)
    expect(match).toMatchObject({
      id,
      cvId,
      matches,
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      status: 'completed',
      errorMessage: null,
    })
    expect(match?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('finds the latest job match for a cv', () => {
    const cvId = seedCv()
    insertJobMatch(db!, { cvId, matches: [{ title: 'A', reasons: [], matchScore: 50 }], modelUsed: 'm1' })
    const latest = insertJobMatch(db!, { cvId, matches: [{ title: 'B', reasons: [], matchScore: 60 }], modelUsed: 'm2' })
    expect(getLatestJobMatchByCvId(db!, cvId)?.id).toBe(latest)
  })
})

describe('approvals repository', () => {
  it('stores approved suggestions and reads back', () => {
    const cvId = seedCv()
    const targetJobId = insertTargetJob(db!, { cvId, title: null, description: 'JD' })
    const reviewId = insertReview(db!, { cvId, targetJobId, overallScore: 70, atsChecks: [], weaknesses: [], suggestions: [], modelUsed: 'a' })
    const approved: Suggestion[] = [{ id: 'sug-1', title: 'Quantify', description: 'Add metric', category: 'achievements', priority: 'high' }]
    const id = insertApproval(db!, { reviewId, approvedSuggestions: approved })
    const approval = getApprovalById(db!, id)
    expect(approval).toMatchObject({ id, reviewId, approvedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) })
    expect(approval?.approvedSuggestions).toEqual(approved)
  })

  it('finds the latest approval for a review', () => {
    const cvId = seedCv()
    const targetJobId = insertTargetJob(db!, { cvId, title: null, description: 'JD' })
    const reviewId = insertReview(db!, { cvId, targetJobId, overallScore: 70, atsChecks: [], weaknesses: [], suggestions: [], modelUsed: 'a' })
    insertApproval(db!, { reviewId, approvedSuggestions: [] })
    const latest = insertApproval(db!, { reviewId, approvedSuggestions: [{ id: 'sug-2', title: 'Skills', description: 'Add skills', category: 'skills', priority: 'low' }] })
    expect(getLatestApprovalByReviewId(db!, reviewId)?.id).toBe(latest)
  })
})

describe('rewrites repository + traversal', () => {
  it('stores a rewrite and reads it back by id', () => {
    const cvId = seedCv()
    const targetJobId = insertTargetJob(db!, { cvId, title: null, description: 'JD' })
    const reviewId = insertReview(db!, { cvId, targetJobId, overallScore: 70, atsChecks: [], weaknesses: [], suggestions: [], modelUsed: 'a' })
    const approvalId = insertApproval(db!, { reviewId, approvedSuggestions: [] })
    const id = insertRewrite(db!, {
      reviewId,
      approvalId,
      rewrittenMarkdown: '# Rizky Pratama',
      postScore: 84,
      warnings: ['Removed 2 education details'],
      postModelUsed: 'nvidia/nemotron-3-nano-30b-a3b:free',
    })
    const rewrite = getRewriteById(db!, id)
    expect(rewrite).toMatchObject({
      id,
      reviewId,
      approvalId,
      rewrittenMarkdown: '# Rizky Pratama',
      postScore: 84,
      warnings: ['Removed 2 education details'],
      postModelUsed: 'nvidia/nemotron-3-nano-30b-a3b:free',
      status: 'completed',
      errorMessage: null,
    })
  })

  it('allows review → approval → rewrite traversal', () => {
    const cvId = seedCv()
    const targetJobId = insertTargetJob(db!, { cvId, title: null, description: 'JD' })
    const reviewId = insertReview(db!, { cvId, targetJobId, overallScore: 70, atsChecks: [], weaknesses: [], suggestions: [], modelUsed: 'a' })
    const approvalId = insertApproval(db!, { reviewId, approvedSuggestions: [{ id: 'sug-1', title: 'Quantify', description: 'Add metric', category: 'achievements', priority: 'high' }] })
    const rewriteId = insertRewrite(db!, { reviewId, approvalId, rewrittenMarkdown: '# CV', postScore: 90, warnings: [], postModelUsed: 'b' })

    const approval = getApprovalById(db!, approvalId)
    expect(approval?.reviewId).toBe(reviewId)

    const rewriteFromApproval = getRewriteByApprovalId(db!, approvalId)
    expect(rewriteFromApproval?.id).toBe(rewriteId)

    const rewriteFromReview = getRewriteByReviewId(db!, reviewId)
    expect(rewriteFromReview?.id).toBe(rewriteId)
    expect(rewriteFromReview?.rewrittenMarkdown).toBe('# CV')
  })
})
