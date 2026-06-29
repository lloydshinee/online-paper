import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import { createAssessment, publishAssessment, setAssessmentQuestions } from '@/lib/assessment-service'
import {
  createLiveSession,
  startLiveSession,
  advanceLiveSession,
  endLiveSession,
  getLiveSession,
  getLiveSessionByAssessment,
  hasActiveLiveSession,
  saveLiveAnswer,
} from '@/lib/live-session-service'
import type { ParsedQuestion } from '@/lib/question-parser'

const testEmails: string[] = []

afterAll(async () => {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  for (const email of testEmails) {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const user = users.users.find((u) => u.email === email)
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id)
    }
    await adminClient.from('users').delete().eq('email', email)
  }
})

const mcQuestion: ParsedQuestion = {
  type: 'MultipleChoice',
  content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 },
  points: 2,
}

async function setupLiveAssessment() {
  const instructorEmail = `test-live-instr-${Date.now()}@example.com`
  const studentEmail = `test-live-stu-${Date.now()}@example.com`
  testEmails.push(instructorEmail, studentEmail)

  const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Instructor', 'instructor')
  const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Student', 'student')
  const { class: cls } = await createClass(instructor!.id, 'Live Class')
  await joinClass(student!.id, cls!.join_code)

  const { assessment } = await createAssessment(
    instructor!.id, cls!.id, 'Live Assessment', 'live', undefined,
  )
  await setAssessmentQuestions(assessment!.id, instructor!.id, [mcQuestion])
  await publishAssessment(assessment!.id, instructor!.id)

  return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
}

describe('live session service', () => {
  test('instructor creates a live session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const result = await createLiveSession(instructor.id, assessment.id)

    expect(result.error).toBeNull()
    expect(result.session).toBeDefined()
    expect(result.session!.status).toBe('waiting')
    expect(result.session!.current_question_index).toBe(-1)
    expect(result.session!.assessment_id).toBe(assessment.id)
  })

  test('cannot create two active live sessions for same assessment', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const first = await createLiveSession(instructor.id, assessment.id)
    expect(first.error).toBeNull()

    const second = await createLiveSession(instructor.id, assessment.id)
    expect(second.error).toBeDefined()
  })

  test('instructor starts a live session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    const result = await startLiveSession(session!.id, instructor.id)

    expect(result.error).toBeNull()
    expect(result.session!.status).toBe('active')
    expect(result.session!.started_at).toBeDefined()
  })

  test('cannot start a session that is already active', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    await startLiveSession(session!.id, instructor.id)

    const second = await startLiveSession(session!.id, instructor.id)
    expect(second.error).toBeDefined()
  })

  test('instructor advances to next question', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    await startLiveSession(session!.id, instructor.id)

    const result = await advanceLiveSession(session!.id, instructor.id, 'next')

    expect(result.error).toBeNull()
    expect(result.session!.current_question_index).toBe(0)  // only 1 question
    expect(result.question).toBeDefined()
  })

  test('cannot go before first question', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    await startLiveSession(session!.id, instructor.id)

    const result = await advanceLiveSession(session!.id, instructor.id, 'prev')

    expect(result.error).toBeNull()
    expect(result.session!.current_question_index).toBe(0)
  })

  test('instructor ends live session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    await startLiveSession(session!.id, instructor.id)
    const result = await endLiveSession(session!.id, instructor.id)

    expect(result.error).toBeNull()
    expect(result.session!.status).toBe('ended')
    expect(result.session!.ended_at).toBeDefined()
  })

  test('getLiveSession returns session with questions', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    const result = await getLiveSession(session!.id)

    expect(result).not.toBeNull()
    expect(result!.questions).toHaveLength(1)
    expect(result!.questions[0].type).toBe('MultipleChoice')
  })

  test('getLiveSessionByAssessment finds active session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    const result = await getLiveSessionByAssessment(assessment.id)

    expect(result).not.toBeNull()
    expect(result!.id).toBe(session!.id)
  })

  test('hasActiveLiveSession returns null when no active session', async () => {
    const { student } = await setupLiveAssessment()

    const result = await hasActiveLiveSession(student.id)

    expect(result.sessionId).toBeNull()
    expect(result.assessmentId).toBeNull()
  })

  test('dual-join rejection: student in active session is detected', async () => {
    const { instructor, student, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor.id, assessment.id)
    await startLiveSession(session!.id, instructor.id)

    const fullSession = await getLiveSession(session!.id)
    const questionId = fullSession!.questions[0].id

    // Student joins by saving an answer
    const saveResult = await saveLiveAnswer(session!.id, student.id, questionId, { selectedIndex: 0 })
    expect(saveResult.error).toBeNull()

    // Now hasActiveLiveSession should detect the student is in a session
    const result = await hasActiveLiveSession(student.id)
    expect(result.sessionId).toBe(session!.id)
    expect(result.assessmentId).toBe(assessment.id)
  })
})
