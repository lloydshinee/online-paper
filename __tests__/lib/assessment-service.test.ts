import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass } from '@/lib/class-service'
import {
  createAssessment,
  publishAssessment,
  closeAssessment,
  deleteAssessment,
  getClassAssessments,
  setAssessmentQuestions,
} from '@/lib/assessment-service'
import type { ParsedQuestion } from '@/lib/question-parser'

const testEmails: string[] = []
const testClassIds: string[] = []

afterAll(async () => {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  for (const classId of testClassIds) {
    await adminClient.from('classes').delete().eq('id', classId)
  }

  for (const email of testEmails) {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const user = users.users.find((u) => u.email === email)
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id)
    }
    await adminClient.from('users').delete().eq('email', email)
  }
})

const sampleQuestions: ParsedQuestion[] = [
  {
    type: 'MultipleChoice',
    content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 },
    points: 2,
  },
  {
    type: 'TrueOrFalse',
    content: { statement: 'The sky is blue.', correctAnswer: true },
    points: 1,
  },
  {
    type: 'Essay',
    content: { prompt: 'Describe photosynthesis.' },
    points: 5,
  },
]

describe('assessment service', () => {
  test('instructor creates a draft assessment', async () => {
    const email = `test-assessment-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Test Class')
    testClassIds.push(cls!.id)

    const result = await createAssessment(
      instructor!.id,
      cls!.id,
      'Midterm Exam',
      'timed',
      60,
    )

    expect(result.error).toBeNull()
    expect(result.assessment).toBeDefined()
    expect(result.assessment!.title).toBe('Midterm Exam')
    expect(result.assessment!.mode).toBe('timed')
    expect(result.assessment!.duration_minutes).toBe(60)
    expect(result.assessment!.state).toBe('draft')
    expect(result.assessment!.class_id).toBe(cls!.id)
  })

  test('instructor sets questions on a draft assessment', async () => {
    const email = `test-setq-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Q Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Q Test', 'timed', 30)

    const result = await setAssessmentQuestions(assessment!.id, instructor!.id, sampleQuestions)

    expect(result.error).toBeNull()
    expect(result.questions).toHaveLength(3)
    expect(result.questions![0].type).toBe('MultipleChoice')
    expect(result.questions![0].points).toBe(2)
    expect(result.questions![1].type).toBe('TrueOrFalse')
    expect(result.questions![1].points).toBe(1)
    expect(result.questions![2].type).toBe('Essay')
    expect(result.questions![2].points).toBe(5)
  })

  test('live mode assessment has no duration', async () => {
    const email = `test-live-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Live Class')
    testClassIds.push(cls!.id)

    const result = await createAssessment(
      instructor!.id,
      cls!.id,
      'Live Quiz',
      'live',
      undefined,
    )

    expect(result.error).toBeNull()
    expect(result.assessment!.mode).toBe('live')
    expect(result.assessment!.duration_minutes).toBeNull()
  })

  test('instructor publishes an assessment', async () => {
    const email = `test-publish-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Pub Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'Pub Test',
      'timed',
      30,
    )

    const result = await publishAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()
    expect(result.assessment!.state).toBe('active')

    // Verify in DB
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: dbAssessment } = await adminClient
      .from('assessments')
      .select('state')
      .eq('id', assessment!.id)
      .single()

    expect(dbAssessment!.state).toBe('active')
  })

  test('instructor closes an assessment', async () => {
    const email = `test-close-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Close Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'Close Test',
      'timed',
      30,
    )

    await publishAssessment(assessment!.id, instructor!.id)

    const result = await closeAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()
    expect(result.assessment!.state).toBe('closed')
  })

  test('instructor deletes a draft assessment', async () => {
    const email = `test-delete-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Delete Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'Delete Test',
      'timed',
      30,
    )

    const result = await deleteAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()

    // Verify deleted from DB
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: dbAssessment } = await adminClient
      .from('assessments')
      .select('id')
      .eq('id', assessment!.id)
      .maybeSingle()

    expect(dbAssessment).toBeNull()
  })

  test('cannot delete a published assessment', async () => {
    const email = `test-nodelete-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'NoDelete Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'NoDelete Test',
      'timed',
      30,
    )

    await publishAssessment(assessment!.id, instructor!.id)

    const result = await deleteAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeDefined()
    expect(result.error).toContain('draft')
  })

  test('getClassAssessments returns assessments for a class', async () => {
    const email = `test-listassess-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'List Class')
    testClassIds.push(cls!.id)

    await createAssessment(instructor!.id, cls!.id, 'Assessment 1', 'timed', 30)
    await createAssessment(instructor!.id, cls!.id, 'Assessment 2', 'live', undefined)

    const result = await getClassAssessments(instructor!.id, cls!.id)

    expect(result.error).toBeNull()
    expect(result.assessments).toHaveLength(2)
    expect(result.assessments[0].title).toBe('Assessment 2') // newest first
    expect(result.assessments[1].title).toBe('Assessment 1')
  })
})
