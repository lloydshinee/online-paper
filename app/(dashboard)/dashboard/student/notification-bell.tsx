'use client'

import { useState, useEffect, useCallback, useRef, startTransition } from 'react'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getNotificationsAction, getUnreadCountAction, markAsReadAction, markAllAsReadAction } from '@/app/actions/notifications'

const supabase = createClient()

interface Notification {
  id: string
  user_id: string
  assessment_id: string | null
  class_id: string | null
  message: string
  read: boolean
  created_at: string
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    const [notifs, count] = await Promise.all([
      getNotificationsAction(),
      getUnreadCountAction(),
    ])
    setNotifications(notifs)
    setUnreadCount(count)
  }, [])

  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    let ignore = false
    startTransition(() => { refresh() })

    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return

      channel = supabase
        .channel(`notifs-${data.user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${data.user.id}`,
          },
          () => { if (!ignore) refreshRef.current() },
        )
        .subscribe()
    })

    return () => {
      ignore = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [refresh])

  const handleMarkRead = async (id: string) => {
    await markAsReadAction(id)
    setOpen(false)
    refresh()
  }

  const handleMarkAllRead = async () => {
    await markAllAsReadAction()
    refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No notifications
                </p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.assessment_id && n.class_id ? `/dashboard/student/classes/${n.class_id}/assessments/${n.assessment_id}` : '#'}
                    onClick={(e) => {
                      if (!n.assessment_id || !n.class_id) e.preventDefault()
                      handleMarkRead(n.id)
                    }}
                    className={`block border-b border-border px-4 py-3 hover:bg-muted/50 transition-colors last:border-b-0 ${
                      !n.read ? 'bg-primary/5' : ''
                    }`}
                  >
                    <p className="text-sm">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
