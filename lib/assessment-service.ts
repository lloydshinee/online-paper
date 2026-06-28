import { createServiceClient } from '@/lib/supabase/service'
import type { ParsedQuestion } from '@/lib/question-parser'

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
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
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
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
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
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
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
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
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
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  if (error) {
    return { assessments: [], error: error.message }
  }

  return { assessments: (data as AssessmentData[]) ?? [], error: null }
}

export async function setAssessmentQuestions(
  assessmentId: string,
  instructorId: string,
  questions: ParsedQuestion[],
): Promise<{ questions: QuestionData[] | null; error: string | null }> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructor(supabase, assessmentId, instructorId)
  if (!authorized) {
    return { questions: null, error: 'Not authorized' }
  }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('state')
    .eq('id', assessmentId)
    .single()

  if (!assessment) {
    return { questions: null, error: 'Assessment not found' }
  }

  await supabase.from('questions').delete().eq('assessment_id', assessmentId)

  if (questions.length === 0) {
    return { questions: [], error: null }
  }

  const rows = questions.map((q, idx) => ({
    assessment_id: assessmentId,
    type: q.type,
    content: q.content,
    points: q.points,
    order_index: idx,
  }))

  const { data, error } = await supabase
    .from('questions')
    .insert(rows)
    .select('*')
    .order('order_index')

  if (error) {
    return { questions: null, error: error.message }
  }

  return { questions: data as QuestionData[], error: null }
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

  if (Object.keys(updateData).length === 0) {
    return { assessment: null, error: 'No updates provided' }
  }

  const { data, error } = await supabase
    .from('assessments')
    .update(updateData)
    .eq('id', assessmentId)
    .select('id, class_id, title, mode, state, duration_minutes, scores_released, answer_reveal_enabled, accepting_submissions, created_at')
    .single()

  if (error) {
    return { assessment: null, error: error.message }
  }

  return { assessment: data as AssessmentData, error: null }
}
