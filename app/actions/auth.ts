'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { register, login, logout } from '@/lib/auth/auth-service'
import { sanitize } from '@/lib/sanitize'

interface AuthFormState {
  error?: string
  email?: string
}

export async function registerAction(
  prevState: AuthFormState | null | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  const rawName = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  const name = sanitize(rawName)

  if (!name || !email || !password) {
    return { error: 'All fields are required', email }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters', email }
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match', email }
  }

  const supabase = await createClient()
  const result = await register(supabase, email, password, name)

  if (result.error) {
    return { error: result.error, email }
  }

  redirect('/dashboard/student')
}

export async function loginAction(
  prevState: AuthFormState | null | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required', email }
  }

  const supabase = await createClient()
  const result = await login(supabase, email, password)

  if (result.error) {
    return { error: result.error, email }
  }

  if (result.user?.role === 'admin') {
    redirect('/dashboard/admin')
  }
  if (result.user?.role === 'instructor') {
    redirect('/dashboard/instructor')
  }
  redirect('/dashboard/student')
}

export async function logoutAction() {
  const supabase = await createClient()
  await logout(supabase)
  redirect('/login')
}
