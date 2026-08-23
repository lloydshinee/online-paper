import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import { createAssessment, publishAssessment, setAssessmentQuestions } from '@/lib/assessment-service'
import { startSubmission, saveAnswer } from '@/lib/submission-service'
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

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** A client acting as a real signed-in account over the public anon key —
 * the same power any browser holds, bypassing every server action. */
function asUser(email: string, password: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return client.auth.signInWithPassword({ email, password }).then(({ data }) => {
    if (!data.session) throw new Error(`sign-in failed for ${email}`)
    return client
  })
}

const mcQuestion: ParsedQuestion = {
  type: 'MultipleChoice',
  content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 },
  points: 2,
}

async function setup() {
  const instructorEmail = `test-rls-instr-${Date.now()}@example.com`
  const studentEmail = `test-rls-stu-${Date.now()}@example.com`
  testEmails.push(instructorEmail, studentEmail)

  const password = 'TestPass123!'
  const { user: instructor } = await createUser(instructorEmail, password, 'Test', 'Instructor', 'instructor')
  const { user: student } = await createUser(studentEmail, password, 'Test', 'Student', 'student')
  const { class: cls } = await createClass(instructor!.id, 'RLS Class')
  await joinClass(student!.id, cls!.join_code)

  const { assessment } = await createAssessment(instructor!.id, cls!.id, 'RLS Assessment', 'timed', 30)
  await setAssessmentQuestions(assessment!.id, instructor!.id, [mcQuestion])
  await publishAssessment(assessment!.id, instructor!.id)

  // Real rows must exist so the negative assertions are not vacuous.
  const admin = getAdmin()
  const { submission } = await startSubmission(student!.id, assessment!.id)
  const { data: question } = await admin
    .from('questions')
    .select('id')
    .eq('assessment_id', assessment!.id)
    .single()
  await saveAnswer(submission!.id, question!.id, student!.id, { selectedIndex: 1 })

  return {
    instructorEmail,
    studentEmail,
    password,
    instructorId: instructor!.id,
    assessmentId: assessment!.id,
    submissionId: submission!.id,
  }
}

describe('student direct-read policies (PostgREST)', () => {
  test('an enrolled student cannot read questions, submissions, or answers directly', async () => {
    const ctx = await setup()
    const student = await asUser(ctx.studentEmail, ctx.password)

    // The app serves questions through sanitizing server actions; direct
    // reads would ship the answer key inside content.jsonb.
    const questions = await student.from('questions').select('*').eq('assessment_id', ctx.assessmentId)
    expect(questions.data).toEqual([])

    const submissions = await student.from('submissions').select('*').eq('id', ctx.submissionId)
    expect(submissions.data).toEqual([])

    const answers = await student
      .from('answers')
      .select('*')
      .eq('submission_id', ctx.submissionId)
    expect(answers.data).toEqual([])
  })

  test('the owning instructor still reads their questions and class data', async () => {
    const ctx = await setup()
    const instructor = await asUser(ctx.instructorEmail, ctx.password)

    const questions = await instructor.from('questions').select('*').eq('assessment_id', ctx.assessmentId)
    expect(questions.error).toBeNull()
    expect((questions.data ?? []).length).toBe(1)

    // Positive control that the rows exist and are visible to the service role.
    const admin = getAdmin()
    const { data: allQuestions } = await admin.from('questions').select('id').eq('assessment_id', ctx.assessmentId)
    expect((allQuestions ?? []).length).toBe(1)
  })

  test('a signed-out anon key cannot read questions either', async () => {
    const ctx = await setup()

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const questions = await anon.from('questions').select('*').eq('assessment_id', ctx.assessmentId)
    expect(questions.data).toEqual([])
  })
})
