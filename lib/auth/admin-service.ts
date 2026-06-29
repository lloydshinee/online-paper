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
  role: 'admin' | 'instructor' | 'student',
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

export async function listUsers(
  limit = 50,
  offset = 0,
  search?: string,
): Promise<{
  users: UserProfile[]
  total: number
  error: string | null
}> {
  const supabase = createServiceClient()

  let query = supabase.from('users').select('*', { count: 'exact', head: true })
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { count } = await query

  let dataQuery = supabase
    .from('users')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    dataQuery = dataQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await dataQuery

  if (error) {
    return { users: [], total: 0, error: error.message }
  }

  return { users: (data as UserProfile[]) ?? [], total: count ?? 0, error: null }
}
