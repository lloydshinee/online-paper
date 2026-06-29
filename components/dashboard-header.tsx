import Link from 'next/link'
import { Lightbulb } from 'lucide-react'
import { logoutAction } from '@/app/actions/auth'

export default function DashboardHeader({
  userName,
  children,
}: {
  userName: string
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
        <div className="flex items-center gap-3">
          {children}
          <span className="text-sm text-muted-foreground">{userName}</span>
          <form action={logoutAction}>
            <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
