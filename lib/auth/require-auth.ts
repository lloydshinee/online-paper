import { getUser } from '@/lib/auth/auth-service'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import type { UserProfile } from '@/lib/auth/auth-service'

export async function requireAuth(): Promise<UserProfile> {
  const supabase = await createClient()
  const serviceClient = createServiceClient()
  const user = await getUser(supabase, serviceClient)

  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireRole(
  roles: Array<'admin' | 'instructor' | 'student'>,
): Promise<UserProfile> {
  const user = await requireAuth()

  if (!roles.includes(user.role)) {
    redirect('/dashboard')
  }

  return user
}
