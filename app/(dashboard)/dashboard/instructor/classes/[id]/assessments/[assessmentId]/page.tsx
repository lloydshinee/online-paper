'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  getAssessmentWithQuestions,
} from '@/app/actions/assessments'
import { ArrowLeft, Radio } from 'lucide-react'
import DashboardHeader from '@/components/dashboard-header'
import Link from 'next/link'
import type { AssessmentInfo, PageTab } from './_components/types'

const QuestionsTab = dynamic(() => import('./_components/questions-tab'), {
  loading: () => <div className="px-6 py-10"><div className="animate-pulse rounded-xl bg-muted h-64" /></div>,
})
const SettingsTab = dynamic(() => import('./_components/settings-tab'), {
  loading: () => <div className="px-6 py-10"><div className="animate-pulse rounded-xl bg-muted h-64" /></div>,
})
const SubmissionsTab = dynamic(() => import('./_components/submissions-tab'), {
  loading: () => <div className="px-6 py-10"><div className="animate-pulse rounded-xl bg-muted h-64" /></div>,
})

const tabs: { key: PageTab; label: string }[] = [
  { key: 'questions', label: 'Questions' },
  { key: 'settings', label: 'Settings' },
  { key: 'submissions', label: 'Submissions' },
]

export default function AssessmentPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; assessmentId: string }>
}) {
  const { id: classId, assessmentId } = use(paramsPromise)
  const router = useRouter()

  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null)
  const [tab, setTab] = useState<PageTab>('questions')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const data = await getAssessmentWithQuestions(assessmentId)
      if (data && data.assessment) {
        setAssessment(data.assessment)
      } else {
        setError('Assessment not found')
      }
      setLoaded(true)
    }
    load()
  }, [assessmentId])

  const isDraft = assessment?.state === 'draft'

  function handleAssessmentUpdate(updated: AssessmentInfo) {
    setAssessment(updated)
  }

  function handleDelete() {
    router.push(`/dashboard/instructor/classes/${classId}`)
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <DashboardHeader userName="" />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <div className="animate-pulse rounded-xl bg-muted h-32 mb-6" />
          <div className="animate-pulse rounded-xl bg-muted h-96" />
        </main>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{error || 'Assessment not found'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName="" />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href={`/dashboard/instructor/classes/${classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to class
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{assessment.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground capitalize">{assessment.mode}</span>
              {assessment.duration_minutes && <span className="text-xs text-muted-foreground">{assessment.duration_minutes} min</span>}
              <span className={`rounded-md px-1.5 py-0.5 text-xs ${
                assessment.state === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
              }`}>
                {assessment.state === 'active' ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
          <div>
            {assessment.mode === 'live' && assessment.state === 'active' && (
              <Link
                href={`/dashboard/instructor/classes/${classId}/assessments/${assessmentId}/live`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Radio size={14} />
                Open Live Session
              </Link>
            )}
          </div>
        </div>

        <div className="flex border-b border-border mb-8">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'questions' && <QuestionsTab assessmentId={assessmentId} isDraft={isDraft} />}
        {tab === 'settings' && (
          <SettingsTab
            assessmentId={assessmentId}
            classId={classId}
            assessment={assessment}
            onAssessmentUpdate={handleAssessmentUpdate}
            onDelete={handleDelete}
          />
        )}
        {tab === 'submissions' && <SubmissionsTab assessmentId={assessmentId} />}
      </main>
    </div>
  )
}
