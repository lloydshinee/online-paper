'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { avatarObjectPath, avatarSrc } from '@/lib/avatar'
import { requireAuth } from '@/lib/auth/require-auth'

export interface CurrentUserProfile {
  firstname: string | null
  lastname: string | null
  email: string
  avatar_url: string | null
}

/**
 * The signed-in user's own profile. Client pages must derive the header's
 * identity from this action — never by scanning user lists, where "first
 * row" is an arbitrary account (newest registration) rather than the caller.
 */
export async function getCurrentUserProfileAction(): Promise<CurrentUserProfile | null> {
  const user = await requireAuth()

  return {
    firstname: user.firstname ?? null,
    lastname: user.lastname ?? null,
    email: user.email,
    avatar_url: user.avatar_url ?? null,
  }
}

export async function updateProfileAction(
  prevState: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string } | null> {
  const supabase = await createClient()
  const serviceClient = createServiceClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { error: 'Not authenticated' }

  const firstname = formData.get('firstname') as string
  const lastname = formData.get('lastname') as string

  if (!firstname) return { error: 'First name is required' }

  const { error } = await serviceClient
    .from('users')
    .update({ firstname, lastname: lastname || null })
    .eq('id', authUser.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard', 'layout')
  return { success: 'Profile updated' }
}

export async function uploadAvatarAction(
  _prevState: { error?: string; url?: string } | null,
  formData: FormData,
): Promise<{ error?: string; url?: string } | null> {
  const supabase = await createClient()
  const serviceClient = createServiceClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { error: 'Not authenticated' }

  const file = formData.get('avatar') as File
  if (!file) return { error: 'No file provided' }

  if (file.size > 2 * 1024 * 1024) return { error: 'File must be under 2MB' }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { error: 'File must be JPEG, PNG, or WebP' }
  }

  const ext = file.type.split('/')[1]
  const filePath = avatarObjectPath(authUser.id, ext)

  // Delete old avatar if exists
  const { data: existing } = await supabase.storage.from('avatars').list(authUser.id)
  if (existing && existing.length > 0) {
    await supabase.storage.from('avatars').remove(
      existing.map((f) => `${authUser.id}/${f.name}`),
    )
  }

  // Upload new avatar
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true })

  if (uploadError) return { error: uploadError.message }

  // Store the object path, never a public URL: getPublicUrl() bakes the
  // uploading environment's host (e.g. localhost) into the database, which
  // breaks the image for every other viewer. Rendering resolves paths via
  // avatarSrc() against the configured instance.
  await serviceClient
    .from('users')
    .update({ avatar_url: filePath })
    .eq('id', authUser.id)

  revalidatePath('/dashboard', 'layout')
  return { url: avatarSrc(filePath) ?? undefined }
}
