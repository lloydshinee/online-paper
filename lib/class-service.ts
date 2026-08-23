import { createServiceClient } from '@/lib/supabase/service'

export interface ClassData {
  id: string
  instructor_id: string
  name: string
  join_code: string
  archived: boolean
  created_at: string
}

export interface ClassResult {
  class: ClassData | null
  error: string | null
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export interface MembershipData {
  id: string
  class_id: string
  student_id: string
  enrolled_at: string
}

export interface MembershipResult {
  membership: MembershipData | null
  error: string | null
}

export interface StudentProfile {
  id: string
  email: string
  firstname: string | null
  lastname: string | null
}

export async function createClass(
  instructorId: string,
  name: string,
): Promise<ClassResult> {
  const supabase = createServiceClient()

  let joinCode = generateJoinCode()
  let attempts = 0

  while (attempts < 5) {
    const { data, error } = await supabase
      .from('classes')
      .insert({
        instructor_id: instructorId,
        name,
        join_code: joinCode,
      })
      .select('id, instructor_id, name, join_code, archived, created_at')
      .single()

    if (!error && data) {
      return { class: data as ClassData, error: null }
    }

    if (error?.code === '23505') {
      joinCode = generateJoinCode()
      attempts++
      continue
    }

    return { class: null, error: error?.message ?? 'Failed to create class' }
  }

  return { class: null, error: 'Failed to generate unique join code' }
}

export async function joinClass(
  studentId: string,
  joinCode: string,
): Promise<MembershipResult> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id, archived')
    .eq('join_code', joinCode)
    .single()

  if (!cls) {
    return { membership: null, error: 'Invalid invite code' }
  }

  if (cls.archived) {
    return { membership: null, error: 'Invalid invite code' }
  }

  const { data: existing } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', cls.id)
    .maybeSingle()

  if (existing) {
    return { membership: null, error: 'You are already enrolled in this class' }
  }

  const { data, error } = await supabase
    .from('class_enrollments')
    .insert({
      student_id: studentId,
      class_id: cls.id,
    })
    .select('id, class_id, student_id, enrolled_at')
    .single()

  if (error) {
    return { membership: null, error: error.message }
  }

  return { membership: data as MembershipData, error: null }
}

export async function getStudentClasses(
  studentId: string,
): Promise<{ classes: ClassData[]; error: string | null }> {
  const supabase = createServiceClient()

  const { data: enrollments, error } = await supabase
    .from('class_enrollments')
    .select('class_id')
    .eq('student_id', studentId)

  if (error) {
    return { classes: [], error: error.message }
  }

  if (!enrollments || enrollments.length === 0) {
    return { classes: [], error: null }
  }

  const classIds = enrollments.map((e) => e.class_id)

  const { data: classes, error: classError } = await supabase
    .from('classes')
    .select('id, instructor_id, name, join_code, archived, created_at')
    .in('id', classIds)
    .eq('archived', false)

  if (classError) {
    return { classes: [], error: classError.message }
  }

  return { classes: (classes as ClassData[]) ?? [], error: null }
}

export async function getClassRoster(
  instructorId: string,
  classId: string,
): Promise<{ students: StudentProfile[]; error: string | null }> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) {
    return { students: [], error: 'Class not found' }
  }

  const { data: enrollments, error } = await supabase
    .from('class_enrollments')
    .select('student_id')
    .eq('class_id', classId)

  if (error) {
    return { students: [], error: error.message }
  }

  if (!enrollments || enrollments.length === 0) {
    return { students: [], error: null }
  }

  const studentIds = enrollments.map((e) => e.student_id)

  const { data: students, error: studentError } = await supabase
    .from('users')
    .select('id, email, firstname, lastname')
    .in('id', studentIds)

  if (studentError) {
    return { students: [], error: studentError.message }
  }

  return { students: (students as StudentProfile[]) ?? [], error: null }
}

export async function getClassRosterPaginated(
  instructorId: string,
  classId: string,
  page = 1,
  pageSize = 20,
  search?: string,
): Promise<{ students: StudentProfile[]; total: number; error: string | null }> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) {
    return { students: [], total: 0, error: 'Class not found' }
  }

  // Get total count
  let countQuery = supabase
    .from('class_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId)

  if (search) {
    const { data: matchingUsers } = await supabase
      .from('users')
      .select('id')
      .or(`firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%`)

    const matchingIds = (matchingUsers ?? []).map((u) => u.id)
    if (matchingIds.length === 0) return { students: [], total: 0, error: null }
    countQuery = countQuery.in('student_id', matchingIds)
  }

  const { count } = await countQuery

  // Get student IDs with pagination — filter first, then order for a stable
  // window; slicing before the search filter hid every match beyond the
  // current page.
  let enrollQuery = supabase
    .from('class_enrollments')
    .select('student_id')
    .eq('class_id', classId)

  if (search) {
    const { data: matchingUsers } = await supabase
      .from('users')
      .select('id')
      .or(`firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%`)

    const matchingIds = (matchingUsers ?? []).map((u) => u.id)
    if (matchingIds.length === 0) return { students: [], total: 0, error: null }
    enrollQuery = enrollQuery.in('student_id', matchingIds)
  }

  enrollQuery = enrollQuery
    .order('student_id')
    .range((page - 1) * pageSize, page * pageSize - 1)

  const { data: enrollments } = await enrollQuery

  if (!enrollments || enrollments.length === 0) {
    return { students: [], total: count ?? 0, error: null }
  }

  const studentIds = enrollments.map((e) => e.student_id)

  const { data: students, error: studentError } = await supabase
    .from('users')
    .select('id, email, firstname, lastname')
    .in('id', studentIds)

  if (studentError) {
    return { students: [], total: 0, error: studentError.message }
  }

  return { students: (students as StudentProfile[]) ?? [], total: count ?? 0, error: null }
}

export async function removeStudentFromClass(
  instructorId: string,
  classId: string,
  studentId: string,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) {
    return { error: 'Class not found' }
  }

  const { error } = await supabase
    .from('class_enrollments')
    .delete()
    .eq('class_id', classId)
    .eq('student_id', studentId)

  if (error) return { error: error.message }

  return { error: null }
}

export async function getInstructorClasses(
  instructorId: string,
): Promise<{ classes: ClassData[]; error: string | null }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('classes')
    .select('id, instructor_id, name, join_code, archived, created_at')
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false })

  return { classes: (data as ClassData[]) ?? [], error: error?.message ?? null }
}

export async function archiveClass(classId: string, instructorId?: string): Promise<ClassResult> {
  const supabase = createServiceClient()

  let query = supabase
    .from('classes')
    .update({ archived: true })
    .eq('id', classId)

  if (instructorId) {
    query = query.eq('instructor_id', instructorId)
  }

  const { data, error } = await query
    .select('id, instructor_id, name, join_code, archived, created_at')
    .single()

  if (error) {
    return { class: null, error: error.message }
  }

  return { class: data as ClassData, error: null }
}
