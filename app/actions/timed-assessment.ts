'use server'

import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import {
  startSubmission,
  saveAnswer,
  submitAssessment,
  getQuestionsForAssessment,
  getAssessmentTimeLimit,
  getStudentSubmissionResults,
  getActiveSubmission,
  recordViolation,
} from '@/lib/submission-service'

export async function getStudentClassAssessments(classId: string) {
  const auth = await authorize()
  if ('error' in auth) return { assessments: [], error: auth.error }

  const supabase = await createClient()
  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', auth.userId)
    .eq('class_id', classId)
    .maybeSingle()

  if (!enrollment) return { assessments: [], error: 'Not enrolled' }

  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, accepting_submissions, scores_released, created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  if (!assessments || assessments.length === 0) {
    return { assessments: [], error: null }
  }

  const assessmentIds = assessments.map((a) => a.id)
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, assessment_id, status, score_total')
    .eq('student_id', auth.userId)
    .in('assessment_id', assessmentIds)

  const submissionByAssessment = new Map<string, { status: string; score_total: number | null }>()
  for (const s of submissions ?? []) {
    if (!submissionByAssessment.has(s.assessment_id)) {
      submissionByAssessment.set(s.assessment_id, { status: s.status, score_total: s.score_total })
    }
  }

  const assessmentsWithSubs = assessments.map((a) => ({
    ...a,
    submission: submissionByAssessment.get(a.id) ?? null,
  }))

  return { assessments: assessmentsWithSubs, error: null }
}

export async function startAssessmentAction(assessmentId: string) {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error, submissionId: null }

  const result = await startSubmission(auth.userId, assessmentId)

  if (result.error) {
    return { error: result.error, submissionId: null }
  }

  return { error: null, submissionId: result.submission!.id }
}

export async function saveAnswerAction(
  submissionId: string,
  questionId: string,
  answerContent: Record<string, unknown>,
) {
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error }

  return saveAnswer(submissionId, questionId, auth.userId, answerContent)
}

export async function submitAssessmentAction(submissionId: string) {
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error }

  return submitAssessment(submissionId, auth.userId)
}

export async function getAssessmentData(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  const supabase = await createClient()
  const questions = await getQuestionsForAssessment(assessmentId)
  const timeLimit = await getAssessmentTimeLimit(assessmentId)

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, accepting_submissions, scores_released, answer_reveal_enabled, proctoring_violations_allowed')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return null

  return { assessment, questions, timeLimit }
}

export async function getSubmissionResultsAction(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  return getStudentSubmissionResults(assessmentId, auth.userId)
}

export async function getActiveSubmissionAction(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  return getActiveSubmission(auth.userId, assessmentId)
}

export async function recordViolationAction(submissionId: string) {
  const auth = await authorize()
  if ('error' in auth) return

  await recordViolation(submissionId)
}
