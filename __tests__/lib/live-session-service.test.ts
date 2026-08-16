import { describe, test, expect, vi, afterAll } from 'vitest'
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
  getLiveSessionForInstructor,
  hasActiveLiveSession,
  joinLiveSession,
  saveLiveAnswer,
  getLiveSessionByAssessmentForStudent,
  getQuestionAnswerCount,
  getSessionAnswerCounts,
} from '@/lib/live-session-service'
import type { ParsedQuestion } from '@/lib/question-parser'

// Ticket 21 (F4): conversion failure handling is tested by intercepting
// convertLiveSession. The spy defaults to the real implementation, so every
// other test in this file is unaffected.
const conversionMocks = vi.hoisted(() => ({
  convertLiveSession: vi.fn<
    (sessionId: string, assessmentId: string, startedAt: string) => Promise<void>
  >(),
  realConvertLiveSession: null as
    | null
    | ((sessionId: string, assessmentId: string, startedAt: string) => Promise<void>),
}))

vi.mock('@/lib/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/submission-service')>()
  conversionMocks.realConvertLiveSession = actual.convertLiveSession
  conversionMocks.convertLiveSession.mockImplementation(
    (sessionId, assessmentId, startedAt) =>
      conversionMocks.realConvertLiveSession!(sessionId, assessmentId, startedAt),
  )
  return {
    ...actual,
    convertLiveSession: conversionMocks.convertLiveSession,
  }
})

function restoreRealConvertLiveSession() {
  conversionMocks.convertLiveSession.mockReset()
  conversionMocks.convertLiveSession.mockImplementation(
    (sessionId, assessmentId, startedAt) =>
      conversionMocks.realConvertLiveSession!(sessionId, assessmentId, startedAt),
  )
}

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

  const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
  const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
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

    const result = await createLiveSession(instructor!.id, assessment!.id)

    expect(result.error).toBeNull()
    expect(result.session).toBeDefined()
    expect(result.session!.status).toBe('waiting')
    expect(result.session!.current_question_index).toBe(-1)
    expect(result.session!.assessment_id).toBe(assessment.id)
  })

  test('cannot create two active live sessions for same assessment', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const first = await createLiveSession(instructor!.id, assessment!.id)
    expect(first.error).toBeNull()

    const second = await createLiveSession(instructor!.id, assessment!.id)
    expect(second.error).toBeDefined()
  })

  test('instructor starts a live session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    const result = await startLiveSession(session!.id, instructor.id)

    expect(result.error).toBeNull()
    expect(result.session!.status).toBe('active')
    expect(result.session!.started_at).toBeDefined()
  })

  test('starting an already-active session is idempotent', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    const first = await startLiveSession(session!.id, instructor.id)
    expect(first.error).toBeNull()

    const second = await startLiveSession(session!.id, instructor.id)
    expect(second.error).toBeNull()
    expect(second.session!.status).toBe('active')
    expect(second.session!.started_at).toBe(first.session!.started_at) // not corrupted
  })

  test('concurrent starts of a waiting session are idempotent', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)

    const [a, b] = await Promise.all([
      startLiveSession(session!.id, instructor.id),
      startLiveSession(session!.id, instructor.id),
    ])

    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.session!.status).toBe('active')
    expect(b.session!.status).toBe('active')
  })

  test('instructor advances to next question', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)

    const result = await advanceLiveSession(session!.id, instructor.id, 'next')

    expect(result.error).toBeNull()
    expect(result.session!.current_question_index).toBe(0)  // only 1 question
    expect(result.question).toBeDefined()
  })

  test('cannot go before first question', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)

    const result = await advanceLiveSession(session!.id, instructor.id, 'prev')

    expect(result.error).toBeNull()
    expect(result.session!.current_question_index).toBe(0)
  })

  test('instructor ends live session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    const result = await endLiveSession(session!.id, instructor.id)

    expect(result.error).toBeNull()
    expect(result.session!.status).toBe('ended')
    expect(result.session!.ended_at).toBeDefined()
  })

  test('getLiveSession returns session with questions', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    const result = await getLiveSession(session!.id)

    expect(result).not.toBeNull()
    expect(result!.questions).toHaveLength(1)
    expect(result!.questions[0].type).toBe('MultipleChoice')
  })

  test('getLiveSessionByAssessment finds active session', async () => {
    const { instructor, assessment } = await setupLiveAssessment()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
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

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')

    // Student joins explicitly (membership), without answering yet.
    const joinResult = await joinLiveSession(session!.id, student.id)
    expect(joinResult.error).toBeNull()

    // hasActiveLiveSession detects the membership even with zero answers.
    const result = await hasActiveLiveSession(student.id)
    expect(result.sessionId).toBe(session!.id)
    expect(result.assessmentId).toBe(assessment.id)
  })
})

describe('live answer write gating', () => {
  const mcA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }
  const mcB: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'Second question?', options: ['c', 'd'], correctAnswer: 'c', correctIndex: 0 },
    points: 2,
  }

  async function setupTwoQuestionLive() {
    const instructorEmail = `test-live2-instr-${Date.now()}@example.com`
    const studentEmail = `test-live2-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Live2 Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Live2 Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [mcA, mcB])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  test('saving a live answer while the session is Waiting is rejected', async () => {
    const { instructor, student, assessment } = await setupTwoQuestionLive()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    const fullSession = await getLiveSession(session!.id)

    const result = await saveLiveAnswer(session!.id, student.id, fullSession!.questions[0].id, { selectedIndex: 0 })

    expect(result.error).toBeDefined()
    expect(result.error).toContain('waiting')
  })

  test('saving a live answer after the session Ended is rejected', async () => {
    const { instructor, student, assessment } = await setupTwoQuestionLive()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await endLiveSession(session!.id, instructor.id)

    const fullSession = await getLiveSession(session!.id)
    const result = await saveLiveAnswer(session!.id, student.id, fullSession!.questions[0].id, { selectedIndex: 0 })

    expect(result.error).toBeDefined()
    expect(result.error).toContain('ended')
  })

  test('saving a live answer for a question other than the current index is rejected', async () => {
    const { instructor, student, assessment } = await setupTwoQuestionLive()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)

    const fullSession = await getLiveSession(session!.id)
    // Current index is -1 (no question advanced yet)
    const early = await saveLiveAnswer(session!.id, student.id, fullSession!.questions[0].id, { selectedIndex: 0 })
    expect(early.error).toBeDefined()
    expect(early.error).toContain('not the current question')

    // Advance to question 0
    const advanced = await advanceLiveSession(session!.id, instructor.id, 'next')
    expect(advanced.session!.current_question_index).toBe(0)

    // Saving question 1 while question 0 is current is rejected
    const outOfOrder = await saveLiveAnswer(session!.id, student.id, fullSession!.questions[1].id, { selectedIndex: 0 })
    expect(outOfOrder.error).toBeDefined()
    expect(outOfOrder.error).toContain('not the current question')

    // Saving the current question succeeds
    const ok = await saveLiveAnswer(session!.id, student.id, fullSession!.questions[0].id, { selectedIndex: 0 })
    expect(ok.error).toBeNull()
  })

  test('unenrolled students cannot save live answers', async () => {
    const { instructor, assessment } = await setupTwoQuestionLive()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')

    const fullSession = await getLiveSession(session!.id)

    // Create a second student who is NOT enrolled
    const outsiderEmail = `test-live2-out-${Date.now()}@example.com`
    testEmails.push(outsiderEmail)
    const { user: outsider } = await createUser(outsiderEmail, 'TestPass123!', 'Out', 'Sider', 'student')

    const result = await saveLiveAnswer(session!.id, outsider!.id, fullSession!.questions[0].id, { selectedIndex: 0 })

    expect(result.error).toBeDefined()
    expect(result.error).toContain('not enrolled')
  })
})

describe('live membership and end-of-session flush', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }

  async function setupMembership() {
    const instructorEmail = `test-mem-instr-${Date.now()}@example.com`
    const studentEmail = `test-mem-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Membership Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Membership Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('a student who joined but has not answered is blocked from a second session', async () => {
    const { instructor, student, assessment } = await setupMembership()

    // Assessment 1 session
    const { session: session1 } = await createLiveSession(instructor!.id, assessment!.id)
    const join1 = await joinLiveSession(session1!.id, student.id)
    expect(join1.error).toBeNull()

    // A second live assessment for the same instructor
    const { class: cls2 } = await createClass(instructor.id, 'Membership Class 2')
    await joinClass(student.id, cls2!.join_code)
    const { assessment: assessment2 } = await createAssessment(instructor.id, cls2!.id, 'Second Live', 'live', undefined)
    await setAssessmentQuestions(assessment2!.id, instructor.id, [qA])
    await publishAssessment(assessment2!.id, instructor.id)
    const { session: session2 } = await createLiveSession(instructor.id, assessment2!.id)

    const join2 = await joinLiveSession(session2!.id, student.id)
    expect(join2.error).toBeDefined()
    expect(join2.error).toContain('another live session')
  })

  test('a student with an answer in an active session cannot join a second session', async () => {
    const { instructor, student, assessment } = await setupMembership()

    const { session: session1 } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session1!.id, instructor.id)
    await advanceLiveSession(session1!.id, instructor.id, 'next')
    await joinLiveSession(session1!.id, student.id)
    const full = await getLiveSession(session1!.id)
    await saveLiveAnswer(session1!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })

    // Second session on a second assessment
    const instructor2 = await createUser(`test-mem-instr2-${Date.now()}@example.com`, 'TestPass123!', 'Test2', 'Instructor', 'instructor')
    testEmails.push(instructor2.user!.email)
    const { class: cls2 } = await createClass(instructor2.user!.id, 'Other Class')
    await joinClass(student.id, cls2!.join_code)
    const { assessment: assessment2 } = await createAssessment(instructor2.user!.id, cls2!.id, 'Other Live', 'live', undefined)
    await setAssessmentQuestions(assessment2!.id, instructor2.user!.id, [qA])
    await publishAssessment(assessment2!.id, instructor2.user!.id)
    const { session: session2 } = await createLiveSession(instructor2.user!.id, assessment2!.id)

    const join2 = await joinLiveSession(session2!.id, student.id)
    expect(join2.error).toBeDefined()
    expect(join2.error).toContain('another live session')
  })

  test('membership from an ended session does not block future joins', async () => {
    const { instructor, student, assessment } = await setupMembership()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await endLiveSession(session!.id, instructor.id)

    // Ended session => no active membership
    const active = await hasActiveLiveSession(student.id)
    expect(active.sessionId).toBeNull()
  })

  test('re-running a session is blocked while retakes are disallowed', async () => {
    const { instructor, student, assessment } = await setupMembership()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    const full = await getLiveSession(session!.id)
    await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })
    await endLiveSession(session!.id, instructor.id)

    // Re-run without retakes -> rejected with a clear reason
    const rerun = await createLiveSession(instructor!.id, assessment!.id)
    expect(rerun.error).toBeDefined()
    expect(rerun.error).toContain('Retakes are not allowed')
  })

  test('re-running a session is allowed once retakes are enabled', async () => {
    const { instructor, student, assessment } = await setupMembership()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    const full = await getLiveSession(session!.id)
    await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })
    await endLiveSession(session!.id, instructor.id)

    const admin = getAdmin()
    await admin.from('assessments').update({ retakes_allowed: true }).eq('id', assessment.id)

    const rerun = await createLiveSession(instructor!.id, assessment!.id)
    expect(rerun.error).toBeNull()
    expect(rerun.session!.status).toBe('waiting')
  })

  test('end-session includes a save that lands during the flush grace window', async () => {
    const { instructor, student, assessment } = await setupMembership()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    const full = await getLiveSession(session!.id)
    const qid = full!.questions[0].id

    await saveLiveAnswer(session!.id, student.id, qid, { selectedIndex: 0 })

    // Instructor ends; while the grace window is open the student's pending
    // debounced save lands (simulating last-seconds typing).
    const endPromise = endLiveSession(session!.id, instructor.id)
    await new Promise((r) => setTimeout(r, 300))
    const lateSave = await saveLiveAnswer(session!.id, student.id, qid, { selectedIndex: 1 })
    expect(lateSave.error).toBeNull()

    const endResult = await endPromise
    expect(endResult.error).toBeNull()
    expect(endResult.session!.status).toBe('ended')

    // The converted submission includes the late answer.
    const admin = getAdmin()
    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
    expect(subs).not.toBeNull()
    const { data: answers } = await admin
      .from('answers')
      .select('answer_content')
      .in('submission_id', subs!.map((s) => s.id))
    const contents = (answers ?? []).map((a) => a.answer_content)
    expect(contents).toContainEqual({ selectedIndex: 1 })

    // Writes after conversion are rejected, never silently orphaned.
    const postEnd = await saveLiveAnswer(session!.id, student.id, qid, { selectedIndex: 0 })
    expect(postEnd.error).toBeDefined()
    expect(postEnd.error).toContain('ended')
  })

  test('student live view is sanitized and limited to the current question', async () => {
    const { instructor, student, assessment } = await setupMembership()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')

    const view = await getLiveSessionByAssessmentForStudent(assessment.id, student.id)
    expect('session' in view).toBe(true)
    if (!('session' in view)) return
    expect(view.totalQuestions).toBe(1)
    expect(view.currentQuestion).not.toBeNull()
    expect(view.currentQuestion!.content.correctAnswer).toBeUndefined()
    expect(view.currentQuestion!.content.correctIndex).toBeUndefined()
    // The raw content still has options the student needs to answer.
    expect(view.currentQuestion!.content.options).toBeDefined()
  })

  test('unenrolled student cannot read the live session view', async () => {
    const { instructor, assessment } = await setupMembership()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')

    const outsiderEmail = `test-mem-out-${Date.now()}@example.com`
    testEmails.push(outsiderEmail)
    const { user: outsider } = await createUser(outsiderEmail, 'TestPass123!', 'Out', 'Sider', 'student')

    const view = await getLiveSessionByAssessmentForStudent(assessment.id, outsider!.id)
    expect('error' in view && view.error).toContain('not enrolled')
  })
})

describe('advance flush window (ticket 16)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }
  const qB: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'Second question?', options: ['c', 'd'], correctAnswer: 'c', correctIndex: 0 },
    points: 2,
  }

  async function setupTwo() {
    const instructorEmail = `test-flush-instr-${Date.now()}@example.com`
    const studentEmail = `test-flush-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Flush Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Flush Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA, qB])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('a flush save for the immediately previous question is accepted after an advance', async () => {
    const { instructor, student, assessment } = await setupTwo()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id
    const q1 = full!.questions[1].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next') // now index 1

    // The student's synchronous advance flush saves Q0 right after the move.
    const flush = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(flush.error).toBeNull()

    // The current question still saves fine.
    const current = await saveLiveAnswer(session!.id, student.id, q1, { selectedIndex: 0 })
    expect(current.error).toBeNull()
  })

  test('a save for the previous question after the flush window is rejected', async () => {
    const { instructor, student, assessment } = await setupTwo()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next')

    // Backdate the departing question's own departure record beyond the
    // window (ticket 21 F2: each departed question carries its own window).
    const admin = getAdmin()
    const longAgo = new Date(Date.now() - 60_000).toISOString()
    await admin
      .from('live_sessions')
      .update({ flush_departures: [{ index: 0, departed_at: longAgo }] })
      .eq('id', session!.id)

    const late = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(late.error).toBeDefined()
    expect(late.error).toContain('not the current question')
  })

  test('a save two questions ahead of the current index is still rejected', async () => {
    const { instructor, student, assessment } = await setupTwo()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q1 = full!.questions[1].id

    const result = await saveLiveAnswer(session!.id, student.id, q1, { selectedIndex: 0 })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('not the current question')
  })
})

describe('rapid advance flush chain (ticket 21 F1/F2)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }
  const qB: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'Second question?', options: ['c', 'd'], correctAnswer: 'c', correctIndex: 0 },
    points: 2,
  }
  const qC: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'Third question?', options: ['e', 'f'], correctAnswer: 'e', correctIndex: 0 },
    points: 2,
  }

  async function setupThree() {
    const instructorEmail = `test-chain-instr-${Date.now()}@example.com`
    const studentEmail = `test-chain-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Chain Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Chain Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA, qB, qC])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('a flush for the first question survives rapid back-to-back advances', async () => {
    const { instructor, student, assessment } = await setupThree()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id
    const q1 = full!.questions[1].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 2 (rapid)

    // The student's flush for Q0 — the question before the FIRST advance —
    // lands after the SECOND advance and must still be accepted (F1).
    const flush = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(flush.error).toBeNull()

    // A flush for the question shown between the two advances is accepted too.
    const middle = await saveLiveAnswer(session!.id, student.id, q1, { selectedIndex: 0 })
    expect(middle.error).toBeNull()

    // End and verify the flushed edit is in the converted submission.
    const endResult = await endLiveSession(session!.id, instructor.id)
    expect(endResult.error).toBeNull()
    expect(endResult.session!.status).toBe('ended')

    const admin = getAdmin()
    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
    expect(subs).toHaveLength(1)

    const { data: answers } = await admin
      .from('answers')
      .select('question_id, answer_content')
      .eq('submission_id', subs![0].id)
    const q0Answer = (answers ?? []).find((a) => a.question_id === q0)
    expect(q0Answer?.answer_content).toEqual({ selectedIndex: 1 })
  })

  test('the extended window covers a poll-discovered advance (12s+margin)', async () => {
    const { instructor, student, assessment } = await setupThree()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1

    // Simulate a poll discovering the advance 13s later (within the extended
    // 15s window): the outgoing-question flush must still be persisted (F2).
    const thirteenSecondsAgo = new Date(Date.now() - 13_000).toISOString()
    await admin
      .from('live_sessions')
      .update({ flush_departures: [{ index: 0, departed_at: thirteenSecondsAgo }] })
      .eq('id', session!.id)

    const flush = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(flush.error).toBeNull()
  })

  test('a double-advance flush discovered at 13s after the first departure is accepted', async () => {
    const { instructor, student, assessment } = await setupThree()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    // Both broadcasts missed: the instructor advances twice while the
    // student is still on Q0.
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 2

    // The poll discovers the moves 13s after Q0's own departure. Q0's window
    // is measured from ITS departure, not the chain origin — accepted (F2).
    const thirteenSecondsAgo = new Date(Date.now() - 13_000).toISOString()
    const fresh = new Date().toISOString()
    await admin
      .from('live_sessions')
      .update({
        flush_departures: [
          { index: 0, departed_at: thirteenSecondsAgo },
          { index: 1, departed_at: fresh },
        ],
      })
      .eq('id', session!.id)

    const flush = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(flush.error).toBeNull()
  })

  test('the same double-advance flush at 16s after departure is rejected', async () => {
    const { instructor, student, assessment } = await setupThree()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 2

    // 16s after Q0's own departure the flush is beyond Q0's window.
    const sixteenSecondsAgo = new Date(Date.now() - 16_000).toISOString()
    const fresh = new Date().toISOString()
    await admin
      .from('live_sessions')
      .update({
        flush_departures: [
          { index: 0, departed_at: sixteenSecondsAgo },
          { index: 1, departed_at: fresh },
        ],
      })
      .eq('id', session!.id)

    const late = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(late.error).toBeDefined()
    expect(late.error).toContain('not the current question')
  })

  test('a flush after the chain window has expired is rejected', async () => {
    const { instructor, student, assessment } = await setupThree()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0
    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 2

    // Both departure records are beyond their windows.
    const longAgo = new Date(Date.now() - 60_000).toISOString()
    await admin
      .from('live_sessions')
      .update({
        flush_departures: [
          { index: 0, departed_at: longAgo },
          { index: 1, departed_at: longAgo },
        ],
      })
      .eq('id', session!.id)

    const late = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(late.error).toBeDefined()
    expect(late.error).toContain('not the current question')
  })

  test('the latest outgoing question keeps its own window late in a chain', async () => {
    const { instructor, student, assessment } = await setupThree()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id
    const q1 = full!.questions[1].id

    await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 2 (chain)

    // Q0's own departure has expired, but Q1's is fresh: each departed
    // question keeps its own full window; the stale Q0 does not.
    const originExpired = new Date(Date.now() - 60_000).toISOString()
    const fresh = new Date().toISOString()
    await admin
      .from('live_sessions')
      .update({
        flush_departures: [
          { index: 0, departed_at: originExpired },
          { index: 1, departed_at: fresh },
        ],
      })
      .eq('id', session!.id)

    const q1Flush = await saveLiveAnswer(session!.id, student.id, q1, { selectedIndex: 1 })
    expect(q1Flush.error).toBeNull()

    const q0Late = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 1 })
    expect(q0Late.error).toBeDefined()
    expect(q0Late.error).toContain('not the current question')
  })

  test('two questions ahead of the current index is rejected with three questions', async () => {
    const { instructor, student, assessment } = await setupThree()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0

    const full = await getLiveSession(session!.id)
    const q2 = full!.questions[2].id

    const result = await saveLiveAnswer(session!.id, student.id, q2, { selectedIndex: 0 })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('not the current question')
  })

  test('a flush for the outgoing question after a backward advance is accepted', async () => {
    const { instructor, student, assessment } = await setupThree()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await joinLiveSession(session!.id, student.id)
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 0
    await advanceLiveSession(session!.id, instructor.id, 'next') // index 1

    const full = await getLiveSession(session!.id)
    const q0 = full!.questions[0].id
    const q1 = full!.questions[1].id

    await saveLiveAnswer(session!.id, student.id, q1, { selectedIndex: 0 })
    await advanceLiveSession(session!.id, instructor.id, 'prev') // back to 0

    // The student's flush for the outgoing Q1 lands after the backward move.
    const flush = await saveLiveAnswer(session!.id, student.id, q1, { selectedIndex: 1 })
    expect(flush.error).toBeNull()

    // The (new) current question still saves.
    const current = await saveLiveAnswer(session!.id, student.id, q0, { selectedIndex: 0 })
    expect(current.error).toBeNull()
  })
})

describe('conversion retry and revert (ticket 21 F4)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }

  async function setupConvert() {
    const instructorEmail = `test-conv-instr-${Date.now()}@example.com`
    const studentEmail = `test-conv-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Conv Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Conv Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  afterAll(() => {
    // Restore the real conversion for the describes that follow this one.
    restoreRealConvertLiveSession()
  })

  test('a transient conversion failure is retried within the same end call', async () => {
    const { instructor, student, assessment } = await setupConvert()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await joinLiveSession(session!.id, student.id)
    const full = await getLiveSession(session!.id)
    await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })

    conversionMocks.convertLiveSession.mockRejectedValueOnce(new Error('transient hiccup'))

    const result = await endLiveSession(session!.id, instructor.id)
    expect(result.error).toBeNull()
    expect(result.session!.status).toBe('ended')

    // Exactly one submission, containing the answer.
    const admin = getAdmin()
    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
    expect(subs).toHaveLength(1)
  })

  test('a total conversion failure reverts the status flip and can be retried', async () => {
    const { instructor, student, assessment } = await setupConvert()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await joinLiveSession(session!.id, student.id)
    const full = await getLiveSession(session!.id)
    await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })

    conversionMocks.convertLiveSession.mockRejectedValue(new Error('db down'))

    const first = await endLiveSession(session!.id, instructor.id)
    expect(first.error).toBeDefined()
    expect(first.error).toContain('Failed to finalize')

    // The session is NOT permanently ended: the flip was reverted.
    const admin = getAdmin()
    const { data: row } = await admin
      .from('live_sessions')
      .select('status, ended_at')
      .eq('id', session!.id)
      .single()
    expect(row!.status).toBe('active')
    expect(row!.ended_at).toBeNull()

    // Once conversion works again, a retried End succeeds and no student is
    // left with a missing submission.
    restoreRealConvertLiveSession()

    const second = await endLiveSession(session!.id, instructor.id)
    expect(second.error).toBeNull()
    expect(second.session!.status).toBe('ended')

    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
    expect(subs).toHaveLength(1)
  })

  test('a crash on the final attempt leaves no duplicates after a successful re-End', async () => {
    const { instructor, student, assessment } = await setupConvert()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await joinLiveSession(session!.id, student.id)
    const full = await getLiveSession(session!.id)
    await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })

    // First two attempts fail outright; the FINAL attempt runs the real
    // conversion (creating rows) and then crashes — partial rows remain.
    let attempts = 0
    conversionMocks.convertLiveSession.mockImplementation(
      async (sessionId, assessmentId, startedAt) => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('transient failure')
        }
        await conversionMocks.realConvertLiveSession!(sessionId, assessmentId, startedAt)
        throw new Error('crash after partial conversion')
      },
    )

    const first = await endLiveSession(session!.id, instructor.id)
    expect(first.error).toBeDefined()
    expect(first.error).toContain('Failed to finalize')

    // The crashed final attempt left converted rows behind.
    const admin = getAdmin()
    const { data: partial } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
      .eq('status', 'submitted')
    expect(partial).toHaveLength(1)

    // A successful re-End must dedup the partial rows (signature cleanup now
    // runs before the first attempt too) — exactly one submission per student.
    restoreRealConvertLiveSession()

    const second = await endLiveSession(session!.id, instructor.id)
    expect(second.error).toBeNull()
    expect(second.session!.status).toBe('ended')

    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
    expect(subs).toHaveLength(1)
  })
})

describe('end-session idempotency (ticket 17)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }

  async function setupEnd() {
    const instructorEmail = `test-end-instr-${Date.now()}@example.com`
    const studentEmail = `test-end-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'End Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'End Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('two concurrent end calls produce exactly one submission per student', async () => {
    const { instructor, student, assessment } = await setupEnd()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await joinLiveSession(session!.id, student.id)
    const full = await getLiveSession(session!.id)
    await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })

    const [a, b] = await Promise.all([
      endLiveSession(session!.id, instructor.id),
      endLiveSession(session!.id, instructor.id),
    ])

    const successes = [a, b].filter((r) => r.error === null)
    const losers = [a, b].filter((r) => r.error !== null)
    expect(successes).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0].error).toContain('already ended')

    const admin = getAdmin()
    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessment.id)
      .eq('student_id', student.id)
    expect(subs).toHaveLength(1)
  })
})

describe('waiting session recovery and membership TTL (ticket 18)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }

  async function setupWaiting() {
    const instructorEmail = `test-wait-instr-${Date.now()}@example.com`
    const studentEmail = `test-wait-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Waiting Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Waiting Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('a re-entered waiting session can be started and advanced', async () => {
    const { instructor, assessment } = await setupWaiting()

    // Simulate a session left in Waiting (e.g. a previous start failed).
    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    expect(session!.status).toBe('waiting')

    // Re-enter: start works, then advance works (no "Session is not active").
    const started = await startLiveSession(session!.id, instructor.id)
    expect(started.error).toBeNull()
    expect(started.session!.status).toBe('active')

    const advanced = await advanceLiveSession(session!.id, instructor.id, 'next')
    expect(advanced.error).toBeNull()
    expect(advanced.session!.current_question_index).toBe(0)
  })

  test('a stale membership against an abandoned waiting session is cleaned up', async () => {
    const { instructor, student, assessment } = await setupWaiting()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)

    // Backdate the MEMBERSHIP itself so it is genuinely stale (ticket 21 F5:
    // the TTL keys on the membership's own age, not the session's).
    const longAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    await admin
      .from('live_session_members')
      .update({ joined_at: longAgo })
      .eq('session_id', session!.id)
      .eq('student_id', student.id)

    const result = await hasActiveLiveSession(student.id)
    expect(result.sessionId).toBeNull()
    expect(result.assessmentId).toBeNull()

    const { data: rows } = await admin
      .from('live_session_members')
      .select('id')
      .eq('student_id', student.id)
      .eq('session_id', session!.id)
    expect(rows).toHaveLength(0)
  })

  test('a fresh membership in an older-than-TTL Waiting session is never evicted', async () => {
    const { instructor, student, assessment } = await setupWaiting()
    const admin = getAdmin()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)

    // The SESSION predates the TTL...
    const longAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    await admin.from('live_sessions').update({ created_at: longAgo }).eq('id', session!.id)

    // ...but the student joined 1 minute ago — the membership must survive
    // cleanup (ticket 21 F5).
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    await admin
      .from('live_session_members')
      .update({ joined_at: oneMinuteAgo })
      .eq('session_id', session!.id)
      .eq('student_id', student.id)

    const result = await hasActiveLiveSession(student.id)
    expect(result.sessionId).toBe(session!.id)
    expect(result.assessmentId).toBe(assessment.id)

    const { data: rows } = await admin
      .from('live_session_members')
      .select('id')
      .eq('student_id', student.id)
      .eq('session_id', session!.id)
    expect(rows).toHaveLength(1)
  })

  test('a fresh waiting membership still blocks a second session', async () => {
    const { instructor, student, assessment } = await setupWaiting()

    const { session } = await createLiveSession(instructor!.id, assessment!.id)
    await joinLiveSession(session!.id, student.id)

    const result = await hasActiveLiveSession(student.id)
    expect(result.sessionId).toBe(session!.id)
    expect(result.assessmentId).toBe(assessment.id)
  })
})

describe('instructor-scoped session read (ticket 19)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }

  test('another instructor cannot read the session; the owner can', async () => {
    const instructorEmail = `test-idor-instr-${Date.now()}@example.com`
    const otherEmail = `test-idor-other-${Date.now()}@example.com`
    testEmails.push(instructorEmail, otherEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: other } = await createUser(otherEmail, 'TestPass123!', 'Other', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'IDOR Class')

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'IDOR Assessment', 'live', undefined)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [qA])
    await publishAssessment(assessment!.id, instructor!.id)

    const { session } = await createLiveSession(instructor!.id, assessment!.id)

    // Owner reads the full session with questions.
    const ownerView = await getLiveSessionForInstructor(session!.id, instructor!.id)
    expect(ownerView).not.toBeNull()
    expect(ownerView!.questions).toHaveLength(1)

    // Another instructor is rejected.
    const otherView = await getLiveSessionForInstructor(session!.id, other!.id)
    expect(otherView).toBeNull()
  })
})

describe('write-path membership and scoped answer counts (ticket 20.2 / 20.4)', () => {
  const qA: ParsedQuestion = {
    type: 'MultipleChoice',
    content: { stem: 'First question?', options: ['a', 'b'], correctAnswer: 'a', correctIndex: 0 },
    points: 2,
  }

  async function setupTwoAssessments() {
    const instructorEmail = `test-mp-instr-${Date.now()}@example.com`
    const studentEmail = `test-mp-stu-${Date.now()}@example.com`
    const outsiderEmail = `test-mp-out-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail, outsiderEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { user: outsider } = await createUser(outsiderEmail, 'TestPass123!', 'Out', 'Sider', 'student')

    const { class: cls1 } = await createClass(instructor!.id, 'MP Class 1')
    await joinClass(student!.id, cls1!.join_code)
    const { assessment: assessment1 } = await createAssessment(instructor!.id, cls1!.id, 'MP Assessment 1', 'live', undefined)
    await setAssessmentQuestions(assessment1!.id, instructor!.id, [qA])
    await publishAssessment(assessment1!.id, instructor!.id)

    const { class: cls2 } = await createClass(instructor!.id, 'MP Class 2')
    await joinClass(student!.id, cls2!.join_code)
    const { assessment: assessment2 } = await createAssessment(instructor!.id, cls2!.id, 'MP Assessment 2', 'live', undefined)
    await setAssessmentQuestions(assessment2!.id, instructor!.id, [qA])
    await publishAssessment(assessment2!.id, instructor!.id)

    return { instructor: instructor!, student: student!, outsider: outsider!, assessment1: assessment1!, assessment2: assessment2! }
  }

  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('a non-member cannot save answers even for the current question', async () => {
    const { instructor, student, assessment1 } = await setupTwoAssessments()

    const { session } = await createLiveSession(instructor.id, assessment1.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    const full = await getLiveSession(session!.id)

    const result = await saveLiveAnswer(session!.id, student.id, full!.questions[0].id, { selectedIndex: 0 })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('not a participant')
  })

  test('a student with membership in two non-ended sessions cannot save to the second one', async () => {
    const { instructor, student, outsider, assessment1, assessment2 } = await setupTwoAssessments()
    const admin = getAdmin()

    const { session: session1 } = await createLiveSession(instructor.id, assessment1.id)
    await joinLiveSession(session1!.id, student.id)

    const { session: session2 } = await createLiveSession(instructor.id, assessment2.id)

    // Forge a membership row for session2 (the DB trigger only guards INSERTs;
    // create it as an outsider and re-point it, simulating a split-brain state
    // the service-level check must still reject).
    const { data: forged } = await admin
      .from('live_session_members')
      .insert({ session_id: session2!.id, student_id: outsider.id })
      .select('id')
      .single()
    await admin
      .from('live_session_members')
      .update({ student_id: student.id })
      .eq('id', forged!.id)

    await startLiveSession(session2!.id, instructor.id)
    await advanceLiveSession(session2!.id, instructor.id, 'next')
    const full2 = await getLiveSession(session2!.id)

    const result = await saveLiveAnswer(session2!.id, student.id, full2!.questions[0].id, { selectedIndex: 0 })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('another live session')
  })

  test('non-owning instructors cannot read answer counts', async () => {
    const { instructor, student, assessment1 } = await setupTwoAssessments()

    const otherEmail = `test-mp-other-${Date.now()}@example.com`
    testEmails.push(otherEmail)
    const { user: other } = await createUser(otherEmail, 'TestPass123!', 'Other', 'Instructor', 'instructor')

    const { session } = await createLiveSession(instructor.id, assessment1.id)
    await startLiveSession(session!.id, instructor.id)
    await advanceLiveSession(session!.id, instructor.id, 'next')
    await joinLiveSession(session!.id, student.id)
    const full = await getLiveSession(session!.id)
    const qid = full!.questions[0].id
    await saveLiveAnswer(session!.id, student.id, qid, { selectedIndex: 0 })

    // Owner sees the count.
    const ownerCount = await getQuestionAnswerCount(session!.id, qid, instructor!.id)
    expect(ownerCount).toBe(1)
    const ownerCounts = await getSessionAnswerCounts(session!.id, [qid], instructor!.id)
    expect(ownerCounts[qid]).toBe(1)

    // Non-owner sees zero / empty.
    const otherCount = await getQuestionAnswerCount(session!.id, qid, other!.id)
    expect(otherCount).toBe(0)
    const otherCounts = await getSessionAnswerCounts(session!.id, [qid], other!.id)
    expect(otherCounts).toEqual({})
  })
})
