import { ClipboardList, Plus, FileEdit, CheckCircle2, Archive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { AssessmentData } from '@/lib/assessment-service'

interface AssessmentsTabProps {
  classId: string
  drafts: AssessmentData[]
  published: AssessmentData[]
  closed: AssessmentData[]
}

export function AssessmentsTab({ classId, drafts, published, closed }: AssessmentsTabProps) {
  if (drafts.length === 0 && published.length === 0 && closed.length === 0) {
    return (
      <div className="rounded-xl border border-border p-12 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
          <ClipboardList size={24} className="text-muted-foreground" />
        </div>
        <h2 className="text-base font-medium mb-1">No assessments yet</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
          Create your first assessment to get started.
        </p>
        <Link
          href={`/dashboard/instructor/classes/${classId}/assessments/create`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Create Assessment
        </Link>
      </div>
    )
  }

  return (
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
                href={`/dashboard/instructor/classes/${classId}/assessments/${a.id}`}
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
                href={`/dashboard/instructor/classes/${classId}/assessments/${a.id}`}
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
                href={`/dashboard/instructor/classes/${classId}/assessments/${a.id}`}
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
    </div>
  )
}
