import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/auth-service'

export type AuthorizeResult =
  | { userId: string; error?: undefined }
  | { userId?: undefined; error: string }

export async function authorize(
  roles?: string[],
): Promise<AuthorizeResult> {
  const supabase = await createClient()
  const user = await getUser(supabase)

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return { error: 'Not authorized' }
  }

  return { userId: user.id }
}
