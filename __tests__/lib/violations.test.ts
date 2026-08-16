import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import { createAssessment, publishAssessment, setAssessmentQuestions } from '@/lib/assessment-service'
import { startSubmission, recordViolation, getActiveSubmission } from '@/lib/submission-service'
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

const mcQuestion: ParsedQuestion = {
  type: 'MultipleChoice',
  content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswer: '4', correctIndex: 1 },
  points: 2,
}

async function setup() {
  const instructorEmail = `test-viol-instr-${Date.now()}@example.com`
  const studentEmail = `test-viol-stu-${Date.now()}@example.com`
  const outsiderEmail = `test-viol-out-${Date.now()}@example.com`
  testEmails.push(instructorEmail, studentEmail, outsiderEmail)

  const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
  const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
  const { user: outsider } = await createUser(outsiderEmail, 'TestPass123!', 'Out', 'Sider', 'student')
  const { class: cls } = await createClass(instructor!.id, 'Violation Class')
  await joinClass(student!.id, cls!.join_code)

  const { assessment } = await createAssessment(instructor!.id, cls!.id, 'Violation Assessment', 'timed', 30)
  await setAssessmentQuestions(assessment!.id, instructor!.id, [mcQuestion])
  await publishAssessment(assessment!.id, instructor!.id)

  return { instructor: instructor!, student: student!, outsider: outsider!, class: cls!, assessment: assessment! }
}

describe('proctoring violations', () => {
  test('recording a violation against another student\'s submission is rejected', async () => {
    const { student, outsider, assessment } = await setup()

    const { submission } = await startSubmission(student.id, assessment.id)

    const result = await recordViolation(submission!.id, outsider.id)
    expect(result.error).toBeNull()
    expect(result.violations).toBeNull()

    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('violations, status').eq('id', submission!.id).single()
    expect(row!.violations).toBe(0)
    expect(row!.status).toBe('in_progress')
  })

  test('concurrent violation increments are all counted', async () => {
    const { student, assessment } = await setup()

    const { submission } = await startSubmission(student.id, assessment.id)

    const results = await Promise.all(
      Array.from({ length: 5 }, () => recordViolation(submission!.id, student.id)),
    )

    const counts = results.map((r) => r.violations).filter((v): v is number => v !== null)
    expect(counts.length).toBe(5)
    expect(new Set(counts).size).toBe(5) // every increment returned a distinct value

    const admin = getAdmin()
    const { data: row } = await admin.from('submissions').select('violations').eq('id', submission!.id).single()
    expect(row!.violations).toBe(5)
  })

  test('violations on non-in-progress submissions are ignored', async () => {
    const { student, assessment } = await setup()

    const { submission } = await startSubmission(student.id, assessment.id)

    const admin = getAdmin()
    await admin.from('submissions').update({ status: 'submitted' }).eq('id', submission!.id)

    const result = await recordViolation(submission!.id, student.id)
    expect(result.violations).toBeNull()
    expect(result.error).toBeNull()

    const { data: row } = await admin.from('submissions').select('violations, status').eq('id', submission!.id).single()
    expect(row!.violations).toBe(0)
    expect(row!.status).toBe('submitted')
  })

  test('reaching the limit auto-submits with expired status (off-by-one at boundary)', async () => {
    const { student, assessment } = await setup()

    const admin = getAdmin()
    await admin.from('assessments').update({ proctoring_violations_allowed: 2 }).eq('id', assessment.id)

    const { submission } = await startSubmission(student.id, assessment.id)

    // First violation: at limit - 1, still in progress
    const first = await recordViolation(submission!.id, student.id)
    expect(first.violations).toBe(1)
    const { data: midRow } = await admin.from('submissions').select('status').eq('id', submission!.id).single()
    expect(midRow!.status).toBe('in_progress')

    // Second violation: trips the limit, expires and auto-grades
    const second = await recordViolation(submission!.id, student.id)
    expect(second.violations).toBe(2)
    const { data: endRow } = await admin.from('submissions').select('status, score_total').eq('id', submission!.id).single()
    expect(endRow!.status).toBe('expired')
    expect(endRow!.score_total).not.toBeNull()
  })

  test('the active submission exposes the server violation count for client resume seeding', async () => {
    const { student, assessment } = await setup()

    const { submission } = await startSubmission(student.id, assessment.id)
    await recordViolation(submission!.id, student.id)
    await recordViolation(submission!.id, student.id)

    const active = await getActiveSubmission(student.id, assessment.id)
    expect(active).not.toBeNull()
    expect(active!.violations).toBe(2)
  })
})
