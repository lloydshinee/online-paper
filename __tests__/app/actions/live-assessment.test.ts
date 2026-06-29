import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createLiveSession, startLiveSession, endLiveSession } from '@/lib/live-session-service'
import { saveLiveAnswer } from '@/lib/live-session-service'
import { getAssessmentQuestions } from '@/lib/assessment-service'
import {
  createTestUser,
  createTestClass,
  createTestAssessment,
  cleanupTestData,
} from '../../test-utils'

describe('live assessment actions', () => {
  let instructor: { id: string; email: string; password: string; role: string }
  let student: { id: string; email: string; password: string; role: string }
  let testClass: { id: string; instructorId: string; joinCode: string }

  beforeAll(async () => {
    instructor = await createTestUser('instructor')
    student = await createTestUser('student')
    testClass = await createTestClass(instructor.id)
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
