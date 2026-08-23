'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import {
  getLiveSessionByAssessmentForStudentAction,
  getLiveSessionForStudentAction,
  saveLiveAnswerAction,
  getStudentLiveAnswerAction,
  checkActiveLiveSessionAction,
  joinLiveSessionAction,
} from '@/app/actions/live-assessment'
import { createClient } from '@/lib/supabase/client'
import { Lightbulb, Users, Clock3 } from 'lucide-react'
import Link from 'next/link'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface QuestionData {
  id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

interface SessionState {
  id: string
  assessment_id: string
  current_question_index: number
  status: 'waiting' | 'active' | 'ended'
}

interface SessionView {
  session: SessionState
  currentQuestion: QuestionData | null
  totalQuestions: number
}

const typeLabels: Record<string, string> = {
  MultipleChoice: 'MC', FillInTheBlank: 'Fill', TrueOrFalse: 'T/F', Essay: 'Essay', Coding: 'Coding',
}

type ViewState = 'loading' | 'waiting' | 'active' | 'ended' | 'error' | 'blocked'

const AUTOSAVE_DEBOUNCE_MS = 800

/** Light poll cadence while Active (recovers missed end/advance broadcasts). */
const SLOW_POLL_MS = 12_000

export default function StudentLivePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; assessmentId: string }>
}) {
  const { id: classId, assessmentId } = use(paramsPromise)

  const [viewState, setViewState] = useState<ViewState>('loading')
  const [session, setSession] = useState<SessionState | null>(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [answer, setAnswer] = useState<{ questionId: string | null; content: Record<string, unknown> }>({ questionId: null, content: {} })
  const [studentCount, setStudentCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle')

  const supabase = createClient()

  const channelRef = useRef<RealtimeChannel | null>(null)
  const userIdRef = useRef<string | null>(null)
  const sessionRef = useRef<SessionState | null>(null)
  const answerRef = useRef<Record<string, unknown>>({})
  const answerQuestionIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ questionId: string; content: Record<string, unknown> } | null>(null)
  const saveChainsRef = useRef<Record<string, Promise<void>>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionLoadSeqRef = useRef(0)
  const unmountedRef = useRef(false)
  const joinedRef = useRef(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    return () => { unmountedRef.current = true }
  }, [])

  // ------------------------------------------------------------------
  // Save plumbing (serialized per question, flushable on advance/end)
  // ------------------------------------------------------------------
  const runSave = useCallback(async (questionId: string, content: Record<string, unknown>): Promise<void> => {
    const sid = sessionRef.current?.id
    if (!sid || !questionId) return
    const prev = saveChainsRef.current[questionId] ?? Promise.resolve()
    const run = prev.then(async () => {
      setAutosaveStatus('saving')
      const result = await saveLiveAnswerAction(sid, questionId, content)
      if (!unmountedRef.current) {
        if (result?.error) {
          setAutosaveStatus('error')
        } else {
          setAutosaveStatus('saved')
          // Let the instructor's answer counter refresh.
          channelRef.current?.send({ type: 'broadcast', event: 'answer', payload: { questionId } })
        }
      }
    })
    saveChainsRef.current[questionId] = run.then(
      () => {},
      () => {},
    )
    return saveChainsRef.current[questionId]
  }, [])

  const scheduleSave = useCallback((questionId: string, content: Record<string, unknown>) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    pendingSaveRef.current = { questionId, content }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const pending = pendingSaveRef.current
      if (pending && pending.questionId === questionId) {
        pendingSaveRef.current = null
        void runSave(pending.questionId, pending.content)
      }
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [runSave])

  const flushPendingSave = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (pending) {
      await runSave(pending.questionId, pending.content)
    }
    await Promise.allSettled(Object.values(saveChainsRef.current))
  }, [runSave])

  // ------------------------------------------------------------------
  // Server state convergence (poll until active / ended)
  // ------------------------------------------------------------------
  const loadSessionView = useCallback(async (): Promise<SessionView | null> => {
    return getLiveSessionByAssessmentForStudentAction(assessmentId)
  }, [assessmentId])

  const applyView = useCallback(async (view: SessionView | null, seq: number): Promise<boolean> => {
    if (seq !== questionLoadSeqRef.current) return false
    if (view === null) {
      return false
    }

    // Ignore stale snapshots that would regress an already-applied state:
    // once the client has a question for the session's index, a poll result
    // without one (older index) must not overwrite it.
    if (
      sessionRef.current &&
      sessionRef.current.current_question_index === view.session.current_question_index &&
      sessionRef.current.status === 'active' &&
      answerQuestionIdRef.current != null &&
      view.currentQuestion === null
    ) {
      return false
    }

    setSession(view.session)
    setTotalQuestions(view.totalQuestions)

    // Persist membership whenever a non-ended session is found (including
    // via polling, so joined-but-not-answered students are tracked too).
    if (!joinedRef.current && view.session.status !== 'ended') {
      joinedRef.current = true
      void joinLiveSessionAction(view.session.id)
    }

    if (view.session.status === 'ended') {
      setViewState('ended')
      return true
    }

    if (view.session.status === 'active') {
      if (view.currentQuestion) {
        setCurrentQuestion(view.currentQuestion)
      } else {
        // Active but no question advanced yet — stay in waiting view.
        setViewState('waiting')
        return true
      }

      // Restore the saved answer only when the user has not edited locally
      // for this question — never clobber in-flight typing with server state.
      const locallyEdited =
        dirtyRef.current && answerQuestionIdRef.current === view.currentQuestion.id
      if (!locallyEdited) {
        const saved = await getStudentLiveAnswerAction(view.session.id, view.currentQuestion.id)
        // Re-check after the await: typing during the fetch must win over the
        // (now stale) server value.
        const typedDuringFetch =
          dirtyRef.current && answerQuestionIdRef.current === view.currentQuestion.id
        if (seq === questionLoadSeqRef.current && !typedDuringFetch) {
          if (saved) {
            setAnswer({ questionId: view.currentQuestion.id, content: saved })
            answerRef.current = saved
            answerQuestionIdRef.current = view.currentQuestion.id
          } else {
            setAnswer({ questionId: view.currentQuestion.id, content: {} })
            answerRef.current = {}
            answerQuestionIdRef.current = view.currentQuestion.id
          }
        }
      }
      setViewState('active')
      return true
    }

    // waiting
    setCurrentQuestion(null)
    setAnswer({ questionId: null, content: {} })
    answerRef.current = {}
    answerQuestionIdRef.current = null
    setViewState('waiting')
    return true
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      const view = await loadSessionView()
      if (view && view !== null) {
        const seq = ++questionLoadSeqRef.current
        const applied = await applyView(view, seq)
        const converged =
          view.session.status === 'ended' ||
          (view.session.status === 'active' && view.currentQuestion !== null)
        if (applied && converged) {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      }
    }, 2000)
  }, [loadSessionView, applyView])

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (cancelled) return
        if (!authData.user) {
          setError('Not authenticated')
          setViewState('error')
          return
        }
        userIdRef.current = authData.user.id

        // Block students already participating in another live session.
        const active = await checkActiveLiveSessionAction()
        if (cancelled) return
        if (active.sessionId && active.assessmentId !== assessmentId) {
          setError('You are already in another live assessment session.')
          setViewState('blocked')
          return
        }

        const view = await loadSessionView()
        if (cancelled) return

        if (view === null) {
          setViewState('waiting')
          startPolling()
          return
        }

        // Join (persist membership) as soon as a non-ended session exists.
        const join = await joinLiveSessionAction(view.session.id)
        if (cancelled) return
        if (join?.error && /another live session/i.test(join.error)) {
          setError('You are already in another live assessment session.')
          setViewState('blocked')
          return
        }
        if (join?.error && !/already/.test(join.error)) {
          setError(join.error)
          setViewState('error')
          return
        }

        const seq = ++questionLoadSeqRef.current
        const applied = await applyView(view, seq)
        if (cancelled) return
        if (!applied || view.session.status === 'waiting') {
          startPolling()
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load the live session')
          setViewState('error')
        }
      }
    }
    init()
    return () => {
      cancelled = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  // ------------------------------------------------------------------
  // Realtime: subscribe ONCE per session id; handlers read refs
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!session?.id) return

    const channel = supabase.channel(`live-${session.id}`, {
      config: { presence: { key: userIdRef.current ?? `anon-${Date.now()}` } },
    })
    channelRef.current = channel

    const handleAdvance = async () => {
      const sid = sessionRef.current?.id
      if (!sid) return
      const seq = ++questionLoadSeqRef.current

      // Flush the previous question's pending save with the old question id.
      await flushPendingSave()

      // Synchronously clear the old answer so it can never render under the
      // new question, nor be saved against the new question's id.
      answerRef.current = {}
      answerQuestionIdRef.current = null
      dirtyRef.current = false
      setAnswer({ questionId: null, content: {} })

      // Fetch the sanitized current question from the server.
      const view = await getLiveSessionForStudentAction(sid)
      if (seq !== questionLoadSeqRef.current) return // superseded by a newer advance
      if (!view) return
      await applyView(view, seq)

      // A broadcast converged the view — polling can stop.
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    channel
      .on('broadcast', { event: 'next' }, () => {
        handleAdvance()
      })
      .on('broadcast', { event: 'prev' }, () => {
        handleAdvance()
      })
      .on('broadcast', { event: 'end' }, async () => {
        // Flush pending edits, then wait for the server to finish conversion.
        try {
          await flushPendingSave()
        } catch {
          // A rejected flush (session already ended) still converges to Ended.
        }
        const pollEnded = setInterval(async () => {
          const view = await loadSessionView()
          if (view && view !== null && view.session.status === 'ended') {
            clearInterval(pollEnded)
            const seq = ++questionLoadSeqRef.current
            await applyView(view, seq)
          }
        }, 1500)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const students = Object.values(state).filter(
          (metas) => (metas as { role?: string }[]).some((m) => m.role === 'student'),
        )
        setStudentCount(students.length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ role: 'student', user_id: userIdRef.current, joined_at: new Date().toISOString() })
        }
      })

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  // ------------------------------------------------------------------
  // Poll fallback while Active (ticket 20.1): if the realtime socket drops,
  // a missed end broadcast (or advance) is recovered via light polling.
  //
  // Ticket 21 (F2/F6): the poll's apply path flushes the outgoing question's
  // pending save BEFORE switching — the same guarantee the broadcast handler
  // provides — so an advance discovered by the 12s poll never silently drops
  // an edit. Backward index changes are applied too; the flush persists any
  // in-progress answer before the view moves, and applyView's dirty guard
  // still wins for same-question in-flight edits.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (viewState !== 'active') return

    const timer = setInterval(async () => {
      const view = await loadSessionView()
      if (!view) return

      if (view.session.status === 'ended') {
        const seq = ++questionLoadSeqRef.current
        await applyView(view, seq)
        return
      }

      const localIndex = sessionRef.current?.current_question_index ?? -1
      if (
        view.session.status === 'active' &&
        view.session.current_question_index !== localIndex
      ) {
        // Flush the outgoing question's pending save with the old question id.
        await flushPendingSave()

        const seq = ++questionLoadSeqRef.current

        // Synchronously clear the old answer so it can never render under the
        // new question, nor be saved against the new question's id.
        answerRef.current = {}
        answerQuestionIdRef.current = null
        dirtyRef.current = false
        setAnswer({ questionId: null, content: {} })

        await applyView(view, seq)
      }
    }, SLOW_POLL_MS)

    return () => clearInterval(timer)
  }, [viewState, loadSessionView, applyView, flushPendingSave])

  // ------------------------------------------------------------------
  // Autosave on answer change (keyed per question)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (viewState !== 'active' || !currentQuestion) return
    if (answer.questionId !== currentQuestion.id) return
    // Never autosave an empty answer that a programmatic reset produced —
    // only student edits (non-empty content) are worth persisting.
    if (!answer.content || Object.keys(answer.content).length === 0) return
    scheduleSave(currentQuestion.id, answer.content)
  }, [answer, viewState, currentQuestion, scheduleSave])

  // Keep answerRef in sync for handlers that read mutable state.
  useEffect(() => {
    answerRef.current = answer.content
    answerQuestionIdRef.current = answer.questionId
  }, [answer])

  // Best-effort save on unmount.
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = pendingSaveRef.current
      if (pending) {
        void runSave(pending.questionId, pending.content)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [runSave])

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  const handleAnswerChange = useCallback((content: Record<string, unknown>) => {
    dirtyRef.current = true
    setAnswer({ questionId: currentQuestion?.id ?? null, content })
    setAutosaveStatus('idle')
  }, [currentQuestion])

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (viewState === 'blocked' || viewState === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20 mx-auto">
            <Clock3 size={24} className="text-yellow-700 dark:text-yellow-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{viewState === 'blocked' ? 'Already in a live session' : 'Something went wrong'}</h2>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <Link
            href={`/dashboard/student/classes/${classId}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to class
          </Link>
        </div>
      </div>
    )
  }

  if (viewState === 'ended') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20 mx-auto">
            <svg className="size-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Session Ended</h2>
          <p className="text-sm text-muted-foreground mb-6">
            The instructor has ended this live session. Your answers have been saved as a submission.
          </p>
          <Link
            href={`/dashboard/student/classes/${classId}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to class
          </Link>
        </div>
      </div>
    )
  }

  if (viewState === 'waiting') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20 mx-auto">
            <Clock3 size={24} className="text-yellow-700 dark:text-yellow-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Waiting for instructor</h2>
          <p className="text-sm text-muted-foreground mb-2">
            {session
              ? "The session hasn't started yet. The instructor will begin shortly."
              : "The instructor has not created the session yet. You will join automatically once it's ready."}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Users size={12} />
            {studentCount > 0 ? `${studentCount} student${studentCount !== 1 ? 's' : ''} connected` : 'You are the first one here'}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground animate-pulse mt-3">
            Checking for session...
          </div>
        </div>
      </div>
    )
  }

  const activeQuestion = currentQuestion
  const currentAnswer = answer.questionId === activeQuestion?.id ? answer.content : {}

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
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users size={12} /> {studentCount} connected
            </span>
            {autosaveStatus !== 'idle' && (
              <span className={`text-xs ${autosaveStatus === 'saving' ? 'text-muted-foreground' : autosaveStatus === 'error' ? 'text-destructive' : 'text-green-600'}`}>
                {autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'error' ? 'Save failed — check your connection' : 'Saved'}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {session && session.current_question_index >= 0
              ? `Q${session.current_question_index + 1}/${totalQuestions}`
              : `-/${totalQuestions}`}
          </span>
          {activeQuestion && (
            <>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{typeLabels[activeQuestion.type]}</span>
              <span className="text-xs text-muted-foreground">{activeQuestion.points} pt{activeQuestion.points !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>

        {activeQuestion ? (
          <div className="rounded-xl border border-border">
            <div className="px-6 py-6">
              {activeQuestion.type === 'MultipleChoice' && (
                <MCQuestion
                  content={activeQuestion.content}
                  selectedIndex={currentAnswer.selectedIndex as number | undefined}
                  onChange={(idx) => handleAnswerChange({ selectedIndex: idx })}
                />
              )}
              {activeQuestion.type === 'TrueOrFalse' && (
                <TFQuestion
                  content={activeQuestion.content}
                  selectedValue={currentAnswer.value as boolean | undefined}
                  onChange={(val) => handleAnswerChange({ value: val })}
                />
              )}
              {activeQuestion.type === 'FillInTheBlank' && (
                <FillQuestion
                  content={activeQuestion.content}
                  value={currentAnswer.text as string | undefined}
                  onChange={(text) => handleAnswerChange({ text })}
                />
              )}
              {activeQuestion.type === 'Essay' && (
                <EssayQuestion
                  content={activeQuestion.content}
                  value={currentAnswer.text as string | undefined}
                  onChange={(text) => handleAnswerChange({ text })}
                />
              )}
              {activeQuestion.type === 'Coding' && (
                <CodingQuestion
                  content={activeQuestion.content}
                  value={currentAnswer.code as string | undefined}
                  onChange={(code) => handleAnswerChange({ code })}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border p-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
              <Clock3 size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Waiting for the instructor</h2>
            <p className="text-sm text-muted-foreground">
              The instructor will begin the first question shortly.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          The instructor controls question navigation. Your answer is auto-saved as you type.
        </p>
      </main>
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
              name={`mc-live-${content.stem}`}
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
              name={`tf-live-${content.statement}`}
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
