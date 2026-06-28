import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  createUser,
  deactivateUser,
  resetPassword,
  listUsers,
} from '@/lib/auth/admin-service'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const testEmails: string[] = []

afterAll(async () => {
  for (const email of testEmails) {
    const { data: users } = await adminClient.auth.admin.listUsers()
    const user = users.users.find((u) => u.email === email)
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id)
    }
    await adminClient.from('users').delete().eq('email', email)
  }
})

describe('admin service', () => {
  test('admin creates instructor account', async () => {
    const email = `test-instructor-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TempPass123!'

    const result = await createUser(email, password, 'Test Instructor', 'instructor')

    expect(result.error).toBeNull()
    expect(result.user).toBeDefined()
    expect(result.user!.email).toBe(email)
    expect(result.user!.name).toBe('Test Instructor')
    expect(result.user!.role).toBe('instructor')

    const { data: profile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', result.user!.id)
      .single()

    expect(profile!.role).toBe('instructor')
  })

  test('admin creates admin account', async () => {
    const email = `test-admin-account-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'AdminPass123!'

    const result = await createUser(email, password, 'Test Admin', 'admin')

    expect(result.error).toBeNull()
    expect(result.user!.role).toBe('admin')
  })

  test('admin deactivates user', async () => {
    const email = `test-deactivate-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TempPass123!'

    const { user } = await createUser(email, password, 'instructor')
    expect(user).toBeDefined()

    const result = await deactivateUser(user!.id)
    expect(result.error).toBeNull()

    const { data: authUsers } = await adminClient.auth.admin.listUsers()
    const found = authUsers.users.find((u) => u.id === user!.id)
    expect(found).toBeUndefined()
  })

  test('admin resets user password', async () => {
    const email = `test-resetpw-${Date.now()}@example.com`
    testEmails.push(email)
    const oldPassword = 'OldPass123!'
    const newPassword = 'NewPass456!'

    const { user } = await createUser(email, oldPassword, 'instructor')
    expect(user).toBeDefined()

    const result = await resetPassword(user!.id, newPassword)
    expect(result.error).toBeNull()

    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: newPassword,
    })

    expect(error).toBeNull()
    expect(data.user).toBeDefined()
  })

  test('listUsers returns all users', async () => {
    const result = await listUsers()
    expect(result.error).toBeNull()
    expect(Array.isArray(result.users)).toBe(true)
  })
})
