'use server'

import { authorize } from '@/lib/auth/authorize'
import { verifyAssessmentOwnership } from '@/lib/assessment-service'
import {
  getSubmissionsForAssessment,
  getSubmissionForGrading,
  gradeAnswer,
  deleteSubmission,
  verifySubmissionOwnership,
} from '@/lib/submission-service'

export async function getAssessmentSubmissions(assessmentId: string, limit?: number, offset?: number, search?: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { submissions: [], total: 0, error: auth.error }

  const authorized = await verifyAssessmentOwnership(auth.userId, assessmentId)
  if (!authorized) return { submissions: [], total: 0, error: 'Not authorized' }

  const result = await getSubmissionsForAssessment(assessmentId, limit, offset, search)

  return { submissions: result.submissions, total: result.total, error: null }
}

export async function getSubmissionDetail(submissionId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return null

  return getSubmissionForGrading(submissionId)
}

export async function gradeAnswerAction(
  answerId: string,
  score: number,
  feedback: string | null,
) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  return gradeAnswer(answerId, score, feedback)
}

export async function deleteSubmissionAction(submissionId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const authorized = await verifySubmissionOwnership(auth.userId, submissionId)
  if (!authorized) return { error: 'Not authorized' }

  return deleteSubmission(submissionId)
}
