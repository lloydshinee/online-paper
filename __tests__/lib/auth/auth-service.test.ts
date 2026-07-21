import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { register, login, getUser, logout } from '@/lib/auth/auth-service'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const adminClient = createClient(supabaseUrl, serviceRoleKey)
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

function makeClient() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

describe('auth service', () => {
  test('student registers with name, email and password', async () => {
    const email = `test-reg-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TestPass123!'

    const result = await register(makeClient(), adminClient, email, password, 'Test', 'Student')

    expect(result.error).toBeNull()
    expect(result.user).toBeDefined()
    expect(result.user!.email).toBe(email)
    expect(result.user!.firstname).toBe('Test')
    expect(result.user!.lastname).toBe('Student')
    expect(result.user!.role).toBe('student')
  })

  test('registration fails with duplicate email', async () => {
    const email = `test-dup-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TestPass123!'

    await register(makeClient(), adminClient, email, password, 'Test', 'Student')
    const result = await register(makeClient(), adminClient, email, password, 'Test', 'Student')

    expect(result.error).toBeDefined()
    expect(result.user).toBeNull()
  })

  test('login with valid credentials', async () => {
    const email = `test-login-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TestPass123!'

    await register(makeClient(), adminClient, email, password, 'Test', 'Student')

    const client = makeClient()
    const result = await login(client, adminClient, email, password)

    expect(result.error).toBeNull()
    expect(result.user).toBeDefined()
    expect(result.user!.email).toBe(email)
    expect(result.user!.role).toBe('student')
  })

  test('login fails with wrong password', async () => {
    const email = `test-badlogin-${Date.now()}@example.com`
    testEmails.push(email)

    await register(makeClient(), adminClient, email, 'TestPass123!', 'Test', 'Student')

    const result = await login(makeClient(), adminClient, email, 'WrongPassword!')

    expect(result.error).toBeDefined()
    expect(result.user).toBeNull()
  })

  test('getUser returns null when not authenticated', async () => {
    const user = await getUser(makeClient(), adminClient)
    expect(user).toBeNull()
  })

  test('getUser returns profile after login', async () => {
    const email = `test-getuser-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TestPass123!'

    await register(makeClient(), adminClient, email, password, 'Test', 'Student')

    const client = makeClient()
    await login(client, adminClient, email, password)

    const user = await getUser(client, adminClient)
    expect(user).toBeDefined()
    expect(user!.email).toBe(email)
  })

  test('logout clears session', async () => {
    const email = `test-logout-${Date.now()}@example.com`
    testEmails.push(email)
    const password = 'TestPass123!'

    await register(makeClient(), adminClient, email, password, 'Test', 'Student')

    const client = makeClient()
    await login(client, adminClient, email, password)
    await logout(client)

    const user = await getUser(client, adminClient)
    expect(user).toBeNull()
  })
})
