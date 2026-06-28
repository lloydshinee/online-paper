'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import { saveLiveAnswer } from '@/lib/submission-service'
import {
  createLiveSession,
  startLiveSession,
  advanceLiveSession,
  endLiveSession,
  getLiveSession,
  getLiveSessionByAssessment,
  getStudentLiveAnswer,
  hasActiveLiveSession,
} from '@/lib/live-session-service'

export async function createLiveSessionAction(assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { session: null, error: auth.error }

  const supabase = await createClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', assessmentId)
    .single()

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

  const supabase = await createClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', assessmentId)
    .single()

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

  const supabase = await createClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', assessmentId)
    .single()

  const result = await endLiveSession(sessionId, auth.userId)

  if (assessment?.class_id) {
    revalidatePath(`/dashboard/instructor/classes/${assessment.class_id}`)
  }

  return result
}

export async function getLiveSessionAction(sessionId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  return getLiveSession(sessionId)
}

export async function getLiveSessionByAssessmentAction(assessmentId: string) {
  const auth = await authorize()
  if ('error' in auth) return null

  return getLiveSessionByAssessment(assessmentId)
}

export async function saveLiveAnswerAction(
  sessionId: string,
  questionId: string,
  answerContent: Record<string, unknown>,
) {
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error }

  return saveLiveAnswer(sessionId, auth.userId, questionId, answerContent)
}

export async function getStudentLiveAnswerAction(
  sessionId: string,
  questionId: string,
) {
  const auth = await authorize()
  if ('error' in auth) return null

  return getStudentLiveAnswer(sessionId, auth.userId, questionId)
}

export async function checkActiveLiveSessionAction() {
  const auth = await authorize(['student'])
  if ('error' in auth) return { sessionId: null, assessmentId: null }

  return hasActiveLiveSession(auth.userId)
}
