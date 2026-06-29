'use client'

import { useState, useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createAssessmentAction } from '@/app/actions/assessments'
import DashboardHeader from '@/components/dashboard-header'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function CreateAssessmentPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [classId, setClassId] = useState<string>('')
  const [mode, setMode] = useState<'timed' | 'live'>('timed')
  const router = useRouter()

  useEffect(() => {
    paramsPromise.then((p) => setClassId(p.id))
  }, [paramsPromise])

  const [state, action, pending] = useActionState(createAssessmentAction, null)

  useEffect(() => {
    if (state?.redirectTo) {
      router.push(state.redirectTo)
    }
  }, [state?.redirectTo, router])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName="" />

      <main className="mx-auto max-w-lg px-6 py-10">
        <Link
          href={`/dashboard/instructor/classes/${classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to class
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight mb-8">Create Assessment</h1>

        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="classId" value={classId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <input id="title" name="title" type="text" required
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Midterm Exam" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Mode</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('timed')}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'timed' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                }`}>
                Timed
              </button>
              <button type="button" onClick={() => setMode('live')}
                className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'live' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                }`}>
                Live
              </button>
            </div>
            <input type="hidden" name="mode" value={mode} />
          </div>

          {mode === 'timed' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="durationMinutes" className="text-sm font-medium">Time limit (minutes)</label>
              <input id="durationMinutes" name="durationMinutes" type="number" min="1" required
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="60" />
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <button type="submit" disabled={pending}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {pending ? 'Creating...' : 'Create Assessment'}
          </button>
        </form>
      </main>
    </div>
  )
}
