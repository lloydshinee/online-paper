import { requireAuth } from '@/lib/auth/require-auth'
import { getStudentEnrolledClasses } from '@/app/actions/classes'
import { getStudentClassAssessments } from '@/app/actions/timed-assessment'
import DashboardHeader from '@/components/dashboard-header'
import { NotificationBell } from '@/app/(dashboard)/dashboard/student/notification-bell'
import { ArrowLeft, Clock, CheckCircle2, Timer, Play, RotateCcw, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

  const pending = assessments.filter(
    (a) => !a.submission || a.submission.status === 'in_progress'
  )
  const completed = assessments.filter(
    (a) => a.submission && (a.submission.status === 'submitted' || a.submission.status === 'expired')
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        userName={[user.firstname, user.lastname].filter(Boolean).join(' ') || 'User'}
        userFirstname={user.firstname}
        userLastname={user.lastname}
        userEmail={user.email}
        userAvatarUrl={user.avatar_url}
      >
        <NotificationBell />
      </DashboardHeader>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/dashboard/student"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{cls.name}</h1>
          {assessments.length > 0 && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={12} className="text-amber-500" />
                {pending.length} pending
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 size={12} className="text-green-500" />
                {completed.length} completed
              </div>
            </div>
          )}
        </div>

        {assessments.length === 0 ? (
          <div className="rounded-xl border border-border p-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
              <Clock size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-base font-medium mb-1">No assessments published yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Check back later for new assessments from your instructor.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pending */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={15} className="text-amber-500" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pending</h2>
                <Badge variant="secondary" className="ml-1">{pending.length}</Badge>
              </div>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-border px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No pending assessments</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((a) => {
                    const isInProgress = a.submission?.status === 'in_progress'
                    const isLive = a.mode === 'live' && a.state === 'active'
                    const notAccepting = a.accepting_submissions === false && !isLive
                    const href = `/dashboard/student/classes/${id}/assessments/${a.id}`

                    return (
                      <div
                        key={a.id}
                        className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
                      >
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                            </div>
                            {isLive ? (
                              <Badge variant="default" className="shrink-0 bg-red-500 hover:bg-red-500">Live</Badge>
                            ) : isInProgress ? (
                              <Badge variant="secondary" className="shrink-0">In progress</Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0">New</Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mb-4">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize h-4">
                              {a.mode === 'timed' ? 'Timed' : 'Live session'}
                            </Badge>
                            {a.mode === 'timed' && a.duration_minutes && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Timer size={10} />
                                {a.duration_minutes} min
                              </span>
                            )}
                          </div>

                          {isLive ? (
                            <Link
                              href={`${href}/live`}
                              className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-red-500 px-4 py-2 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                            >
                              <Play size={13} /> Join Live
                            </Link>
                          ) : isInProgress ? (
                            <Link
                              href={href}
                              className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                            >
                              <RotateCcw size={13} /> Resume
                            </Link>
                          ) : notAccepting ? (
                            <span className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
                              Not accepting submissions
                            </span>
                          ) : (
                            <Link
                              href={href}
                              className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              <Play size={13} /> Start Assessment
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Completed */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={15} className="text-green-500" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Completed</h2>
                <Badge variant="secondary" className="ml-1">{completed.length}</Badge>
              </div>
              {completed.length === 0 ? (
                <div className="rounded-xl border border-border px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No completed assessments</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completed.map((a) => {
                    const href = `/dashboard/student/classes/${id}/assessments/${a.id}`
                    const hasScore = a.submission?.score_total != null
                    const scoresReleased = a.scores_released
                    // Timed retakes are offered only for finished work with
                    // nothing running: at least one finished attempt AND no
                    // In Progress attempt. The live join link keeps its
                    // previous behavior.
                    const canRetake =
                      a.retakes_allowed &&
                      (a.mode === 'live' ||
                        (!a.submission!.has_in_progress && a.submission!.has_finished_attempt))

                    return (
                      <div
                        key={a.id}
                        className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
                      >
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                            </div>
                            {hasScore && scoresReleased ? (
                              <Badge variant="default" className="shrink-0 bg-green-600 hover:bg-green-600">
                                {a.submission!.score_total} pts
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="shrink-0">Submitted</Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mb-4">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize h-4">
                              {a.mode === 'timed' ? 'Timed' : 'Live session'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            {scoresReleased ? (
                              <Link
                                href={href}
                                className="inline-flex items-center justify-center gap-1.5 flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                <Eye size={13} /> View results
                              </Link>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1.5 flex-1 rounded-md bg-green-50 dark:bg-green-900/10 px-4 py-2 text-xs font-medium text-green-700 dark:text-green-400">
                                <CheckCircle2 size={13} /> Submitted
                              </span>
                            )}
                            {canRetake && (
                              <Link
                                href={a.mode === 'live' ? `${href}/live` : `${href}?retake=1`}
                                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-xs font-medium hover:bg-muted transition-colors"
                              >
                                <RotateCcw size={13} /> Retake
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
