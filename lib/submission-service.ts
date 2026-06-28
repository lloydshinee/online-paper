import { createServiceClient } from '@/lib/supabase/service'
import { gradeSubmission } from '@/lib/auto-grader'

export interface SubmissionData {
  id: string
  assessment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  status: 'in_progress' | 'submitted' | 'expired'
  score_total: number | null
  violations: number
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

interface SubmissionResult {
  submission: SubmissionData | null
  error: string | null
}

interface AnswerResult {
  error: string | null
}

export async function startSubmission(
  studentId: string,
  assessmentId: string,
): Promise<SubmissionResult> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('assessment_id', assessmentId)
    .eq('status', 'in_progress')
    .maybeSingle()

  if (existing) {
    return { submission: existing as SubmissionData, error: null }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, state, duration_minutes, accepting_submissions')
    .eq('id', assessmentId)
    .single()

  if (!assessment || assessment.state !== 'active') {
    return { submission: null, error: 'Assessment is not available' }
  }

  if (assessment.accepting_submissions === false) {
    return { submission: null, error: 'Assessment is not currently accepting submissions' }
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
): Promise<SubmissionWithAnswers | null> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('assessment_id', assessmentId)
    .in('status', ['in_progress', 'submitted', 'expired'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!submission) return null

  const { data: answers } = await supabase
    .from('answers')
    .select('*')
    .eq('submission_id', submission.id)

  return { ...(submission as SubmissionData), answers: (answers as AnswerData[]) ?? [] }
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
    .select('id, status')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .single()

  if (!submission) {
    return { error: 'Submission not found' }
  }

  if (submission.status !== 'in_progress') {
    return { error: 'Cannot modify a submitted assessment' }
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
    .select('*')
    .eq('id', submissionId)
    .eq('student_id', studentId)
    .single()

  if (!submission) {
    return { submission: null, error: 'Submission not found' }
  }

  if (submission.status !== 'in_progress') {
    return { submission: null, error: 'Assessment already submitted' }
  }

  const { error } = await supabase
    .from('submissions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) {
    return { submission: null, error: error.message }
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
): Promise<SubmissionResult> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('submissions')
    .update({
      status: 'expired',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'in_progress')

  if (error) {
    return { submission: null, error: error.message }
  }

  await gradeSubmission(createServiceClient(), submissionId)

  const { data: updated } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  return { submission: updated as SubmissionData, error: null }
}

export async function getQuestionsForAssessment(
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

  const { data: allQuestions } = await supabase
    .from('questions')
    .select('id, type, content, points, order_index')
    .eq('assessment_id', submission.assessment_id)
    .order('order_index')

  const { data: existingAnswers } = await supabase
    .from('answers')
    .select('*')
    .eq('submission_id', submissionId)

  const answeredIds = new Set((existingAnswers ?? []).map((a) => a.question_id))
  const manualTypes = ['Essay', 'Coding']
  const unansweredManual = (allQuestions ?? []).filter(
    (q) => !answeredIds.has(q.id) && manualTypes.includes(q.type)
  )

  if (unansweredManual.length > 0) {
    const inserts = unansweredManual.map((q) => ({
      submission_id: submissionId,
      question_id: q.id,
      answer_content: {} as Record<string, unknown>,
      score: 0,
      is_correct: null,
      feedback: null,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('answers').upsert(inserts, { onConflict: 'submission_id,question_id' })
    await recalculateTotal(submissionId)
    const { data: updated } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single()
    if (updated) submission.score_total = updated.score_total
  }

  const { data: allAnswers } = await supabase
    .from('answers')
    .select('*, questions!inner(type, content, points, order_index)')
    .eq('submission_id', submissionId)

  const answeredIds2 = new Set((allAnswers ?? []).map((a) => a.question_id))
  const unansweredAuto = (allQuestions ?? [])
    .filter((q) => !answeredIds2.has(q.id))
    .map((q) => ({
      id: '',
      submission_id: submissionId,
      question_id: q.id,
      answer_content: {} as Record<string, unknown>,
      score: null,
      is_correct: null,
      feedback: null,
      questions: {
        type: q.type,
        content: q.content,
        points: q.points,
        order_index: q.order_index,
      },
    }))

  const mergedAnswers = [...(allAnswers ?? []), ...unansweredAuto].sort(
    (a, b) => ((a.questions as { order_index: number })?.order_index ?? 0) - ((b.questions as { order_index: number })?.order_index ?? 0)
  )

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
): Promise<(SubmissionData & { student_name: string; student_email: string; pending_count: number })[]> {
  const supabase = createServiceClient()

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('started_at', { ascending: false })

  if (!submissions) return []

  const studentIds = submissions.map((s) => s.student_id)
  const { data: students } = await supabase
    .from('users')
    .select('id, name, email')
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

  return submissions.map((s) => ({
    ...(s as SubmissionData),
    student_name: studentMap.get(s.student_id)?.name ?? 'Unknown',
    student_email: studentMap.get(s.student_id)?.email ?? 'Unknown',
    pending_count: pendingBySubmission.get(s.id) ?? 0,
  }))
}

export async function saveLiveAnswer(
  sessionId: string,
  studentId: string,
  questionId: string,
  answerContent: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('live_answers')
    .upsert({
      session_id: sessionId,
      student_id: studentId,
      question_id: questionId,
      answer_content: answerContent,
      auto_saved_at: new Date().toISOString(),
    }, { onConflict: 'session_id,student_id,question_id' })

  return { error: error ? error.message : null }
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

export async function gradeAnswer(
  answerId: string,
  score: number,
  feedback: string | null,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { data: answer } = await supabase
    .from('answers')
    .select('id, submission_id')
    .eq('id', answerId)
    .single()

  if (!answer) return { error: 'Answer not found' }

  const { error } = await supabase
    .from('answers')
    .update({ score, feedback, is_correct: null })
    .eq('id', answerId)

  if (error) return { error: error.message }

  await recalculateTotal(answer.submission_id)

  return { error: null }
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
  assessment: {
    title: string
    scores_released: boolean
    answer_reveal_enabled: boolean
    total_points: number
  }
  submission: SubmissionData | null
  answers: SubmissionResultAnswer[] | null
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

  return {
    assessment: {
      title: assessment.title,
      scores_released: assessment.scores_released,
      answer_reveal_enabled: assessment.answer_reveal_enabled,
      total_points: totalPoints,
    },
    submission: submission as SubmissionData,
    answers: (answers as SubmissionResultAnswer[]) ?? [],
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

export async function recordViolation(
  submissionId: string,
): Promise<void> {
  const supabase = createServiceClient()

  const { data: current } = await supabase
    .from('submissions')
    .select('violations')
    .eq('id', submissionId)
    .single()

  const next = (current?.violations ?? 0) + 1

  await supabase
    .from('submissions')
    .update({ violations: next })
    .eq('id', submissionId)
}
