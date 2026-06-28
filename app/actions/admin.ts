'use server'

import { revalidatePath } from 'next/cache'
import {
  createUser,
  deactivateUser,
  resetPassword,
  listUsers,
} from '@/lib/auth/admin-service'

interface AdminActionState {
  error?: string
  success?: string
}

export async function createUserAction(
  prevState: AdminActionState | null | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const role = formData.get('role') as 'admin' | 'instructor'

  if (!email || !password || !name || !role) {
    return { error: 'All fields are required' }
  }

  const result = await createUser(email, password, name, role)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/admin')
  return { success: `Created ${role} account: ${email}` }
}

export async function deactivateUserAction(userId: string) {
  const { error } = await deactivateUser(userId)

  if (error) {
    return { error }
  }

  revalidatePath('/dashboard/admin')
}

export async function resetPasswordAction(
  prevState: AdminActionState | null | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const userId = formData.get('userId') as string
  const newPassword = formData.get('newPassword') as string

  if (!userId || !newPassword || newPassword.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const { error } = await resetPassword(userId, newPassword)

  if (error) {
    return { error }
  }

  return { success: 'Password reset successfully' }
}

export async function getUsers() {
  return listUsers()
}
