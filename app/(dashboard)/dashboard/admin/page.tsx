import { requireRole } from '@/lib/auth/require-auth'
import { logoutAction } from '@/app/actions/auth'
import { getUsers } from '@/app/actions/admin'
import { CreateUserDialog } from './create-user-dialog'
import { UserTable } from './user-table'
import { Lightbulb } from 'lucide-react'
import Link from 'next/link'

export default async function AdminDashboard() {
  const user = await requireRole(['admin'])
  const { users } = await getUsers()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-medium text-base">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Lightbulb size={16} />
            </div>
            Online Paper
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <form action={logoutAction}>
              <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="text-sm text-muted-foreground">Manage users and oversee the platform</p>
          </div>
          <CreateUserDialog />
        </div>

        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-6 py-4">
            <p className="text-sm font-medium">Users</p>
            <p className="text-xs text-muted-foreground">{users.length} registered user{users.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="px-6 py-4">
            <UserTable users={users} />
          </div>
        </div>
      </main>
    </div>
  )
}
