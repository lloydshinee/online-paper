import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
}

interface E2ECredentials {
  instructorEmail: string
  studentEmail: string
  password: string
  classId: string
  joinCode: string
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default async function globalSetup() {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const stamp = Date.now()
  const instructorEmail = `e2e-instr-${stamp}@example.com`
  const studentEmail = `e2e-stu-${stamp}@example.com`
  const password = 'TestPass123!'

  async function createAccount(email: string, role: 'instructor' | 'student', firstname: string, lastname: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, firstname, lastname },
    })
    if (error || !data.user) throw new Error(`Failed to create ${role}: ${error?.message}`)

    const { error: updateError } = await admin
      .from('users')
      .update({ firstname, lastname, role })
      .eq('id', data.user.id)
    if (updateError) throw new Error(`Failed to set profile: ${updateError.message}`)

    return data.user.id
  }

  const instructorId = await createAccount(instructorEmail, 'instructor', 'E2E', 'Instructor')
  const studentId = await createAccount(studentEmail, 'student', 'E2E', 'Student')

  const joinCode = generateJoinCode()
  const { data: cls, error: classError } = await admin
    .from('classes')
    .insert({ instructor_id: instructorId, name: 'E2E Class', join_code: joinCode })
    .select('id')
    .single()
  if (classError || !cls) throw new Error(`Failed to create class: ${classError?.message}`)

  const { error: enrollError } = await admin
    .from('class_enrollments')
    .insert({ student_id: studentId, class_id: cls.id })
  if (enrollError) throw new Error(`Failed to enroll student: ${enrollError.message}`)

  const credentials: E2ECredentials = {
    instructorEmail,
    studentEmail,
    password,
    classId: cls.id,
    joinCode,
  }

  const outDir = join(__dirname, '.auth')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'credentials.json'), JSON.stringify(credentials, null, 2))

  // Best-effort cleanup of stale E2E data from previous runs.
  const { data: staleUsers } = await admin
    .from('users')
    .select('id, email')
    .like('email', 'e2e-%@example.com')
    .lte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())

  for (const stale of (staleUsers ?? [])) {
    try { await admin.auth.admin.deleteUser(stale.id) } catch { /* ignore */ }
  }
}
