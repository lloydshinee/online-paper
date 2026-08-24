import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  getSubmissionsForAssessment,
  gradeAnswer,
  startSubmission,
  saveAnswer,
  submitAssessment,
  getSubmission,
  getSubmissionForGrading,
  verifySubmissionOwnership,
  deleteSubmission,
} from '@/lib/submission-service'
import { getAssessmentQuestions, updateAssessmentSettings, verifyAssessmentOwnership } from '@/lib/assessment-service'
import { joinClass } from '@/lib/class-service'
import {
  createTestUser,
  createTestClass,
  createTestAssessment,
  cleanupTestData,
} from '../../test-utils'
import { getAdminClient } from '../../setup'

describe('grading actions', () => {
  let instructor: { id: string; email: string; password: string; role: string }
  let otherInstructor: { id: string; email: string; password: string; role: string }
  let student: { id: string; email: string; password: string; role: string }
  let testClass: { id: string; instructorId: string; joinCode: string }
  let assessment: { id: string; classId: string }

  beforeAll(async () => {
    instructor = await createTestUser('instructor')
    otherInstructor = await createTestUser('instructor')
    student = await createTestUser('student')
    testClass = await createTestClass(instructor.id)
    await joinClass(student.id, testClass.joinCode)
    assessment = await createTestAssessment(testClass.id, instructor.id, { publish: true })
    await updateAssessmentSettings(assessment.id, instructor.id, { retakes_allowed: true })
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  async function submitAttempt() {
    const { submission } = await startSubmission(student.id, assessment.id, { retake: true })
    const questions = await getAssessmentQuestions(assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Paris' })
    await saveAnswer(submission!.id, questions[3].id, student.id, { text: 'Some essay' })
    await submitAssessment(submission!.id, student.id)
    return submission!
  }

  test('getSubmissionsForAssessment returns student submissions', async () => {
    const submission = await submitAttempt()

    const result = await getSubmissionsForAssessment(assessment.id)
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.submissions.length).toBeGreaterThan(0)
    const sub = result.submissions.find((s) => s.id === submission.id)
    expect(sub).toBeDefined()
    expect(sub!.student_name).toBeDefined()
  })

  test('gradeAnswer updates score for the owning instructor', async () => {
    const submission = await submitAttempt()
    const detail = await getSubmission(submission.id, student.id)
    const questions = await getAssessmentQuestions(assessment.id)
    const essayQ = questions.find((q) => q.type === 'Essay')!
    const answer = detail!.answers.find((a) => a.question_id === essayQ.id)!

    const result = await gradeAnswer(answer.id, 3, 'Good work', instructor.id)
    expect(result.error).toBeNull()

    const after = await getSubmission(submission.id, student.id)
    const graded = after!.answers.find((a) => a.id === answer.id)
    expect(graded!.score).toBe(3)
    expect(graded!.feedback).toBe('Good work')
  })

  test('another instructor cannot grade answers on this assessment', async () => {
    const submission = await submitAttempt()
    const detail = await getSubmission(submission.id, student.id)
    const questions = await getAssessmentQuestions(assessment.id)
    const essayQ = questions.find((q) => q.type === 'Essay')!
    const answer = detail!.answers.find((a) => a.question_id === essayQ.id)!

    const result = await gradeAnswer(answer.id, 5, 'Hacked', otherInstructor.id)

    expect(result.error).toBeDefined()
    expect(result.error).toContain('Not authorized')

    // No partial write happened
    const after = await getSubmission(submission.id, student.id)
    const untouched = after!.answers.find((a) => a.id === answer.id)
    expect(untouched!.score).not.toBe(5)
  })

  test('manual grading an auto-graded question type is rejected', async () => {
    const submission = await submitAttempt()
    const detail = await getSubmission(submission.id, student.id)
    const questions = await getAssessmentQuestions(assessment.id)
    const mcQ = questions.find((q) => q.type === 'MultipleChoice')!
    const answer = detail!.answers.find((a) => a.question_id === mcQ.id)!

    const result = await gradeAnswer(answer.id, 2, 'Forced', instructor.id)

    expect(result.error).toBeDefined()
    expect(result.error).toContain('Cannot manually grade')
  })

  test('composite unanswered ID branch validates ownership and question membership', async () => {
    const submission = await submitAttempt()
    const questions = await getAssessmentQuestions(assessment.id)
    const essayQ = questions.find((q) => q.type === 'Essay')!

    // Cross-instructor attempt via composite ID is rejected
    const crossResult = await gradeAnswer(`_unanswered_${submission.id}_${essayQ.id}`, 5, null, otherInstructor.id)
    expect(crossResult.error).toBeDefined()

    // Composite ID pointing at a question from a different assessment is rejected
    const foreignResult = await gradeAnswer(`_unanswered_${submission.id}_${submission.assessment_id}`, 5, null, instructor.id)
    expect(foreignResult.error).toBeDefined()

    // Owning instructor grading an unanswered manual question works
    const okResult = await gradeAnswer(`_unanswered_${submission.id}_${essayQ.id}`, 4, 'Late grade', instructor.id)
    expect(okResult.error).toBeNull()

    const after = await getSubmission(submission.id, student.id)
    const created = after!.answers.find((a) => a.question_id === essayQ.id)
    expect(created).toBeDefined()
    expect(created!.score).toBe(4)
  })

  test('cross-instructor submission read is rejected by ownership helper', async () => {
    const submission = await submitAttempt()

    expect(await verifySubmissionOwnership(instructor.id, submission.id)).toBe(true)
    expect(await verifySubmissionOwnership(otherInstructor.id, submission.id)).toBe(false)
  })

  test('cross-instructor assessment read is rejected by ownership helper', async () => {
    expect(await verifyAssessmentOwnership(instructor.id, assessment.id)).toBe(true)
    expect(await verifyAssessmentOwnership(otherInstructor.id, assessment.id)).toBe(false)
  })

  test('deleteSubmission removes the attempt, cascades its answers, and drops it from listings', async () => {
    const submission = await submitAttempt()
    const detail = await getSubmission(submission.id, student.id)
    expect(detail!.answers.length).toBeGreaterThan(0)

    // Ownership gate used by deleteSubmissionAction: only the owning instructor may delete.
    expect(await verifySubmissionOwnership(instructor.id, submission.id)).toBe(true)
    expect(await verifySubmissionOwnership(otherInstructor.id, submission.id)).toBe(false)

    const before = await getSubmissionsForAssessment(assessment.id)
    expect(before.submissions.find((s) => s.id === submission.id)).toBeDefined()

    const result = await deleteSubmission(submission.id)
    expect(result.error).toBeNull()

    const admin = getAdminClient()
    const { data: answers } = await admin.from('answers').select('id').eq('submission_id', submission.id)
    expect(answers).toHaveLength(0)

    const after = await getSubmissionsForAssessment(assessment.id)
    expect(after.submissions.find((s) => s.id === submission.id)).toBeUndefined()
  })

  test('deleting the only attempt returns the student to never-taken even when retakes are disallowed', async () => {
    await updateAssessmentSettings(assessment.id, instructor.id, { retakes_allowed: false })
    const fresh = await createTestUser('student')
    await joinClass(fresh.id, testClass.joinCode)

    const first = await startSubmission(fresh.id, assessment.id)
    expect(first.error).toBeNull()
    const questions = await getAssessmentQuestions(assessment.id)
    await saveAnswer(first.submission!.id, questions[0].id, fresh.id, { selectedIndex: 1 })
    await submitAssessment(first.submission!.id, fresh.id)

    // With the attempt present (and retakes off), a plain restart is blocked...
    const blocked = await startSubmission(fresh.id, assessment.id)
    expect(blocked.error).toContain('already submitted')

    const deleted = await deleteSubmission(first.submission!.id)
    expect(deleted.error).toBeNull()

    // ...but once the rows are gone the student is never-taken again and can start over.
    const restart = await startSubmission(fresh.id, assessment.id)
    expect(restart.error).toBeNull()
    expect(restart.submission!.status).toBe('in_progress')

    await updateAssessmentSettings(assessment.id, instructor.id, { retakes_allowed: true })
  })

  test('getSubmissionForGrading returns the detail for valid submissions', async () => {
    const submission = await submitAttempt()
    const detail = await getSubmissionForGrading(submission.id)
    expect(detail).not.toBeNull()
    expect(detail!.assessment_title).toBe('Test Assessment')
  })
})
