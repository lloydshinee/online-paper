import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createLiveSession, startLiveSession, endLiveSession, advanceLiveSession, joinLiveSession } from '@/lib/live-session-service'
import { saveLiveAnswer } from '@/lib/live-session-service'
import { getAssessmentQuestions } from '@/lib/assessment-service'
import { joinClass } from '@/lib/class-service'
import {
  createTestUser,
  createTestClass,
  createTestAssessment,
  cleanupTestData,
} from '../../test-utils'

// Ticket 21 hardening: action-level role dispatch for getLiveSessionAction.
// The authorization layer is stubbed; the live-session-service read functions
// are spied on (with everything else delegated to the real implementation) so
// the dispatch can be asserted per role.
vi.mock('@/lib/auth/authorize', () => ({
  authorize: vi.fn(),
}))

vi.mock('@/lib/live-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/live-session-service')>()
  return {
    ...actual,
    getLiveSessionForStudent: vi.fn(),
    getLiveSessionForInstructor: vi.fn(),
    getLiveSession: vi.fn(),
  }
})

import { authorize } from '@/lib/auth/authorize'
import { getLiveSessionAction } from '@/app/actions/live-assessment'
import {
  getLiveSessionForStudent,
  getLiveSessionForInstructor,
  getLiveSession,
  type StudentLiveSessionView,
  type LiveSessionData,
  type LiveQuestionData,
} from '@/lib/live-session-service'

const authorizeMock = vi.mocked(authorize)
const getLiveSessionForStudentMock = vi.mocked(getLiveSessionForStudent)
const getLiveSessionForInstructorMock = vi.mocked(getLiveSessionForInstructor)
const getLiveSessionMock = vi.mocked(getLiveSession)

describe('live assessment actions', () => {
  let instructor: { id: string; email: string; password: string; role: string }
  let student: { id: string; email: string; password: string; role: string }
  let testClass: { id: string; instructorId: string; joinCode: string }

  beforeAll(async () => {
    instructor = await createTestUser('instructor')
    student = await createTestUser('student')
    testClass = await createTestClass(instructor.id)
    await joinClass(student.id, testClass.joinCode)
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  test('full live session lifecycle', async () => {
    const assessment = await createTestAssessment(testClass.id, instructor.id, { publish: true, mode: 'live' })
    const questions = await getAssessmentQuestions(assessment.id)
    expect(questions.length).toBeGreaterThan(0)

    const { session, error: createError } = await createLiveSession(instructor.id, assessment.id)
    expect(createError).toBeNull()
    expect(session).toBeDefined()
    expect(session!.status).toBe('waiting')

    const { session: started, error: startError } = await startLiveSession(session!.id, instructor.id)
    expect(startError).toBeNull()
    expect(started).toBeDefined()
    expect(started!.status).toBe('active')

    const advanced = await advanceLiveSession(session!.id, instructor.id, 'next')
    expect(advanced.error).toBeNull()
    expect(advanced.session!.current_question_index).toBe(0)

    // Membership is enforced on the write path (ticket 20.2).
    const joinResult = await joinLiveSession(session!.id, student.id)
    expect(joinResult.error).toBeNull()

    const saveResult = await saveLiveAnswer(session!.id, student.id, questions[0].id, { selectedIndex: 0 })
    expect(saveResult.error).toBeNull()

    const { session: ended, error: endError } = await endLiveSession(session!.id, instructor.id)
    expect(endError).toBeNull()
    expect(ended).toBeDefined()
    expect(ended!.status).toBe('ended')
  })

  test('createLiveSession fails for non-live assessment', async () => {
    const timedAssessment = await createTestAssessment(testClass.id, instructor.id, { publish: true, mode: 'timed' })
    const { session, error } = await createLiveSession(instructor.id, timedAssessment.id)
    expect(session).toBeNull()
    expect(error).toBeDefined()
  })
})

describe('getLiveSessionAction role dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('student role dispatches to the sanitized student view', async () => {
    authorizeMock.mockResolvedValue({ userId: 'student-1', role: 'student' })
    const view: StudentLiveSessionView = {
      session: { id: 'session-1', assessment_id: 'assessment-1', current_question_index: 0, status: 'active' },
      currentQuestion: null,
      totalQuestions: 3,
    }
    getLiveSessionForStudentMock.mockResolvedValue(view)

    const result = await getLiveSessionAction('session-1')

    // Sanitized view returned verbatim; raw/scoped readers never touched.
    expect(result).toEqual(view)
    expect(getLiveSessionForStudentMock).toHaveBeenCalledWith('session-1', 'student-1')
    expect(getLiveSessionForInstructorMock).not.toHaveBeenCalled()
    expect(getLiveSessionMock).not.toHaveBeenCalled()
  })

  test('instructor role dispatches to the ownership-scoped read', async () => {
    authorizeMock.mockResolvedValue({ userId: 'instructor-1', role: 'instructor' })
    const scoped: LiveSessionData & { questions: LiveQuestionData[] } = {
      id: 'session-1',
      assessment_id: 'assessment-1',
      instructor_id: 'instructor-1',
      current_question_index: 0,
      status: 'active',
      started_at: null,
      ended_at: null,
      created_at: new Date().toISOString(),
      questions: [],
    }
    getLiveSessionForInstructorMock.mockResolvedValue(scoped)

    const result = await getLiveSessionAction('session-1')

    expect(result).toEqual(scoped)
    expect(getLiveSessionForInstructorMock).toHaveBeenCalledWith('session-1', 'instructor-1')
    expect(getLiveSessionForStudentMock).not.toHaveBeenCalled()
    expect(getLiveSessionMock).not.toHaveBeenCalled()
  })

  test('admin role dispatches to the raw session read', async () => {
    authorizeMock.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    const raw: LiveSessionData & { questions: LiveQuestionData[] } = {
      id: 'session-1',
      assessment_id: 'assessment-1',
      instructor_id: 'instructor-1',
      current_question_index: 0,
      status: 'active',
      started_at: null,
      ended_at: null,
      created_at: new Date().toISOString(),
      questions: [],
    }
    getLiveSessionMock.mockResolvedValue(raw)

    const result = await getLiveSessionAction('session-1')

    expect(result).toEqual(raw)
    expect(getLiveSessionMock).toHaveBeenCalledWith('session-1')
    expect(getLiveSessionForStudentMock).not.toHaveBeenCalled()
    expect(getLiveSessionForInstructorMock).not.toHaveBeenCalled()
  })

  test('unauthenticated callers get null', async () => {
    authorizeMock.mockResolvedValue({ error: 'Not authenticated' })

    const result = await getLiveSessionAction('session-1')

    expect(result).toBeNull()
    expect(getLiveSessionForStudentMock).not.toHaveBeenCalled()
    expect(getLiveSessionForInstructorMock).not.toHaveBeenCalled()
    expect(getLiveSessionMock).not.toHaveBeenCalled()
  })
})
