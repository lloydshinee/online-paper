import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

export function getAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export default function setup() {
  return async () => {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
      // Find all test users by email pattern
      const { data: testUsers } = await admin.from('users').select('id').like('email', 'test-%@example.com')
      const testUserIds: string[] = testUsers?.map((u: { id: string }) => u.id) ?? []

      if (testUserIds.length === 0) {
        // No test users found — nothing to clean up
        try {
          const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 500 })
          for (const user of authUsers?.users ?? []) {
            if (user.email?.startsWith('test-') && user.email?.endsWith('@example.com')) {
              try { await admin.auth.admin.deleteUser(user.id) } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
        return
      }

      // Trace test data: users → classes → assessments → sessions, submissions
      const { data: testClasses } = await admin.from('classes').select('id').in('instructor_id', testUserIds)
      const testClassIds: string[] = testClasses?.map((c: { id: string }) => c.id) ?? []

      const { data: testAssessments } = testClassIds.length > 0
        ? await admin.from('assessments').select('id').in('class_id', testClassIds)
        : { data: [] }
      const testAssessmentIds: string[] = testAssessments?.map((a: { id: string }) => a.id) ?? []

      const { data: testSessions } = testAssessmentIds.length > 0
        ? await admin.from('live_sessions').select('id').in('assessment_id', testAssessmentIds)
        : { data: [] }
      const testSessionIds: string[] = testSessions?.map((s: { id: string }) => s.id) ?? []

      const { data: testSubmissions } = testAssessmentIds.length > 0
        ? await admin.from('submissions').select('id').in('assessment_id', testAssessmentIds)
        : { data: [] }
      const testSubmissionIds: string[] = testSubmissions?.map((s: { id: string }) => s.id) ?? []

      // Delete in FK dependency order
      if (testSessionIds.length > 0) {
        try { await admin.from('live_answers').delete().in('session_id', testSessionIds) } catch { /* ignore */ }
      }
      // Also delete live_answers by test student IDs (in case they answered in non-test sessions — shouldn't happen)
      try { await admin.from('live_answers').delete().in('student_id', testUserIds) } catch { /* ignore */ }

      if (testSubmissionIds.length > 0) {
        try { await admin.from('answers').delete().in('submission_id', testSubmissionIds) } catch { /* ignore */ }
      }
      if (testAssessmentIds.length > 0) {
        try { await admin.from('notifications').delete().in('assessment_id', testAssessmentIds) } catch { /* ignore */ }
      }
      if (testSubmissionIds.length > 0) {
        try { await admin.from('submissions').delete().in('id', testSubmissionIds) } catch { /* ignore */ }
      }
      // Also delete submissions by test student IDs (safety net)
      try { await admin.from('submissions').delete().in('student_id', testUserIds) } catch { /* ignore */ }

      if (testAssessmentIds.length > 0) {
        try { await admin.from('questions').delete().in('assessment_id', testAssessmentIds) } catch { /* ignore */ }
        try { await admin.from('live_sessions').delete().in('assessment_id', testAssessmentIds) } catch { /* ignore */ }
      }
      if (testClassIds.length > 0) {
        try { await admin.from('assessments').delete().in('class_id', testClassIds) } catch { /* ignore */ }
        try { await admin.from('class_enrollments').delete().in('class_id', testClassIds) } catch { /* ignore */ }
        try { await admin.from('classes').delete().in('id', testClassIds) } catch { /* ignore */ }
      }
      // Also delete enrollments for test students (safety net)
      try { await admin.from('class_enrollments').delete().in('student_id', testUserIds) } catch { /* ignore */ }

      // Delete test users
      try { await admin.from('users').delete().in('id', testUserIds) } catch { /* ignore */ }

      // Clean up auth users
      try {
        const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 500 })
        for (const user of authUsers?.users ?? []) {
          if (user.email?.startsWith('test-') && user.email?.endsWith('@example.com')) {
            try { await admin.auth.admin.deleteUser(user.id) } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }
}
