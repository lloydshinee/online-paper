'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { authorize } from '@/lib/auth/authorize'
import { getUser } from '@/lib/auth/auth-service'
import {
  createClass,
  joinClass,
  getStudentClasses,
  getClassRoster,
  archiveClass,
  getInstructorClasses as getInstructorClassesService,
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

  return getInstructorClassesService(auth.userId)
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

  const supabase = await createClient()
  const user = await getUser(supabase)

  const instructorId = user?.role === 'instructor' ? auth.userId : undefined

  const result = await archiveClass(classId, instructorId)

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/instructor')
  revalidatePath('/dashboard/admin')
}
