import { requireAuth } from '@/lib/auth/require-auth'
import { getStudentEnrolledClasses } from '@/app/actions/classes'
import { getStudentClassAssessments } from '@/app/actions/timed-assessment'
import { logoutAction } from '@/app/actions/auth'
import { ArrowLeft, ClipboardList, Lightbulb } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function StudentClassPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()
  const { classes } = await getStudentEnrolledClasses()

  const cls = classes.find((c: { id: string }) => c.id === id)
  if (!cls) notFound()

  const { assessments } = await getStudentClassAssessments(id)

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
        <Link
          href="/dashboard/student"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight mb-8">{cls.name}</h1>

        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-muted-foreground" />
              <p className="text-sm font-medium">Assessments</p>
            </div>
            <p className="text-xs text-muted-foreground">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="px-6 py-4">
            {assessments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No assessments published yet.
              </p>
            ) : (
              <div className="divide-y divide-border -mx-6">
                {assessments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground capitalize">{a.mode}</span>
                        {a.duration_minutes && (
                          <span className="text-xs text-muted-foreground">{a.duration_minutes} min</span>
                        )}
                      </div>
                    </div>
                    <div>
                      {(() => {
                        const sub = (a as Record<string, unknown>).submission as { status: string; score_total: number | null } | null
                        const href = `/dashboard/student/classes/${id}/assessments/${a.id}`

                        if (sub?.status === 'in_progress') {
                          return (
                            <Link
                              href={href}
                              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              Resume
                            </Link>
                          )
                        }

                        if (sub?.status === 'submitted' || sub?.status === 'expired') {
                          if (a.scores_released) {
                            return (
                              <Link
                                href={href}
                                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                View results
                              </Link>
                            )
                          }
                          return (
                            <span className="rounded-md bg-green-100 dark:bg-green-900/20 px-3 py-1.5 text-xs text-green-700 dark:text-green-400 font-medium">
                              Submitted
                            </span>
                          )
                        }

                        if (a.state === 'active' && a.mode === 'timed' && a.accepting_submissions !== false) {
                          return (
                            <Link
                              href={href}
                              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              Start
                            </Link>
                          )
                        }

                        if (a.state === 'active' && a.mode === 'live') {
                          return (
                            <Link
                              href={`${href}/live`}
                              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              Join Live
                            </Link>
                          )
                        }

                        if (a.state === 'active' && a.accepting_submissions === false) {
                          return (
                            <span className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                              Not accepting
                            </span>
                          )
                        }

                        if (a.state !== 'active') {
                          return (
                            <span className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                              Draft
                            </span>
                          )
                        }

                        return (
                          <span className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                            Live
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
