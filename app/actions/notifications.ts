'use server'

import { revalidatePath } from 'next/cache'
import { authorize } from '@/lib/auth/authorize'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/lib/notification-service'

export async function getNotificationsAction() {
  const auth = await authorize(['student'])
  if ('error' in auth) return []

  return getNotifications(auth.userId)
}

export async function getUnreadCountAction() {
  const auth = await authorize(['student'])
  if ('error' in auth) return 0

  return getUnreadCount(auth.userId)
}

export async function markAsReadAction(notificationId: string) {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error }

  const result = await markAsRead(notificationId, auth.userId)
  revalidatePath('/dashboard/student')
  return result
}

export async function markAllAsReadAction() {
  const auth = await authorize(['student'])
  if ('error' in auth) return { error: auth.error }

  const result = await markAllAsRead(auth.userId)
  revalidatePath('/dashboard/student')
  return result
}
