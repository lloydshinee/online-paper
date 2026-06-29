'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { getAssessmentSubmissions, getSubmissionDetail } from '@/app/actions/grading'
import { Search, Eye, Check, ClipboardList, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { SubmissionData, SubmissionDetail } from './types'
import { getLastName } from './types'
import GradingPanel from './grading-panel'

interface SubmissionsTabProps {
  assessmentId: string
}

interface StudentGroup {
  studentId: string
  studentName: string
  studentEmail: string
  submissions: SubmissionData[]
  attemptCount: number
  latestScore: number | null
  totalPending: number
}

export default function SubmissionsTab({ assessmentId }: SubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [submissionTotal, setSubmissionTotal] = useState(0)
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [submissionSearchInput, setSubmissionSearchInput] = useState('')
  const [viewingSubmission, setViewingSubmission] = useState<SubmissionDetail | null>(null)
  const [viewingStudent, setViewingStudent] = useState<StudentGroup | null>(null)
  const [scoresCopied, setScoresCopied] = useState(false)
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState<number | null>(null)

  async function loadSubmissions() {
    const { submissions: subs, total } = await getAssessmentSubmissions(assessmentId, 1000, 0, submissionSearch || undefined)
    subs.sort((a, b) => getLastName(a.student_name).localeCompare(getLastName(b.student_name)))
    setSubmissions(subs)
    setSubmissionTotal(total)
  }

  useEffect(() => {
    let ignore = false
    async function fetch() {
      const { submissions: subs, total } = await getAssessmentSubmissions(assessmentId, 1000, 0, submissionSearch || undefined)
      if (ignore) return
      subs.sort((a, b) => getLastName(a.student_name).localeCompare(getLastName(b.student_name)))
      setSubmissions(subs)
      setSubmissionTotal(total)
    }
    fetch()
    return () => { ignore = true }
  }, [assessmentId, submissionSearch])

  const studentGroups = useMemo((): StudentGroup[] => {
    const map = new Map<string, SubmissionData[]>()
    for (const s of submissions) {
      const list = map.get(s.student_id) || []
      list.push(s)
      map.set(s.student_id, list)
    }
    return Array.from(map.entries()).map(([studentId, subs]) => {
      const sorted = [...subs].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      return {
        studentId,
        studentName: sorted[0].student_name,
        studentEmail: sorted[0].student_email,
        submissions: sorted,
        attemptCount: sorted.length,
        latestScore: sorted[0].score_total,
        totalPending: sorted.reduce((sum, s) => sum + (s.pending_count ?? 0), 0),
      }
    })
  }, [submissions])

  function handleSubSearch() {
    setSubmissionSearch(submissionSearchInput)
  }

  function handleCopyScores() {
    const lines = studentGroups.map((g) =>
      g.latestScore != null ? String(g.latestScore) : '-'
    )
    if (lines.length === 0) return
    navigator.clipboard.writeText(lines.join('\n'))
    setScoresCopied(true)
    setTimeout(() => setScoresCopied(false), 2000)
  }

  async function viewSubmission(submissionId: string) {
    const detail = await getSubmissionDetail(submissionId)
    if (detail) {
      setViewingSubmission(detail as unknown as SubmissionDetail)
    }
  }

  async function handleGradeComplete() {
    await loadSubmissions()
    const subId = viewingSubmission?.id
    if (subId) viewSubmission(subId)
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : '-'

  if (viewingSubmission) {
    return (
      <div>
        <GradingPanel
          submission={viewingSubmission}
          attemptNumber={currentAttemptNumber ?? undefined}
          onBack={() => { setViewingSubmission(null); setCurrentAttemptNumber(null) }}
          onGradeComplete={handleGradeComplete}
          onError={(msg) => toast.error(msg)}
          onSuccess={(msg) => toast.success(msg)}
        />
      </div>
    )
  }

  return (
    <div>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-medium">Submissions</p>
            <p className="text-xs text-muted-foreground">{studentGroups.length} student{studentGroups.length !== 1 ? 's' : ''} &middot; {submissionTotal} submission{submissionTotal !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-36 pl-8 text-xs"
                placeholder="Search student..."
                value={submissionSearchInput}
                onChange={(e) => setSubmissionSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubSearch() }}
              />
            </div>
            {submissionSearch && (
              <button onClick={() => { setSubmissionSearchInput(''); setSubmissionSearch('') }}
                className="text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            )}
            {studentGroups.length > 0 && (
              <button onClick={handleCopyScores}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                {scoresCopied ? <Check size={12} /> : <ClipboardList size={12} />}
                {scoresCopied ? 'Copied!' : 'Copy scores'}
              </button>
            )}
          </div>
        </div>
        <div className="px-6 py-4">
          {studentGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No submissions yet. Student submissions will appear here once the assessment is published.
            </p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {studentGroups.map((g) => (
                <div key={g.studentId} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-medium">{g.studentName}</p>
                    <p className="text-xs text-muted-foreground">{g.studentEmail}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {g.latestScore != null && (
                        <span className="text-xs text-muted-foreground">{g.latestScore} pts</span>
                      )}
                      {g.totalPending > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100 dark:bg-yellow-900/20 px-1.5 py-0.5 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                          <AlertCircle size={10} />
                          {g.totalPending} pending
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {g.attemptCount} attempt{g.attemptCount !== 1 ? 's' : ''}
                    </span>
                    <button onClick={() => setViewingStudent(g)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                      <Eye size={12} /> View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={viewingStudent !== null} onOpenChange={(open) => { if (!open) setViewingStudent(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingStudent?.studentName}</DialogTitle>
            <DialogDescription>
              {viewingStudent?.attemptCount} attempt{viewingStudent?.attemptCount !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border -mx-6 max-h-[60vh] overflow-y-auto">
            {viewingStudent?.submissions.map((s, idx) => (
              <div key={s.id} className="px-6 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">Attempt {viewingStudent.submissions.length - idx}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-xs ${
                        s.status === 'submitted' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : s.status === 'expired' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-muted text-muted-foreground'
                      }`}>
                        {s.status === 'submitted' ? 'Submitted' : s.status === 'expired' ? 'Expired' : 'In progress'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(s.submitted_at)}</span>
                      {s.score_total != null && (
                        <span className="text-xs text-muted-foreground">{s.score_total} pts</span>
                      )}
                      {s.pending_count > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100 dark:bg-yellow-900/20 px-1.5 py-0.5 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                          <AlertCircle size={10} />
                          {s.pending_count} ungraded
                        </span>
                      )}
                      {(s.violations ?? 0) > 0 && (
                        <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive font-medium">
                          {s.violations} violation{(s.violations ?? 0) !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setCurrentAttemptNumber(viewingStudent.submissions.length - idx); setViewingStudent(null); viewSubmission(s.id) }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                      <Eye size={12} /> View
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
