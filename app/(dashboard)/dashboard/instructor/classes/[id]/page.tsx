import { requireRole } from '@/lib/auth/require-auth'
import { getInstructorClasses, getRoster } from '@/app/actions/classes'
import { getAssessmentsForClass } from '@/app/actions/assessments'
import DashboardHeader from '@/components/dashboard-header'
import { StudentRoster } from '@/components/student-roster'
import { ArrowLeft, ClipboardList, Plus, FileEdit, CheckCircle2, Archive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { notFound } from 'next/navigation'

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

  const drafts = assessments.filter((a) => a.state === 'draft')
  const published = assessments.filter((a) => a.state === 'active')
  const closed = assessments.filter((a) => a.state === 'closed')

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
              <div className="flex items-center gap-3 mt-2">
                <p className="text-sm text-muted-foreground">
                  Code: <span className="font-mono rounded bg-muted px-2 py-0.5">{cls.join_code}</span>
                </p>
                <span className="text-xs text-muted-foreground">
                  {students.length} student{students.length !== 1 ? 's' : ''}
                </span>
                {cls.archived && (
                  <Badge variant="destructive" className="h-5">Archived</Badge>
                )}
              </div>
              {assessments.length > 0 && (
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileEdit size={12} className="text-muted-foreground" />
                    {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 size={12} className="text-green-500" />
                    {published.length} published
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Archive size={12} className="text-muted-foreground" />
                    {closed.length} closed
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/instructor/classes/${id}/assessments/create`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Create
              </Link>
            </div>
          </div>
        </div>

        {assessments.length === 0 ? (
          <div className="rounded-xl border border-border p-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
              <ClipboardList size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-base font-medium mb-1">No assessments yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Create your first assessment to get started.
            </p>
            <Link
              href={`/dashboard/instructor/classes/${id}/assessments/create`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} />
              Create Assessment
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Drafts */}
            {drafts.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <FileEdit size={15} className="text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Drafts</h2>
                  <Badge variant="secondary" className="ml-1">{drafts.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {drafts.map((a) => (
                    <Link
                      key={a.id}
                      href={`/dashboard/instructor/classes/${id}/assessments/${a.id}`}
                      className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                          </div>
                          <Badge variant="secondary" className="shrink-0">Draft</Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize h-4">
                            {a.mode === 'timed' ? 'Timed' : 'Live session'}
                          </Badge>
                          {a.mode === 'timed' && a.duration_minutes && (
                            <span className="text-[10px] text-muted-foreground">{a.duration_minutes} min</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Published */}
            {published.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={15} className="text-green-500" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Published</h2>
                  <Badge variant="secondary" className="ml-1">{published.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {published.map((a) => (
                    <Link
                      key={a.id}
                      href={`/dashboard/instructor/classes/${id}/assessments/${a.id}`}
                      className="group rounded-xl border border-border bg-card hover:border-green-200 dark:hover:border-green-900/30 hover:shadow-sm transition-all"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                          </div>
                          <Badge variant="default" className="shrink-0 bg-green-600 hover:bg-green-600">Published</Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize h-4">
                            {a.mode === 'timed' ? 'Timed' : 'Live session'}
                          </Badge>
                          {a.mode === 'timed' && a.duration_minutes && (
                            <span className="text-[10px] text-muted-foreground">{a.duration_minutes} min</span>
                          )}
                          {a.accepting_submissions === false && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Closed</Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Closed */}
            {closed.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Archive size={15} className="text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Closed</h2>
                  <Badge variant="secondary" className="ml-1">{closed.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {closed.map((a) => (
                    <Link
                      key={a.id}
                      href={`/dashboard/instructor/classes/${id}/assessments/${a.id}`}
                      className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all opacity-60 hover:opacity-100"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                          </div>
                          <Badge variant="secondary" className="shrink-0">Closed</Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize h-4">
                            {a.mode === 'timed' ? 'Timed' : 'Live session'}
                          </Badge>
                          {a.mode === 'timed' && a.duration_minutes && (
                            <span className="text-[10px] text-muted-foreground">{a.duration_minutes} min</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <StudentRoster classId={id} initialCount={students.length} />
          </div>
        )}
      </main>
    </div>
  )
}
