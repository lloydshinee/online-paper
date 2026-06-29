import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import { getInstructorClasses, joinClass, getStudentClasses } from '@/lib/class-service'
import {
  createTestUser,
  createTestClass,
  cleanupTestData,
} from '../../test-utils'

describe('class service actions', () => {
  let instructor: { id: string; email: string; password: string; role: string }
  let student: { id: string; email: string; password: string; role: string }
  let testClass: { id: string; instructorId: string; joinCode: string }

  beforeAll(async () => {
    instructor = await createTestUser('instructor')
    student = await createTestUser('student')
    testClass = await createTestClass(instructor.id)
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  test('getInstructorClasses returns instructor classes', async () => {
    const { classes, error } = await getInstructorClasses(instructor.id)
    expect(error).toBeNull()
    expect(classes.length).toBeGreaterThanOrEqual(1)
    expect(classes[0].name).toBe('Test Class')
  })

  test('joinClass enrolls a student', async () => {
    const result = await joinClass(student.id, testClass.joinCode)
    expect(result.error).toBeNull()
    expect(result.membership).toBeDefined()
  })

  test('getStudentClasses returns enrolled classes', async () => {
    await joinClass(student.id, testClass.joinCode).catch(() => {})
    const { classes, error } = await getStudentClasses(student.id)
    expect(error).toBeNull()
    const found = classes.find((c) => c.id === testClass.id)
    expect(found).toBeDefined()
  })

  test('joinClass with invalid code returns error', async () => {
    const result = await joinClass(student.id, 'INVALID123')
    expect(result.error).toBeDefined()
  })
})
