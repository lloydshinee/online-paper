import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUser } from '@/lib/auth/auth-service'

export type AuthorizeResult =
  | { userId: string; role: string; error?: undefined }
  | { userId?: undefined; role?: undefined; error: string }

export async function authorize(
  roles?: string[],
): Promise<AuthorizeResult> {
  const supabase = await createClient()
  const serviceClient = createServiceClient()
  const user = await getUser(supabase, serviceClient)

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return { error: 'Not authorized' }
  }

  return { userId: user.id, role: user.role }
}
