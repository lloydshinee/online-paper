import { requireAuth } from '@/lib/auth/require-auth'
import { getStudentEnrolledClasses } from '@/app/actions/classes'
import { logoutAction } from '@/app/actions/auth'
import { JoinClassDialog } from './join-class-dialog'
import { BookOpen, ClipboardList, Lightbulb } from 'lucide-react'
import Link from 'next/link'

export default async function StudentDashboard() {
  const user = await requireAuth()
  const { classes } = await getStudentEnrolledClasses()

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
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Your classes and assessments</p>
          </div>
          <JoinClassDialog />
        </div>

        <div className="grid gap-6">
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium">My Classes</p>
              </div>
              <p className="text-xs text-muted-foreground">{classes.length} class{classes.length !== 1 ? 'es' : ''}</p>
            </div>
            <div className="px-6 py-4">
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No classes yet. Join a class with an invitation code to get started.
                </p>
              ) : (
                <div className="divide-y divide-border -mx-6">
                  {classes.map((cls) => (
                    <Link
                      key={cls.id}
                      href={`/dashboard/student/classes/${cls.id}`}
                      className="block px-6 py-4 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{cls.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        View assessments
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border p-6">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList size={20} />
            </div>
            <h2 className="mb-1 text-base font-medium">Upcoming Assessments</h2>
            <p className="text-sm text-muted-foreground">
              Published assessments will appear here.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
