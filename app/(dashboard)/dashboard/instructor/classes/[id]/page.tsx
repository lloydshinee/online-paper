import { requireRole } from '@/lib/auth/require-auth'
import { getInstructorClasses, getRoster } from '@/app/actions/classes'
import { getAssessmentsForClass } from '@/app/actions/assessments'
import { logoutAction } from '@/app/actions/auth'
import { ArrowLeft, ClipboardList, Lightbulb, Plus, Users } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const stateLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  active: { label: 'Published', className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
}

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireRole(['instructor'])
  const { classes } = await getInstructorClasses()

  const cls = classes.find((c: { id: string }) => c.id === id)
  if (!cls) notFound()

  const { students } = await getRoster(id)
  const { assessments } = await getAssessmentsForClass(id)

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
        <div className="mb-8">
          <Link
            href="/dashboard/instructor"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{cls.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Invite code: <span className="font-mono rounded bg-muted px-2 py-0.5">{cls.join_code}</span>
              </p>
              {cls.archived && (
                <span className="inline-block mt-2 rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  Archived
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-muted-foreground" />
                  <p className="text-sm font-medium">Assessments</p>
                </div>
                <p className="text-xs text-muted-foreground">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</p>
              </div>
              <Link
                href={`/dashboard/instructor/classes/${id}/assessments/create`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Create
              </Link>
            </div>
            <div className="px-6 py-4">
              {assessments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No assessments yet. Create one to get started.
                </p>
              ) : (
                <div className="divide-y divide-border -mx-6">
                  {assessments.map((a) => {
                    const stateInfo = stateLabels[a.state] ?? { label: a.state, className: 'bg-muted text-muted-foreground' }
                    return (
                      <Link
                        key={a.id}
                        href={`/dashboard/instructor/classes/${id}/assessments/${a.id}`}
                        className="flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium">{a.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`rounded-md px-1.5 py-0.5 text-xs ${stateInfo.className}`}>
                              {stateInfo.label}
                            </span>
                            <span className="text-xs text-muted-foreground capitalize">{a.mode}</span>
                            {a.duration_minutes && (
                              <span className="text-xs text-muted-foreground">{a.duration_minutes} min</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium">Student Roster</p>
              </div>
              <p className="text-xs text-muted-foreground">{students.length} student{students.length !== 1 ? 's' : ''} enrolled</p>
            </div>
            <div className="px-6 py-4">
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No students enrolled yet. Share the invite code with your students.
                </p>
              ) : (
                <div className="divide-y divide-border -mx-6">
                  {students.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
