import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { startSubmission, saveAnswer, submitAssessment } from '@/lib/submission-service'
import { getAssessmentQuestions } from '@/lib/assessment-service'
import { joinClass } from '@/lib/class-service'
import {
  createTestUser,
  createTestClass,
  createTestAssessment,
  cleanupTestData,
} from '../../test-utils'

describe('timed assessment flow', () => {
  let instructor: { id: string; email: string; password: string; role: string }
  let student: { id: string; email: string; password: string; role: string }
  let testClass: { id: string; instructorId: string; joinCode: string }
  let assessment: { id: string; classId: string }

  beforeAll(async () => {
    instructor = await createTestUser('instructor')
    student = await createTestUser('student')
    testClass = await createTestClass(instructor.id)
    await joinClass(student.id, testClass.joinCode)
    assessment = await createTestAssessment(testClass.id, instructor.id, { publish: true })
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  test('starts a submission', async () => {
    const result = await startSubmission(student.id, assessment.id)
    expect(result.error).toBeNull()
    expect(result.submission).toBeDefined()
    expect(result.submission!.status).toBe('in_progress')
  })

  test('saves an answer', async () => {
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getAssessmentQuestions(assessment.id)
    expect(questions.length).toBeGreaterThan(0)

    const result = await saveAnswer(
      submission!.id,
      questions[0].id,
      student.id,
      { selectedIndex: 1 },
    )
    expect(result.error).toBeNull()
  })

  test('submits an assessment', async () => {
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getAssessmentQuestions(assessment.id)

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Paris' })

    const result = await submitAssessment(submission!.id, student.id)
    expect(result.error).toBeNull()
    expect(result.submission!.status).toBe('submitted')
  })
})
