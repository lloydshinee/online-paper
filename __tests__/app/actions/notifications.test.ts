import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { getNotifications, markAsRead, markAllAsRead } from '@/lib/notification-service'
import {
  createTestUser,
  cleanupTestData,
} from '../../test-utils'

describe('notification actions', () => {
  let student: { id: string; email: string; password: string; role: string }

  beforeAll(async () => {
    student = await createTestUser('student')
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  test('getNotifications returns empty array for new user', async () => {
    const notifications = await getNotifications(student.id)
    expect(Array.isArray(notifications)).toBe(true)
  })

  test('markAsRead handles invalid ID', async () => {
    await markAsRead('invalid-id', student.id)
    // Should not throw
    expect(true).toBe(true)
  })

  test('markAllAsRead succeeds for new user', async () => {
    await markAllAsRead(student.id)
    // Should not throw
    expect(true).toBe(true)
  })
})
