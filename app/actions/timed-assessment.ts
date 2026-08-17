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
  expireSubmission,
  extendSubmissionTime,
  getSubmissionRemainingTime,
  verifySubmissionOwnership,
} from '@/lib/submission-service'
import {
  getStudentAssessments as getStudentAssessmentsService,
  getAllStudentAssessments as getAllStudentAssessmentsService,
  getAssessmentQuestionsForStudent,
  getAssessmentTimeLimit,
  verifyStudentEnrollment,
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

export async function expireAssessmentAction(submissionId: string, force = false) {
  const auth = await authorize()
  if ('error' in auth) {
    return { error: auth.error, submission: null, overdue: true, remainingSeconds: 0, deadline: null }
  }

  // Client auto-submit paths (timer zero, violation limit, resume-after-deadline)
  // must produce a submission with status `expired`, never `submitted`.
  return expireSubmission(submissionId, auth.userId, { force })
}

export async function grantTimeAction(submissionId: string, minutes: number) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error, submission: null }

  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) {
    return { error: 'Minutes must be a positive integer no greater than 1440', submission: null }
  }

  const authorized = await verifySubmissionOwnership(auth.userId, submissionId)
  if (!authorized) return { error: 'Not authorized', submission: null }

  return extendSubmissionTime(submissionId, auth.userId, minutes)
}

export async function getRemainingTimeAction(submissionId: string) {
  const auth = await authorize(['student'])
  if ('error' in auth) {
    return { error: auth.error, remainingSeconds: 0, extraSeconds: 0, overdue: true, deadline: null }
  }

  return getSubmissionRemainingTime(submissionId, auth.userId)
}

export async function getAssessmentData(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error, assessment: null, questions: [], timeLimit: null }

  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, accepting_submissions, scores_released, answer_reveal_enabled, retakes_allowed, proctoring_violations_allowed')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return { error: 'Assessment not found', assessment: null, questions: [], timeLimit: null }

  if (assessment.state === 'draft') return { error: 'Assessment is not available', assessment: null, questions: [], timeLimit: null }

  // Only enrolled students may read the take-page payload.
  const enrolled = await verifyStudentEnrollment(auth.userId, assessmentId)
  if (!enrolled) return { error: 'You are not enrolled in this class', assessment: null, questions: [], timeLimit: null }

  const questions = await getAssessmentQuestionsForStudent(assessmentId)
  const timeLimit = await getAssessmentTimeLimit(assessmentId)

  return { error: null, assessment, questions, timeLimit }
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
  if ('error' in auth) return { violations: null, error: auth.error }

  // The service scopes the write to the requesting student's own submission.
  return recordViolation(submissionId, auth.userId)
}
