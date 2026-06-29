'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { authorize } from '@/lib/auth/authorize'
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
  const auth = await authorize(['admin'])
  if ('error' in auth) return { error: auth.error }

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
  const auth = await authorize(['admin'])
  if ('error' in auth) return { error: auth.error }

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
  const auth = await authorize(['admin'])
  if ('error' in auth) return { error: auth.error }

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

export async function getUsers(limit?: number, offset?: number, search?: string) {
  const auth = await authorize(['admin'])
  if ('error' in auth) return { users: [], total: 0, error: auth.error }

  return listUsers(limit, offset, search)
}

export async function getSystemOverview(search?: string) {
  const auth = await authorize(['admin'])
  if ('error' in auth) return { classes: [] }

  const supabase = createServiceClient()

  let query = supabase
    .from('classes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: classes } = await query

  if (!classes) return { classes: [] }

  const classIds = classes.map((c) => c.id)

  const { data: assessments } = await supabase
    .from('assessments')
    .select('*')
    .in('class_id', classIds)
    .order('created_at', { ascending: false })

  const assessmentIds = (assessments ?? []).map((a) => a.id)

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, assessment_id, status')
    .in('assessment_id', assessmentIds)

  const submissionCounts = new Map<string, number>()
  for (const s of submissions ?? []) {
    submissionCounts.set(s.assessment_id, (submissionCounts.get(s.assessment_id) ?? 0) + 1)
  }

  const result = classes.map((c) => {
    const classAssessments = (assessments ?? [])
      .filter((a) => a.class_id === c.id)
      .map((a) => ({
        ...a,
        submission_count: submissionCounts.get(a.id) ?? 0,
      }))
    return {
      ...c,
      assessments: classAssessments,
    }
  })

  return { classes: result }
}

export async function getAdminClassAssessments(classId: string) {
  const auth = await authorize(['admin'])
  if ('error' in auth) return { assessments: [], className: '' }

  const supabase = createServiceClient()

  const { data: assessmentRows } = await supabase
    .from('assessments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  if (!assessmentRows) return { assessments: [], className: '' }

  const { data: cls } = await supabase
    .from('classes')
    .select('name')
    .eq('id', classId)
    .single()

  const ids = assessmentRows.map((a) => a.id)
  const { data: submissions } = await supabase
    .from('submissions')
    .select('assessment_id')
    .in('assessment_id', ids)

  const counts = new Map<string, number>()
  for (const s of submissions ?? []) {
    counts.set(s.assessment_id, (counts.get(s.assessment_id) ?? 0) + 1)
  }

  const assessments = assessmentRows.map((a) => ({
    id: a.id,
    title: a.title,
    mode: a.mode,
    state: a.state,
    submission_count: counts.get(a.id) ?? 0,
  }))

  return { assessments, className: cls?.name ?? 'Unknown' }
}

export async function getAdminClassStudents(
  classId: string,
  assessmentId: string,
  limit = 20,
  offset = 0,
  search?: string,
) {
  const auth = await authorize(['admin'])
  if ('error' in auth) return { students: [], total: 0 }

  const supabase = createServiceClient()

  // Count total
  let countQuery = supabase.from('class_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId)

  if (search) {
    const { data: matchingUsers } = await supabase
      .from('users')
      .select('id')
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const matchingIds = (matchingUsers ?? []).map((u) => u.id)
    if (matchingIds.length === 0) return { students: [], total: 0 }
    countQuery = countQuery.in('student_id', matchingIds)
  }

  const { count } = await countQuery

  // Get enrolled student IDs with pagination
  let enrollQuery = supabase.from('class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .range(offset, offset + limit - 1)

  if (search) {
    const { data: matchingUsers } = await supabase
      .from('users')
      .select('id')
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const matchingIds = (matchingUsers ?? []).map((u) => u.id)
    if (matchingIds.length === 0) return { students: [], total: 0 }
    enrollQuery = enrollQuery.in('student_id', matchingIds)
  }

  const { data: enrollments } = await enrollQuery

  if (!enrollments || enrollments.length === 0) return { students: [], total: count ?? 0 }

  const studentIds = enrollments.map((e) => e.student_id)

  const [usersRes, submissionsRes] = await Promise.all([
    supabase.from('users').select('id, name, email').in('id', studentIds),
    supabase.from('submissions').select('student_id, status, score_total')
      .eq('assessment_id', assessmentId)
      .in('student_id', studentIds),
  ])

  const subMap = new Map<string, { status: string; score_total: number | null }>()
  for (const s of (submissionsRes.data ?? [])) {
    subMap.set(s.student_id, { status: s.status, score_total: s.score_total })
  }

  const students = ((usersRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((u) => ({
    id: u.id,
    name: u.name ?? 'Unknown',
    email: u.email ?? '',
    submission_status: subMap.get(u.id)?.status ?? null,
    score_total: subMap.get(u.id)?.score_total ?? null,
  }))

  return { students, total: count ?? 0 }
}
