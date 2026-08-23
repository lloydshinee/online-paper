'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { getAssessmentSubmissions, getSubmissionDetail } from '@/app/actions/grading'
import * as timedAssessmentActions from '@/app/actions/timed-assessment'
import { Search, Eye, Check, ClipboardList, AlertCircle, Clock3 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { SubmissionData, SubmissionDetail } from './types'
import GradingPanel from './grading-panel'
import { copyToClipboard } from '@/lib/utils'

interface SubmissionsTabProps {
  assessmentId: string
  assessmentMode: string
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

const PRESET_MINUTES = [1, 5, 10, 15, 30]
const grantTime = timedAssessmentActions as {
  grantTimeAction?: (submissionId: string, minutes: number) => Promise<{ error: string | null; submission?: unknown }>
}

function formatRemainingTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60

  if (hours > 0) return `${hours}h ${minutes}m left`
  if (minutes > 0) return `${minutes}m ${remaining}s left`
  return `${remaining}s left`
}

function formatAddedTime(seconds: number) {
  const minutes = seconds / 60
  return Number.isInteger(minutes) ? `${minutes} min added` : `${seconds}s added`
}

export default function SubmissionsTab({ assessmentId, assessmentMode }: SubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [submissionTotal, setSubmissionTotal] = useState(0)
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [submissionSearchInput, setSubmissionSearchInput] = useState('')
  const [viewingSubmission, setViewingSubmission] = useState<SubmissionDetail | null>(null)
  const [viewingStudent, setViewingStudent] = useState<StudentGroup | null>(null)
  const [scoresCopied, setScoresCopied] = useState(false)
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState<number | null>(null)
  const [timeDialogAttempt, setTimeDialogAttempt] = useState<SubmissionData | null>(null)
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null)
  const [customMinutes, setCustomMinutes] = useState('')
  const [timeError, setTimeError] = useState<string | null>(null)
  const [showReopenWarning, setShowReopenWarning] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function loadSubmissions() {
    const { submissions: subs, total } = await getAssessmentSubmissions(assessmentId, 1000, 0, submissionSearch || undefined)
    subs.sort(// student_name is surname-first, so a plain compare sorts by family name.
        (a, b) => a.student_name.localeCompare(b.student_name))
    setSubmissions(subs)
    setSubmissionTotal(total)
  }

  useEffect(() => {
    let ignore = false
    async function fetch() {
      const { submissions: subs, total } = await getAssessmentSubmissions(assessmentId, 1000, 0, submissionSearch || undefined)
      if (ignore) return
      subs.sort(// student_name is surname-first, so a plain compare sorts by family name.
        (a, b) => a.student_name.localeCompare(b.student_name))
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

  async function handleCopyScores() {
    const lines = studentGroups.map((g) =>
      g.latestScore != null ? String(g.latestScore) : '-'
    )
    if (lines.length === 0) return
    const ok = await copyToClipboard(lines.join('\n'))
    if (ok) {
      setScoresCopied(true)
      setTimeout(() => setScoresCopied(false), 2000)
    } else {
      toast.error('Copy failed — use a secure context or select and copy manually')
    }
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

  function openAddTimeDialog(submission: SubmissionData) {
    setTimeDialogAttempt(submission)
    setSelectedMinutes(null)
    setCustomMinutes('')
    setTimeError(null)
    setShowReopenWarning(false)
  }

  function closeAddTimeDialog() {
    setTimeDialogAttempt(null)
    setSelectedMinutes(null)
    setCustomMinutes('')
    setTimeError(null)
    setShowReopenWarning(false)
  }

  function resolveMinutes() {
    if (selectedMinutes != null) return selectedMinutes
    if (customMinutes.trim().length === 0) {
      return null
    }
    const parsed = Number(customMinutes)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  }

  async function refreshStudentDialog(targetStudentId?: string) {
    const { submissions: subs, total } = await getAssessmentSubmissions(assessmentId, 1000, 0, submissionSearch || undefined)
    subs.sort(// student_name is surname-first, so a plain compare sorts by family name.
        (a, b) => a.student_name.localeCompare(b.student_name))
    setSubmissions(subs)
    setSubmissionTotal(total)

    if (!targetStudentId) return

    const grouped = new Map<string, SubmissionData[]>()
    for (const submission of subs) {
      const list = grouped.get(submission.student_id) || []
      list.push(submission)
      grouped.set(submission.student_id, list)
    }

    const updated = grouped.get(targetStudentId)
    if (!updated || updated.length === 0) {
      setViewingStudent(null)
      return
    }

    const sorted = [...updated].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    setViewingStudent({
      studentId: targetStudentId,
      studentName: sorted[0].student_name,
      studentEmail: sorted[0].student_email,
      submissions: sorted,
      attemptCount: sorted.length,
      latestScore: sorted[0].score_total,
      totalPending: sorted.reduce((sum, s) => sum + (s.pending_count ?? 0), 0),
    })
  }

  function isLatestFinishedAttempt(submissionsForStudent: SubmissionData[], submission: SubmissionData) {
    const latestFinished = submissionsForStudent.find((attempt) => attempt.status !== 'in_progress')
    return latestFinished?.id === submission.id
  }

  function canAddTime(submissionsForStudent: SubmissionData[], submission: SubmissionData) {
    if (assessmentMode !== 'timed') return false
    if (submission.status === 'in_progress') return true
    return isLatestFinishedAttempt(submissionsForStudent, submission)
  }

  async function submitGrantTime() {
    if (!timeDialogAttempt || isPending) return

    const minutes = resolveMinutes()
    if (minutes == null) {
      setTimeError('Enter a valid number of minutes greater than zero')
      return
    }

    setTimeError(null)

    startTransition(async () => {
      if (!grantTime.grantTimeAction) {
        toast.error('Add time is not available yet')
        return
      }

      const result = await grantTime.grantTimeAction(timeDialogAttempt.id, minutes)
      await refreshStudentDialog(timeDialogAttempt.student_id)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(`Added ${minutes} minute${minutes !== 1 ? 's' : ''}`)
      closeAddTimeDialog()
    })
  }

  function handleConfirmTime() {
    if (!timeDialogAttempt) return

    const minutes = resolveMinutes()
    if (minutes == null) {
      setTimeError('Enter a valid number of minutes greater than zero')
      return
    }

    if (timeDialogAttempt.status === 'in_progress') {
      void submitGrantTime()
      return
    }

    setTimeError(null)
    setShowReopenWarning(true)
  }

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
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Student</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground">Score</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground">Attempts</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {studentGroups.map((g) => (
                    <tr key={g.studentId} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 text-foreground">{g.studentName}</td>
                      <td className="px-6 py-3 text-xs text-muted-foreground text-center">{g.studentEmail}</td>
                      <td className="px-6 py-3 text-center">
                        {g.latestScore != null ? (
                          <span className="text-foreground">{g.latestScore} pts</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center text-xs text-muted-foreground">{g.attemptCount}</td>
                      <td className="px-6 py-3 text-center">
                        {g.totalPending > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100 dark:bg-yellow-900/20 px-1.5 py-0.5 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                            <AlertCircle size={10} />
                            {g.totalPending} pending
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Graded</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button onClick={() => setViewingStudent(g)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      {s.status === 'in_progress' && s.remaining_seconds != null && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900/20 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-400 font-medium">
                          <Clock3 size={10} />
                          {formatRemainingTime(s.remaining_seconds)}
                        </span>
                      )}
                      {s.extra_seconds > 0 && (
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 font-medium">
                          Time added: {formatAddedTime(s.extra_seconds)}
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
                    {canAddTime(viewingStudent.submissions, s) && (
                      <button onClick={() => openAddTimeDialog(s)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                        <Clock3 size={12} /> Add time
                      </button>
                    )}
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

      <Dialog open={timeDialogAttempt !== null} onOpenChange={(open) => { if (!open) closeAddTimeDialog() }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add time</DialogTitle>
            <DialogDescription>
              {timeDialogAttempt?.status === 'in_progress'
                ? 'Extend this in-progress attempt.'
                : 'Re-open this finished attempt with extra time.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {PRESET_MINUTES.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  variant={selectedMinutes === minutes ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedMinutes(minutes)
                    setCustomMinutes('')
                    setTimeError(null)
                  }}
                >
                  {minutes}m
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="custom-minutes">Custom minutes</label>
              <Input
                id="custom-minutes"
                inputMode="decimal"
                placeholder="Enter minutes"
                value={customMinutes}
                onChange={(e) => {
                  setCustomMinutes(e.target.value)
                  setSelectedMinutes(null)
                  setTimeError(null)
                }}
              />
            </div>
            {timeError && <p className="text-xs text-destructive">{timeError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeAddTimeDialog} disabled={isPending}>Cancel</Button>
              <Button type="button" onClick={handleConfirmTime} disabled={isPending}>Confirm</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showReopenWarning} onOpenChange={setShowReopenWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-open this attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-opening lets the student continue, clears auto-grades, and keeps manual grades.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submitGrantTime()} disabled={isPending}>
              Re-open and add time
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
