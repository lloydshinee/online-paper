import type { SupabaseClient } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  email: string
  name: string | null
  role: 'admin' | 'instructor' | 'student'
  created_at?: string
}

export interface AuthResult {
  user: UserProfile | null
  error: string | null
}

function getRoleFromError(error: Error | null): string | null {
  if (!error) return null
  if (error.message.includes('Email not confirmed')) return 'Email not confirmed'
  if (error.message.includes('Invalid login')) return 'Invalid email or password'
  if (error.message.includes('User already registered')) return 'User already registered'
  return error.message
}

async function fetchProfile(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data: profile } = await serviceClient
    .from('users')
    .select('id, email, name, role')
    .eq('id', userId)
    .single()

  return (profile as UserProfile) ?? null
}

export async function register(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  email: string,
  password: string,
  name: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })

  if (error || !data.user) {
    return { user: null, error: getRoleFromError(error) }
  }

  const profile = await fetchProfile(serviceClient, data.user.id)

  return {
    user: profile,
    error: null,
  }
}

export async function login(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { user: null, error: getRoleFromError(error) }
  }

  const profile = await fetchProfile(serviceClient, data.user.id)

  return {
    user: profile,
    error: null,
  }
}

export async function getUser(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<UserProfile | null> {
  const { data } = await supabase.auth.getUser()

  if (!data.user) return null

  return fetchProfile(serviceClient, data.user.id)
}

export async function logout(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut()
}
