'use server'

import { authorize } from '@/lib/auth/authorize'
import { getStudentSummaryMatrix } from '@/lib/student-summary-service'

export async function getStudentSummary(classId: string) {
  const auth = await authorize(['instructor'])
  if ('error' in auth) return { matrix: null, error: auth.error }

  return getStudentSummaryMatrix(auth.userId, classId)
}
