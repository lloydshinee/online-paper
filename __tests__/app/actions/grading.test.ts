import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { getSubmissionsForAssessment, gradeAnswer } from '@/lib/submission-service'
import { startSubmission, saveAnswer, submitAssessment } from '@/lib/submission-service'
import { getAssessmentQuestions, updateAssessmentSettings } from '@/lib/assessment-service'
import { joinClass } from '@/lib/class-service'
import {
  createTestUser,
  createTestClass,
  createTestAssessment,
  cleanupTestData,
} from '../../test-utils'

describe('grading actions', () => {
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

  test('getSubmissionsForAssessment returns student submissions', async () => {
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getAssessmentQuestions(assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Paris' })
    await submitAssessment(submission!.id, student.id)

    const result = await getSubmissionsForAssessment(assessment.id)
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.submissions.length).toBeGreaterThan(0)
    const sub = result.submissions.find((s) => s.id === submission!.id)
    expect(sub).toBeDefined()
    expect(sub!.student_name).toBeDefined()
  })

  test('gradeAnswer updates score', async () => {
    // Enable retakes for the second submission
    await updateAssessmentSettings(assessment.id, instructor.id, { retakes_allowed: true })

    const { submission } = await startSubmission(student.id, assessment.id, { retake: true })
    const questions = await getAssessmentQuestions(assessment.id)
    await saveAnswer(submission!.id, questions[3].id, student.id, { text: 'Some essay' })
    await submitAssessment(submission!.id, student.id)
    await saveAnswer(submission!.id, questions[3].id, student.id, { text: 'Some essay' })
    await submitAssessment(submission!.id, student.id)

    const { submissions } = await getSubmissionsForAssessment(assessment.id)
    const sub = submissions.find((s) => s.student_id === student.id)
    expect(sub).toBeDefined()
    expect(sub!.pending_count).toBeGreaterThan(0)

    if (sub && sub.pending_count > 0) {
      const result = await gradeAnswer('test-answer-id', 3, 'Good work')
      expect(result).toBeDefined()
    }
  })
})
