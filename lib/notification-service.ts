import { createServiceClient } from '@/lib/supabase/service'

export interface NotificationData {
  id: string
  user_id: string
  assessment_id: string | null
  message: string
  read: boolean
  created_at: string
}

export async function createNotificationsForAssessment(
  assessmentId: string,
  studentIds: string[],
  assessmentTitle: string,
): Promise<void> {
  if (studentIds.length === 0) return

  const supabase = createServiceClient()
  const message = `New assessment published: ${assessmentTitle}`

  const rows = studentIds.map((studentId) => ({
    user_id: studentId,
    assessment_id: assessmentId,
    message,
  }))

  await supabase.from('notifications').insert(rows)
}

export async function getNotifications(
  userId: string,
): Promise<(NotificationData & { class_id: string | null })[]> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('notifications')
    .select('*, assessments(class_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!data) return []

  return data.map((n: Record<string, unknown>) => ({
    ...n,
    class_id: (n.assessments as { class_id: string } | null)?.class_id ?? null,
  })) as (NotificationData & { class_id: string | null })[]
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createServiceClient()

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  return count ?? 0
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const supabase = createServiceClient()

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
}

export async function markAllAsRead(userId: string): Promise<void> {
  const supabase = createServiceClient()

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
}
