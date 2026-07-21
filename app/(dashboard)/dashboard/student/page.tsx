import { requireAuth } from '@/lib/auth/require-auth'
import { getStudentEnrolledClasses } from '@/app/actions/classes'
import { getDashboardAssessments } from '@/app/actions/timed-assessment'
import DashboardHeader from '@/components/dashboard-header'
import { JoinClassDialog } from './join-class-dialog'
import { NotificationBell } from './notification-bell'
import { BookOpen, ClipboardList, Clock, Timer, Users, Play, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function StudentDashboard() {
  const user = await requireAuth()
  const { classes } = await getStudentEnrolledClasses()
  const { assessments } = await getDashboardAssessments()

  const pending = assessments.filter(
    (a) => !a.submission || a.submission.status === 'in_progress'
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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Your classes and pending assessments</p>
          </div>
          <JoinClassDialog />
        </div>

        {/* Enrolled classes quick overview */}
        {classes.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={15} className="text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">My Classes</h2>
              <Badge variant="secondary" className="ml-1">{classes.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {classes.map((cls) => (
                <Link
                  key={cls.id}
                  href={`/dashboard/student/classes/${cls.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  <Users size={13} className="text-muted-foreground" />
                  {cls.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Pending assessments */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-amber-500" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pending Assessments</h2>
            <Badge variant="secondary" className="ml-1">{pending.length}</Badge>
          </div>

          {pending.length === 0 ? (
            <div className="rounded-xl border border-border p-12 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
                <ClipboardList size={24} className="text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium mb-1">All caught up</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {classes.length === 0
                  ? 'Join a class to see assessments from your instructor.'
                  : 'No pending assessments right now. Check back later.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              {pending.map((a) => {
                const isInProgress = a.submission?.status === 'in_progress'
                const isLive = a.mode === 'live' && a.state === 'active'
                const href = `/dashboard/student/classes/${a.class_id}/assessments/${a.id}`

                return (
                  <div
                    key={a.id}
                    className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{a.class_name}</p>
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
        </div>
      </main>
    </div>
  )
}
