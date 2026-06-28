'use server'

import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import {
  getSubmissionsForAssessment,
  getSubmissionForGrading,
  gradeAnswer,
  deleteSubmission,
} from '@/lib/submission-service'

export async function getAssessmentSubmissions(assessmentId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { submissions: [], error: auth.error }

  const supabase = await createClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return { submissions: [], error: 'Assessment not found' }

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id)
    .eq('instructor_id', auth.userId)
    .single()

  if (!cls) return { submissions: [], error: 'Not authorized' }

  const submissions = await getSubmissionsForAssessment(assessmentId)

  return { submissions, error: null }
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

  const supabase = await createClient()
  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assessment_id')
    .eq('id', submissionId)
    .single()

  if (!submission) return { error: 'Submission not found' }

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id')
    .eq('id', submission.assessment_id)
    .single()

  if (!assessment) return { error: 'Assessment not found' }

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id)
    .eq('instructor_id', auth.userId)
    .single()

  if (!cls) return { error: 'Not authorized' }

  return deleteSubmission(submissionId)
}
