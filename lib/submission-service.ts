import { createServiceClient } from '@/lib/supabase/service'
import { questionTypeRegistry } from '@/lib/question-types/registry'
import { computeDeadline, remainingSeconds } from '@/lib/deadline'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubmissionData {
  id: string
  assessment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  status: 'in_progress' | 'submitted' | 'expired'
  score_total: number | null
  violations: number
  extra_seconds: number
}

export interface AnswerData {
  id: string
  submission_id: string
  question_id: string
  answer_content: Record<string, unknown>
  score: number | null
  is_correct: boolean | null
  feedback: string | null
}

export interface QuestionData {
  id: string
  assessment_id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

export interface SubmissionWithAnswers extends SubmissionData {
  answers: AnswerData[]
}

/** Answer fields safe to hand a student on an in-progress attempt: identity
 * plus content only — never score, is_correct, or feedback (a reopened
 * attempt can still carry manual grades from its previous life). */
export interface StudentActiveAnswer {
  id: string
  question_id: string
  answer_content: Record<string, unknown>
}

export interface StudentActiveSubmission extends SubmissionData {
  answers: StudentActiveAnswer[]
}

interface SubmissionResult {
  submission: SubmissionData | null
  error: string | null
  remainingSeconds?: number
  overdue?: boolean
  deadline?: number
}

interface AnswerResult {
  error: string | null
}

interface RemainingTimeResult {
  error: string | null
  remainingSeconds: number
  extraSeconds: number
  overdue: boolean
  deadline: number | null
}

interface SubmissionTimingAssessment {
  duration_minutes: number | null
  mode: string
  state?: string
  class_id?: string
}

interface DeadlineState {
  deadline: number
  remainingSeconds: number
  overdue: boolean
}

export async function startSubmission(
  studentId: string,
  assessmentId: string,
  opts?: { retake?: boolean },
): Promise<SubmissionResult> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('assessment_id', assessmentId)
    .eq('status', 'in_progress')
    .maybeSingle()

  if (existing && !opts?.retake) {
    const overdue = await isSubmissionOverdue(existing)
    if (overdue) {
      await expireSubmission(existing.id)
    } else {
      return { submission: existing as SubmissionData, error: null }
    }
  }

  if (!opts?.retake) {
    const { data: completed } = await supabase
      .from('submissions')
      .select('id')
      .eq('student_id', studentId)
      .eq('assessment_id', assessmentId)
      .in('status', ['submitted', 'expired'])
      .limit(1)
    if (completed && completed.length > 0) {
      return { submission: null, error: 'You have already submitted this assessment. Use the retake option to try again.' }
    }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, state, mode, duration_minutes, accepting_submissions, retakes_allowed, class_id')
    .eq('id', assessmentId)
    .single()

  if (!assessment || assessment.state !== 'active') {
    return { submission: null, error: 'Assessment is not available' }
  }

  if (assessment.mode === 'live') {
    return { submission: null, error: 'Live assessments are taken through the live session page' }
  }

  // The student must be enrolled in the assessment's class before writing anything.
  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', assessment.class_id)
    .maybeSingle()

  if (!enrollment) {
    return { submission: null, error: 'You are not enrolled in this class' }
  }

  // The accepting_submissions gate applies to retakes as well as first attempts.
  if (assessment.accepting_submissions === false) {
    return { submission: null, error: 'Assessment is not currently accepting submissions' }
  }

  if (opts?.retake) {
    if (!assessment.retakes_allowed) {
      return { submission: null, error: 'Retakes are not allowed for this assessment' }
    }
    // Expire any existing in_progress submission from a previous retake
    if (existing) {
      await expireSubmission(existing.id)
    }
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      assessment_id: assessmentId,
      student_id: studentId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    return { submission: null, error: error.message }
  }

  return { submission: data as SubmissionData, error: null }
}

export async function getSubmission(
  submissionId: string,
  studentId: string,
): Promise<SubmissionWithAnswers | null> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .single()

  if (!submission) return null

  const { data: answers } = await supabase
    .from('answers')
    .select('*')
    .eq('submission_id', submissionId)

  return { ...(submission as SubmissionData), answers: (answers as AnswerData[]) ?? [] }
}

export async function getActiveSubmission(
  studentId: string,
  assessmentId: string,
): Promise<StudentActiveSubmission | null> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('assessment_id', assessmentId)
    .eq('status', 'in_progress')
    .maybeSingle()

  if (!submission) return null

  if (submission.status === 'in_progress') {
    const overdue = await isSubmissionOverdue(submission)
    if (overdue) {
      await expireSubmission(submission.id)
      return null
    }
  }

  // Grading columns are deliberately excluded: an attempt reopened by a time
  // extension keeps its previous Essay/Coding grades until resubmitted, and
  // those must not reach the student while scores are unreleased.
  const { data: answers } = await supabase
    .from('answers')
    .select('id, question_id, answer_content')
    .eq('submission_id', submission.id)

  return { ...(submission as SubmissionData), answers: (answers as StudentActiveAnswer[]) ?? [] }
}

export async function saveAnswer(
  submissionId: string,
  questionId: string,
  studentId: string,
  answerContent: Record<string, unknown>,
): Promise<AnswerResult> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, status, assessment_id, started_at, extra_seconds')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .single()

  if (!submission) {
    return { error: 'Submission not found' }
  }

  if (submission.status !== 'in_progress') {
    return { error: 'Cannot modify a submitted assessment' }
  }

  // Enforce the deadline on the write path: if the submission is overdue,
  // force it through the expiry path and reject the write.
  const overdue = await isSubmissionOverdue(submission)
  if (overdue) {
    await expireSubmission(submissionId, studentId)
    return { error: 'Time has expired. This assessment has been auto-submitted.' }
  }

  const { error } = await supabase
    .from('answers')
    .upsert({
      submission_id: submissionId,
      question_id: questionId,
      answer_content: answerContent,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'submission_id,question_id' })

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}

export async function submitAssessment(
  submissionId: string,
  studentId: string,
): Promise<SubmissionResult> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, status, assessment_id, started_at, extra_seconds')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .single()

  if (!submission) {
    return { submission: null, error: 'Submission not found' }
  }

  if (submission.status !== 'in_progress') {
    return { submission: null, error: 'Assessment already submitted' }
  }

  // Overdue submissions are expired, never marked as a manual submit.
  const overdue = await isSubmissionOverdue(submission)
  if (overdue) {
    return expireSubmission(submissionId, studentId)
  }

  // Guarded transition: only an in_progress submission can become submitted.
  // `.select()` makes the race authoritative — the caller that loses a
  // concurrent double-submit gets no row back and never runs grading, so
  // grading happens exactly once.
  const { data: transitioned, error: updateError } = await supabase
    .from('submissions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'in_progress')
    .select('status')
    .maybeSingle()

  if (updateError) {
    return { submission: null, error: updateError.message }
  }

  if (!transitioned || transitioned.status !== 'submitted') {
    // Another writer transitioned the submission first (double submit).
    return { submission: null, error: 'Assessment already submitted' }
  }

  await gradeSubmission(createServiceClient(), submissionId)

  const { data: updated } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  return { submission: updated as SubmissionData, error: null }
}

export async function expireSubmission(
  submissionId: string,
  studentId?: string,
  opts?: { force?: boolean },
): Promise<SubmissionResult> {
  const supabase = createServiceClient()

  if (!opts?.force) {
    let existingQuery = supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)

    if (studentId) {
      existingQuery = existingQuery.eq('student_id', studentId)
    }

    const { data: existing } = await existingQuery.maybeSingle()

    if (existing?.status === 'in_progress') {
      const assessment = await getSubmissionTimingAssessment(supabase, existing.assessment_id)
      const deadlineState = assessment && assessment.mode === 'timed' && assessment.duration_minutes
        ? getDeadlineState(existing.started_at, assessment.duration_minutes, existing.extra_seconds ?? 0)
        : null

      if (deadlineState && !deadlineState.overdue) {
        return {
          submission: existing as SubmissionData,
          error: null,
          remainingSeconds: deadlineState.remainingSeconds,
          overdue: false,
          deadline: deadlineState.deadline,
        }
      }
    }
  }

  let updateQuery = supabase
    .from('submissions')
    .update({
      status: 'expired',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'in_progress')

  if (studentId) {
    updateQuery = updateQuery.eq('student_id', studentId)
  }

  // Guarded transition: `.select()` makes the race authoritative. When
  // another writer transitioned the submission first (a concurrent manual
  // submit or expiry), this matched 0 rows and grading must be skipped so
  // exactly one caller grades.
  const { data: transitioned, error } = await updateQuery.select('status').maybeSingle()

  if (error) {
    return { submission: null, error: error.message }
  }

  if (transitioned) {
    await gradeSubmission(createServiceClient(), submissionId)
  }

  const { data: updated } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  return { submission: updated as SubmissionData, error: null }
}

export async function extendSubmissionTime(
  submissionId: string,
  grantorUserId: string,
  minutes: number,
): Promise<SubmissionResult> {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    return { submission: null, error: 'Minutes must be a positive integer' }
  }

  const supabase = createServiceClient()
  const grantedSeconds = minutes * 60

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  if (!submission) {
    return { submission: null, error: 'Submission not found' }
  }

  const assessment = await getSubmissionTimingAssessment(supabase, submission.assessment_id)
  if (!assessment || assessment.mode !== 'timed' || !assessment.duration_minutes) {
    return { submission: null, error: 'Time extensions are only available for timed assessments' }
  }

  if (assessment.state === 'draft') {
    return { submission: null, error: 'Draft assessments cannot receive time extensions' }
  }

  const { data: owningClass } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id!)
    .eq('instructor_id', grantorUserId)
    .single()

  if (!owningClass) {
    return { submission: null, error: 'Not authorized' }
  }

  const { data: currentInProgress } = await supabase
    .from('submissions')
    .select('id')
    .eq('student_id', submission.student_id)
    .eq('assessment_id', submission.assessment_id)
    .eq('status', 'in_progress')
    .maybeSingle()

  if (submission.status === 'in_progress') {
    if (currentInProgress?.id !== submission.id) {
      return { submission: null, error: 'Only the current in-progress submission can be extended' }
    }

    // Atomic increment with a status guard: a concurrent manual submit or
    // expiry makes this match zero rows instead of stacking seconds onto a
    // dead submission, and two concurrent grants can no longer lose one.
    const { data: updatedRows, error: updateError } = await supabase.rpc('increment_extra_seconds', {
      p_submission_id: submission.id,
      p_seconds: grantedSeconds,
    })

    if (updateError) {
      return { submission: null, error: updateError.message }
    }

    const updated = (updatedRows as SubmissionData[] | null)?.[0]
    if (!updated) {
      return { submission: null, error: 'Submission is no longer in progress' }
    }

    return { submission: updated, error: null }
  }

  if (submission.status !== 'submitted' && submission.status !== 'expired') {
    return { submission: null, error: 'Submission is not eligible for a time extension' }
  }

  const { data: latestFinished } = await supabase
    .from('submissions')
    .select('id')
    .eq('student_id', submission.student_id)
    .eq('assessment_id', submission.assessment_id)
    .in('status', ['submitted', 'expired'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestFinished?.id !== submission.id) {
    return { submission: null, error: 'Only the latest finished submission can be reopened' }
  }

  if (currentInProgress && currentInProgress.id !== submission.id) {
    return { submission: null, error: 'The student already has an in-progress submission' }
  }

  const oldDeadline = computeDeadline(submission.started_at, assessment.duration_minutes, submission.extra_seconds ?? 0)
  const now = Date.now()
  const newExtraSeconds = (submission.extra_seconds ?? 0) + Math.floor((now - oldDeadline) / 1000) + grantedSeconds

  const { data: transitioned, error: transitionError } = await supabase
    .from('submissions')
    .update({
      status: 'in_progress',
      submitted_at: null,
      score_total: null,
      violations: 0,
      extra_seconds: newExtraSeconds,
    })
    .eq('id', submission.id)
    .eq('status', submission.status)
    .select('*')
    .maybeSingle()

  if (transitionError) {
    return { submission: null, error: transitionError.message }
  }

  if (!transitioned || transitioned.status !== 'in_progress') {
    return { submission: null, error: 'Submission is no longer eligible for reopening' }
  }

  // Best-effort reset of auto-grading on the reopened attempt. Failure is
  // non-fatal and NOT reported as a failed reopen (the row is already
  // in_progress; reporting an error made instructors retry and stack grant
  // seconds). Stale values are safe: grading recomputes every answer on the
  // next submit, and getActiveSubmission no longer exposes these columns.
  const { data: autoQuestions } = await supabase
    .from('questions')
    .select('id')
    .eq('assessment_id', submission.assessment_id)
    .in('type', ['MultipleChoice', 'TrueOrFalse', 'FillInTheBlank'])

  const autoQuestionIds = (autoQuestions ?? []).map((question) => question.id)
  if (autoQuestionIds.length > 0) {
    await supabase
      .from('answers')
      .update({ is_correct: null, score: null })
      .eq('submission_id', submission.id)
      .in('question_id', autoQuestionIds)
  }

  return { submission: transitioned as SubmissionData, error: null }
}

export async function getSubmissionRemainingTime(
  submissionId: string,
  studentId: string,
): Promise<RemainingTimeResult> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, status, assessment_id, started_at, extra_seconds')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (!submission) {
    return { error: 'Submission not found', remainingSeconds: 0, extraSeconds: 0, overdue: true, deadline: null }
  }

  if (submission.status !== 'in_progress') {
    return {
      error: 'Submission is not in progress',
      remainingSeconds: 0,
      extraSeconds: submission.extra_seconds ?? 0,
      overdue: true,
      deadline: null,
    }
  }

  const assessment = await getSubmissionTimingAssessment(supabase, submission.assessment_id)
  if (!assessment || assessment.mode !== 'timed' || !assessment.duration_minutes) {
    return {
      error: 'Submission is not timed',
      remainingSeconds: 0,
      extraSeconds: submission.extra_seconds ?? 0,
      overdue: false,
      deadline: null,
    }
  }

  const deadlineState = getDeadlineState(submission.started_at, assessment.duration_minutes, submission.extra_seconds ?? 0)
  return {
    error: null,
    remainingSeconds: deadlineState.remainingSeconds,
    extraSeconds: submission.extra_seconds ?? 0,
    overdue: deadlineState.overdue,
    deadline: deadlineState.deadline,
  }
}

export async function getSubmissionForGrading(
  submissionId: string,
): Promise<SubmissionWithAnswers & { assessment_title: string } | null> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  if (!submission) return null

  if (submission.status === 'in_progress') {
    const overdue = await isSubmissionOverdue(submission)
    if (overdue) {
      await expireSubmission(submission.id)
      const { data: refreshed } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .single()
      if (refreshed) {
        submission.status = refreshed.status
        submission.submitted_at = refreshed.submitted_at
        submission.score_total = refreshed.score_total
      }
    }
  }

  const { data: allAnswers } = await supabase
    .from('answers')
    .select('*, questions!inner(type, content, points, order_index)')
    .eq('submission_id', submissionId)

  // Fetch all questions to fill in unanswered ones
  const { data: allQuestions } = await supabase
    .from('questions')
    .select('id, type, content, points, order_index')
    .eq('assessment_id', submission.assessment_id)
    .order('order_index')

  const answeredIds = new Set((allAnswers ?? []).map((a) => a.question_id))
  const unanswered = (allQuestions ?? []).filter((q) => !answeredIds.has(q.id))

  const placeholderAnswers: (AnswerData & { questions: { type: string; content: Record<string, unknown>; points: number; order_index: number } })[] = unanswered.map((q) => ({
    id: `_unanswered_${submissionId}_${q.id}`,
    submission_id: submissionId,
    question_id: q.id,
    answer_content: {} as Record<string, unknown>,
    score: null,
    is_correct: null,
    feedback: null,
    questions: {
      type: q.type,
      content: q.content as Record<string, unknown>,
      points: q.points,
      order_index: q.order_index,
    },
  }))

  const mergedAnswers = [...((allAnswers ?? []) as typeof placeholderAnswers), ...placeholderAnswers]
  mergedAnswers.sort((a, b) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0))

  const { data: assessment } = await supabase
    .from('assessments')
    .select('title')
    .eq('id', submission.assessment_id)
    .single()

  return {
    ...(submission as SubmissionData),
    assessment_title: assessment?.title ?? '',
    answers: mergedAnswers as AnswerData[],
  }
}

export async function getSubmissionsForAssessment(
  assessmentId: string,
  limit = 50,
  offset = 0,
  search?: string,
): Promise<{
  submissions: (SubmissionData & { student_name: string; student_email: string; pending_count: number; remaining_seconds: number | null })[]
  total: number
}> {
  const supabase = createServiceClient()

  // If searching, first find matching student IDs. Match against the real
  // profile columns — an earlier version filtered on users.name, which does
  // not exist, so every search errored and returned zero rows.
  let studentFilter: string[] | undefined
  if (search) {
    const { data: matchingStudents } = await supabase
      .from('users')
      .select('id')
      .or(`firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%`)
    studentFilter = (matchingStudents ?? []).map((s) => s.id)
    if (studentFilter.length === 0) return { submissions: [], total: 0 }
  }

  const countQuery = supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('assessment_id', assessmentId)
  const { count } = await (studentFilter ? countQuery.in('student_id', studentFilter) : countQuery)

  // Filter before windowing so matches beyond the current slice are visible.
  let dataQuery = supabase
    .from('submissions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('started_at', { ascending: false })
  if (studentFilter) {
    dataQuery = dataQuery.in('student_id', studentFilter)
  }
  dataQuery = dataQuery.range(offset, offset + limit - 1)

  const { data: submissions } = await dataQuery

  if (!submissions || submissions.length === 0) return { submissions: [], total: count ?? 0 }

  let timedAssessmentDuration: number | null = null

  // Expire any overdue in_progress submissions so pending counts are accurate
  const inProgress = submissions.filter((s) => s.status === 'in_progress')
  if (inProgress.length > 0) {
    const { data: assessment } = await supabase
      .from('assessments')
      .select('duration_minutes, mode')
      .eq('id', assessmentId)
      .single()

    if (assessment && assessment.mode === 'timed' && assessment.duration_minutes) {
      timedAssessmentDuration = assessment.duration_minutes
      const now = Date.now()
      for (const s of inProgress) {
        const deadline = computeDeadline(s.started_at, assessment.duration_minutes, s.extra_seconds ?? 0)
        if (now > deadline) {
          await expireSubmission(s.id)
          // Refresh the row we return: the instructor dialog classifies
          // grant-vs-reopen by this status, and a stale 'in_progress' here
          // silently skips the destructive-reopen warning.
          s.status = 'expired'
        }
      }
    }
  }

  const studentIds = submissions.map((s) => s.student_id)
  const { data: students } = await supabase
    .from('users')
    .select('id, firstname, lastname, email')
    .in('id', studentIds)

  const studentMap = new Map((students ?? []).map((s) => [s.id, s]))

  const submissionIds = submissions.map((s) => s.id)
  const { data: pendingAnswers } = await supabase
    .from('answers')
    .select('submission_id, questions!inner(type)')
    .in('submission_id', submissionIds)
    .is('score', null)
    .in('questions.type', ['Essay', 'Coding'])

  const pendingBySubmission = new Map<string, number>()
  for (const pa of pendingAnswers ?? []) {
    pendingBySubmission.set(pa.submission_id, (pendingBySubmission.get(pa.submission_id) ?? 0) + 1)
  }

  const { data: manualQuestions } = await supabase
    .from('questions')
    .select('id')
    .eq('assessment_id', assessmentId)
    .in('type', ['Essay', 'Coding'])

  if (manualQuestions && manualQuestions.length > 0) {
    const manualQuestionIds = new Set(manualQuestions.map((q) => q.id))

    const { data: allAnswers } = await supabase
      .from('answers')
      .select('submission_id, question_id')
      .in('submission_id', submissionIds)
      .in('question_id', Array.from(manualQuestionIds))

    const answeredBySubmission = new Map<string, Set<string>>()
    for (const a of allAnswers ?? []) {
      if (!answeredBySubmission.has(a.submission_id)) {
        answeredBySubmission.set(a.submission_id, new Set())
      }
      answeredBySubmission.get(a.submission_id)!.add(a.question_id)
    }

    for (const s of submissions) {
      const answered = answeredBySubmission.get(s.id) ?? new Set()
      let unansweredCount = 0
      for (const qId of manualQuestionIds) {
        if (!answered.has(qId)) unansweredCount++
      }
      if (unansweredCount > 0) {
        pendingBySubmission.set(s.id, (pendingBySubmission.get(s.id) ?? 0) + unansweredCount)
      }
    }
  }

  const remainingBySubmission = new Map<string, number>()
  if (timedAssessmentDuration) {
    const now = Date.now()
    for (const s of submissions) {
      if (s.status !== 'in_progress') continue
      const deadline = computeDeadline(s.started_at, timedAssessmentDuration, s.extra_seconds ?? 0)
      remainingBySubmission.set(s.id, remainingSeconds(deadline, now))
    }
  }

  return {
    submissions: submissions.map((s) => ({
      ...(s as SubmissionData),
      student_name: (() => {
        const st = studentMap.get(s.student_id)
        if (!st) return 'Unknown'
        // Surname-first for student lists: sorts and scans by family name.
        return [st.lastname, st.firstname].filter(Boolean).join(' ') || 'Unknown'
      })(),
      student_email: studentMap.get(s.student_id)?.email ?? 'Unknown',
      pending_count: pendingBySubmission.get(s.id) ?? 0,
      remaining_seconds: remainingBySubmission.get(s.id) ?? null,
    })),
    total: count ?? 0,
  }
}

export async function convertLiveSession(
  sessionId: string,
  assessmentId: string,
  startedAt: string,
): Promise<void> {
  const supabase = createServiceClient()

  const { data: liveAnswers } = await supabase
    .from('live_answers')
    .select('*')
    .eq('session_id', sessionId)

  if (!liveAnswers || liveAnswers.length === 0) return

  const byStudent = new Map<string, typeof liveAnswers>()
  for (const a of liveAnswers) {
    const list = byStudent.get(a.student_id) || []
    list.push(a)
    byStudent.set(a.student_id, list)
  }

  const now = new Date().toISOString()

  for (const [studentId, answers] of byStudent) {
    const { data: submission } = await supabase
      .from('submissions')
      .insert({
        assessment_id: assessmentId,
        student_id: studentId,
        status: 'submitted',
        started_at: startedAt,
        submitted_at: now,
      })
      .select('id')
      .single()

    if (!submission) continue

    for (const a of answers) {
      await supabase
        .from('answers')
        .upsert({
          submission_id: submission.id,
          question_id: a.question_id,
          answer_content: a.answer_content,
        }, { onConflict: 'submission_id,question_id' })
    }

    await gradeSubmission(supabase, submission.id)
  }
}

export async function recalculateAssessmentScores(
  assessmentId: string,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { data: questions } = await supabase
    .from('questions')
    .select('id')
    .eq('assessment_id', assessmentId)

  const currentQuestionIds = new Set((questions ?? []).map((q) => q.id))

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id')
    .in('status', ['submitted', 'expired'])
    .eq('assessment_id', assessmentId)

  if (!submissions || submissions.length === 0) {
    return { error: null }
  }

  for (const submission of submissions) {
    if (currentQuestionIds.size > 0) {
      const { data: existingAnswers } = await supabase
        .from('answers')
        .select('id, question_id')
        .eq('submission_id', submission.id)

      const danglingIds = (existingAnswers ?? [])
        .filter((a) => !currentQuestionIds.has(a.question_id))
        .map((a) => a.id)

      if (danglingIds.length > 0) {
        await supabase
          .from('answers')
          .delete()
          .in('id', danglingIds)
      }
    }

    await gradeSubmission(supabase, submission.id)
  }

  return { error: null }
}

export async function gradeAnswer(
  answerId: string,
  score: number,
  feedback: string | null,
  instructorId?: string,
): Promise<{ error: string | null }> {
  if (score < 0) return { error: 'Score cannot be negative' }

  const supabase = createServiceClient()

  let questionId: string
  let submissionId: string
  let answerRowId: string | null = null

  if (answerId.startsWith('_unanswered_')) {
    const parts = answerId.replace('_unanswered_', '').split('_')
    submissionId = parts[0]
    questionId = parts.slice(1).join('_')

    // Validate the composite ID against the database: the submission must
    // exist and the question must belong to that submission's assessment.
    const { data: submissionCheck } = await supabase
      .from('submissions')
      .select('id, assessment_id')
      .eq('id', submissionId)
      .single()

    if (!submissionCheck) return { error: 'Answer not found' }

    const { data: questionCheck } = await supabase
      .from('questions')
      .select('id')
      .eq('id', questionId)
      .eq('assessment_id', submissionCheck.assessment_id)
      .single()

    if (!questionCheck) return { error: 'Question not found' }
  } else {
    const { data: answer } = await supabase
      .from('answers')
      .select('id, submission_id, question_id')
      .eq('id', answerId)
      .single()

    if (!answer) return { error: 'Answer not found' }
    submissionId = answer.submission_id
    questionId = answer.question_id
    answerRowId = answer.id
  }

  // Object-level ownership: the grading instructor must own the assessment's class.
  if (instructorId) {
    const authorized = await verifySubmissionOwnership(instructorId, submissionId)
    if (!authorized) return { error: 'Not authorized' }
  }

  const { data: question } = await supabase
    .from('questions')
    .select('type, points')
    .eq('id', questionId)
    .single()

  if (!question) return { error: 'Question not found' }

  // Manual grading is restricted to Essay and Coding questions.
  if (question.type !== 'Essay' && question.type !== 'Coding') {
    return { error: `Cannot manually grade a ${question.type} question` }
  }

  if (score > question.points) return { error: `Score exceeds maximum of ${question.points}` }

  if (answerRowId) {
    const { error } = await supabase
      .from('answers')
      .update({ score, feedback, is_correct: null })
      .eq('id', answerRowId)

    if (error) return { error: error.message }
  } else {
    const createError = await createAndGradeAnswer(supabase, submissionId, questionId, score, feedback)
    if (createError.error) return createError
  }

  await recalculateTotal(submissionId)

  return { error: null }
}

async function isSubmissionOverdue(submission: { assessment_id: string; started_at: string; extra_seconds?: number }): Promise<boolean> {
  const supabase = createServiceClient()

  const assessment = await getSubmissionTimingAssessment(supabase, submission.assessment_id)

  if (!assessment || assessment.mode !== 'timed' || !assessment.duration_minutes) return false

  return getDeadlineState(submission.started_at, assessment.duration_minutes, submission.extra_seconds ?? 0).overdue
}

async function getSubmissionTimingAssessment(
  supabase: ReturnType<typeof createServiceClient>,
  assessmentId: string,
): Promise<SubmissionTimingAssessment | null> {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('duration_minutes, mode, state, class_id')
    .eq('id', assessmentId)
    .single()

  return (assessment as SubmissionTimingAssessment | null) ?? null
}

function getDeadlineState(startedAt: string, durationMinutes: number, extraSeconds: number): DeadlineState {
  const deadline = computeDeadline(startedAt, durationMinutes, extraSeconds)
  const now = Date.now()

  return {
    deadline,
    remainingSeconds: remainingSeconds(deadline, now),
    overdue: now > deadline,
  }
}

async function createAndGradeAnswer(
  supabase: ReturnType<typeof createServiceClient>,
  submissionId: string,
  questionId: string,
  score: number,
  feedback: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('answers')
    .upsert({
      submission_id: submissionId,
      question_id: questionId,
      answer_content: {},
      score,
      is_correct: null,
      feedback,
    }, { onConflict: 'submission_id,question_id' })

  if (error) return { error: error.message }

  await recalculateTotal(submissionId)

  return { error: null }
}

async function gradeSubmission(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<void> {
  const { data: submission } = await supabase
    .from('submissions')
    .select('assessment_id')
    .eq('id', submissionId)
    .single()

  if (!submission) return

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', submission.assessment_id)

  if (!questions) return

  const { data: answers } = await supabase
    .from('answers')
    .select('*')
    .eq('submission_id', submissionId)

  const answeredQuestionIds = new Set((answers ?? []).map((a) => a.question_id))

  for (const answer of answers ?? []) {
    const question = questions.find((q) => q.id === answer.question_id)
    if (!question) continue

    const content = question.content as Record<string, unknown>
    const answerContent = answer.answer_content as Record<string, unknown>

    const qType = questionTypeRegistry[question.type]
    let score: number | null = null
    let isCorrect: boolean | null = null

    if (qType) {
      const result = qType.gradeAnswer(content, answerContent, question.points)
      score = result.score
      isCorrect = result.isCorrect
    }

    const isManual = question.type === 'Essay' || question.type === 'Coding'
    const isEmpty = !answerContent || Object.keys(answerContent).length === 0

    if (score === null && answer.score !== null && answer.score !== undefined) {
      score = answer.score
      isCorrect = answer.is_correct
    }

    if (isManual && isEmpty && score === null) {
      score = 0
    }

    await supabase
      .from('answers')
      .update({ score, is_correct: isCorrect })
      .eq('id', answer.id)
  }

  for (const question of questions) {
    if (answeredQuestionIds.has(question.id)) continue

    const isManual = question.type === 'Essay' || question.type === 'Coding'
    await supabase
      .from('answers')
      .upsert({
        submission_id: submissionId,
        question_id: question.id,
        answer_content: {},
        score: 0,
        is_correct: isManual ? null : false,
        feedback: null,
      }, { onConflict: 'submission_id,question_id' })
  }

  await recalculateTotal(submissionId)
}

async function recalculateTotal(submissionId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: answers } = await supabase
    .from('answers')
    .select('score')
    .eq('submission_id', submissionId)

  const total = answers?.reduce((sum, a) => sum + (a.score ?? 0), 0) ?? 0

  await supabase
    .from('submissions')
    .update({ score_total: total })
    .eq('id', submissionId)
}

export interface SubmissionResultAnswer extends AnswerData {
  questions: {
    type: string
    content: Record<string, unknown>
    points: number
    order_index: number
  }
}

export interface StudentSubmissionResults {
  resultStatus: 'released' | 'hidden' | 'no-submission'
  assessment: {
    title: string
    scores_released: boolean
    answer_reveal_enabled: boolean
    total_points: number
  }
  submission: SubmissionData | null
  answers: SubmissionResultAnswer[] | null
}

export interface SubmissionHistoryItem {
  id: string
  attempt_number: number
  score_total: number | null
  status: string
  submitted_at: string | null
  started_at: string
}

export async function getStudentSubmissionHistory(
  assessmentId: string,
  studentId: string,
): Promise<SubmissionHistoryItem[]> {
  const supabase = createServiceClient()

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, score_total, status, submitted_at, started_at')
    .eq('student_id', studentId)
    .eq('assessment_id', assessmentId)
    .in('status', ['submitted', 'expired'])
    .order('started_at', { ascending: true })

  if (!submissions || submissions.length === 0) return []

  // Strip score values server-side while scores are unreleased.
  const { data: assessment } = await supabase
    .from('assessments')
    .select('scores_released')
    .eq('id', assessmentId)
    .single()

  const released = assessment?.scores_released === true

  return submissions.map((s, idx) => ({
    ...s,
    score_total: released ? s.score_total : null,
    attempt_number: idx + 1,
  }))
}

function sanitizeQuestionContent(content: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...content }
  delete sanitized.correctAnswer
  delete sanitized.correctIndex
  // Options are the answer choices, not grading data — the student saw them
  // while answering and the breakdown needs them to render the answer.
  return sanitized
}

export async function getStudentSubmissionResults(
  assessmentId: string,
  studentId: string,
): Promise<StudentSubmissionResults | null> {
  const supabase = createServiceClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title, scores_released, answer_reveal_enabled')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return null

  const { data: questions } = await supabase
    .from('questions')
    .select('points')
    .eq('assessment_id', assessmentId)

  const totalPoints = questions?.reduce((sum, q) => sum + q.points, 0) ?? 0

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('assessment_id', assessmentId)
    .in('status', ['submitted', 'expired'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!submission) {
    return {
      resultStatus: 'no-submission',
      assessment: {
        title: assessment.title,
        scores_released: assessment.scores_released,
        answer_reveal_enabled: assessment.answer_reveal_enabled,
        total_points: totalPoints,
      },
      submission: null,
      answers: null,
    }
  }

  const { data: answers } = await supabase
    .from('answers')
    .select('*, questions!inner(id, type, content, points, order_index)')
    .eq('submission_id', submission.id)

  let resultAnswers = (answers as SubmissionResultAnswer[]) ?? []

  // Fill in unanswered questions so they appear in results
  const answeredIds = new Set(resultAnswers.map((a) => a.question_id))
  const { data: allQuestions } = await supabase
    .from('questions')
    .select('id, type, content, points, order_index')
    .eq('assessment_id', assessmentId)
    .order('order_index')

  const unanswered = (allQuestions ?? []).filter((q) => !answeredIds.has(q.id))
  if (unanswered.length > 0) {
    const placeholderAnswers = unanswered.map((q) => ({
      id: `_unanswered_${submission.id}_${q.id}`,
      submission_id: submission.id,
      question_id: q.id,
      answer_content: {} as Record<string, unknown>,
      score: null as number | null,
      is_correct: null as boolean | null,
      feedback: null as string | null,
      questions: {
        id: q.id,
        type: q.type,
        content: q.content as Record<string, unknown>,
        points: q.points,
        order_index: q.order_index,
      },
    }))
    resultAnswers = [...resultAnswers, ...placeholderAnswers]
  }

  resultAnswers.sort((a, b) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0))

  // Two independent gates (CONTEXT.md): the total follows score release;
  // per-question grading data and the answer key follow answer reveal.
  // Per-question correctness is as revealing as the key itself, so BOTH
  // per-answer fields and key content stay hidden until their own gate opens,
  // regardless of the other setting's state.
  if (!assessment.answer_reveal_enabled) {
    resultAnswers = resultAnswers.map((a) => ({
      ...a,
      questions: {
        ...a.questions,
        content: sanitizeQuestionContent(a.questions.content),
      },
    }))
  }

  let resultSubmission = submission as SubmissionData

  if (!assessment.scores_released) {
    resultSubmission = { ...resultSubmission, score_total: null }
  }

  if (!assessment.scores_released || !assessment.answer_reveal_enabled) {
    resultAnswers = resultAnswers.map((a) => ({
      ...a,
      score: null,
      is_correct: null,
      feedback: null,
    }))
  }

  return {
    resultStatus: assessment.scores_released ? 'released' : 'hidden',
    assessment: {
      title: assessment.title,
      scores_released: assessment.scores_released,
      answer_reveal_enabled: assessment.answer_reveal_enabled,
      total_points: totalPoints,
    },
    submission: resultSubmission,
    answers: resultAnswers,
  }
}

export async function deleteSubmission(
  submissionId: string,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('submissions')
    .delete()
    .eq('id', submissionId)

  if (error) return { error: error.message }

  return { error: null }
}

export async function verifySubmissionOwnership(
  instructorId: string,
  submissionId: string,
): Promise<boolean> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assessment_id')
    .eq('id', submissionId)
    .single()

  if (!submission) return false

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', submission.assessment_id)
    .single()

  if (!assessment) return false

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id)
    .eq('instructor_id', instructorId)
    .single()

  return !!cls
}

export interface ViolationResult {
  violations: number | null
  error: string | null
}

export async function recordViolation(
  submissionId: string,
  studentId: string,
): Promise<ViolationResult> {
  const supabase = createServiceClient()

  // Atomic increment via RPC: no read-modify-write lost updates, ownership
  // bound to the server-verified requesting student, and non-in-progress
  // rows ignored. EXECUTE on the function is service-role-only, so the
  // ownership argument can never be supplied (or nulled) from the wire.
  const { data, error } = await supabase.rpc('increment_violation', {
    p_submission_id: submissionId,
    p_student_id: studentId,
  })

  if (error) {
    return { violations: null, error: error.message }
  }

  const row = (data as { violations: number; status: string; assessment_id: string }[] | null)?.[0]

  if (!row) {
    // Not the owner, or the submission is not in progress — ignore silently.
    return { violations: null, error: null }
  }

  const violations = row.violations

  const { data: assessment } = await supabase
    .from('assessments')
    .select('proctoring_violations_allowed')
    .eq('id', row.assessment_id)
    .single()

  const limit = assessment?.proctoring_violations_allowed
  if (typeof limit === 'number' && violations >= limit) {
    // Reaching the limit auto-submits with status `expired`.
    await expireSubmission(submissionId, undefined, { force: true })
  }

  return { violations, error: null }
}
