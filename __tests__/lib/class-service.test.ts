import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import {
  createClass,
  joinClass,
  getStudentClasses,
  getClassRoster,
  archiveClass,
} from '@/lib/class-service'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

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

describe('class service', () => {
  test('instructor creates a class with a name — system generates a unique invite code', async () => {
    const email = `test-createclass-${Date.now()}@example.com`
    testEmails.push(email)

    const { user: instructor } = await createUser(email, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    expect(instructor).toBeDefined()

    const result = await createClass(instructor!.id, 'Math 101')
    testClassIds.push(result.class!.id)

    expect(result.error).toBeNull()
    expect(result.class).toBeDefined()
    expect(result.class!.name).toBe('Math 101')
    expect(result.class!.instructor_id).toBe(instructor!.id)
    expect(result.class!.join_code).toBeDefined()
    expect(result.class!.join_code.length).toBeGreaterThanOrEqual(6)

    // Verify it exists in DB
    const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: dbClass } = await adminClient
      .from('classes')
      .select('*')
      .eq('id', result.class!.id)
      .single()

    expect(dbClass).toBeDefined()
    expect(dbClass.name).toBe('Math 101')
    expect(dbClass.join_code).toBe(result.class!.join_code)
  })

  test('student joins a class with a valid invite code', async () => {
    const instructorEmail = `test-join-instr-${Date.now()}@example.com`
    const studentEmail = `test-join-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')
    expect(student).toBeDefined()

    const { class: cls } = await createClass(instructor!.id, 'Science')
    testClassIds.push(cls!.id)

    const result = await joinClass(student!.id, cls!.join_code)

    expect(result.error).toBeNull()
    expect(result.membership).toBeDefined()
    expect(result.membership!.class_id).toBe(cls!.id)
    expect(result.membership!.student_id).toBe(student!.id)
  })

  test('invalid invite code returns error', async () => {
    const studentEmail = `test-badcode-${Date.now()}@example.com`
    testEmails.push(studentEmail)

    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')

    const result = await joinClass(student!.id, 'NONEXISTENT')

    expect(result.error).toBeDefined()
    expect(result.error).toContain('Invalid invite code')
    expect(result.membership).toBeNull()
  })

  test('student already enrolled → joining again returns error', async () => {
    const instructorEmail = `test-double-instr-${Date.now()}@example.com`
    const studentEmail = `test-double-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')

    const { class: cls } = await createClass(instructor!.id, 'History')
    testClassIds.push(cls!.id)

    const first = await joinClass(student!.id, cls!.join_code)
    expect(first.error).toBeNull()

    const second = await joinClass(student!.id, cls!.join_code)
    expect(second.error).toBeDefined()
    expect(second.error).toContain('already enrolled')
    expect(second.membership).toBeNull()
  })

  test('student sees their enrolled classes', async () => {
    const instructorEmail = `test-list-instr-${Date.now()}@example.com`
    const studentEmail = `test-list-stu-${Date.now()}@example.com`
    testEmails.push(instructorEmail, studentEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')

    const { class: cls1 } = await createClass(instructor!.id, 'English')
    const { class: cls2 } = await createClass(instructor!.id, 'Physics')
    testClassIds.push(cls1!.id, cls2!.id)

    await joinClass(student!.id, cls1!.join_code)
    await joinClass(student!.id, cls2!.join_code)

    const result = await getStudentClasses(student!.id)

    expect(result.error).toBeNull()
    expect(result.classes.length).toBe(2)
    expect(result.classes.some((c) => c.name === 'English')).toBe(true)
    expect(result.classes.some((c) => c.name === 'Physics')).toBe(true)
  })

  test('student with no classes gets empty list', async () => {
    const studentEmail = `test-empty-${Date.now()}@example.com`
    testEmails.push(studentEmail)

    const { user: student } = await createUser(studentEmail, 'TestPass123!', 'Test', 'Student', 'student')

    const result = await getStudentClasses(student!.id)

    expect(result.error).toBeNull()
    expect(result.classes).toEqual([])
  })

  test('instructor sees class roster (list of enrolled students)', async () => {
    const instructorEmail = `test-roster-instr-${Date.now()}@example.com`
    const student1Email = `test-roster-stu1-${Date.now()}@example.com`
    const student2Email = `test-roster-stu2-${Date.now()}@example.com`
    testEmails.push(instructorEmail, student1Email, student2Email)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')
    const { user: student1 } = await createUser(student1Email, 'TestPass123!', 'Student', '1', 'student')
    const { user: student2 } = await createUser(student2Email, 'TestPass123!', 'Student', '2', 'student')

    const { class: cls } = await createClass(instructor!.id, 'Biology')
    testClassIds.push(cls!.id)

    await joinClass(student1!.id, cls!.join_code)
    await joinClass(student2!.id, cls!.join_code)

    const result = await getClassRoster(instructor!.id, cls!.id)

    expect(result.error).toBeNull()
    expect(result.students.length).toBe(2)
    expect(result.students.some((s) => s.email === student1Email)).toBe(true)
    expect(result.students.some((s) => s.email === student2Email)).toBe(true)
  })

  test('admin archives a class', async () => {
    const instructorEmail = `test-archive-instr-${Date.now()}@example.com`
    testEmails.push(instructorEmail)

    const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'Test', 'Instructor', 'instructor')

    const { class: cls } = await createClass(instructor!.id, 'Old Course')
    testClassIds.push(cls!.id)

    const result = await archiveClass(cls!.id)

    expect(result.error).toBeNull()
    expect(result.class).toBeDefined()
    expect(result.class!.archived).toBe(true)

    // Verify in DB
    const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: dbClass } = await adminClient
      .from('classes')
      .select('archived')
      .eq('id', cls!.id)
      .single()

    expect(dbClass!.archived).toBe(true)
  })
})
