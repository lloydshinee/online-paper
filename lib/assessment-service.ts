import { createServiceClient } from '@/lib/supabase/service'
import type { ParsedQuestion } from '@/lib/question-parser'
import { recalculateAssessmentScores } from '@/lib/submission-service'
import { sanitizeQuestionForStudent } from '@/lib/question-sanitizer'
import { computeDeadline } from '@/lib/deadline'

export interface DashboardAssessment {
  id: string
  class_id: string
  class_name: string
  title: string
  mode: 'timed' | 'live'
  state: 'draft' | 'active' | 'closed'
  duration_minutes: number | null
  scores_released: boolean
  answer_reveal_enabled: boolean
  accepting_submissions: boolean
  retakes_allowed: boolean
  created_at: string
  submission: StudentSubmissionSummary | null
}

/** Per-assessment submission state for student views. `has_in_progress` is
 * deliberately deadline-blind: a past-deadline attempt still counts as
 * running until the server expires it, so retake entry points stay hidden
 * while any attempt is alive. */
export interface StudentSubmissionSummary {
  status: string
  score_total: number | null
  has_in_progress: boolean
  has_finished_attempt: boolean
}

const ASSESSMENT_SELECT = 'id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, retakes_allowed, created_at'

type AssessmentForMap = { id: string; mode: string; duration_minutes: number | null; scores_released?: boolean }
type SubmissionForMap = { assessment_id: string; status: string; score_total: number | null; started_at: string; extra_seconds?: number }

function buildSubmissionMap(
  assessments: AssessmentForMap[],
  submissions: SubmissionForMap[] | null,
): Map<string, StudentSubmissionSummary> {
  const assessmentMap = new Map(assessments.map((a) => [a.id, a]))
  const subsByAssessment = new Map<string, SubmissionForMap[]>()

  for (const s of submissions ?? []) {
    if (!subsByAssessment.has(s.assessment_id)) {
      subsByAssessment.set(s.assessment_id, [])
    }
    subsByAssessment.get(s.assessment_id)!.push(s)
  }

  const result = new Map<string, StudentSubmissionSummary>()

  for (const [assessmentId, subs] of subsByAssessment) {
    const latest = subs[0]
    const assessment = assessmentMap.get(assessmentId)
    const hasInProgress = subs.some((s) => s.status === 'in_progress')
    const finished = subs.find((s) => s.status === 'submitted' || s.status === 'expired')

    if (latest.status === 'in_progress' && assessment) {
      const isOverdue =
        assessment.mode === 'timed' &&
        assessment.duration_minutes != null &&
        computeDeadline(latest.started_at, assessment.duration_minutes, latest.extra_seconds ?? 0) < Date.now()

      if (isOverdue) {
        if (finished) {
          const scoreTotal = assessment.scores_released === true ? finished.score_total : null
          result.set(assessmentId, { status: finished.status, score_total: scoreTotal, has_in_progress: hasInProgress, has_finished_attempt: true })
        } else {
          result.set(assessmentId, { status: 'expired', score_total: null, has_in_progress: hasInProgress, has_finished_attempt: false })
        }
        continue
      }
    }

    // Scores are stripped server-side while scores_released is off.
    const scoreTotal = assessment?.scores_released === true ? latest.score_total : null
    result.set(assessmentId, { status: latest.status, score_total: scoreTotal, has_in_progress: hasInProgress, has_finished_attempt: !!finished })
  }

  return result
}

export interface AssessmentData {
  id: string
  class_id: string
  title: string
  mode: 'timed' | 'live'
  state: 'draft' | 'active' | 'closed'
  duration_minutes: number | null
  scores_released: boolean
  answer_reveal_enabled: boolean
  accepting_submissions: boolean
  retakes_allowed: boolean
  created_at: string
}

export interface AssessmentResult {
  assessment: AssessmentData | null
  error: string | null
}

export async function createAssessment(
  instructorId: string,
  classId: string,
  title: string,
  mode: 'timed' | 'live',
  durationMinutes: number | undefined,
): Promise<AssessmentResult> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) {
    return { assessment: null, error: 'Class not found or not authorized' }
  }

  const { data: assessment, error } = await supabase
    .from('assessments')
    .insert({
      class_id: classId,
      title,
      mode,
      duration_minutes: mode === 'timed' ? (durationMinutes ?? null) : null,
      state: 'draft',
    })
    .select(ASSESSMENT_SELECT)
    .single()

  if (error) {
    return { assessment: null, error: error.message }
  }

  return { assessment: assessment as AssessmentData, error: null }
}

async function verifyInstructor(
  supabase: ReturnType<typeof createServiceClient>,
  assessmentId: string,
  instructorId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', assessmentId)
    .single()

  if (!data) return false

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', data.class_id)
    .eq('instructor_id', instructorId)
    .single()

  return !!cls
}

export async function publishAssessment(
  assessmentId: string,
  instructorId: string,
): Promise<AssessmentResult> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { assessment: null, error: 'Assessment not found or not authorized' }
  }

  const { data, error } = await supabase
    .from('assessments')
    .update({ state: 'active' })
    .eq('id', assessmentId)
    .select(ASSESSMENT_SELECT)
    .single()

  if (error) {
    return { assessment: null, error: error.message }
  }

  return { assessment: data as AssessmentData, error: null }
}

export async function unpublishAssessment(
  assessmentId: string,
  instructorId: string,
): Promise<AssessmentResult> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { assessment: null, error: 'Assessment not found or not authorized' }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('state')
    .eq('id', assessmentId)
    .single()

  if (!assessment || assessment.state !== 'active') {
    return { assessment: null, error: 'Only published assessments can be unpublished' }
  }

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id')
    .eq('assessment_id', assessmentId)
    .limit(1)

  if (submissions && submissions.length > 0) {
    return { assessment: null, error: 'Cannot unpublish an assessment with existing submissions' }
  }

  const { data, error } = await supabase
    .from('assessments')
    .update({ state: 'draft' })
    .eq('id', assessmentId)
    .select(ASSESSMENT_SELECT)
    .single()

  if (error) {
    return { assessment: null, error: error.message }
  }

  return { assessment: data as AssessmentData, error: null }
}

export async function closeAssessment(
  assessmentId: string,
  instructorId: string,
): Promise<AssessmentResult> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { assessment: null, error: 'Assessment not found or not authorized' }
  }

  const { data, error } = await supabase
    .from('assessments')
    .update({ state: 'closed' })
    .eq('id', assessmentId)
    .select(ASSESSMENT_SELECT)
    .single()

  if (error) {
    return { assessment: null, error: error.message }
  }

  return { assessment: data as AssessmentData, error: null }
}

export async function deleteAssessment(
  assessmentId: string,
  instructorId: string,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { error: 'Assessment not found or not authorized' }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('state')
    .eq('id', assessmentId)
    .single()

  if (!assessment) {
    return { error: 'Assessment not found' }
  }

  const { error } = await supabase
    .from('assessments')
    .delete()
    .eq('id', assessmentId)

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}

export async function getClassAssessments(
  instructorId: string,
  classId: string,
): Promise<{ assessments: AssessmentData[]; error: string | null }> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) {
    return { assessments: [], error: 'Class not found or not authorized' }
  }

  const { data, error } = await supabase
    .from('assessments')
    .select(ASSESSMENT_SELECT)
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  if (error) {
    return { assessments: [], error: error.message }
  }

  return { assessments: (data as AssessmentData[]) ?? [], error: null }
}

/**
 * Stable content identity for a question. Points are deliberately excluded:
 * editing points in place must keep the same question row (and its answers),
 * while a content or type change yields a new identity.
 */
export function questionContentIdentity(q: { type: string; content: Record<string, unknown> }): string {
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(q.content).sort()) {
    sorted[key] = q.content[key]
  }
  return JSON.stringify({ type: q.type, content: sorted })
}

export async function setAssessmentQuestions(
  assessmentId: string,
  instructorId: string,
  questions: ParsedQuestion[],
): Promise<{ questions: QuestionData[] | null; resetCount: number; error: string | null }> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { questions: null, resetCount: 0, error: 'Not authorized' }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('state')
    .eq('id', assessmentId)
    .single()

  if (!assessment) {
    return { questions: null, resetCount: 0, error: 'Assessment not found' }
  }

  const { data: existing } = await supabase
    .from('questions')
    .select('id, type, content, points, order_index')
    .eq('assessment_id', assessmentId)
    .order('order_index')

  // Match incoming questions to existing rows by content identity so that
  // unchanged questions keep their IDs (and their answers stay bound) even
  // when the instructor inserts or reorders other questions.
  const candidatesByIdentity = new Map<string, string[]>()
  for (const row of (existing as QuestionData[]) ?? []) {
    const identity = questionContentIdentity(row)
    const list = candidatesByIdentity.get(identity) ?? []
    list.push(row.id)
    candidatesByIdentity.set(identity, list)
  }

  const usedIds = new Set<string>()
  const updatedIds: string[] = []

  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx]
    const identity = questionContentIdentity(q)
    const candidates = candidatesByIdentity.get(identity) ?? []
    const existingId = candidates.find((id) => !usedIds.has(id))

    const row = {
      assessment_id: assessmentId,
      type: q.type,
      content: q.content,
      points: q.points,
      order_index: idx,
    }

    if (existingId) {
      usedIds.add(existingId)
      const { data: updated } = await supabase
        .from('questions')
        .update(row)
        .eq('id', existingId)
        .select('*')
        .single()
      if (updated) updatedIds.push(updated.id)
    } else {
      const { data: inserted } = await supabase
        .from('questions')
        .insert(row)
        .select('*')
        .single()
      if (inserted) updatedIds.push(inserted.id)
    }
  }

  // Rows that were not matched are either removed or replaced by a new
  // identity. Deleting them cascades to their answers, so existing answers
  // are never re-graded against different question content.
  const toDelete = ((existing as QuestionData[]) ?? [])
    .filter((q) => !usedIds.has(q.id))
    .map((q) => q.id)

  if (toDelete.length > 0) {
    await supabase.from('questions').delete().in('id', toDelete)
  }

  const resetCount = toDelete.length

  if (updatedIds.length === 0 && questions.length === 0) {
    return { questions: [], resetCount, error: null }
  }

  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('id', updatedIds)
    .order('order_index')

  if (error) {
    return { questions: null, resetCount, error: error.message }
  }

  if (assessment.state !== 'draft') {
    await recalculateAssessmentScores(assessmentId)
  }

  return { questions: data as QuestionData[], resetCount, error: null }
}

export interface QuestionData {
  id: string
  assessment_id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

export async function getAssessmentQuestions(
  assessmentId: string,
): Promise<QuestionData[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('order_index')
  return (data as QuestionData[]) ?? []
}

export async function getAssessmentQuestionsForStudent(
  assessmentId: string,
): Promise<QuestionData[]> {
  const questions = await getAssessmentQuestions(assessmentId)
  return questions.map((q) => sanitizeQuestionForStudent(q))
}

export async function verifyStudentEnrollment(
  studentId: string,
  assessmentId: string,
): Promise<boolean> {
  const supabase = createServiceClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('class_id')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return false

  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', assessment.class_id)
    .maybeSingle()

  return !!enrollment
}

export async function getAssessmentTimeLimit(
  assessmentId: string,
): Promise<number | null> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('assessments')
    .select('duration_minutes, mode')
    .eq('id', assessmentId)
    .single()

  if (!data || data.mode !== 'timed') return null
  return data.duration_minutes
}

export async function getAssessmentBasic(
  assessmentId: string,
): Promise<{ id: string; class_id: string } | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', assessmentId)
    .single()
  return data
}

export async function getAssessmentWithQuestions(assessmentId: string): Promise<{
  assessment: AssessmentData | null
  questions: QuestionData[]
}> {
  const supabase = createServiceClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select(ASSESSMENT_SELECT)
    .eq('id', assessmentId)
    .single()

  if (!assessment) return { assessment: null, questions: [] }

  const questions = await getAssessmentQuestions(assessmentId)
  return { assessment: assessment as AssessmentData, questions }
}

export async function getStudentAssessments(
  studentId: string,
  classId: string,
): Promise<{
  assessments: (AssessmentData & { submission: StudentSubmissionSummary | null })[]
  error: string | null
}> {
  const supabase = createServiceClient()

  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .maybeSingle()

  if (!enrollment) return { assessments: [], error: 'Not enrolled' }

  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, accepting_submissions, scores_released, answer_reveal_enabled, retakes_allowed, created_at')
    .eq('class_id', classId)
    .neq('state', 'draft')
    .order('created_at', { ascending: false })

  if (!assessments || assessments.length === 0) {
    return { assessments: [], error: null }
  }

  const assessmentIds = assessments.map((a) => a.id)
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, assessment_id, status, score_total, started_at, extra_seconds')
    .eq('student_id', studentId)
    .in('assessment_id', assessmentIds)
    .order('started_at', { ascending: false })

  const submissionByAssessment = buildSubmissionMap(assessments, submissions)

  const assessmentsWithSubs = assessments.map((a) => ({
    ...a,
    submission: submissionByAssessment.get(a.id) ?? null,
  }))

  return { assessments: assessmentsWithSubs, error: null }
}

export async function verifyAssessmentOwnership(
  instructorId: string,
  assessmentId: string,
): Promise<boolean> {
  const supabase = createServiceClient()
  return verifyInstructor(supabase, assessmentId, instructorId)
}

export async function updateAssessmentSettings(
  assessmentId: string,
  instructorId: string,
  updates: {
    title?: string
    mode?: 'timed' | 'live'
    duration_minutes?: number | null
    scores_released?: boolean
    answer_reveal_enabled?: boolean
    accepting_submissions?: boolean
    retakes_allowed?: boolean
  },
): Promise<AssessmentResult> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { assessment: null, error: 'Not authorized' }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('state')
    .eq('id', assessmentId)
    .single()

  if (!assessment) {
    return { assessment: null, error: 'Assessment not found' }
  }

  const updateData: Record<string, unknown> = {}
  if (updates.title !== undefined) updateData.title = updates.title
  if (updates.mode !== undefined) updateData.mode = updates.mode
  if (updates.duration_minutes !== undefined) updateData.duration_minutes = updates.duration_minutes
  if (updates.scores_released !== undefined) updateData.scores_released = updates.scores_released
  if (updates.answer_reveal_enabled !== undefined) updateData.answer_reveal_enabled = updates.answer_reveal_enabled
  if (updates.accepting_submissions !== undefined) updateData.accepting_submissions = updates.accepting_submissions
  if (updates.retakes_allowed !== undefined) updateData.retakes_allowed = updates.retakes_allowed

  if (Object.keys(updateData).length === 0) {
    return { assessment: null, error: 'No updates provided' }
  }

  const { data, error } = await supabase
    .from('assessments')
    .update(updateData)
    .eq('id', assessmentId)
    .select(ASSESSMENT_SELECT)
    .single()

  if (error) {
    return { assessment: null, error: error.message }
  }

  return { assessment: data as AssessmentData, error: null }
}

export async function getAllStudentAssessments(
  studentId: string,
): Promise<{ assessments: DashboardAssessment[]; error: string | null }> {
  const supabase = createServiceClient()

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('class_id')
    .eq('student_id', studentId)

  if (!enrollments || enrollments.length === 0) {
    return { assessments: [], error: null }
  }

  const classIds = enrollments.map((e) => e.class_id)

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .in('id', classIds)
    .eq('archived', false)

  if (!classes || classes.length === 0) {
    return { assessments: [], error: null }
  }

  const classMap = new Map(classes.map((c) => [c.id, c.name as string]))
  const activeClassIds = classes.map((c) => c.id)

  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, accepting_submissions, scores_released, answer_reveal_enabled, retakes_allowed, created_at')
    .in('class_id', activeClassIds)
    .neq('state', 'draft')
    .order('created_at', { ascending: false })

  if (!assessments || assessments.length === 0) {
    return { assessments: [], error: null }
  }

  const assessmentIds = assessments.map((a) => a.id)
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, assessment_id, status, score_total, started_at, extra_seconds')
    .eq('student_id', studentId)
    .in('assessment_id', assessmentIds)
    .order('started_at', { ascending: false })

  const submissionByAssessment = buildSubmissionMap(assessments, submissions)

  return {
    assessments: assessments.map((a) => ({
      ...a,
      class_name: classMap.get(a.class_id) ?? 'Unknown',
      submission: submissionByAssessment.get(a.id) ?? null,
    })) as DashboardAssessment[],
    error: null,
  }
}
