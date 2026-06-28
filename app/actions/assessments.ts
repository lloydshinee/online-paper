'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import {
  createAssessment,
  publishAssessment,
  unpublishAssessment,
  closeAssessment,
  deleteAssessment,
  getClassAssessments,
  setAssessmentQuestions,
  getAssessmentQuestions,
  updateAssessmentSettings,
} from '@/lib/assessment-service'
import type { ParsedQuestion } from '@/lib/question-parser'

interface AssessmentActionState {
  error?: string
  success?: string
}

export async function createAssessmentAction(
  prevState: AssessmentActionState | null | undefined,
  formData: FormData,
): Promise<AssessmentActionState & { redirectTo?: string }> {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const classId = formData.get('classId') as string
  const title = formData.get('title') as string
  const mode = formData.get('mode') as string
  const durationMinutes = formData.get('durationMinutes') as string

  if (!classId || !title || !mode) {
    return { error: 'All fields are required' }
  }

  if (mode === 'timed' && (!durationMinutes || parseInt(durationMinutes) < 1)) {
    return { error: 'Duration must be at least 1 minute for timed assessments' }
  }

  const result = await createAssessment(
    auth.userId,
    classId,
    title.trim(),
    mode as 'timed' | 'live',
    mode === 'timed' ? parseInt(durationMinutes) : undefined,
  )

  if (result.error) {
    return { error: result.error }
  }

  const assessmentId = result.assessment!.id

  revalidatePath(`/dashboard/instructor/classes/${classId}`)
  return { success: 'Assessment created', redirectTo: `/dashboard/instructor/classes/${classId}/assessments/${assessmentId}` }
}

export async function publishAssessmentAction(assessmentId: string, classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await publishAssessment(assessmentId, auth.userId)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath(`/dashboard/instructor/classes/${classId}`)
  return { success: 'Assessment published' }
}

export async function unpublishAssessmentAction(assessmentId: string, classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await unpublishAssessment(assessmentId, auth.userId)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath(`/dashboard/instructor/classes/${classId}`)
  return { success: 'Assessment unpublished' }
}

export async function closeAssessmentAction(assessmentId: string, classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await closeAssessment(assessmentId, auth.userId)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath(`/dashboard/instructor/classes/${classId}`)
  return { success: 'Assessment closed' }
}

export async function deleteAssessmentAction(assessmentId: string, classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await deleteAssessment(assessmentId, auth.userId)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath(`/dashboard/instructor/classes/${classId}`)
  return { success: 'Assessment deleted' }
}

export async function getAssessmentsForClass(classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { assessments: [], error: auth.error }

  return getClassAssessments(auth.userId, classId)
}

export async function saveAssessmentQuestionsAction(
  assessmentId: string,
  questions: ParsedQuestion[],
) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await setAssessmentQuestions(assessmentId, auth.userId, questions)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath(`/dashboard/instructor/classes/${result.questions![0]?.assessment_id ?? ''}`)
  return { error: null, count: result.questions!.length }
}

export async function getAssessmentWithQuestions(assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { assessment: null, questions: [], error: auth.error }

  const supabase = await createClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
    .eq('id', assessmentId)
    .single()

  if (!assessment) {
    return { assessment: null, questions: [], error: 'Assessment not found' }
  }

  const questions = await getAssessmentQuestions(assessmentId)

  return { assessment, questions, error: null }
}

export async function updateAssessmentSettingsAction(
  assessmentId: string,
  updates: {
    title?: string
    mode?: 'timed' | 'live'
    duration_minutes?: number | null
    scores_released?: boolean
    answer_reveal_enabled?: boolean
    accepting_submissions?: boolean
  },
) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await updateAssessmentSettings(assessmentId, auth.userId, updates)

  if (result.error) {
    return { error: result.error }
  }

  return { error: null, assessment: result.assessment }
}
