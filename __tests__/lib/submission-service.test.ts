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
  getActiveSubmission,
  getStudentSubmissionResults,
  recalculateAssessmentScores,
  gradeAnswer,
} from '@/lib/submission-service'
import { updateAssessmentSettings, getAssessmentQuestions } from '@/lib/assessment-service'
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

  const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
  const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
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
    const questions = await getAssessmentQuestions(assessment.id)
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
    expect(sub).toBeDefined()
    expect(sub!.answers).toHaveLength(3)
    expect(sub!.answers.find((a) => a.question_id === mcQ.id)!.answer_content).toEqual({ selectedIndex: 1 })
  })

  test('student submits assessment', async () => {
    const { student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getAssessmentQuestions(assessment.id)

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
    const questions = await getAssessmentQuestions(assessment.id)

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
    const questions = await getAssessmentQuestions(assessment.id)

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
    const questions = await getAssessmentQuestions(assessment.id)

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
    const { student, assessment, instructor } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getAssessmentQuestions(assessment.id)

    // Correct MC answer (correctIndex is 1)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    // Correct TF answer (correctAnswer is true)
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    // Essay answer (not auto-graded)
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Photosynthesis is the process...' })
    await submitAssessment(submission!.id, student.id)

    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })

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

describe('retakes', () => {
  test('student can retake when retakes_allowed is enabled', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    // Submit first attempt
    const { submission: first } = await startSubmission(student.id, assessment.id)
    await saveAnswer(first!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(first!.id, student.id)

    // Enable retakes
    await updateAssessmentSettings(assessment.id, instructor.id, { retakes_allowed: true })

    // Start a retake
    const { submission: retake } = await startSubmission(student.id, assessment.id, { retake: true })

    expect(retake).not.toBeNull()
    expect(retake!.id).not.toBe(first!.id) // New submission
    expect(retake!.status).toBe('in_progress')

    // Verify first submission is preserved
    const results = await getStudentSubmissionResults(assessment.id, student.id)
    expect(results!.submission!.id).toBe(first!.id) // Latest remains first until retake submitted
    expect(results!.submission!.status).toBe('submitted')

    // Submit retake
    await saveAnswer(retake!.id, questions[0].id, student.id, { selectedIndex: 0 }) // Wrong answer
    await submitAssessment(retake!.id, student.id)

    // Now latest should be the retake
    const after = await getStudentSubmissionResults(assessment.id, student.id)
    expect(after!.submission!.id).toBe(retake!.id)
    expect(after!.submission!.status).toBe('submitted')
  })

  test('retake fails when retakes_allowed is disabled', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    // Submit
    const { submission: first } = await startSubmission(student.id, assessment.id)
    await saveAnswer(first!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(first!.id, student.id)

    // Try retake without enabling
    const { submission: retake, error } = await startSubmission(student.id, assessment.id, { retake: true })

    expect(retake).toBeNull()
    expect(error).toContain('Retakes are not allowed')
  })

  test('startSubmission rejects surprise re-entry after submit without retake flag', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    // Submit first attempt
    const { submission: first } = await startSubmission(student.id, assessment.id)
    await saveAnswer(first!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(first!.id, student.id)

    // Try to start a new submission without retake flag (simulating page refresh)
    const { submission: second, error } = await startSubmission(student.id, assessment.id)

    expect(second).toBeNull()
    expect(error).toContain('already submitted')
  })
})

describe('score recalculation', () => {
  test('recalculates scores after question edit', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    // Correct answers: MC selectedIndex 1 = correctIndex 1, TF value true = correctAnswer true
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Photosynthesis...' })
    await submitAssessment(submission!.id, student.id)

    // Verify original scores
    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })
    const before = await getStudentSubmissionResults(assessment.id, student.id)
    const mcBefore = before!.answers!.find((a) => a.questions.type === 'MultipleChoice')
    expect(mcBefore!.score).toBe(2)
    expect(mcBefore!.is_correct).toBe(true)

    // Edit questions: change MC correct answer from index 1 to index 0
    const modifiedQuestions: ParsedQuestion[] = [
      { ...mcQuestion, content: { ...mcQuestion.content, correctIndex: 0, correctAnswer: '3' } },
      tfQuestion,
      essayQuestion,
    ]
    await setAssessmentQuestions(assessment.id, instructor.id, modifiedQuestions)

    // Check recalculation happened (score should change because correct answer changed)
    const after = await getStudentSubmissionResults(assessment.id, student.id)
    const mcAfter = after!.answers!.find((a) => a.questions.type === 'MultipleChoice')
    // Student answered index 1, but correct is now index 0 — should be wrong
    expect(mcAfter!.score).toBe(0)
    expect(mcAfter!.is_correct).toBe(false)
  })

  test('recalculates scores when question points change', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await submitAssessment(submission!.id, student.id)

    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })
    const before = await getStudentSubmissionResults(assessment.id, student.id)
    expect(before!.submission!.score_total).toBe(1)

    // Change TF question points from 1 to 10
    const modifiedQuestions: ParsedQuestion[] = [
      mcQuestion,
      { ...tfQuestion, points: 10 },
      essayQuestion,
    ]
    await setAssessmentQuestions(assessment.id, instructor.id, modifiedQuestions)

    const after = await getStudentSubmissionResults(assessment.id, student.id)
    const tfAfter = after!.answers!.find((a) => a.questions.type === 'TrueOrFalse')
    expect(tfAfter!.score).toBe(10)
    expect(after!.submission!.score_total).toBe(10)
  })

  test('standalone recalculateAssessmentScores works', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: false })
    await submitAssessment(submission!.id, student.id)

    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })

    const before = await getStudentSubmissionResults(assessment.id, student.id)
    const tfBefore = before!.answers!.find((a) => a.questions.type === 'TrueOrFalse')
    expect(tfBefore!.is_correct).toBe(false)
    expect(tfBefore!.score).toBe(0)

    // Directly call recalculate (no-op since questions haven't changed)
    const result = await recalculateAssessmentScores(assessment.id)
    expect(result.error).toBeNull()

    // Scores should remain the same
    const after = await getStudentSubmissionResults(assessment.id, student.id)
    expect(after!.submission!.score_total).toBe(before!.submission!.score_total)
  })

  test('recalculation handles assessment with no submissions', async () => {
    const { assessment } = await setupAssessment()
    const result = await recalculateAssessmentScores(assessment.id)
    expect(result.error).toBeNull()
  })

  test('recalculation preserves existing manual grades', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Photosynthesis is the process...' })
    await submitAssessment(submission!.id, student.id)

    // Manually grade the essay
    const sub = await getSubmission(submission!.id, student.id)
    const essayAnswer = sub!.answers.find((a) => a.question_id === questions[2].id)
    await gradeAnswer(essayAnswer!.id, 4, 'Well written')

    // Verify manual grade
    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })
    const before = await getStudentSubmissionResults(assessment.id, student.id)
    const essayBefore = before!.answers!.find((a) => a.questions.type === 'Essay')
    expect(essayBefore!.score).toBe(4)
    expect(essayBefore!.feedback).toBe('Well written')

    // Change MC points (triggers recalculation)
    const modifiedQuestions: ParsedQuestion[] = [
      { ...mcQuestion, points: 3 },
      tfQuestion,
      essayQuestion,
    ]
    await setAssessmentQuestions(assessment.id, instructor.id, modifiedQuestions)

    // Manual grade should be preserved
    const after = await getStudentSubmissionResults(assessment.id, student.id)
    const essayAfter = after!.answers!.find((a) => a.questions.type === 'Essay')
    expect(essayAfter!.score).toBe(4)
    expect(essayAfter!.feedback).toBe('Well written')
  })
})
