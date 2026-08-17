import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import { createAssessment, publishAssessment, setAssessmentQuestions, updateAssessmentSettings, getAssessmentQuestions } from '@/lib/assessment-service'
import {
  startSubmission,
  getSubmission,
  saveAnswer,
  submitAssessment,
  getActiveSubmission,
  getStudentSubmissionResults,
  recalculateAssessmentScores,
  gradeAnswer,
  expireSubmission,
  extendSubmissionTime,
} from '@/lib/submission-service'
import { computeDeadline } from '@/lib/deadline'
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

  test('starting while a submission is In Progress resumes the same submission (idempotent)', async () => {
    const { student, assessment } = await setupAssessment()

    const first = await startSubmission(student.id, assessment.id)
    expect(first.error).toBeNull()

    const second = await startSubmission(student.id, assessment.id)
    expect(second.error).toBeNull()
    expect(second.submission!.id).toBe(first.submission!.id)
    expect(second.submission!.status).toBe('in_progress')
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

  test('per-question correctness stays hidden until answer reveal, even after score release', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)
    const questions = await getAssessmentQuestions(assessment.id)

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await submitAssessment(submission!.id, student.id)

    // Release scores but keep answer reveal OFF — the exact state that
    // leaked per-question correctness to students mid-exam.
    await updateAssessmentSettings(assessment.id, instructor.id, { scores_released: true })

    const results = await getStudentSubmissionResults(assessment.id, student.id)

    expect(results!.assessment.scores_released).toBe(true)
    expect(results!.assessment.answer_reveal_enabled).toBe(false)
    // The total score is visible...
    expect(results!.submission!.score_total).not.toBeNull()
    // ...but per-question grading data must not be.
    for (const answer of results!.answers!) {
      expect(answer.is_correct).toBeNull()
      expect(answer.score).toBeNull()
      expect(answer.questions.content.correctAnswer).toBeUndefined()
      expect(answer.questions.content.correctIndex).toBeUndefined()
    }
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
    const { student, assessment } = await setupAssessment()
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
    await gradeAnswer(essayAnswer!.id, 4, 'Well written', instructor.id)

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

describe('deadline enforcement on write paths', () => {
  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  async function backdateSubmission(submissionId: string, hoursAgo = 2) {
    const admin = getAdmin()
    const startedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
    await admin.from('submissions').update({ started_at: startedAt }).eq('id', submissionId)
  }

  test('saving an answer after the deadline is rejected and expires + grades the submission', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await backdateSubmission(submission!.id)

    const result = await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })

    expect(result.error).toBeDefined()
    expect(result.error).toContain('expired')

    // Submission was expired and auto-graded server-side
    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('status, score_total').eq('id', submission!.id).single()
    expect(row!.status).toBe('expired')
    expect(row!.score_total).not.toBeNull()
  })

  test('submitting after the deadline yields status expired, not submitted', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await backdateSubmission(submission!.id)

    const result = await submitAssessment(submission!.id, student.id)

    expect(result.error).toBeNull()
    expect(result.submission!.status).toBe('expired')
  })

  test('manual submit before the deadline yields submitted; double submit cannot grade twice', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })

    const first = await submitAssessment(submission!.id, student.id)
    expect(first.error).toBeNull()
    expect(first.submission!.status).toBe('submitted')
    const firstScore = first.submission!.score_total

    const second = await submitAssessment(submission!.id, student.id)
    expect(second.error).toBeDefined()

    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('status, score_total').eq('id', submission!.id).single()
    expect(row!.status).toBe('submitted')
    expect(row!.score_total).toBe(firstScore)
  })

  test('expireSubmission is scoped to the owning student', async () => {
    const { student, assessment } = await setupAssessment()
    const { submission } = await startSubmission(student.id, assessment.id)

    // Wrong student cannot expire someone else's submission
    const other = await createUser(`test-sub-other-${Date.now()}@example.com`, 'TestPass123!', 'Other', 'Student', 'student')
    testEmails.push(other.user!.email)
    const wrongResult = await expireSubmission(submission!.id, other.user!.id)
    const admin = getAdmin()
    const { data: stillInProgress } = await admin.from('submissions').select('status').eq('id', submission!.id).single()
    expect(stillInProgress!.status).toBe('in_progress')
    expect(wrongResult.submission!.status).toBe('in_progress')

    // Owning student expires successfully
    const okResult = await expireSubmission(submission!.id, student.id, { force: true })
    expect(okResult.error).toBeNull()
    expect(okResult.submission!.status).toBe('expired')
    expect(okResult.submission!.score_total).not.toBeNull()
  })

  test('two racing submits transition exactly once (ticket 20.5)', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })

    const [a, b] = await Promise.all([
      submitAssessment(submission!.id, student.id),
      submitAssessment(submission!.id, student.id),
    ])

    const winners = [a, b].filter((r) => r.error === null)
    const losers = [a, b].filter((r) => r.error !== null)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0].error).toContain('already submitted')
    expect(winners[0].submission!.status).toBe('submitted')

    // The submission is graded once with the correct total (2 + 1 = 3).
    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('status, score_total').eq('id', submission!.id).single()
    expect(row!.status).toBe('submitted')
    expect(row!.score_total).toBe(3)
  })
})

describe('time extensions (extra_seconds) on write paths', () => {
  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  async function backdateSubmission(submissionId: string, hoursAgo = 2) {
    const admin = getAdmin()
    const startedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
    await admin.from('submissions').update({ started_at: startedAt }).eq('id', submissionId)
  }

  async function setExtraSeconds(submissionId: string, seconds: number) {
    const admin = getAdmin()
    await admin.from('submissions').update({ extra_seconds: seconds }).eq('id', submissionId)
  }

  test('extendSubmissionTime moves the deadline so saves past the old deadline are accepted', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await backdateSubmission(submission!.id)

    const extension = await extendSubmissionTime(submission!.id, instructor.id, 180)
    expect(extension.error).toBeNull()
    expect(extension.submission!.extra_seconds).toBe(180 * 60)

    const result = await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })

    expect(result.error).toBeNull()

    // The submission stays in progress and the answer landed.
    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('status').eq('id', submission!.id).single()
    expect(row!.status).toBe('in_progress')
    const sub = await getSubmission(submission!.id, student.id)
    expect(sub!.answers.find((a) => a.question_id === questions[1].id)!.answer_content).toEqual({ value: true })
  })

  test('a save past the extended deadline is rejected and expires the submission', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    // Started 2 hours ago with only 30 extra minutes: the extended deadline was 1 hour ago.
    await backdateSubmission(submission!.id)
    await setExtraSeconds(submission!.id, 30 * 60)

    const result = await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })

    expect(result.error).toBeDefined()
    expect(result.error).toContain('expired')

    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('status, score_total').eq('id', submission!.id).single()
    expect(row!.status).toBe('expired')
    expect(row!.score_total).not.toBeNull()
  })

  test('repeat grants accumulate on an in-progress submission', async () => {
    const { instructor, student, assessment } = await setupAssessment()

    const { submission } = await startSubmission(student.id, assessment.id)

    const first = await extendSubmissionTime(submission!.id, instructor.id, 5)
    const second = await extendSubmissionTime(submission!.id, instructor.id, 10)

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(second.submission!.extra_seconds).toBe(15 * 60)
    expect(second.submission!.status).toBe('in_progress')
  })

  test('reopen transitions to in_progress, clears auto grades, keeps manual grades, and resets violations', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)
    const admin = getAdmin()

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    await saveAnswer(submission!.id, questions[2].id, student.id, { text: 'Plants convert light into energy.' })
    await submitAssessment(submission!.id, student.id)

    const graded = await getSubmission(submission!.id, student.id)
    const essayAnswer = graded!.answers.find((answer) => answer.question_id === questions[2].id)!
    await gradeAnswer(essayAnswer.id, 4, 'Keep this feedback', instructor.id)
    await admin.from('submissions').update({ violations: 2 }).eq('id', submission!.id)

    const reopened = await extendSubmissionTime(submission!.id, instructor.id, 5)

    expect(reopened.error).toBeNull()
    expect(reopened.submission!.status).toBe('in_progress')
    expect(reopened.submission!.submitted_at).toBeNull()
    expect(reopened.submission!.score_total).toBeNull()
    expect(reopened.submission!.violations).toBe(0)

    const after = await getSubmission(submission!.id, student.id)
    const mcQuestionId = questions.find((question) => question.type === 'MultipleChoice')!.id
    const tfQuestionId = questions.find((question) => question.type === 'TrueOrFalse')!.id
    const essayQuestionId = questions.find((question) => question.type === 'Essay')!.id
    const mcAnswer = after!.answers.find((answer) => answer.question_id === mcQuestionId)!
    const tfAnswer = after!.answers.find((answer) => answer.question_id === tfQuestionId)!
    const essayAfter = after!.answers.find((answer) => answer.question_id === essayQuestionId)!

    expect(mcAnswer.score).toBeNull()
    expect(mcAnswer.is_correct).toBeNull()
    expect(tfAnswer.score).toBeNull()
    expect(tfAnswer.is_correct).toBeNull()
    expect(essayAfter.score).toBe(4)
    expect(essayAfter.feedback).toBe('Keep this feedback')

    const newDeadline = computeDeadline(after!.started_at, 30, after!.extra_seconds)
    expect(Math.abs(newDeadline - (Date.now() + 5 * 60 * 1000))).toBeLessThanOrEqual(3000)
  })

  test('only the latest finished submission can be reopened', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission: first } = await startSubmission(student.id, assessment.id)
    await saveAnswer(first!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(first!.id, student.id)

    await updateAssessmentSettings(assessment.id, instructor.id, { retakes_allowed: true })

    const { submission: second } = await startSubmission(student.id, assessment.id, { retake: true })
    await saveAnswer(second!.id, questions[0].id, student.id, { selectedIndex: 0 })
    await submitAssessment(second!.id, student.id)

    const result = await extendSubmissionTime(first!.id, instructor.id, 5)

    expect(result.error).toContain('latest finished')
  })

  test('non-instructors cannot grant time', async () => {
    const { student, assessment } = await setupAssessment()
    const { user: otherInstructor } = await createUser(`test-time-other-instr-${Date.now()}@example.com`, 'TestPass123!', 'Other', 'Instructor', 'instructor')
    testEmails.push(otherInstructor!.email)

    const { submission } = await startSubmission(student.id, assessment.id)
    const result = await extendSubmissionTime(submission!.id, otherInstructor!.id, 5)

    expect(result.error).toBe('Not authorized')
  })

  test('live-mode assessments reject time extensions', async () => {
    const instructorEmail = `test-live-instr-${Date.now()}@example.com`
    const studentEmail = `test-live-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Live', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Live', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Live Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment: liveAssessment } = await createAssessment(instructor!.id, cls!.id, 'Live Assessment', 'live', undefined)
    await setAssessmentQuestions(liveAssessment!.id, instructor!.id, [mcQuestion])
    await publishAssessment(liveAssessment!.id, instructor!.id)

    const admin = getAdmin()
    const startedAt = new Date().toISOString()
    const { data: liveSubmission } = await admin
      .from('submissions')
      .insert({
        assessment_id: liveAssessment!.id,
        student_id: student!.id,
        status: 'in_progress',
        started_at: startedAt,
      })
      .select('*')
      .single()

    const result = await extendSubmissionTime(liveSubmission!.id, instructor!.id, 5)

    expect(result.error).toContain('timed assessments')
  })

  test('draft assessments reject time extensions', async () => {
    const instructorEmail = `test-draft-instr-${Date.now()}@example.com`
    const studentEmail = `test-draft-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Draft', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Draft', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Draft Class')
    await joinClass(student!.id, cls!.join_code)

    const { assessment: draftAssessment } = await createAssessment(instructor!.id, cls!.id, 'Draft Assessment', 'timed', 30)
    await setAssessmentQuestions(draftAssessment!.id, instructor!.id, [mcQuestion])

    const admin = getAdmin()
    const { data: draftSubmission } = await admin
      .from('submissions')
      .insert({
        assessment_id: draftAssessment!.id,
        student_id: student!.id,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    const result = await extendSubmissionTime(draftSubmission!.id, instructor!.id, 5)

    expect(result.error).toContain('Draft assessments')
  })

  test('re-submit after reopen regrades the cleared auto-graded answers', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 0 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: false })
    await submitAssessment(submission!.id, student.id)

    const reopened = await extendSubmissionTime(submission!.id, instructor.id, 5)
    expect(reopened.error).toBeNull()

    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student.id, { value: true })
    const resubmitted = await submitAssessment(submission!.id, student.id)

    expect(resubmitted.error).toBeNull()
    expect(resubmitted.submission!.status).toBe('submitted')

    await updateAssessmentSettings(assessment.id, instructor.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })
    const results = await getStudentSubmissionResults(assessment.id, student.id)
    const mcAnswer = results!.answers!.find((answer) => answer.questions.type === 'MultipleChoice')!
    const tfAnswer = results!.answers!.find((answer) => answer.questions.type === 'TrueOrFalse')!
    expect(mcAnswer.score).toBe(2)
    expect(mcAnswer.is_correct).toBe(true)
    expect(tfAnswer.score).toBe(1)
    expect(tfAnswer.is_correct).toBe(true)
  })
})

describe('submit-vs-expire race', () => {
  function getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }

  test('racing submit and expire transition exactly once and grade once', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    // Correct MC answer: 2 points.
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })

    const [submitRes, expireRes] = await Promise.all([
      submitAssessment(submission!.id, student.id),
      expireSubmission(submission!.id, student.id, { force: true }),
    ])

    // Exactly one caller wins the guarded transition; the other observed the
    // winner's state and must not have double-run grading.
    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('status, score_total').eq('id', submission!.id).single()
    expect(['submitted', 'expired']).toContain(row!.status)
    expect(row!.score_total).toBe(2)

    if (submitRes.error === null) {
      // Submit won: expire lost the guarded update and skipped grading.
      expect(submitRes.submission!.status).toBe('submitted')
      expect(expireRes.error).toBeNull()
      expect(['submitted', 'expired', 'in_progress']).toContain(expireRes.submission!.status)
      expect(expireRes.submission!.score_total).toBe(2)
    } else {
      // Expire won: the submit lost the race.
      expect(submitRes.error).toContain('already submitted')
      expect(expireRes.error).toBeNull()
      expect(expireRes.submission!.status).toBe('expired')
      expect(expireRes.submission!.score_total).toBe(2)
    }
  })

  test('expireSubmission after a completed submit skips grading', async () => {
    const { student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)
    await saveAnswer(submission!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(submission!.id, student.id)

    // The guarded update matches 0 rows (already submitted), so the expire
    // observes the winner's state without grading again.
    const result = await expireSubmission(submission!.id, student.id)

    expect(result.error).toBeNull()
    expect(result.submission!.status).toBe('submitted')
    expect(result.submission!.score_total).toBe(2)
  })
})

describe('enrollment and submission gating', () => {
  test('starting a submission for a class the student is not enrolled in is rejected', async () => {
    const { student, assessment } = await setupAssessment()

    // Remove the enrollment, then attempt to start
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: assessmentRow } = await admin.from('assessments').select('class_id').eq('id', assessment.id).single()
    await admin.from('class_enrollments').delete().eq('student_id', student.id).eq('class_id', assessmentRow!.class_id)

    const result = await startSubmission(student.id, assessment.id)

    expect(result.error).toBeDefined()
    expect(result.error).toContain('not enrolled')
    expect(result.submission).toBeNull()
  })

  test('retakes are rejected while accepting_submissions is off', async () => {
    const { instructor, student, assessment } = await setupAssessment()
    const questions = await getAssessmentQuestions(assessment.id)

    // Complete a first attempt
    const { submission: first } = await startSubmission(student.id, assessment.id)
    await saveAnswer(first!.id, questions[0].id, student.id, { selectedIndex: 1 })
    await submitAssessment(first!.id, student.id)

    // Enable retakes but turn off accepting submissions
    await updateAssessmentSettings(assessment.id, instructor.id, {
      retakes_allowed: true,
      accepting_submissions: false,
    })

    const result = await startSubmission(student.id, assessment.id, { retake: true })

    expect(result.error).toBeDefined()
    expect(result.error).toContain('not currently accepting submissions')
    expect(result.submission).toBeNull()
  })

  test('first attempt is rejected while accepting_submissions is off', async () => {
    const { instructor, student, assessment } = await setupAssessment()

    await updateAssessmentSettings(assessment.id, instructor.id, { accepting_submissions: false })

    const result = await startSubmission(student.id, assessment.id)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('not currently accepting submissions')
  })
})
