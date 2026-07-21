import Link from 'next/link'
import { Lightbulb } from 'lucide-react'
import { logoutAction } from '@/app/actions/auth'
import { ProfileDialog } from '@/components/profile-dialog'

export default function DashboardHeader({
  userName,
  userFirstname,
  userLastname,
  userEmail,
  userAvatarUrl,
  children,
}: {
  userName: string
  userFirstname?: string | null
  userLastname?: string | null
  userEmail?: string
  userAvatarUrl?: string | null
  children?: React.ReactNode
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-medium text-base">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Lightbulb size={16} />
          </div>
          Online Paper
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          {children}
          <ProfileDialog
            userName={userName}
            firstname={userFirstname ?? null}
            lastname={userLastname ?? null}
            email={userEmail ?? ''}
            avatarUrl={userAvatarUrl ?? null}
          />
          <form action={logoutAction} className="shrink-0">
            <button className="rounded-md border border-border px-2 sm:px-3 py-1.5 text-sm hover:bg-muted transition-colors">
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden" aria-label="Sign out">Exit</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
