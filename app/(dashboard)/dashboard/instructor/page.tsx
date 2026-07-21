import { requireRole } from '@/lib/auth/require-auth'
import DashboardHeader from '@/components/dashboard-header'
import { getInstructorClasses } from '@/app/actions/classes'
import { CreateClassDialog } from './create-class-dialog'
import { BookOpen, ExternalLink, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function InstructorDashboard() {
  const user = await requireRole(['instructor'])
  const { classes } = await getInstructorClasses()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        userName={[user.firstname, user.lastname].filter(Boolean).join(' ') || 'User'}
        userFirstname={user.firstname}
        userLastname={user.lastname}
        userEmail={user.email}
        userAvatarUrl={user.avatar_url}
      />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Instructor Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage your classes and assessments</p>
          </div>
          <CreateClassDialog />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <BookOpen size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">My Classes</h2>
          <Badge variant="secondary" className="ml-1">{classes.length}</Badge>
        </div>

        {classes.length === 0 ? (
          <div className="rounded-xl border border-border p-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
              <BookOpen size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">No classes yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Create your first class to start adding assessments.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.map((cls) => (
              <Link
                key={cls.id}
                href={`/dashboard/instructor/classes/${cls.id}`}
                className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate">{cls.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{cls.join_code}</p>
                    </div>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Users size={14} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {cls.archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                      Open <ExternalLink size={12} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
