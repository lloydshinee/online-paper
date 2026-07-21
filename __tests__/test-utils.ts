import { getAdminClient } from './setup'
import { createUser } from '@/lib/auth/admin-service'
import { createClass } from '@/lib/class-service'
import { createAssessment, setAssessmentQuestions, publishAssessment } from '@/lib/assessment-service'
import type { ParsedQuestion } from '@/lib/question-parser'

const adminClient = getAdminClient()

export interface TestUser {
  id: string
  email: string
  password: string
  role: string
}

export interface TestClass {
  id: string
  instructorId: string
  joinCode: string
}

export interface TestAssessment {
  id: string
  classId: string
}

// Global registry: tracked so global teardown can clean up if per-file cleanup misses
export const testUserIds: string[] = []
export const testClassIds: string[] = []
export const testAssessmentIds: string[] = []

export async function createTestUser(role: 'admin' | 'instructor' | 'student'): Promise<TestUser> {
  const email = `test-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'TestPass123!'

  if (role === 'student') {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'student', firstname: 'Test', lastname: 'Student' },
    })
    if (error || !data.user) throw new Error(error?.message ?? 'Failed to create student')
    const userId = data.user.id
    testUserIds.push(userId)
    return { id: userId, email, password, role: 'student' }
  }

  const { user, error } = await createUser(email, password, 'Test', role === 'admin' ? 'Admin' : 'Instructor', role)
  if (error || !user) throw new Error(error ?? 'Failed to create user')
  testUserIds.push(user.id)
  return { id: user.id, email, password, role }
}

export async function createTestClass(instructorId: string): Promise<TestClass> {
  const { class: cls, error } = await createClass(instructorId, 'Test Class')
  if (error || !cls) throw new Error(error ?? 'Failed to create class')
  testClassIds.push(cls.id)
  return { id: cls.id, instructorId, joinCode: cls.join_code }
}

export async function createTestAssessment(
  classId: string,
  instructorId: string,
  options?: { publish?: boolean; mode?: 'timed' | 'live' },
): Promise<TestAssessment> {
  const mode = options?.mode ?? 'timed'
  const { assessment, error } = await createAssessment(
    instructorId,
    classId,
    'Test Assessment',
    mode,
    mode === 'timed' ? 30 : undefined,
  )
  if (error || !assessment) throw new Error(error ?? 'Failed to create assessment')
  testAssessmentIds.push(assessment.id)

  const questions: ParsedQuestion[] = [
    { type: 'MultipleChoice', content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 }, points: 2 },
    { type: 'TrueOrFalse', content: { statement: 'The sky is blue.', correctAnswer: true }, points: 1 },
    { type: 'FillInTheBlank', content: { stem: 'The capital of France is ______.', correctAnswer: 'Paris' }, points: 2 },
    { type: 'Essay', content: { prompt: 'Describe photosynthesis.' }, points: 5 },
  ]
  await setAssessmentQuestions(assessment.id, instructorId, questions)

  if (options?.publish) {
    await publishAssessment(assessment.id, instructorId)
  }

  return { id: assessment.id, classId }
}

export async function cleanupTestData(): Promise<void> {
  for (const assessmentId of testAssessmentIds) {
    try { await adminClient.from('answers').delete().in('submission_id', (await adminClient.from('submissions').select('id').eq('assessment_id', assessmentId)).data?.map((s: { id: string }) => s.id) ?? ['none']) } catch { /* ignore */ }
    try { await adminClient.from('submissions').delete().eq('assessment_id', assessmentId) } catch { /* ignore */ }
    try { await adminClient.from('live_answers').delete().in('session_id', (await adminClient.from('live_sessions').select('id').eq('assessment_id', assessmentId)).data?.map((s: { id: string }) => s.id) ?? ['none']) } catch { /* ignore */ }
    try { await adminClient.from('notifications').delete().eq('assessment_id', assessmentId) } catch { /* ignore */ }
    try { await adminClient.from('questions').delete().eq('assessment_id', assessmentId) } catch { /* ignore */ }
    try { await adminClient.from('live_sessions').delete().eq('assessment_id', assessmentId) } catch { /* ignore */ }
    try { await adminClient.from('assessments').delete().eq('id', assessmentId) } catch { /* ignore */ }
  }
  for (const classId of testClassIds) {
    try { await adminClient.from('class_enrollments').delete().eq('class_id', classId) } catch { /* ignore */ }
    try { await adminClient.from('classes').delete().eq('id', classId) } catch { /* ignore */ }
  }
  for (const userId of testUserIds) {
    try { await adminClient.from('classes').delete().eq('instructor_id', userId) } catch { /* ignore */ }
    try { await adminClient.auth.admin.deleteUser(userId) } catch { /* ignore */ }
    try { await adminClient.from('users').delete().eq('id', userId) } catch { /* ignore */ }
  }
}
