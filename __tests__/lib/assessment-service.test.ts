import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import {
  createAssessment,
  publishAssessment,
  closeAssessment,
  deleteAssessment,
  getClassAssessments,
  setAssessmentQuestions,
  getAssessmentWithQuestions,
  getStudentAssessments,
  getAllStudentAssessments,
  getAssessmentQuestions,
  getAssessmentQuestionsForStudent,
  verifyStudentEnrollment,
  updateAssessmentSettings,
} from '@/lib/assessment-service'
import { startSubmission, saveAnswer, submitAssessment, getStudentSubmissionHistory, getStudentSubmissionResults } from '@/lib/submission-service'
import type { ParsedQuestion } from '@/lib/question-parser'

const testEmails: string[] = []
const testClassIds: string[] = []

afterAll(async () => {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  for (const classId of testClassIds) {
    await adminClient.from('classes').delete().eq('id', classId)
  }

  for (const email of testEmails) {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const user = users.users.find((u) => u.email === email)
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id)
    }
    await adminClient.from('users').delete().eq('email', email)
  }
})

const sampleQuestions: ParsedQuestion[] = [
  {
    type: 'MultipleChoice',
    content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 },
    points: 2,
  },
  {
    type: 'TrueOrFalse',
    content: { statement: 'The sky is blue.', correctAnswer: true },
    points: 1,
  },
  {
    type: 'Essay',
    content: { prompt: 'Describe photosynthesis.' },
    points: 5,
  },
]

describe('assessment service', () => {
  test('instructor creates a draft assessment', async () => {
    const email = `test-assessment-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Test Class')
    testClassIds.push(cls!.id)

    const result = await createAssessment(
      instructor!.id,
      cls!.id,
      'Midterm Exam',
      'timed',
      60,
    )

    expect(result.error).toBeNull()
    expect(result.assessment).toBeDefined()
    expect(result.assessment!.title).toBe('Midterm Exam')
    expect(result.assessment!.mode).toBe('timed')
    expect(result.assessment!.duration_minutes).toBe(60)
    expect(result.assessment!.state).toBe('draft')
    expect(result.assessment!.class_id).toBe(cls!.id)
  })

  test('instructor sets questions on a draft assessment', async () => {
    const email = `test-setq-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Q Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Q Test', 'timed', 30)

    const result = await setAssessmentQuestions(assessment!.id, instructor!.id, sampleQuestions)

    expect(result.error).toBeNull()
    expect(result.questions).toHaveLength(3)
    expect(result.questions![0].type).toBe('MultipleChoice')
    expect(result.questions![0].points).toBe(2)
    expect(result.questions![1].type).toBe('TrueOrFalse')
    expect(result.questions![1].points).toBe(1)
    expect(result.questions![2].type).toBe('Essay')
    expect(result.questions![2].points).toBe(5)
  })

  test('live mode assessment has no duration', async () => {
    const email = `test-live-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Live Class')
    testClassIds.push(cls!.id)

    const result = await createAssessment(
      instructor!.id,
      cls!.id,
      'Live Quiz',
      'live',
      undefined,
    )

    expect(result.error).toBeNull()
    expect(result.assessment!.mode).toBe('live')
    expect(result.assessment!.duration_minutes).toBeNull()
  })

  test('instructor publishes an assessment', async () => {
    const email = `test-publish-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Pub Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'Pub Test',
      'timed',
      30,
    )

    const result = await publishAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()
    expect(result.assessment!.state).toBe('active')

    // Verify in DB
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: dbAssessment } = await adminClient
      .from('assessments')
      .select('state')
      .eq('id', assessment!.id)
      .single()

    expect(dbAssessment!.state).toBe('active')
  })

  test('instructor closes an assessment', async () => {
    const email = `test-close-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Close Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'Close Test',
      'timed',
      30,
    )

    await publishAssessment(assessment!.id, instructor!.id)

    const result = await closeAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()
    expect(result.assessment!.state).toBe('closed')
  })

  test('instructor deletes a draft assessment', async () => {
    const email = `test-delete-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Delete Class')
    testClassIds.push(cls!.id)

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'Delete Test',
      'timed',
      30,
    )

    const result = await deleteAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()

    // Verify deleted from DB
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: dbAssessment } = await adminClient
      .from('assessments')
      .select('id')
      .eq('id', assessment!.id)
      .maybeSingle()

    expect(dbAssessment).toBeNull()
  })

  test('can delete a published assessment', async () => {
    const email = `test-delpub-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'Delete Pub Class')

    const { assessment } = await createAssessment(
      instructor!.id,
      cls!.id,
      'DeletePub Test',
      'timed',
      30,
    )

    await publishAssessment(assessment!.id, instructor!.id)

    const result = await deleteAssessment(assessment!.id, instructor!.id)

    expect(result.error).toBeNull()
  })

  test('getClassAssessments returns assessments for a class', async () => {
    const email = `test-listassess-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { class: cls } = await createClass(instructor!.id, 'List Class')
    testClassIds.push(cls!.id)

    await createAssessment(instructor!.id, cls!.id, 'Assessment 1', 'timed', 30)
    await createAssessment(instructor!.id, cls!.id, 'Assessment 2', 'live', undefined)

    const result = await getClassAssessments(instructor!.id, cls!.id)

    expect(result.error).toBeNull()
    expect(result.assessments).toHaveLength(2)
    expect(result.assessments[0].title).toBe('Assessment 2') // newest first
    expect(result.assessments[1].title).toBe('Assessment 1')
  })
})

describe('score stripping on student list paths', () => {
  async function setupWithSubmission() {
    const instructorEmail = `test-strip-instr-${Date.now()}@example.com`
    const studentEmail = `test-strip-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Strip Class')
    testClassIds.push(cls!.id)
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Strip Assessment', 'timed', 30)
    await setAssessmentQuestions(assessment!.id, instructor!.id, sampleQuestions)
    await publishAssessment(assessment!.id, instructor!.id)

    const { submission } = await startSubmission(student!.id, assessment!.id)
    const questions = await getAssessmentQuestions(assessment!.id)
    await saveAnswer(submission!.id, questions[0].id, student!.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student!.id, { value: true })
    await submitAssessment(submission!.id, student!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment!, submission: submission! }
  }

  test('getStudentAssessments strips score_total while scores are unreleased', async () => {
    const { student, class: cls } = await setupWithSubmission()

    const { assessments } = await getStudentAssessments(student.id, cls.id)

    expect(assessments).toHaveLength(1)
    expect(assessments[0].submission).not.toBeNull()
    expect(assessments[0].submission!.status).toBe('submitted')
    expect(assessments[0].submission!.score_total).toBeNull()
  })

  test('getStudentAssessments returns score_total after release', async () => {
    const { instructor, student, class: cls, assessment } = await setupWithSubmission()

    await updateAssessmentSettings(assessment.id, instructor.id, { scores_released: true })

    const { assessments } = await getStudentAssessments(student.id, cls.id)

    expect(assessments[0].submission!.score_total).not.toBeNull()
  })

  test('getAllStudentAssessments strips score_total while scores are unreleased', async () => {
    const { student } = await setupWithSubmission()

    const { assessments } = await getAllStudentAssessments(student.id)

    const found = assessments.find((a) => a.class_name === 'Strip Class')
    expect(found).toBeDefined()
    expect(found!.submission!.score_total).toBeNull()
  })

  test('getAllStudentAssessments returns score_total after release', async () => {
    const { instructor, student, assessment } = await setupWithSubmission()

    await updateAssessmentSettings(assessment.id, instructor.id, { scores_released: true })

    const { assessments } = await getAllStudentAssessments(student.id)
    const found = assessments.find((a) => a.class_name === 'Strip Class')
    expect(found!.submission!.score_total).not.toBeNull()
  })

  test('getStudentSubmissionHistory strips score_total while scores are unreleased', async () => {
    const { student, assessment } = await setupWithSubmission()

    const history = await getStudentSubmissionHistory(assessment.id, student.id)

    expect(history).toHaveLength(1)
    expect(history[0].score_total).toBeNull()
  })

  test('getStudentSubmissionHistory returns score_total after release', async () => {
    const { instructor, student, assessment } = await setupWithSubmission()

    await updateAssessmentSettings(assessment.id, instructor.id, { scores_released: true })

    const history = await getStudentSubmissionHistory(assessment.id, student.id)

    expect(history).toHaveLength(1)
    expect(history[0].score_total).not.toBeNull()
  })
})

describe('question identity on edit', () => {  const mcQuestion: ParsedQuestion = {
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

  async function setupWithAnswers() {
    const instructorEmail = `test-ident-instr-${Date.now()}@example.com`
    const studentEmail = `test-ident-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Identity Class')
    testClassIds.push(cls!.id)
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Identity Assessment', 'timed', 30)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [mcQuestion, tfQuestion, essayQuestion])
    await publishAssessment(assessment!.id, instructor!.id)

    // Correct answers on MC and TF
    const { submission } = await startSubmission(student!.id, assessment!.id)
    const questions = await getAssessmentQuestions(assessment!.id)
    await saveAnswer(submission!.id, questions[0].id, student!.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student!.id, { value: true })
    await submitAssessment(submission!.id, student!.id)

    await updateAssessmentSettings(assessment!.id, instructor!.id, {
      scores_released: true,
      answer_reveal_enabled: true,
    })

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  test('prepending a question does not change existing answers\' grades', async () => {
    const { instructor, student, assessment } = await setupWithAnswers()

    const before = await getStudentSubmissionResults(assessment.id, student.id)
    expect(before!.submission!.score_total).toBe(3) // 2 (MC) + 1 (TF)

    const beforeQuestions = await getAssessmentQuestions(assessment.id)
    const beforeMcId = beforeQuestions.find((q) => q.type === 'MultipleChoice')!.id

    // Prepend a brand-new MC question; the originals keep their content.
    const newQuestion: ParsedQuestion = {
      type: 'MultipleChoice',
      content: { stem: 'Brand new question?', options: ['x', 'y'], correctAnswer: 'x', correctIndex: 0 },
      points: 4,
    }
    await setAssessmentQuestions(assessment.id, instructor.id, [newQuestion, mcQuestion, tfQuestion, essayQuestion])

    const afterQuestions = await getAssessmentQuestions(assessment.id)
    const afterMc = afterQuestions.find((q) => q.content.stem === 'What is 2+2?')
    expect(afterMc).toBeDefined()
    // The unchanged question keeps its ID — answers stay bound to it.
    expect(afterMc!.id).toBe(beforeMcId)

    const after = await getStudentSubmissionResults(assessment.id, student.id)
    const mcAnswer = after!.answers!.find((a) => a.question_id === beforeMcId)
    expect(mcAnswer).toBeDefined()
    expect(mcAnswer!.score).toBe(2)
    expect(mcAnswer!.is_correct).toBe(true)
  })

  test('reordering questions preserves answer-to-question binding', async () => {
    const { instructor, student, assessment } = await setupWithAnswers()

    const before = await getStudentSubmissionResults(assessment.id, student.id)
    expect(before!.submission!.score_total).toBe(3)

    const beforeQuestions = await getAssessmentQuestions(assessment.id)
    const mcId = beforeQuestions.find((q) => q.type === 'MultipleChoice')!.id

    // Reorder: essay first, then TF, then MC
    await setAssessmentQuestions(assessment.id, instructor.id, [essayQuestion, tfQuestion, mcQuestion])

    const afterQuestions = await getAssessmentQuestions(assessment.id)
    expect(afterQuestions[0].type).toBe('Essay')
    expect(afterQuestions[2].id).toBe(mcId) // MC kept its identity and its answers

    const after = await getStudentSubmissionResults(assessment.id, student.id)
    const mcAnswer = after!.answers!.find((a) => a.question_id === mcId)
    expect(mcAnswer!.score).toBe(2)
    expect(mcAnswer!.is_correct).toBe(true)
    expect(after!.submission!.score_total).toBe(3)
  })

  test('changing a question type resets the affected answers — no stale auto-grade score', async () => {
    const { instructor, student, assessment } = await setupWithAnswers()

    const beforeQuestions = await getAssessmentQuestions(assessment.id)
    const mcId = beforeQuestions.find((q) => q.type === 'MultipleChoice')!.id

    // The MC question becomes an Essay question with the same stem.
    const converted: ParsedQuestion = {
      type: 'Essay',
      content: { prompt: 'What is 2+2?' },
      points: 2,
    }
    await setAssessmentQuestions(assessment.id, instructor.id, [converted, tfQuestion, essayQuestion])

    const afterQuestions = await getAssessmentQuestions(assessment.id)
    expect(afterQuestions.some((q) => q.id === mcId)).toBe(false) // old row replaced

    const after = await getStudentSubmissionResults(assessment.id, student.id)
    const essayAnswers = after!.answers!.filter((a) => a.question_id === afterQuestions[0].id)
    expect(essayAnswers.length).toBe(1)
    // No stale auto-grade score survives the type change.
    expect(essayAnswers[0].is_correct).not.toBe(true)
    expect(essayAnswers[0].score).not.toBe(2)
  })
})

describe('sanitized student question reads', () => {
  async function setupPublished() {
    const instructorEmail = `test-sanitize-instr-${Date.now()}@example.com`
    const studentEmail = `test-sanitize-stu-${Date.now()}@example.com`
    const outsiderEmail = `test-sanitize-out-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail, outsiderEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { user: outsider } = await createUser(outsiderEmail, 'TestPass123!', 'Out', 'Sider', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Sanitize Class')
    testClassIds.push(cls!.id)
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Sanitize Assessment', 'timed', 30)
    await setAssessmentQuestions(assessment!.id, instructor!.id, [
      {
        type: 'MultipleChoice',
        content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 },
        points: 2,
      },
    ])
    await publishAssessment(assessment!.id, instructor!.id)

    return { instructor: instructor!, student: student!, outsider: outsider!, class: cls!, assessment: assessment! }
  }

  test('getAssessmentQuestionsForStudent strips correct-answer fields but keeps options', async () => {
    const { assessment } = await setupPublished()

    const questions = await getAssessmentQuestionsForStudent(assessment.id)

    expect(questions).toHaveLength(1)
    expect(questions[0].content.correctAnswer).toBeUndefined()
    expect(questions[0].content.correctIndex).toBeUndefined()
    expect(questions[0].content.options).toEqual(['3', '4', '5', '6'])
    expect(questions[0].content.stem).toBe('What is 2+2?')
  })

  test('verifyStudentEnrollment accepts enrolled students and rejects outsiders', async () => {
    const { student, outsider, assessment } = await setupPublished()

    expect(await verifyStudentEnrollment(student.id, assessment.id)).toBe(true)
    expect(await verifyStudentEnrollment(outsider.id, assessment.id)).toBe(false)
  })

  test('raw getAssessmentQuestions still returns the answer key for instructor paths', async () => {
    const { assessment } = await setupPublished()

    const questions = await getAssessmentQuestions(assessment.id)

    expect(questions[0].content.correctAnswer).toBe('4')
    expect(questions[0].content.correctIndex).toBe(1)
  })
})

describe('passing score settings', () => {
  async function setupWithSubmission() {
    const instructorEmail = `test-pass-instr-${Date.now()}@example.com`
    const studentEmail = `test-pass-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    const { class: cls } = await createClass(instructor!.id, 'Passing Score Class')
    testClassIds.push(cls!.id)
    await joinClass(student!.id, cls!.join_code)

    const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Passing Score Assessment', 'timed', 30)
    await setAssessmentQuestions(assessment!.id, instructor!.id, sampleQuestions)
    await publishAssessment(assessment!.id, instructor!.id)

    const { submission } = await startSubmission(student!.id, assessment!.id)
    const questions = await getAssessmentQuestions(assessment!.id)
    await saveAnswer(submission!.id, questions[0].id, student!.id, { selectedIndex: 1 })
    await saveAnswer(submission!.id, questions[1].id, student!.id, { value: true })
    await submitAssessment(submission!.id, student!.id)

    return { instructor: instructor!, student: student!, class: cls!, assessment: assessment! }
  }

  test('saves a passing score that persists across reloads and clears back to blank', async () => {
    const { instructor, assessment } = await setupWithSubmission()

    // New assessments have no threshold.
    expect((await getAssessmentWithQuestions(assessment.id)).assessment!.passing_score).toBeNull()

    const saved = await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: 75 })
    expect(saved.error).toBeNull()
    expect(saved.assessment!.passing_score).toBe(75)

    // Persists across a fresh read.
    expect((await getAssessmentWithQuestions(assessment.id)).assessment!.passing_score).toBe(75)

    // Survives re-editing to another valid value.
    await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: 60 })
    expect((await getAssessmentWithQuestions(assessment.id)).assessment!.passing_score).toBe(60)

    // Clearing the field removes the threshold.
    const cleared = await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: null })
    expect(cleared.error).toBeNull()
    expect(cleared.assessment!.passing_score).toBeNull()
    expect((await getAssessmentWithQuestions(assessment.id)).assessment!.passing_score).toBeNull()
  })

  test('rejects out-of-range and non-integer passing scores without changing stored value', async () => {
    const { instructor, assessment } = await setupWithSubmission()

    await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: 75 })

    for (const bad of [101, -1, 12.5]) {
      const result = await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: bad })
      expect(result.error).toBe('Passing score must be an integer between 0 and 100')
      expect(result.assessment).toBeNull()
    }

    // The previously saved value is untouched by rejected updates.
    expect((await getAssessmentWithQuestions(assessment.id)).assessment!.passing_score).toBe(75)

    // Boundaries are inclusive.
    expect((await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: 0 })).error).toBeNull()
    expect((await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: 100 })).error).toBeNull()
  })

  test('remains editable after submissions exist with no effect on existing scores', async () => {
    const { instructor, student, assessment } = await setupWithSubmission()

    await updateAssessmentSettings(assessment.id, instructor.id, { scores_released: true })
    const before = await getStudentSubmissionHistory(assessment.id, student.id)
    expect(before).toHaveLength(1)
    expect(before[0].score_total).toBe(3) // MC 2 + TF 1

    const edited = await updateAssessmentSettings(assessment.id, instructor.id, { passing_score: 50 })
    expect(edited.error).toBeNull()
    expect(edited.assessment!.passing_score).toBe(50)

    const after = await getStudentSubmissionHistory(assessment.id, student.id)
    expect(after).toHaveLength(1)
    expect(after[0].score_total).toBe(3)
  })
})
