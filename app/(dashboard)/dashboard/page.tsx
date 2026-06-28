import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/require-auth'

export default async function DashboardPage() {
  const user = await requireAuth()

  if (user.role === 'admin') redirect('/dashboard/admin')
  if (user.role === 'instructor') redirect('/dashboard/instructor')
  redirect('/dashboard/student')
}
