'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import {
  createClass,
  joinClass,
  getStudentClasses,
  getClassRoster,
  archiveClass,
} from '@/lib/class-service'

interface ClassActionState {
  error?: string
  success?: string
}

export async function createClassAction(
  prevState: ClassActionState | null | undefined,
  formData: FormData,
): Promise<ClassActionState> {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { error: auth.error }

  const name = formData.get('name') as string

  if (!name || !name.trim()) {
    return { error: 'Class name is required' }
  }

  const result = await createClass(auth.userId, name.trim())

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/instructor')
  return { success: `Created class "${result.class!.name}"` }
}

export async function joinClassAction(
  prevState: ClassActionState | null | undefined,
  formData: FormData,
): Promise<ClassActionState> {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error }

  const joinCode = formData.get('joinCode') as string

  if (!joinCode || !joinCode.trim()) {
    return { error: 'Invite code is required' }
  }

  const result = await joinClass(auth.userId, joinCode.trim().toUpperCase())

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/student')
  return { success: 'Successfully joined the class' }
}

export async function getInstructorClasses() {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { classes: [], error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classes')
    .select('id, instructor_id, name, join_code, archived, created_at')
    .eq('instructor_id', auth.userId)
    .order('created_at', { ascending: false })

  return { classes: data ?? [], error: error?.message ?? null }
}

export async function getStudentEnrolledClasses() {
  const auth = await authorize(['student'])
  if ('error' in auth) return { classes: [], error: auth.error }

  return getStudentClasses(auth.userId)
}

export async function getRoster(classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { students: [], error: auth.error }

  return getClassRoster(auth.userId, classId)
}

export async function archiveClassAction(classId: string) {
  const auth = await authorize(['admin', 'instructor'])
  if ('error' in auth) return { error: auth.error }

  const result = await archiveClass(classId)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/instructor')
  revalidatePath('/dashboard/admin')
}
