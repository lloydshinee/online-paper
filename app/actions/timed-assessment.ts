'use server'

import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import {
  startSubmission,
  saveAnswer,
  submitAssessment,
  getStudentSubmissionResults,
  getStudentSubmissionHistory,
  getActiveSubmission,
  recordViolation,
} from '@/lib/submission-service'
import {
  getStudentAssessments as getStudentAssessmentsService,
  getAllStudentAssessments as getAllStudentAssessmentsService,
  getAssessmentQuestions,
  getAssessmentTimeLimit,
} from '@/lib/assessment-service'

export async function getStudentClassAssessments(classId: string) {
  const auth = await authorize()
  if ('error' in auth) return { assessments: [], error: auth.error }

  return getStudentAssessmentsService(auth.userId, classId)
}

export async function getDashboardAssessments() {
  const auth = await authorize(['student'])
  if ('error' in auth) return { assessments: [], error: auth.error }

  return getAllStudentAssessmentsService(auth.userId)
}

export async function startAssessmentAction(assessmentId: string, retake = false) {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error, submissionId: null }

  const result = await startSubmission(auth.userId, assessmentId, retake ? { retake: true } : undefined)

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
  const questions = await getAssessmentQuestions(assessmentId)
  const timeLimit = await getAssessmentTimeLimit(assessmentId)

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, accepting_submissions, scores_released, answer_reveal_enabled, retakes_allowed, proctoring_violations_allowed')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return null

  if (assessment.state === 'draft') return null

  return { assessment, questions, timeLimit }
}

export async function getSubmissionResultsAction(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  return getStudentSubmissionResults(assessmentId, auth.userId)
}

export async function getSubmissionHistoryAction(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return []

  return getStudentSubmissionHistory(assessmentId, auth.userId)
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
