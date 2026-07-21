'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
  const filePath = `${authUser.id}/avatar.${ext}`

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

  const { data: publicUrl } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  // Update users table
  await serviceClient
    .from('users')
    .update({ avatar_url: publicUrl.publicUrl })
    .eq('id', authUser.id)

  revalidatePath('/dashboard', 'layout')
  return { url: publicUrl.publicUrl }
}
