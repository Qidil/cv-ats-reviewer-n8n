import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import type { DatabaseSync } from 'node:sqlite'
import { extractPdfText } from '../services/pdf-extract.js'
import { analyzeCv as deterministicAnalyze, attachTypographyNotes, composeReport } from '../services/ats.js'
import type { PdfMetadata } from '../services/ats.js'
import { analyzeCv as proxyAnalyze, matchJobs, N8nProxyError } from '../services/n8n-proxy.js'
import { parseAnalyzeReport, parseJobsReport, ModelParseError, describeAnalyzeFailure, describeJobsFailure } from '../utils/model-parser.js'
import { parseId } from '../utils/route-id.js'
import {
  getCvById,
  getJobMatchById,
  getLatestTargetJobByCvId,
  getReviewById,
  insertCv,
  insertJobMatch,
  insertReview,
  insertTargetJob,
  listCvs,
  type Cv,
} from '../db/repos.js'

const MAX_CV_BYTES = 5 * 1024 * 1024
// Phase 18 (MIN-04): mimetype from the client is trivially spoofable; also require
// the PDF magic bytes to be present near the start of the buffer (tolerant of a
// small amount of leading garbage, which some PDF producers emit, per spec).
const PDF_MAGIC_BYTES = Buffer.from('%PDF-')
const PDF_MAGIC_SEARCH_WINDOW = 1024

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CV_BYTES } })

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC_SEARCH_WINDOW).includes(PDF_MAGIC_BYTES)
}

function toReportJson(
  reviewId: number,
  cvId: number,
  targetJobId: number | null,
  report: ReturnType<typeof composeReport>,
  modelUsed: string,
  createdAt: string,
) {
  return {
    id: reviewId,
    cvId,
    targetJobId,
    overallScore: report.overallScore,
    atsChecks: report.atsChecks,
    weaknesses: report.weaknesses,
    suggestions: report.suggestions,
    modelUsed,
    createdAt,
  }
}

function loadCv(db: DatabaseSync, raw: string | string[], res: Response): { cvId: number; cv: Cv } | null {
  const cvId = parseId(raw)
  if (cvId === undefined) {
    res.status(404).json({ error: 'CV tidak ditemukan.' })
    return null
  }
  const cv = getCvById(db, cvId)
  if (cv === undefined) {
    res.status(404).json({ error: 'CV tidak ditemukan.' })
    return null
  }
  return { cvId, cv }
}

// Phase 18 (MIN-05): shared error-mapping helpers so the /analyze and /jobs
// handlers below don't duplicate the same try/catch + status-code logic.
async function callProxy<T extends { model: string; raw: string; finishReason: string | null }>(
  fn: () => Promise<T>,
  res: Response,
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof N8nProxyError) {
      res.status(502).json({ error: error.message })
      return null
    }
    throw error
  }
}

function parseModelOutput<T>(
  parseFn: () => T,
  raw: string,
  finishReason: string | null,
  describeFn: (raw: string, finishReason: string | null) => string,
  res: Response,
): T | null {
  try {
    return parseFn()
  } catch (error) {
    if (error instanceof ModelParseError) {
      res.status(502).json({ error: describeFn(raw, finishReason) })
      return null
    }
    throw error
  }
}

export function createCvsRouter(db: DatabaseSync): Router {
  const router = Router()

  router.post('/', upload.single('cv'), async (req: Request, res: Response) => {
    if (req.file === undefined) {
      res.status(400).json({ error: 'File CV tidak ditemukan.' })
      return
    }
    if (req.file.mimetype !== 'application/pdf' || !looksLikePdf(req.file.buffer)) {
      res.status(415).json({ error: 'File harus berupa PDF.' })
      return
    }
    const body = req.body as { targetJobTitle?: unknown; targetJobDescription?: unknown }
    const description = typeof body.targetJobDescription === 'string' ? body.targetJobDescription.trim() : ''
    let cvText: string
    let typographyJson: PdfMetadata | null = null
    try {
      const result = await extractPdfText(req.file.buffer)
      cvText = result.text
      if (result.source === 'pdfjs') {
        typographyJson = { typography: result.typography, layout: result.layout }
      }
    } catch {
      res.status(400).json({ error: 'PDF tidak dapat dibaca.' })
      return
    }
    // Phase 18 (MIN-03): scanned/image-only PDFs extract to empty/whitespace-only
    // text; without this check they'd silently produce a near-meaningless analysis.
    if (cvText.trim().length === 0) {
      res.status(400).json({
        error: 'Tidak ada teks yang bisa diekstrak dari PDF. Pastikan CV berbasis teks, bukan hasil pindai/gambar.',
      })
      return
    }
    const title =
      typeof body.targetJobTitle === 'string' && body.targetJobTitle.trim().length > 0
        ? body.targetJobTitle.trim()
        : null
    const cvId = insertCv(db, { originalFilename: req.file.originalname, cvText, typographyJson })
    if (description.length > 0) {
      insertTargetJob(db, { cvId, title, description })
    }
    res.status(201).json({ id: cvId })
  })

  router.get('/', (_req: Request, res: Response) => {
    res.json(listCvs(db))
  })

  router.post('/:cvId/analyze', async (req: Request, res: Response) => {
    const loaded = loadCv(db, req.params.cvId ?? '', res)
    if (loaded === null) return
    const { cvId, cv } = loaded
    const targetJob = getLatestTargetJobByCvId(db, cvId)
    if (targetJob === undefined) {
      res.status(400).json({ error: 'Deskripsi pekerjaan target belum tersedia.' })
      return
    }

    const deterministic = deterministicAnalyze(cv.cvText, targetJob.description, cv.typographyJson)

    const proxyResult = await callProxy(
      () => proxyAnalyze({ cvId, cvText: cv.cvText, targetJobDescription: targetJob.description }),
      res,
    )
    if (proxyResult === null) return
    const { model, raw, finishReason } = proxyResult

    const parsed = parseModelOutput(() => parseAnalyzeReport(raw), raw, finishReason, describeAnalyzeFailure, res)
    if (parsed === null) return

    let report = composeReport(deterministic, parsed, { preferDeterministicFormatting: true })
    report = attachTypographyNotes(report, cv.typographyJson)
    const reviewId = insertReview(db, {
      cvId,
      targetJobId: targetJob.id,
      overallScore: report.overallScore,
      atsChecks: report.atsChecks,
      weaknesses: report.weaknesses,
      suggestions: report.suggestions,
      modelUsed: model,
    })
    const review = getReviewById(db, reviewId)
    res.status(200).json(
      toReportJson(reviewId, cvId, targetJob.id, report, model, review?.createdAt ?? new Date().toISOString()),
    )
  })

  router.post('/:cvId/jobs', async (req: Request, res: Response) => {
    const loaded = loadCv(db, req.params.cvId ?? '', res)
    if (loaded === null) return
    const { cvId, cv } = loaded

    const deterministic = deterministicAnalyze(cv.cvText, '', cv.typographyJson)

    const proxyResult = await callProxy(() => matchJobs({ cvId, cvText: cv.cvText }), res)
    if (proxyResult === null) return
    const { model, raw, finishReason } = proxyResult

    const parsed = parseModelOutput(() => parseJobsReport(raw), raw, finishReason, describeJobsFailure, res)
    if (parsed === null) return

    // Phase 12: model output yang lolos parse tapi tanpa saran pekerjaan atau
    // tanpa hasil analisis inti tetap dianggap gagal (bukan 500, tapi 502 jelas).
    if (parsed.jobs.length === 0 || parsed.atsChecks.length === 0) {
      res.status(502).json({ error: describeJobsFailure(raw, finishReason) })
      return
    }

    let report = composeReport(deterministic, parsed, { preferDeterministicFormatting: true })
    report = attachTypographyNotes(report, cv.typographyJson)
    const reviewId = insertReview(db, {
      cvId,
      targetJobId: null,
      overallScore: report.overallScore,
      atsChecks: report.atsChecks,
      weaknesses: report.weaknesses,
      suggestions: report.suggestions,
      modelUsed: model,
    })
    const matchId = insertJobMatch(db, { cvId, matches: parsed.jobs, modelUsed: model })
    const review = getReviewById(db, reviewId)
    const match = getJobMatchById(db, matchId)
    res.status(200).json({
      review: toReportJson(reviewId, cvId, null, report, model, review?.createdAt ?? new Date().toISOString()),
      jobMatch: {
        id: matchId,
        cvId,
        matches: match?.matches ?? [],
        modelUsed: match?.modelUsed ?? model,
        status: match?.status ?? 'completed',
        errorMessage: match?.errorMessage ?? null,
        createdAt: match?.createdAt ?? new Date().toISOString(),
      },
    })
  })

  return router
}
