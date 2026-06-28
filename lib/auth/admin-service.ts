import { createServiceClient } from '@/lib/supabase/service'
import type { UserProfile } from '@/lib/auth/auth-service'

interface AdminResult {
  user: UserProfile | null
  error: string | null
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: 'admin' | 'instructor',
): Promise<AdminResult> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, name },
  })

  if (error || !data.user) {
    return { user: null, error: error?.message ?? 'Failed to create user' }
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ role, name })
    .eq('id', data.user.id)

  if (updateError) {
    return { user: null, error: updateError.message }
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email!,
      name,
      role,
    },
    error: null,
  }
}

export async function deactivateUser(userId: string): Promise<AdminResult> {
  const supabase = createServiceClient()

  const { error } = await supabase.auth.admin.deleteUser(userId)

  if (error) {
    return { user: null, error: error.message }
  }

  return { user: null, error: null }
}

export async function resetPassword(
  userId: string,
  newPassword: string,
): Promise<AdminResult> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    return { user: null, error: error.message }
  }

  return {
    user: data.user
      ? { id: data.user.id, email: data.user.email!, name: '', role: 'student' }
      : null,
    error: null,
  }
}

export async function listUsers(): Promise<{
  users: UserProfile[]
  error: string | null
}> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.from('users').select('id, email, name, role')

  if (error) {
    return { users: [], error: error.message }
  }

  return { users: data as UserProfile[], error: null }
}
