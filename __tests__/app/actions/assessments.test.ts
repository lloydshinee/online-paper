import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createAssessment, publishAssessment, getClassAssessments, setAssessmentQuestions } from '@/lib/assessment-service'
import {
  createTestUser,
  createTestClass,
  cleanupTestData,
} from '../../test-utils'

describe('assessment service', () => {
  let instructor: { id: string; email: string; password: string; role: string }
  let testClass: { id: string; instructorId: string; joinCode: string }

  beforeAll(async () => {
    instructor = await createTestUser('instructor')
    testClass = await createTestClass(instructor.id)
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  test('creates a draft assessment', async () => {
    const result = await createAssessment(instructor.id, testClass.id, 'Quiz 1', 'timed', 30)
    expect(result.error).toBeNull()
    expect(result.assessment).toBeDefined()
    expect(result.assessment!.state).toBe('draft')
    expect(result.assessment!.mode).toBe('timed')
    expect(result.assessment!.duration_minutes).toBe(30)
  })

  test('publishes an assessment', async () => {
    const { assessment } = await createAssessment(instructor.id, testClass.id, 'Quiz 2', 'timed', 15)
    expect(assessment).toBeDefined()

    const result = await publishAssessment(assessment!.id, instructor.id)
    expect(result.error).toBeNull()
    expect(result.assessment!.state).toBe('active')
  })

  test('getClassAssessments returns assessments for class', async () => {
    await createAssessment(instructor.id, testClass.id, 'Quiz 3', 'live', undefined)
    const { assessments, error } = await getClassAssessments(instructor.id, testClass.id)
    expect(error).toBeNull()
    expect(assessments.length).toBeGreaterThan(0)
  })

  test('createAssessment fails for non-owner', async () => {
    const otherInstructor = await createTestUser('instructor')
    const result = await createAssessment(otherInstructor.id, testClass.id, 'Bad Quiz', 'timed', 10)
    expect(result.error).toBeDefined()
  })
})
