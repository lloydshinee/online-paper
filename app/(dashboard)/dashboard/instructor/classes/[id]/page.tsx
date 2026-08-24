import { requireRole } from '@/lib/auth/require-auth'
import { getInstructorClasses, getRoster } from '@/app/actions/classes'
import { getAssessmentsForClass } from '@/app/actions/assessments'
import DashboardHeader from '@/components/dashboard-header'
import { StudentRoster } from '@/components/student-roster'
import { ArrowLeft, FileEdit, CheckCircle2, Archive, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AssessmentsTab } from './_components/assessments-tab'
import { StudentSummaryTab } from './_components/student-summary-tab'
import { ClassPageTabs, parseClassPageTab } from './_components/class-page-tabs'

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
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

  const { tab } = await searchParams
  const active = parseClassPageTab(tab)

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

        <ClassPageTabs classId={id} active={active} />

        {active === 'assessments' && (
          <AssessmentsTab classId={id} drafts={drafts} published={published} closed={closed} />
        )}
        {active === 'roster' && <StudentRoster classId={id} initialCount={students.length} />}
        {active === 'summary' && <StudentSummaryTab />}
      </main>
    </div>
  )
}
