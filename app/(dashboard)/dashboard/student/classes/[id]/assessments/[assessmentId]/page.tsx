'use client'

import { useState, useEffect, useCallback, use, useRef, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams, useRouter } from 'next/navigation'
import { startAssessmentAction, saveAnswerAction, submitAssessmentAction, expireAssessmentAction, getAssessmentData, getSubmissionResultsAction, getSubmissionHistoryAction, getActiveSubmissionAction, recordViolationAction, getRemainingTimeAction } from '@/app/actions/timed-assessment'
import { Clock, Lightbulb, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock3, AlertCircle, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react'
import { computeDeadline, remainingSeconds } from '@/lib/deadline'
import DashboardHeader from '@/components/dashboard-header'
import { useCurrentUserProfile, profileDisplayName } from '@/components/use-current-user-profile'
import Link from 'next/link'

interface QuestionData {
  id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

interface AssessmentInfo {
  id: string
  class_id: string
  title: string
  mode: string
  state: string
  duration_minutes: number | null
  scores_released?: boolean
  answer_reveal_enabled?: boolean
  proctoring_violations_allowed?: number
}

interface ResultAnswer {
  id: string
  question_id: string
  answer_content: Record<string, unknown>
  score: number | null
  is_correct: boolean | null
  feedback: string | null
  questions: {
    type: string
    content: Record<string, unknown>
    points: number
    order_index: number
  }
}

interface SubmissionResult {
  resultStatus: 'released' | 'hidden' | 'no-submission'
  assessment: {
    title: string
    scores_released: boolean
    answer_reveal_enabled: boolean
    total_points: number
  }
  submission: {
    id: string
    status: string
    score_total: number | null
    submitted_at: string | null
  } | null
  answers: ResultAnswer[] | null
}

interface SubmissionHistoryItem {
  id: string
  attempt_number: number
  score_total: number | null
  status: string
  submitted_at: string | null
  started_at: string
}

const AUTOSAVE_DEBOUNCE_MS = 600
const REMAINING_TIME_POLL_MS = 10_000

export default function TakeAssessmentPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; assessmentId: string }>
}) {
  const { id: classId, assessmentId } = use(paramsPromise)
  const searchParams = useSearchParams()
  const router = useRouter()
  const profile = useCurrentUserProfile()
  const isRetake = searchParams.get('retake') === '1'

  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null)
  const [questions, setQuestions] = useState<QuestionData[]>([])
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [extensionBanner, setExtensionBanner] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [results, setResults] = useState<SubmissionResult | null>(null)
  const [resultsUnavailable, setResultsUnavailable] = useState(false)
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([])
  const [viewMode, setViewMode] = useState<'loading' | 'take' | 'results'>('loading')
  const [violations, setViolations] = useState(0)
  const violationsRef = useRef(0)
  const submissionIdRef = useRef<string | null>(null)
  const initRef = useRef(false)
  const deadlineRef = useRef<number | null>(null)
  // Server truth for the extension counter. The banner fires on changes to
  // THIS value, never on countdown diffs — network latency makes a later
  // server deadline look like a grant otherwise.
  const extraSecondsRef = useRef(0)
  const autoExpiringRef = useRef(false)
  const submittedRef = useRef(false)
  const latestAnswersRef = useRef<Record<string, Record<string, unknown>>>({})
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const saveChainsRef = useRef<Record<string, Promise<void>>>({})
  const pollingRef = useRef(false)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    submittedRef.current = submitted
  }, [submitted])

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current)
      }
    }
  }, [])

  const showExtensionBanner = useCallback((secondsAdded: number) => {
    const minutesAdded = Math.max(1, Math.round(secondsAdded / 60))
    setExtensionBanner(`Instructor added ${minutesAdded} min`)
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current)
    }
    bannerTimerRef.current = setTimeout(() => {
      setExtensionBanner(null)
      bannerTimerRef.current = null
    }, 4000)
  }, [])

  const showResumeExtensionBanner = useCallback(() => {
    setExtensionBanner('Instructor added time')
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current)
    }
    bannerTimerRef.current = setTimeout(() => {
      setExtensionBanner(null)
      bannerTimerRef.current = null
    }, 4000)
  }, [])

  const adoptServerRemainingTime = useCallback((deadline: number, remaining: number, extraSeconds: number) => {
    if (!assessment?.duration_minutes || !submissionIdRef.current) return false

    const currentDeadline = deadlineRef.current

    if (currentDeadline != null && deadline <= currentDeadline) {
      return false
    }

    const grantedDelta = extraSeconds - extraSecondsRef.current
    deadlineRef.current = deadline
    extraSecondsRef.current = extraSeconds
    setTimeLeft(remaining)

    // Announce only real grants. A later deadline with an unchanged counter
    // is ordinary clock convergence (fresh-start latency), not extra time.
    if (grantedDelta > 0) {
      showExtensionBanner(grantedDelta)
    }

    return true
  }, [assessment?.duration_minutes, showExtensionBanner])

  const goToResults = useCallback(async () => {
    const result = await getSubmissionResultsAction(assessmentId)
    if (result) {
      setResults(result)
      setViewMode('results')
      setResultsUnavailable(false)
    } else {
      // The submission itself succeeded (submitted=true already halts the
      // timer/autosave), but the results fetch failed — tell the student to
      // refresh instead of leaving them on the take view with no signal.
      setResultsUnavailable(true)
    }
  }, [assessmentId])

  // Auto-expire paths: timer zero, violation limit, resume-after-deadline,
  // or a server-side expiry detected by a rejected save.
  const autoExpire = useCallback(async (opts?: { force?: boolean }) => {
    if (autoExpiringRef.current) return
    autoExpiringRef.current = true
    const subId = submissionIdRef.current
    let shouldGoToResults = true

    if (subId) {
      const result = await expireAssessmentAction(subId, opts?.force === true)

      if (result?.overdue === false) {
        autoExpiringRef.current = false
        if (result.deadline != null) {
          adoptServerRemainingTime(result.deadline, result.remainingSeconds ?? 0, result.submission?.extra_seconds ?? 0)
        }
        return
      }

      setSubmitted(true)

      if (result?.error) {
        if (opts?.force) {
          await submitAssessmentAction(subId)
        } else {
          shouldGoToResults = false
          setSubmitError(result.error)
          setSubmitted(false)
        }
      }
    }

    if (shouldGoToResults) {
      await goToResults()
    }

    autoExpiringRef.current = false
  }, [adoptServerRemainingTime, goToResults])

  // ------------------------------------------------------------------
  // Autosave: debounced per question, serialized per question.
  // ------------------------------------------------------------------
  const runSave = useCallback((questionId: string) => {
    const subId = submissionIdRef.current
    if (!subId) return
    const content = latestAnswersRef.current[questionId]
    if (!content) return

    const prev = saveChainsRef.current[questionId] ?? Promise.resolve()
    const run = prev.then(async () => {
      const result = await saveAnswerAction(subId, questionId, content)
      if (result?.error) {
        if (/expired|submitted/i.test(result.error)) {
          // The server enforced the deadline — converge to results.
          void autoExpire()
        } else {
          setSaveError(`Could not save your answer: ${result.error}`)
        }
      } else {
        setSaveError(null)
      }
    })
    saveChainsRef.current[questionId] = run.then(
      () => {},
      () => {},
    )
  }, [autoExpire])

  const scheduleSave = useCallback((questionId: string) => {
    if (saveTimersRef.current[questionId]) {
      clearTimeout(saveTimersRef.current[questionId])
    }
    saveTimersRef.current[questionId] = setTimeout(() => {
      delete saveTimersRef.current[questionId]
      runSave(questionId)
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [runSave])

  const flushPendingSaves = useCallback(async () => {
    const pending = Object.keys(saveTimersRef.current)
    for (const questionId of pending) {
      const timer = saveTimersRef.current[questionId]
      if (timer) {
        clearTimeout(timer)
        delete saveTimersRef.current[questionId]
        runSave(questionId)
      }
    }
    await Promise.allSettled(Object.values(saveChainsRef.current))
  }, [runSave])

  // ------------------------------------------------------------------
  // Init / resume
  // ------------------------------------------------------------------
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    async function init() {
      try {
        // Check if the student has an in-progress submission (resume).
        const active = await getActiveSubmissionAction(assessmentId)
        if (active) {
          const data = await getAssessmentData(assessmentId)
          if (!data || data.error || !data.assessment) {
            setError(data?.error ?? 'Assessment not found')
            setLoading(false)
            return
          }
          setAssessment(data.assessment)
          setQuestions(data.questions)
          setSubmissionId(active.id)
          submissionIdRef.current = active.id

          // Restore saved answers
          const savedAnswers: Record<string, Record<string, unknown>> = {}
          for (const a of active.answers) {
            savedAnswers[a.question_id] = a.answer_content
          }
          setAnswers(savedAnswers)
          latestAnswersRef.current = savedAnswers

          // Seed the violation counter from the server value (resume).
          violationsRef.current = active.violations ?? 0
          setViolations(active.violations ?? 0)

          // Compute the true deadline from started_at + duration + extra_seconds.
          if (data.timeLimit) {
            const deadline = computeDeadline(active.started_at, data.timeLimit, active.extra_seconds ?? 0)
            deadlineRef.current = deadline
            extraSecondsRef.current = active.extra_seconds ?? 0
            const remaining = remainingSeconds(deadline, Date.now())
            setTimeLeft(remaining)
            if ((active.extra_seconds ?? 0) > 0) {
              showResumeExtensionBanner()
            }
            if (remaining <= 0) {
              // Resume after the deadline: auto-expire, never a manual submit.
              await autoExpire()
              return
            }
          }

          setViewMode('take')
          setLoading(false)
          return
        }

        // No active submission: fall back to the latest finished one unless
        // this visit is explicitly starting a retake.
        if (!isRetake) {
          const result = await getSubmissionResultsAction(assessmentId)

          if (result && result.submission) {
            setAssessment({
              id: assessmentId,
              class_id: classId,
              title: result.assessment.title,
              mode: 'timed',
              state: 'active',
              duration_minutes: null,
              scores_released: result.assessment.scores_released,
              answer_reveal_enabled: result.assessment.answer_reveal_enabled,
            })
            setResults(result)
            setSubmitted(true)
            setViewMode('results')
            setLoading(false)
            return
          }
        }

        // No prior submission — load assessment for taking.
        const data = await getAssessmentData(assessmentId)
        if (!data || data.error || !data.assessment) {
          setError(data?.error ?? 'Assessment not found')
          setLoading(false)
          return
        }

        if (data.assessment.mode === 'live') {
          router.replace(`${window.location.pathname}/live`)
          return
        }

        setAssessment(data.assessment)
        setQuestions(data.questions)

        if (data.timeLimit) {
          // Optimistic pre-start display only; the authoritative deadline is
          // seeded from the server's started_at below, before the timer can
          // ever read it (viewMode is still 'loading').
          setTimeLeft(data.timeLimit * 60)
        }

        const startResult = await startAssessmentAction(assessmentId, isRetake)
        if (startResult.submissionId) {
          setSubmissionId(startResult.submissionId)
          submissionIdRef.current = startResult.submissionId

          if (data.timeLimit && startResult.startedAt) {
            const deadline = computeDeadline(startResult.startedAt, data.timeLimit, startResult.extraSeconds)
            deadlineRef.current = deadline
            extraSecondsRef.current = startResult.extraSeconds
            setTimeLeft(remainingSeconds(deadline, Date.now()))
          }

          setViewMode('take')
          setLoading(false)
        } else {
          setError(startResult.error || 'This assessment is not currently available.')
          setLoading(false)
        }
      } catch {
        setError('Failed to load assessment')
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, classId])

  useEffect(() => {
    submissionIdRef.current = submissionId
  }, [submissionId])

  // ------------------------------------------------------------------
  // Timer: single stable interval, wall-clock deadline math.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== 'take' || submitted || deadlineRef.current == null) return

    const timer = setInterval(() => {
      const remaining = remainingSeconds(deadlineRef.current!, Date.now())
      setTimeLeft(remaining)
    }, 1000)

    return () => clearInterval(timer)
  }, [viewMode, submitted])

  // Auto-expire when the countdown hits the true deadline.
  useEffect(() => {
    if (viewMode === 'take' && timeLeft === 0 && !submitted && submissionId) {
      autoExpire()
    }
  }, [timeLeft, viewMode, submitted, submissionId, autoExpire])

  useEffect(() => {
    if (viewMode !== 'take' || submitted || !submissionId) return

    const pollRemaining = async () => {
      if (pollingRef.current || submitting || autoExpiringRef.current) return
      pollingRef.current = true

      try {
        const result = await getRemainingTimeAction(submissionId)
        if (!result?.error && result.overdue === false) {
          if (result.deadline != null) {
            adoptServerRemainingTime(result.deadline, result.remainingSeconds, result.extraSeconds)
          }
        }
      } finally {
        pollingRef.current = false
      }
    }

    const timer = setInterval(() => {
      void pollRemaining()
    }, REMAINING_TIME_POLL_MS)

    return () => clearInterval(timer)
  }, [adoptServerRemainingTime, submissionId, submitted, submitting, viewMode])

  // ------------------------------------------------------------------
  // Proctoring: seeded from the server, synced to the server count.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== 'take' || submitted || !assessment) return

    const maxViolations = assessment.proctoring_violations_allowed ?? 3

    function handleVisibilityChange() {
      if (!document.hidden) return
      const next = violationsRef.current + 1
      violationsRef.current = next

      flushSync(() => {
        setViolations(next)
      })

      const subId = submissionIdRef.current
      if (subId) {
        recordViolationAction(subId).then((result) => {
          if (result && result.violations != null && result.violations !== violationsRef.current) {
            violationsRef.current = result.violations
            setViolations(result.violations)
          }
        })
      }

      if (next >= maxViolations) {
        autoExpire({ force: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [viewMode, submitted, assessment, autoExpire])

  useEffect(() => {
    if (viewMode === 'results') {
      getSubmissionHistoryAction(assessmentId).then(setSubmissionHistory)
    }
  }, [viewMode, assessmentId])

  const saveCurrentAnswer = useCallback((newAnswer: Record<string, unknown>) => {
    if (!submissionId || submittedRef.current) return
    const q = questions[currentIndex]
    if (!q) return

    latestAnswersRef.current[q.id] = newAnswer
    setAnswers((prev) => ({ ...prev, [q.id]: newAnswer }))
    scheduleSave(q.id)
  }, [submissionId, questions, currentIndex, scheduleSave])

  const handleSubmit = async () => {
    if (!submissionId || submitting || submitted) return
    setSubmitting(true)
    setSubmitError(null)
    setShowConfirm(false)
    try {
      // Flush everything pending so the graded submission includes the
      // last keystrokes.
      await flushPendingSaves()

      const result = await submitAssessmentAction(submissionId)
      if (result?.error) {
        if (/already submitted/i.test(result.error)) {
          // Another writer transitioned the submission first (second tab, or
          // a server-side expiry raced the submit): converge to the results
          // view instead of stranding the student on the take page.
          setSubmitted(true)
          await goToResults()
          return
        }
        setSubmitError(result.error)
        setSubmitting(false)
        // The student stays on the take page with their answers intact.
        return
      }

      setSubmitted(true)
      await goToResults()
    } catch {
      setSubmitError('Submit failed. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading assessment...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-destructive mb-4">{error}</p>
          <Link href={`/dashboard/student/classes/${classId}`} className="text-sm text-primary hover:underline">
            Back to class
          </Link>
        </div>
      </div>
    )
  }

  const typeLabels: Record<string, string> = {
    MultipleChoice: 'MC', FillInTheBlank: 'Fill', TrueOrFalse: 'T/F', Essay: 'Essay', Coding: 'Coding',
  }

  function getAnswerDisplayText(type: string, answerContent: Record<string, unknown>, content: Record<string, unknown>): string {
    switch (type) {
      case 'MultipleChoice': {
        const idx = answerContent.selectedIndex as number
        if (typeof idx !== 'number') return 'No answer'
        const opts = content.options as string[]
        return `${String.fromCharCode(97 + idx)}) ${opts[idx] ?? ''}`
      }
      case 'TrueOrFalse':
        return typeof answerContent.value === 'boolean'
          ? (answerContent.value ? 'True' : 'False')
          : 'No answer'
      case 'FillInTheBlank':
        return (answerContent.text as string) || 'No answer'
      case 'Essay':
        return (answerContent.text as string) || 'No answer'
      case 'Coding':
        return (answerContent.code as string) || 'No answer'
      default:
        return 'No answer'
    }
  }

  function getCorrectAnswerDisplay(type: string, content: Record<string, unknown>): string {
    switch (type) {
      case 'MultipleChoice': return content.correctAnswer as string
      case 'TrueOrFalse': return content.correctAnswer ? 'True' : 'False'
      case 'FillInTheBlank': return content.correctAnswer as string
      default: return '-'
    }
  }

  function getStatusDisplay(answer: ResultAnswer): { label: string; icon: ReactNode; className: string } {
    if (answer.score == null && (answer.questions.type === 'Essay' || answer.questions.type === 'Coding')) {
      return { label: 'Pending', icon: <Clock3 size={12} />, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' }
    }
    if (answer.is_correct === true) {
      return { label: 'Correct', icon: <CheckCircle size={12} />, className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' }
    }
    if (answer.is_correct === false) {
      return { label: 'Incorrect', icon: <XCircle size={12} />, className: 'bg-destructive/10 text-destructive' }
    }
    if (answer.score != null && answer.score > 0) {
      return { label: 'Graded', icon: <CheckCircle size={12} />, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' }
    }
    return { label: '-', icon: <AlertCircle size={12} />, className: 'bg-muted text-muted-foreground' }
  }

  if (viewMode === 'results' && results) {
    const answersShown = results.assessment.answer_reveal_enabled
    const resultAnswers = results.answers ?? []

    return (
      <div className="min-h-screen bg-background text-foreground">
<DashboardHeader
        userName={profileDisplayName(profile)}
        userFirstname={profile?.firstname ?? null}
        userLastname={profile?.lastname ?? null}
        userEmail={profile?.email ?? ''}
        userAvatarUrl={profile?.avatar_url ?? null}
        />

      {violations > 0 && assessment && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-md bg-destructive/10 px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Tab switch detected! Violation {violations} of {assessment.proctoring_violations_allowed ?? 3}.
              {violations >= (assessment.proctoring_violations_allowed ?? 3)
                ? ' Assessment auto-submitted.'
                : ' Your assessment will be auto-submitted if you exceed the limit.'}
            </p>
          </div>
        </div>
      )}

        <main className="mx-auto max-w-4xl px-6 py-10">
          <Link
            href={`/dashboard/student/classes/${classId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft size={14} />
            Back to class
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight mb-2">{results.assessment.title}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Submitted {results.submission?.submitted_at ? new Date(results.submission.submitted_at).toLocaleString() : ''}
            {results.submission?.status === 'expired' ? ' (time expired)' : ''}
          </p>

          {results.resultStatus === 'hidden' ? (
            <div className="rounded-xl border border-border p-12 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
                <Clock3 size={24} className="text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Scores not yet released</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your assessment has been submitted. The instructor has not released scores yet. Check back later.
              </p>
            </div>
          ) : (
            <div>
              {/* Score summary */}
              <div className="rounded-xl border border-border mb-8">
                <div className="border-b border-border px-6 py-4">
                  <p className="text-sm font-medium">Score Summary</p>
                </div>
                <div className="px-6 py-5">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight">
                      {results.submission?.score_total ?? '-'}
                      <span className="text-base text-muted-foreground font-normal"> / {results.assessment.total_points} pts</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {results.assessment.total_points > 0
                        ? `${Math.round(((results.submission?.score_total ?? 0) / results.assessment.total_points) * 100)}%`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>

              {submissionHistory.length > 1 && (
                <div className="rounded-xl border border-border mb-8">
                  <div className="border-b border-border px-6 py-4">
                    <p className="text-sm font-medium">Submission History</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Attempt</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Submitted</th>
                          {results.resultStatus === 'released' && (
                            <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground">Score</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {submissionHistory.map((h) => {
                          const isCurrent = h.id === results.submission?.id
                          return (
                            <tr key={h.id} className={`hover:bg-muted/30 transition-colors ${isCurrent ? 'bg-primary/5' : ''}`}>
                              <td className="px-6 py-3 text-xs">
                                <span className={`inline-flex items-center gap-1.5 ${isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                                  {isCurrent && <RotateCcw size={12} className="text-primary" />}
                                  {h.status === 'expired' ? <Clock3 size={12} className="text-muted-foreground" /> : null}
                                  Attempt {h.attempt_number}
                                  {isCurrent && <span className="text-primary text-[10px]">(current)</span>}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-xs text-muted-foreground">
                                {h.submitted_at ? new Date(h.submitted_at).toLocaleString() : '-'}
                              </td>
                              {results.resultStatus === 'released' && (
                                <td className="px-6 py-3 text-xs text-right font-mono">
                                  {h.score_total != null ? `${h.score_total}/${results.assessment.total_points}` : '-'}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-question breakdown: requires answer reveal, not just score
                  release — per-question correctness is as revealing as the
                  answers themselves. The server also strips per-question
                  grading data until reveal is enabled. */}
              {answersShown && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="border-b border-border px-6 py-4">
                  <p className="text-sm font-medium">Question Breakdown</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Type</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground w-20">Points</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground w-20">Earned</th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground w-24">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Your Answer</th>
                        {answersShown && (
                          <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Correct Answer</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resultAnswers.map((a, idx) => {
                        const q = a.questions
                        const status = getStatusDisplay(a)
                        const isManual = q.type === 'Essay' || q.type === 'Coding'

                        return (
                          <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-3 text-xs text-muted-foreground">{idx + 1}</td>
                            <td className="px-6 py-3">
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{typeLabels[q.type]}</span>
                            </td>
                            <td className="px-6 py-3 text-center text-xs">{q.points}</td>
                            <td className="px-6 py-3 text-center text-xs font-medium">
                              {a.score != null ? a.score : '-'}
                            </td>
                            <td className="px-6 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${status.className}`}>
                                {status.icon}
                                {status.label}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-xs max-w-[200px] truncate">
                              {getAnswerDisplayText(q.type, a.answer_content, q.content)}
                            </td>
                            {answersShown && (
                              <td className="px-6 py-3 text-xs max-w-[200px] truncate text-green-700 dark:text-green-400 font-medium">
                                {isManual ? '-' : getCorrectAnswerDisplay(q.type, q.content)}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-medium">
                        <td className="px-6 py-3 text-xs" colSpan={2}>Total</td>
                        <td className="px-6 py-3 text-center text-xs">{results.assessment.total_points}</td>
                        <td className="px-6 py-3 text-center text-xs">{results.submission?.score_total ?? '-'}</td>
                        <td className="px-6 py-3 text-center text-xs" colSpan={answersShown ? 3 : 2}>
                          {results.assessment.total_points > 0
                            ? `${Math.round(((results.submission?.score_total ?? 0) / results.assessment.total_points) * 100)}%`
                            : ''}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              )}

              {/* Manual question details (Essay/Coding with feedback) */}
              {answersShown && resultAnswers.some((a) => (a.questions.type === 'Essay' || a.questions.type === 'Coding') && (a.feedback || a.score != null)) && (
                <div className="rounded-xl border border-border mt-8">
                  <div className="border-b border-border px-6 py-4">
                    <p className="text-sm font-medium">Feedback</p>
                  </div>
                  <div className="px-6 py-4 divide-y divide-border -mx-6">
                    {resultAnswers.filter((a) => a.questions.type === 'Essay' || a.questions.type === 'Coding').map((a) => {
                      if (!a.feedback && a.score == null) return null
                      const q = a.questions
                      const realIdx = resultAnswers.findIndex((ans) => ans.id === a.id) + 1
                      return (
                        <div key={a.id} className="px-6 py-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Q{realIdx}</span>
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{typeLabels[q.type]}</span>
                            {a.score != null && (
                              <span className="text-xs font-medium">{a.score}/{q.points} pts</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {q.content.prompt as string}
                          </p>
                          <p className="text-sm mt-2 whitespace-pre-wrap border-l-2 border-muted pl-3">
                            {getAnswerDisplayText(q.type, a.answer_content, q.content)}
                          </p>
                          {a.feedback && (
                            <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-900/10 px-3 py-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Instructor feedback:</p>
                              <p className="text-sm">{a.feedback}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    )
  }

  if (viewMode === 'results' && !results) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20 mx-auto">
            <CheckCircle size={24} className="text-green-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Assessment Submitted</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your answers have been submitted. You can view your results once the instructor releases scores.
          </p>
          <Link
            href={`/dashboard/student/classes/${classId}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Back to class
          </Link>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined
  const totalQuestions = questions.length
  const answeredCount = Object.keys(answers).length

  if (viewMode !== 'take') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading assessment...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-medium text-base">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Lightbulb size={16} />
            </div>
            Online Paper
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              {answeredCount}/{totalQuestions} answered
            </span>
            {timeLeft !== null && (
              <div className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-mono font-medium ${
                timeLeft < 60 ? 'bg-destructive/10 text-destructive' : timeLeft < 300 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' : 'bg-muted text-muted-foreground'
              }`}>
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
        </div>
      </header>

      {violations > 0 && assessment && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-md bg-destructive/10 px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Tab switch detected! Violation {violations} of {assessment.proctoring_violations_allowed ?? 3}.
              {violations >= (assessment.proctoring_violations_allowed ?? 3)
                ? ' Assessment auto-submitted.'
                : ' Your assessment will be auto-submitted if you exceed the limit.'}
            </p>
          </div>
        </div>
      )}

      {saveError && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-md bg-yellow-100 dark:bg-yellow-900/20 px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-700 dark:text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-400">{saveError}</p>
          </div>
        </div>
      )}

      {extensionBanner && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-md bg-blue-100 dark:bg-blue-900/20 px-4 py-3 flex items-center gap-2">
            <Clock3 size={16} className="text-blue-700 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-400">{extensionBanner}</p>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-md bg-destructive/10 px-4 py-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        </div>
      )}

      {resultsUnavailable && (
        <div className="mx-auto max-w-4xl px-6 pt-4">
          <div className="rounded-md bg-blue-100 dark:bg-blue-900/20 px-4 py-3 flex items-center gap-2">
            <Clock3 size={16} className="text-blue-700 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-400">Results unavailable — please refresh the page.</p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm font-medium mb-1">{assessment!.title}</p>

        {/* Progress bar */}
        <div className="mb-8 flex gap-1.5">
          {questions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              title={`Go to question ${idx + 1}`}
              className={`h-3 flex-1 rounded-full transition-all hover:ring-2 hover:ring-primary/30 ${
                idx === currentIndex
                  ? 'bg-primary shadow-sm'
                  : answers[questions[idx].id]
                    ? 'bg-primary/40'
                    : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {currentQuestion && (
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Q{currentIndex + 1}/{totalQuestions}
                </span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {currentQuestion.type}
                </span>
                <span className="text-xs text-muted-foreground">{currentQuestion.points} pt{currentQuestion.points !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="px-6 py-6">
              {currentQuestion.type === 'MultipleChoice' && (
                <MCQuestion
                  content={currentQuestion.content}
                  selectedIndex={currentAnswer?.selectedIndex as number | undefined}
                  onChange={(idx) => saveCurrentAnswer({ selectedIndex: idx })}
                />
              )}

              {currentQuestion.type === 'TrueOrFalse' && (
                <TFQuestion
                  content={currentQuestion.content}
                  selectedValue={currentAnswer?.value as boolean | undefined}
                  onChange={(val) => saveCurrentAnswer({ value: val })}
                />
              )}

              {currentQuestion.type === 'FillInTheBlank' && (
                <FillQuestion
                  content={currentQuestion.content}
                  value={currentAnswer?.text as string | undefined}
                  onChange={(text) => saveCurrentAnswer({ text })}
                />
              )}

              {currentQuestion.type === 'Essay' && (
                <EssayQuestion
                  content={currentQuestion.content}
                  value={currentAnswer?.text as string | undefined}
                  onChange={(text) => saveCurrentAnswer({ text })}
                />
              )}

              {currentQuestion.type === 'Coding' && (
                <CodingQuestion
                  content={currentQuestion.content}
                  value={currentAnswer?.code as string | undefined}
                  onChange={(code) => saveCurrentAnswer({ code })}
                />
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2.5 sm:py-2 text-sm hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
            Previous
          </button>

          <div>
            {currentIndex < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2.5 sm:py-2 text-sm hover:bg-muted transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 sm:py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Submitting...' : 'Submit Assessment'}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Submit confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-xs">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10">
            <h3 className="text-base font-medium mb-2">Submit Assessment?</h3>
            <p className="text-muted-foreground mb-2">
              You have answered {answeredCount} of {totalQuestions} questions.
            </p>
            {answeredCount < totalQuestions && (
              <p className="text-xs text-destructive mb-4">
                {totalQuestions - answeredCount} question{totalQuestions - answeredCount !== 1 ? 's' : ''} unanswered.
              </p>
            )}
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MCQuestion({
  content,
  selectedIndex,
  onChange,
}: {
  content: Record<string, unknown>
  selectedIndex: number | undefined
  onChange: (idx: number) => void
}) {
  const options = content.options as string[]
  return (
    <div>
      <p className="text-base mb-4">{content.stem as string}</p>
      <div className="space-y-2">
        {options.map((opt, idx) => (
          <label
            key={idx}
              className={`flex items-center gap-3 rounded-md border px-4 py-3.5 cursor-pointer transition-colors ${
               selectedIndex === idx
                 ? 'border-primary bg-primary/5'
                 : 'border-border hover:bg-muted/50'
             }`}
          >
            <input
              type="radio"
              name={`mc-${content.stem}`}
              checked={selectedIndex === idx}
              onChange={() => onChange(idx)}
              className="size-4 accent-primary"
            />
            <span className="text-sm">
              <span className="font-medium mr-2">{String.fromCharCode(97 + idx)})</span>
              {opt}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function TFQuestion({
  content,
  selectedValue,
  onChange,
}: {
  content: Record<string, unknown>
  selectedValue: boolean | undefined
  onChange: (val: boolean) => void
}) {
  return (
    <div>
      <p className="text-base mb-4">{content.statement as string}</p>
      <div className="flex gap-3">
        {[true, false].map((val) => (
          <label
            key={String(val)}
             className={`flex-1 flex items-center justify-center gap-2 rounded-md border px-4 py-3.5 cursor-pointer transition-colors ${
               selectedValue === val
                 ? 'border-primary bg-primary/5'
                 : 'border-border hover:bg-muted/50'
             }`}
          >
            <input
              type="radio"
              name={`tf-${content.statement}`}
              checked={selectedValue === val}
              onChange={() => onChange(val)}
              className="size-4 accent-primary"
            />
            <span className="text-sm font-medium">{val ? 'True' : 'False'}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function FillQuestion({
  content,
  value,
  onChange,
}: {
  content: Record<string, unknown>
  value: string | undefined
  onChange: (text: string) => void
}) {
  const parts = (content.stem as string).split('______')
  return (
    <div>
      <p className="text-base mb-4">{parts[0]}
        <span className="inline-flex mx-1">
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="border-b-2 border-dashed border-primary bg-transparent px-1 text-sm outline-none min-w-[120px]"
            placeholder="answer"
          />
        </span>
        {parts[1]}
      </p>
    </div>
  )
}

function EssayQuestion({
  content,
  value,
  onChange,
}: {
  content: Record<string, unknown>
  value: string | undefined
  onChange: (text: string) => void
}) {
  return (
    <div>
      <p className="text-base mb-4">{content.prompt as string}</p>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y"
        placeholder="Write your answer..."
      />
    </div>
  )
}

function CodingQuestion({
  content,
  value,
  onChange,
}: {
  content: Record<string, unknown>
  value: string | undefined
  onChange: (code: string) => void
}) {
  return (
    <div>
      <p className="text-base mb-4">{content.prompt as string}</p>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-mono shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y"
        placeholder="Write your code..."
        spellCheck={false}
      />
    </div>
  )
}
