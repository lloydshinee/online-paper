import { describe, test, expect, afterAll } from 'vitest'
import {
  createTestUser,
  cleanupTestData,
} from '../../test-utils'

describe('auth actions', () => {
  afterAll(async () => {
    await cleanupTestData()
  })

  test('createTestUser creates an instructor', async () => {
    const user = await createTestUser('instructor')
    expect(user.id).toBeDefined()
    expect(user.email).toContain('@example.com')
    expect(user.role).toBe('instructor')
  })

  test('createTestUser creates a student', async () => {
    const user = await createTestUser('student')
    expect(user.id).toBeDefined()
    expect(user.email).toContain('@example.com')
    expect(user.role).toBe('student')
  })
})
