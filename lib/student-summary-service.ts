import { createServiceClient } from '@/lib/supabase/service'
import { computeDeadline } from '@/lib/deadline'

export interface MatrixAssessment {
  id: string
  title: string
  passing_score: number | null
  total_points: number
  mode: string
  state: string
  accepting_submissions: boolean
  duration_minutes: number | null
}

export interface MatrixStudent {
  id: string
  name: string
  email: string
}

export type CellState =
  | { kind: 'score'; score: number; total: number }
  | { kind: 'failed'; score: number; total: number }
  | { kind: 'missing' }
  | { kind: 'not_taken' }
  | { kind: 'in_progress' }

export interface MatrixRow {
  student: MatrixStudent
  cells: Map<string, CellState>
}

export interface StudentSummaryMatrix {
  assessments: MatrixAssessment[]
  rows: MatrixRow[]
}

interface SubmissionRow {
  id: string
  assessment_id: string
  student_id: string
  status: string
  score_total: number | null
  started_at: string
  extra_seconds: number
}

interface AnswerRow {
  submission_id: string
  question_id: string
  score: number | null
  questions: { type: string }
}

interface QuestionRow {
  id: string
  assessment_id: string
  points: number
}

interface AssessmentRow {
  id: string
  title: string
  mode: string
  state: string
  accepting_submissions: boolean
  passing_score: number | null
  duration_minutes: number | null
}

interface StudentRow {
  id: string
  firstname: string | null
  lastname: string | null
  email: string
}

export async function getStudentSummaryMatrix(
  instructorId: string,
  classId: string,
): Promise<{ matrix: StudentSummaryMatrix | null; error: string | null }> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) {
    return { matrix: null, error: 'Class not found or not authorized' }
  }

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('student_id')
    .eq('class_id', classId)

  const studentIds = (enrollments ?? []).map((e) => e.student_id)

  if (studentIds.length === 0) {
    return {
      matrix: { assessments: [], rows: [] },
      error: null,
    }
  }

  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, title, mode, state, accepting_submissions, passing_score, duration_minutes')
    .eq('class_id', classId)
    .neq('state', 'draft')
    .order('created_at', { ascending: false })

  if (!assessments || assessments.length === 0) {
    return {
      matrix: { assessments: [], rows: [] },
      error: null,
    }
  }

  const assessmentIds = assessments.map((a) => a.id)

  const [{ data: students }, { data: questions }, { data: liveSessions }] =
    await Promise.all([
      supabase
        .from('users')
        .select('id, firstname, lastname, email')
        .in('id', studentIds),
      supabase
        .from('questions')
        .select('id, assessment_id, points')
        .in('assessment_id', assessmentIds),
      supabase
        .from('live_sessions')
        .select('assessment_id, status')
        .in('assessment_id', assessmentIds),
    ])

  const { data: allSubmissions } = await supabase
    .from('submissions')
    .select('id, assessment_id, student_id, status, score_total, started_at, extra_seconds')
    .in('assessment_id', assessmentIds)
    .in('student_id', studentIds)
    .order('started_at', { ascending: false })

  const submissionIds = (allSubmissions as SubmissionRow[] | null)?.map((s) => s.id) ?? []

  const { data: allAnswers } = submissionIds.length > 0
    ? await supabase
      .from('answers')
      .select('submission_id, question_id, score, questions!inner(type)')
      .in('submission_id', submissionIds)
      .in('questions.type', ['Essay', 'Coding'])
    : { data: [] }

  const totalPointsByAssessment = new Map<string, number>()
  for (const q of (questions as QuestionRow[]) ?? []) {
    totalPointsByAssessment.set(
      q.assessment_id,
      (totalPointsByAssessment.get(q.assessment_id) ?? 0) + q.points,
    )
  }

  const liveSessionByAssessment = new Map<string, { status: string }>()
  for (const ls of (liveSessions ?? []) as { assessment_id: string; status: string }[]) {
    liveSessionByAssessment.set(ls.assessment_id, { status: ls.status })
  }

  const subsByStudentAssessment = new Map<string, SubmissionRow[]>()
  for (const s of (allSubmissions as SubmissionRow[]) ?? []) {
    const key = `${s.student_id}:${s.assessment_id}`
    const list = subsByStudentAssessment.get(key)
    if (list) {
      list.push(s)
    } else {
      subsByStudentAssessment.set(key, [s])
    }
  }

  const pendingManualBySubmission = new Map<string, boolean>()
  for (const a of (allAnswers as AnswerRow[]) ?? []) {
    if (a.score === null) {
      pendingManualBySubmission.set(a.submission_id, true)
    }
  }

  const matrixAssessments: MatrixAssessment[] = (assessments as AssessmentRow[]).map((a) => ({
    id: a.id,
    title: a.title,
    passing_score: a.passing_score,
    total_points: totalPointsByAssessment.get(a.id) ?? 0,
    mode: a.mode,
    state: a.state,
    accepting_submissions: a.accepting_submissions,
    duration_minutes: a.duration_minutes,
  }))

  const matrixStudents: MatrixStudent[] = ((students as StudentRow[]) ?? []).map((s) => ({
    id: s.id,
    name: [s.lastname, s.firstname].filter(Boolean).join(' ') || s.email,
    email: s.email,
  }))

  const rows: MatrixRow[] = matrixStudents.map((student) => {
    const cells = new Map<string, CellState>()
    for (const assessment of matrixAssessments) {
      const subs = subsByStudentAssessment.get(`${student.id}:${assessment.id}`) ?? []
      cells.set(
        assessment.id,
        computeCellState(subs, assessment, liveSessionByAssessment.get(assessment.id) ?? null, pendingManualBySubmission),
      )
    }
    return { student, cells }
  })

  return { matrix: { assessments: matrixAssessments, rows }, error: null }
}

export function computeCellState(
  submissions: SubmissionRow[],
  assessment: MatrixAssessment,
  liveSession: { status: string } | null,
  pendingManualBySubmission: Map<string, boolean>,
): CellState {
  const inProgress = submissions.find((s) => s.status === 'in_progress')
  const submitted = submissions.find((s) => s.status === 'submitted' || s.status === 'expired')

  if (inProgress) {
    if (isDeadlinePassed(inProgress, assessment)) {
      if (submitted) {
        return makeScoreState(submitted, assessment)
      }
      return { kind: 'missing' }
    }
    return { kind: 'in_progress' }
  }

  if (submitted) {
    const state = makeScoreState(submitted, assessment)
    if (state.kind === 'score' && assessment.passing_score != null && state.total > 0) {
      const pct = (state.score / state.total) * 100
      if (pct < assessment.passing_score) {
        if (!pendingManualBySubmission.get(submitted.id)) {
          return { kind: 'failed', score: state.score, total: state.total }
        }
      }
    }
    return state
  }

  if (!isWindowOpen(assessment, liveSession)) {
    return { kind: 'missing' }
  }
  return { kind: 'not_taken' }
}

function isDeadlinePassed(submission: SubmissionRow, assessment: MatrixAssessment): boolean {
  if (assessment.mode !== 'timed' || !assessment.duration_minutes) return false
  const deadline = computeDeadline(
    submission.started_at,
    assessment.duration_minutes,
    submission.extra_seconds ?? 0,
  )
  return Date.now() > deadline
}

function isWindowOpen(
  assessment: MatrixAssessment,
  liveSession: { status: string } | null,
): boolean {
  if (assessment.state === 'closed') return false
  if (assessment.accepting_submissions === false) return false
  if (assessment.mode === 'live') {
    if (liveSession && liveSession.status === 'ended') return false
  }
  return true
}

function makeScoreState(submission: SubmissionRow, assessment: MatrixAssessment): CellState {
  const score = submission.score_total ?? 0
  return { kind: 'score', score, total: assessment.total_points }
}
