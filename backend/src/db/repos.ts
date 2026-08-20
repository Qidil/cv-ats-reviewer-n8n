import type { DatabaseSync } from 'node:sqlite'
import type { TypographyMetadata, LayoutMetadata } from '../services/pdf-extract.js'

export type AtsCheckStatus = 'pass' | 'warn' | 'fail'
export type SuggestionPriority = 'high' | 'medium' | 'low'
export type RunStatus = 'completed' | 'failed'

export interface AtsCheck {
  id: string
  name: string
  status: AtsCheckStatus
  score: number
  detail: string
}

export interface Suggestion {
  id: string
  title: string
  description: string
  category: string
  priority: SuggestionPriority
}

export interface CvTypographyJson {
  typography: TypographyMetadata | null
  layout: LayoutMetadata | null
}

export interface Cv {
  id: number
  originalFilename: string
  cvText: string
  typographyJson: CvTypographyJson | null
  createdAt: string
  updatedAt: string
}

export interface CvListItem {
  id: number
  originalFilename: string
  createdAt: string
  latestReviewId: number | null
  latestMatchId: number | null
}

export interface TargetJob {
  id: number
  cvId: number
  title: string | null
  description: string
  createdAt: string
}

export interface Review {
  id: number
  cvId: number
  targetJobId: number | null
  overallScore: number
  atsChecks: AtsCheck[]
  weaknesses: string[]
  suggestions: Suggestion[]
  modelUsed: string
  status: RunStatus
  errorMessage: string | null
  createdAt: string
}

export interface JobMatchItem {
  title: string
  reasons: string[]
  matchScore: number
}

export interface JobMatch {
  id: number
  cvId: number
  matches: JobMatchItem[]
  modelUsed: string
  status: RunStatus
  errorMessage: string | null
  createdAt: string
}

export interface Approval {
  id: number
  reviewId: number
  approvedSuggestions: Suggestion[]
  approvedAt: string
}

export interface Rewrite {
  id: number
  reviewId: number
  approvalId: number
  rewrittenMarkdown: string
  postScore: number | null
  warnings: string[] | null
  postModelUsed: string | null
  status: RunStatus
  errorMessage: string | null
  createdAt: string
}

export interface NewCv {
  originalFilename: string
  cvText: string
  typographyJson?: CvTypographyJson | null
}

export interface NewTargetJob {
  cvId: number
  title: string | null
  description: string
}

export interface NewReview {
  cvId: number
  targetJobId: number | null
  overallScore: number
  atsChecks: AtsCheck[]
  weaknesses: string[]
  suggestions: Suggestion[]
  modelUsed: string
  status?: RunStatus
  errorMessage?: string | null
}

export interface NewJobMatch {
  cvId: number
  matches: JobMatchItem[]
  modelUsed: string
  status?: RunStatus
  errorMessage?: string | null
}

export interface NewApproval {
  reviewId: number
  approvedSuggestions: Suggestion[]
}

export interface NewRewrite {
  reviewId: number
  approvalId: number
  rewrittenMarkdown: string
  postScore: number | null
  warnings: string[] | null
  postModelUsed: string | null
  status?: RunStatus
  errorMessage?: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

function lastId(db: DatabaseSync, sql: string, ...params: Array<string | number | null>): number {
  const result = db.prepare(sql).run(...params)
  return Number(result.lastInsertRowid)
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T
}

function parseNullJson<T>(raw: string | null): T | null {
  return raw === null ? null : (JSON.parse(raw) as T)
}

interface CvRow {
  id: number
  original_filename: string
  cv_text: string
  typography_json: string | null
  created_at: string
  updated_at: string
}

interface TargetJobRow {
  id: number
  cv_id: number
  title: string | null
  description: string
  created_at: string
}

interface ReviewRow {
  id: number
  cv_id: number
  target_job_id: number | null
  overall_score: number
  ats_checks_json: string
  weaknesses_json: string
  suggestions_json: string
  model_used: string
  status: RunStatus
  error_message: string | null
  created_at: string
}

interface JobMatchRow {
  id: number
  cv_id: number
  matches_json: string
  model_used: string
  status: RunStatus
  error_message: string | null
  created_at: string
}

interface ApprovalRow {
  id: number
  review_id: number
  approved_suggestions_json: string
  approved_at: string
}

interface RewriteRow {
  id: number
  review_id: number
  approval_id: number
  rewritten_markdown: string
  post_score: number | null
  dropped_info_warnings_json: string | null
  post_model_used: string | null
  status: RunStatus
  error_message: string | null
  created_at: string
}

export function insertCv(db: DatabaseSync, input: NewCv): number {
  const now = nowIso()
  return lastId(
    db,
    'INSERT INTO cvs (original_filename, cv_text, typography_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    input.originalFilename,
    input.cvText,
    input.typographyJson === undefined || input.typographyJson === null ? null : JSON.stringify(input.typographyJson),
    now,
    now,
  )
}

function toCv(row: CvRow): Cv {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    cvText: row.cv_text,
    typographyJson: parseNullJson<CvTypographyJson>(row.typography_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getCvById(db: DatabaseSync, id: number): Cv | undefined {
  const row = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id) as CvRow | undefined
  return row === undefined ? undefined : toCv(row)
}

export function listCvs(db: DatabaseSync): CvListItem[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.original_filename, c.created_at,
              (SELECT MAX(r.id) FROM reviews r WHERE r.cv_id = c.id) AS latest_review_id,
              (SELECT MAX(j.id) FROM job_matches j WHERE j.cv_id = c.id) AS latest_match_id
       FROM cvs c
       ORDER BY c.created_at DESC, c.id DESC`,
    )
    .all() as Array<{
    id: number
    original_filename: string
    created_at: string
    latest_review_id: number | null
    latest_match_id: number | null
  }>
  return rows.map((row) => ({
    id: row.id,
    originalFilename: row.original_filename,
    createdAt: row.created_at,
    latestReviewId: row.latest_review_id,
    latestMatchId: row.latest_match_id,
  }))
}

export function insertTargetJob(db: DatabaseSync, input: NewTargetJob): number {
  return lastId(
    db,
    'INSERT INTO target_jobs (cv_id, title, description, created_at) VALUES (?, ?, ?, ?)',
    input.cvId,
    input.title,
    input.description,
    nowIso(),
  )
}

function toTargetJob(row: TargetJobRow): TargetJob {
  return {
    id: row.id,
    cvId: row.cv_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
  }
}

export function getTargetJobById(db: DatabaseSync, id: number): TargetJob | undefined {
  const row = db.prepare('SELECT * FROM target_jobs WHERE id = ?').get(id) as TargetJobRow | undefined
  return row === undefined ? undefined : toTargetJob(row)
}

export function getLatestTargetJobByCvId(db: DatabaseSync, cvId: number): TargetJob | undefined {
  const row = db
    .prepare('SELECT * FROM target_jobs WHERE cv_id = ? ORDER BY id DESC LIMIT 1')
    .get(cvId) as TargetJobRow | undefined
  return row === undefined ? undefined : toTargetJob(row)
}

export function insertReview(db: DatabaseSync, input: NewReview): number {
  return lastId(
    db,
    `INSERT INTO reviews
       (cv_id, target_job_id, overall_score, ats_checks_json, weaknesses_json,
        suggestions_json, model_used, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.cvId,
    input.targetJobId,
    input.overallScore,
    JSON.stringify(input.atsChecks),
    JSON.stringify(input.weaknesses),
    JSON.stringify(input.suggestions),
    input.modelUsed,
    input.status ?? 'completed',
    input.errorMessage ?? null,
    nowIso(),
  )
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    cvId: row.cv_id,
    targetJobId: row.target_job_id,
    overallScore: row.overall_score,
    atsChecks: parseJson<AtsCheck[]>(row.ats_checks_json),
    weaknesses: parseJson<string[]>(row.weaknesses_json),
    suggestions: parseJson<Suggestion[]>(row.suggestions_json),
    modelUsed: row.model_used,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

export function getReviewById(db: DatabaseSync, id: number): Review | undefined {
  const row = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as ReviewRow | undefined
  return row === undefined ? undefined : toReview(row)
}

export function insertApproval(db: DatabaseSync, input: NewApproval): number {
  return lastId(
    db,
    'INSERT INTO approvals (review_id, approved_suggestions_json, approved_at) VALUES (?, ?, ?)',
    input.reviewId,
    JSON.stringify(input.approvedSuggestions),
    nowIso(),
  )
}

function toApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    reviewId: row.review_id,
    approvedSuggestions: parseJson<Suggestion[]>(row.approved_suggestions_json),
    approvedAt: row.approved_at,
  }
}

export function getApprovalById(db: DatabaseSync, id: number): Approval | undefined {
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined
  return row === undefined ? undefined : toApproval(row)
}

export function getLatestApprovalByReviewId(db: DatabaseSync, reviewId: number): Approval | undefined {
  const row = db
    .prepare('SELECT * FROM approvals WHERE review_id = ? ORDER BY id DESC LIMIT 1')
    .get(reviewId) as ApprovalRow | undefined
  return row === undefined ? undefined : toApproval(row)
}

export function insertRewrite(db: DatabaseSync, input: NewRewrite): number {
  return lastId(
    db,
    `INSERT INTO rewrites
       (review_id, approval_id, rewritten_markdown, post_score,
        dropped_info_warnings_json, post_model_used, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.reviewId,
    input.approvalId,
    input.rewrittenMarkdown,
    input.postScore,
    input.warnings === null ? null : JSON.stringify(input.warnings),
    input.postModelUsed,
    input.status ?? 'completed',
    input.errorMessage ?? null,
    nowIso(),
  )
}

function toRewrite(row: RewriteRow): Rewrite {
  return {
    id: row.id,
    reviewId: row.review_id,
    approvalId: row.approval_id,
    rewrittenMarkdown: row.rewritten_markdown,
    postScore: row.post_score,
    warnings: parseNullJson<string[]>(row.dropped_info_warnings_json),
    postModelUsed: row.post_model_used,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

export function getRewriteById(db: DatabaseSync, id: number): Rewrite | undefined {
  const row = db.prepare('SELECT * FROM rewrites WHERE id = ?').get(id) as RewriteRow | undefined
  return row === undefined ? undefined : toRewrite(row)
}

export function getRewriteByReviewId(db: DatabaseSync, reviewId: number): Rewrite | undefined {
  const row = db
    .prepare('SELECT * FROM rewrites WHERE review_id = ? ORDER BY id DESC LIMIT 1')
    .get(reviewId) as RewriteRow | undefined
  return row === undefined ? undefined : toRewrite(row)
}

export function getRewriteByApprovalId(db: DatabaseSync, approvalId: number): Rewrite | undefined {
  const row = db
    .prepare('SELECT * FROM rewrites WHERE approval_id = ? ORDER BY id DESC LIMIT 1')
    .get(approvalId) as RewriteRow | undefined
  return row === undefined ? undefined : toRewrite(row)
}

export function insertJobMatch(db: DatabaseSync, input: NewJobMatch): number {
  return lastId(
    db,
    `INSERT INTO job_matches (cv_id, matches_json, model_used, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.cvId,
    JSON.stringify(input.matches),
    input.modelUsed,
    input.status ?? 'completed',
    input.errorMessage ?? null,
    nowIso(),
  )
}

function toJobMatch(row: JobMatchRow): JobMatch {
  return {
    id: row.id,
    cvId: row.cv_id,
    matches: parseJson<JobMatchItem[]>(row.matches_json),
    modelUsed: row.model_used,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

export function getJobMatchById(db: DatabaseSync, id: number): JobMatch | undefined {
  const row = db.prepare('SELECT * FROM job_matches WHERE id = ?').get(id) as JobMatchRow | undefined
  return row === undefined ? undefined : toJobMatch(row)
}

export function getLatestJobMatchByCvId(db: DatabaseSync, cvId: number): JobMatch | undefined {
  const row = db
    .prepare('SELECT * FROM job_matches WHERE cv_id = ? ORDER BY id DESC LIMIT 1')
    .get(cvId) as JobMatchRow | undefined
  return row === undefined ? undefined : toJobMatch(row)
}
