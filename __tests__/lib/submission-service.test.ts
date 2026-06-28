import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import { createAssessment, publishAssessment, setAssessmentQuestions } from '@/lib/assessment-service'
import {
  startSubmission,
  getSubmission,
  saveAnswer,
  submitAssessment,
  getQuestionsForAssessment,
  getActiveSubmission,
  getStudentSubmissionResults,
} from '@/lib/submission-service'
import { updateAssessmentSettings } from '@/lib/assessment-service'
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

const tfQuestion: ParsedQuestion = {
  type: 'TrueOrFalse',
  content: { statement: 'The sky is blue.', correctAnswer: true },
  points: 1,
}

const essayQuestion: ParsedQuestion = {
  type: 'Essay',
  content: { prompt: 'Describe photosynthesis.' },
  points: 5,
}

async function setupAssessment() {
  const instructorEmail = `test-sub-instr-${Date.now()}@example.com`
  const studentEmail = `test-sub-stu-${Date.now()}@example.com`
  testEmails.push(instructorEmail, studentEmail)

  const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Instructor', 'instructor')
  const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Student', 'student')
  const { class: cls } = await createClass(instructor!.id, 'Sub Class')
  await joinClass(student!.id, cls!.join_code)

  const { assessment } = await createAssessment(
    instructor!.id, cls!.id, 'Test Assessment', 'timed', 30,
  )
  await setAssessmentQuestions(assessment!.id, instructor!.id, [mcQuestion, tfQuestion, essayQuestion])
  await publishAssessment(assessment!.id, instructor!.id)

  return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
}

describe('submission service', () => {
  test('student starts a submission', async () => {
    const { student, assessment } = await setupAssessment()

    const result = await startSubmission(student.id, assessment.id)

    expect(result.error).toBeNull()
    expect(result.submission).toBeDefined()
    expect(result.submission!.status).toBe('in_progress')
    expect(result.submission!.student_id).toBe(student.id)
    expect(result.submission!.assessment_id).toBe(assessment.id)
    expect(result.submission!.started_at).toBeDefined()
  })

  test('cannot start two active submissions for same assessment', async () => {
    const { student, assessment } = await setupAssessment()

    const first = await startSubmission(student.id, assessment.id)
    expect(first.error).toBeNull()

    const second = await startSubmission(student.id, assessment.id)
    expect(second.error).toBeDefined()
  })

  test('student saves answers', async () => {
    const { student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getQuestionsForAssessment(assessment.id)
    expect(questions).toHaveLength(3)

    // Save MC answer
    const mcQ = questions.find((q) => q.type === 'MultipleChoice')!
    const mcResult = await saveAnswer(submission!.id, mcQ.id, student.id, { selectedIndex: 1 })
    expect(mcResult.error).toBeNull()

    // Save TF answer
    const tfQ = questions.find((q) => q.type === 'TrueOrFalse')!
    const tfResult = await saveAnswer(submission!.id, tfQ.id, student.id, { value: true })
    expect(tfResult.error).toBeNull()

    // Save Essay answer
    const essayQ = questions.find((q) => q.type === 'Essay')!
    const essayResult = await saveAnswer(submission!.id, essayQ.id, student.id, { text: 'Photosynthesis is...' })
    expect(essayResult.error).toBeNull()

    // Verify answers stored
    const sub = await getSubmission(submission!.id, student.id)
    expect(sub.answers).toHaveLength(3)
    expect(sub.answers.find((a) => a.question_id === mcQ.id)!.answer_content).toEqual({ selectedIndex: 1 })
  })

  test('student submits assessment', async () => {
    const { student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getQuestionsForAssessment(assessment.id)

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 0 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: false })

    const result = await submitAssessment(submission!.id, student.id)

    expect(result.error).toBeNull()
    expect(result.submission!.status).toBe('submitted')
    expect(result.submission!.submitted_at).toBeDefined()

    // Verify cannot submit again
    const second = await submitAssessment(submission!.id, student.id)
    expect(second.error).toBeDefined()
  })

  test('getActiveSubmission returns in-progress submission', async () => {
    const { student, assessment } = await setupAssessment()

    const { submission } = await startSubmission(student.id, assessment.id)

    const active = await getActiveSubmission(student.id, assessment.id)

    expect(active!.id).toBe(submission!.id)
    expect(active!.status).toBe('in_progress')
  })

  test('getActiveSubmission returns null when no active submission', async () => {
    const { student, assessment } = await setupAssessment()

    const active = await getActiveSubmission(student.id, assessment.id)
    expect(active).toBeNull()
  })
})

describe('score release', () => {
  test('getStudentSubmissionResults returns null submission before taking', async () => {
    const { student, assessment } = await setupAssessment()

    const results = await getStudentSubmissionResults(assessment.id, student.id)

    expect(results).not.toBeNull()
    expect(results!.assessment.scores_released).toBe(false)
    expect(results!.assessment.answer_reveal_enabled).toBe(false)
    expect(results!.submission).toBeNull()
    expect(results!.answers).toBeNull()
  })

  test('getStudentSubmissionResults returns submission after submitting', async () => {
    const { student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getQuestionsForAssessment(assessment.id)

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await submitAssessment(submission!.id, student.id)

    const results = await getStudentSubmissionResults(assessment.id, student.id)

    expect(results).not.toBeNull()
    expect(results!.submission).not.toBeNull()
    expect(results!.submission!.status).toBe('submitted')
    expect(results!.answers).not.toBeNull()
    expect(results!.answers!.length).toBeGreaterThan(0)
    expect(results!.assessment.total_points).toBeGreaterThan(0)
  })

  test('getStudentSubmissionResults reflects scores_released setting', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getQuestionsForAssessment(assessment.id)

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(submission!.id, student.id)

    // Release scores
    await updateAssessmentSettings(assessment.id, instructor.id, { scores_released: true })

    const results = await getStudentSubmissionResults(assessment.id, student.id)

    expect(results!.assessment.scores_released).toBe(true)
    expect(results!.submission!.score_total).not.toBeNull()
    expect(results!.answers!.length).toBeGreaterThan(0)
  })

  test('getStudentSubmissionResults reflects answer_reveal_enabled setting', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getQuestionsForAssessment(assessment.id)

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(submission!.id, student.id)

    // Release scores and answers
    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })

    const results = await getStudentSubmissionResults(assessment.id, student.id)

    expect(results!.assessment.scores_released).toBe(true)
    expect(results!.assessment.answer_reveal_enabled).toBe(true)
  })

  test('getStudentSubmissionResults returns auto-graded scores', async () => {
    const { student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getQuestionsForAssessment(assessment.id)

    // Correct MC answer (correctIndex is 1)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    // Correct TF answer (correctAnswer is true)
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    // Essay answer (not auto-graded)
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Photosynthesis is the process...' })
    await submitAssessment(submission!.id, student.id)

    const results = await getStudentSubmissionResults(assessment.id, student.id)

    expect(results!.submission!.score_total).toBeGreaterThan(0)

    // MC should be correct (correctIndex 1 matches selectedIndex 1, worth 2 pts)
    const mcAnswer = results!.answers!.find((a) => a.questions.type === 'MultipleChoice')
    expect(mcAnswer!.is_correct).toBe(true)
    expect(mcAnswer!.score).toBe(2)

    // TF should be correct (value true matches correctAnswer true, worth 1 pt)
    const tfAnswer = results!.answers!.find((a) => a.questions.type === 'TrueOrFalse')
    expect(tfAnswer!.is_correct).toBe(true)
    expect(tfAnswer!.score).toBe(1)

    // Essay should not be graded yet
    const essayAnswer = results!.answers!.find((a) => a.questions.type === 'Essay')
    expect(essayAnswer!.score).toBeNull()
    expect(essayAnswer!.is_correct).toBeNull()
  })
})
