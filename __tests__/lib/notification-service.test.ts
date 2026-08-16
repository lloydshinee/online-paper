import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createUser } from '@/lib/auth/admin-service'
import { createClass, joinClass } from '@/lib/class-service'
import { createAssessment, setAssessmentQuestions } from '@/lib/assessment-service'
import {
  createNotificationsForAssessment,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/lib/notification-service'
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
  content: { stem: 'Test Q?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'B', correctIndex: 1 },
  points: 1,
}

async function setupWithStudents(studentCount: number) {
  const instructorEmail = `test-ns-instr-${Date.now()}@example.com`
  testEmails.push(instructorEmail)

  const { user: instructor } = await createUser(instructorEmail, 'TestPass123!', 'NS', 'Instructor', 'instructor')
  if (!instructor) throw new Error('Failed to create instructor')

  const { class: cls } = await createClass(instructor.id, 'NS Class')
  if (!cls) throw new Error('Failed to create class')

  const studentIds: string[] = []
  for (let i = 0; i < studentCount; i++) {
    const email = `test-ns-stu${i}-${Date.now()}@example.com`
    testEmails.push(email)
    const { user: student } = await createUser(email, 'TestPass123!', 'NS', `Student ${i}`, 'instructor')
    if (!student) throw new Error(`Failed to create student ${i}`)
    await joinClass(student.id, cls.join_code)
    studentIds.push(student.id)
  }

  const { assessment, error } = await createAssessment(instructor.id, cls.id, 'NS Assessment', 'timed', 30)
  if (!assessment) throw new Error(`Failed to create assessment: ${error}`)
  await setAssessmentQuestions(assessment.id, instructor.id, [mcQuestion])

  return { instructor, students: studentIds, assessment }
}

describe('notification service', () => {
  test('createNotificationsForAssessment creates notifications for all students', async () => {
    const { assessment, students } = await setupWithStudents(2)

    await createNotificationsForAssessment(assessment.id, students, 'NS Assessment')

    for (const studentId of students) {
      const notifs = await getNotifications(studentId)
      expect(notifs.length).toBe(1)
      expect(notifs[0].message).toContain('NS Assessment')
      expect(notifs[0].assessment_id).toBe(assessment.id)
      expect(notifs[0].read).toBe(false)
    }
  })

  test('getUnreadCount returns correct number', async () => {
    const { assessment, students } = await setupWithStudents(1)

    await createNotificationsForAssessment(assessment.id, students, 'NS Assessment')

    const count = await getUnreadCount(students[0])
    expect(count).toBe(1)
  })

  test('markAsRead marks notification as read', async () => {
    const { assessment, students } = await setupWithStudents(1)

    await createNotificationsForAssessment(assessment.id, students, 'NS Assessment')

    const notifs = await getNotifications(students[0])
    expect(notifs[0].read).toBe(false)

    await markAsRead(notifs[0].id, students[0])

    const updated = await getNotifications(students[0])
    expect(updated[0].read).toBe(true)

    const count = await getUnreadCount(students[0])
    expect(count).toBe(0)
  })

  test('markAllAsRead marks all notifications as read', async () => {
    const { assessment, students } = await setupWithStudents(1)

    await createNotificationsForAssessment(assessment.id, students, 'NS Assessment')
    await createNotificationsForAssessment(assessment.id, students, 'Another notification')

    const before = await getUnreadCount(students[0])
    expect(before).toBe(2)

    await markAllAsRead(students[0])

    const after = await getUnreadCount(students[0])
    expect(after).toBe(0)
  })

  test('getNotifications is ordered newest first', async () => {
    const { assessment, students } = await setupWithStudents(1)

    await createNotificationsForAssessment(assessment.id, students, 'First notification')
    await new Promise((r) => setTimeout(r, 200))
    await createNotificationsForAssessment(assessment.id, students, 'Second notification')

    const notifs = await getNotifications(students[0])
    expect(notifs.length).toBe(2)
    expect(notifs[0].message).toContain('Second')
    expect(notifs[1].message).toContain('First')
  })

  test('createNotificationsForAssessment with empty student list does nothing', async () => {
    const { assessment } = await setupWithStudents(1)

    await createNotificationsForAssessment(assessment.id, [], 'No students')
  })
})
