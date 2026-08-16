'use server'

import { revalidatePath } from 'next/cache'
import { authorize } from '@/lib/auth/authorize'
import { getAssessmentBasic, verifyAssessmentOwnership } from '@/lib/assessment-service'
import {
  createLiveSession,
  startLiveSession,
  advanceLiveSession,
  endLiveSession,
  getLiveSession,
  getLiveSessionByAssessment,
  getLiveSessionForInstructor,
  getLiveSessionForStudent,
  getLiveSessionByAssessmentForStudent,
  getStudentLiveAnswer,
  getQuestionAnswerCount,
  getSessionAnswerCounts,
  hasActiveLiveSession,
  joinLiveSession,
  saveLiveAnswer,
} from '@/lib/live-session-service'

export async function createLiveSessionAction(assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { session: null, error: auth.error }

  const assessment = await getAssessmentBasic(assessmentId)
  if (!assessment) return { session: null, error: 'Assessment not found' }

  const result = await createLiveSession(auth.userId, assessmentId)

  if (assessment.class_id) {
    revalidatePath(`/dashboard/instructor/classes/${assessment.class_id}`)
  }

  return result
}

export async function startLiveSessionAction(sessionId: string, assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { session: null, error: auth.error }

  const assessment = await getAssessmentBasic(assessmentId)

  const result = await startLiveSession(sessionId, auth.userId)

  if (assessment?.class_id) {
    revalidatePath(`/dashboard/instructor/classes/${assessment.class_id}`)
  }

  return result
}

export async function advanceLiveSessionAction(
  sessionId: string,
  direction: 'next' | 'prev',
) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { session: null, question: null, error: auth.error }

  return advanceLiveSession(sessionId, auth.userId, direction)
}

export async function endLiveSessionAction(sessionId: string, assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { session: null, error: auth.error }

  const assessment = await getAssessmentBasic(assessmentId)

  const result = await endLiveSession(sessionId, auth.userId)

  if (assessment?.class_id) {
    revalidatePath(`/dashboard/instructor/classes/${assessment.class_id}`)
  }

  return result
}

export async function getLiveSessionAction(sessionId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  if (auth.role === 'student') {
    const view = await getLiveSessionForStudent(sessionId, auth.userId)
    return 'session' in view ? view : null
  }

  // Instructors must own the session's class before reading the raw session
  // (full question list incl. the answer key). Admins keep full visibility.
  if (auth.role === 'instructor') {
    return getLiveSessionForInstructor(sessionId, auth.userId)
  }

  return getLiveSession(sessionId)
}

export async function getLiveSessionByAssessmentAction(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  if (auth.role === 'student') {
    const view = await getLiveSessionByAssessmentForStudent(assessmentId, auth.userId)
    return 'session' in view ? view : null
  }

  // Instructor / admin: verify object-level ownership before returning the
  // full question list (which includes the answer key).
  if (auth.role === 'instructor') {
    const authorized = await verifyAssessmentOwnership(auth.userId, assessmentId)
    if (!authorized) return null
  }

  return getLiveSessionByAssessment(assessmentId)
}

/** Student-scoped: sanitized questions, only the current question. */
export async function getLiveSessionByAssessmentForStudentAction(assessmentId: string) {
  const auth = await authorize(['student'])
  if ('error' in auth) return null

  const view = await getLiveSessionByAssessmentForStudent(assessmentId, auth.userId)
  return 'session' in view ? view : null
}

/** Student-scoped: sanitized questions, only the current question. */
export async function getLiveSessionForStudentAction(sessionId: string) {
  const auth = await authorize(['student'])
  if ('error' in auth) return null

  const view = await getLiveSessionForStudent(sessionId, auth.userId)
  return 'session' in view ? view : null
}

/** Instructor-scoped: full session including the question list. */
export async function getLiveSessionByAssessmentInstructorAction(assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return null

  const authorized = await verifyAssessmentOwnership(auth.userId, assessmentId)
  if (!authorized) return null

  return getLiveSessionByAssessment(assessmentId)
}

export async function saveLiveAnswerAction(
  sessionId: string,
  questionId: string,
  answerContent: Record<string, unknown>,
) {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error }

  return saveLiveAnswer(sessionId, auth.userId, questionId, answerContent)
}

export async function getStudentLiveAnswerAction(
  sessionId: string,
  questionId: string,
) {
  const auth = await authorize(['student'])
  if ('error' in auth) return null

  return getStudentLiveAnswer(sessionId, auth.userId, questionId)
}

export async function getQuestionAnswerCountAction(
  sessionId: string,
  questionId: string,
): Promise<number> {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return 0

  return getQuestionAnswerCount(sessionId, questionId, auth.userId)
}

export async function getSessionAnswerCountsAction(
  sessionId: string,
  questionIds: string[],
): Promise<Record<string, number>> {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return {}

  return getSessionAnswerCounts(sessionId, questionIds, auth.userId)
}

export async function checkActiveLiveSessionAction() {
  const auth = await authorize(['student'])
  if ('error' in auth) return { sessionId: null, assessmentId: null }

  return hasActiveLiveSession(auth.userId)
}

export async function joinLiveSessionAction(sessionId: string) {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error }

  return joinLiveSession(sessionId, auth.userId)
}
