'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import {
  getLiveSessionByAssessmentAction,
  saveLiveAnswerAction,
  getStudentLiveAnswerAction,
  checkActiveLiveSessionAction,
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

const typeLabels: Record<string, string> = {
  MultipleChoice: 'MC', FillInTheBlank: 'Fill', TrueOrFalse: 'T/F', Essay: 'Essay', Coding: 'Coding',
}

type ViewState = 'loading' | 'waiting' | 'active' | 'ended' | 'error' | 'blocked'

export default function StudentLivePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; assessmentId: string }>
}) {
  const { id: classId, assessmentId } = use(paramsPromise)

  const [viewState, setViewState] = useState<ViewState>('loading')
  const [session, setSession] = useState<SessionState | null>(null)
  const [questions, setQuestions] = useState<QuestionData[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [answer, setAnswer] = useState<Record<string, unknown>>({})
  const [studentCount, setStudentCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle')

  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const answerRef = useRef(answer)
  const sessionRef = useRef(session)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    answerRef.current = answer
  }, [answer])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const saveAnswer = useCallback(async () => {
    if (!session || !currentQuestion) return
    setAutosaveStatus('saving')
    await saveLiveAnswerAction(session.id, currentQuestion.id, answerRef.current)
    setAutosaveStatus('saved')
    setTimeout(() => setAutosaveStatus('idle'), 1500)
  }, [session, currentQuestion])

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(saveAnswer, 1500)
  }, [saveAnswer])

  // Initialize
  useEffect(() => {
    async function init() {
      // Check if student is already in another live session
      const active = await checkActiveLiveSessionAction()
      if (active.sessionId && active.assessmentId !== assessmentId) {
        setError('You are already in another live assessment session.')
        setViewState('blocked')
        return
      }

      const result = await getLiveSessionByAssessmentAction(assessmentId)
      if (!result) {
        setError('No active live session found.')
        setViewState('error')
        return
      }

      if (result.status === 'ended') {
        setViewState('ended')
        return
      }

      setSession({ id: result.id, assessment_id: result.assessment_id, current_question_index: result.current_question_index, status: result.status })
      setQuestions(result.questions)

      if (result.status === 'active') {
        setCurrentQuestion(result.questions[result.current_question_index] ?? null)
        setViewState('active')

        // Restore previous answer for this question
        const saved = await getStudentLiveAnswerAction(result.id, result.questions[result.current_question_index]?.id ?? '')
        if (saved) setAnswer(saved)
      } else {
        setViewState('waiting')
      }
    }
    init()
  }, [assessmentId])

  // Subscribe to Realtime channel
  useEffect(() => {
    if (!session) return

    const channel = supabase.channel(`live-${session.id}`, {
      config: { presence: { key: 'student' } },
    })

    channelRef.current = channel

    channel
      .on('broadcast', { event: 'start' }, () => {
        setSession((prev) => prev ? { ...prev, status: 'active' } : prev)
        setViewState('active')
        if (questions.length > 0) {
          setCurrentQuestion(questions[0])
        }
      })
      .on('broadcast', { event: 'next' }, (payload) => {
        const data = payload.payload as { questionIndex: number; question: QuestionData }
        setSession((prev) => prev ? { ...prev, current_question_index: data.questionIndex } : prev)
        setCurrentQuestion(data.question)
        const sid = sessionRef.current?.id
        if (sid && data.question?.id) {
          getStudentLiveAnswerAction(sid, data.question.id)
            .then((saved) => {
              if (saved) setAnswer(saved)
              else setAnswer({})
            })
        }
      })
      .on('broadcast', { event: 'prev' }, (payload) => {
        const data = payload.payload as { questionIndex: number; question: QuestionData }
        setSession((prev) => prev ? { ...prev, current_question_index: data.questionIndex } : prev)
        setCurrentQuestion(data.question)
        const sid = sessionRef.current?.id
        if (sid && data.question?.id) {
          getStudentLiveAnswerAction(sid, data.question.id)
            .then((saved) => {
              if (saved) setAnswer(saved)
              else setAnswer({})
            })
        }
      })
      .on('broadcast', { event: 'end' }, () => {
        saveAnswer().then(() => {
          setViewState('ended')
        })
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setStudentCount(Object.keys(state).filter((k) => k !== 'instructor').length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ role: 'student', joined_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.id, supabase, questions, saveAnswer])

  // Auto-save on answer change
  useEffect(() => {
    if (viewState !== 'active' || !currentQuestion) return
    debouncedSave()
  }, [answer, viewState, currentQuestion, debouncedSave])

  // Save on unmount/blur
  useEffect(() => {
    const handleBlur = () => saveAnswer()
    window.addEventListener('beforeunload', handleBlur)
    return () => window.removeEventListener('beforeunload', handleBlur)
  }, [saveAnswer])

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (viewState === 'blocked') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20 mx-auto">
            <Clock3 size={24} className="text-yellow-700 dark:text-yellow-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Already in a live session</h2>
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

  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-destructive mb-4">{error}</p>
          <Link href={`/dashboard/student/classes/${classId}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
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
            The session hasn&apos;t started yet. The instructor will begin shortly.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Users size={12} />
            {studentCount > 0 ? `${studentCount} student${studentCount !== 1 ? 's' : ''} connected` : 'You are the first one here'}
          </div>
        </div>
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
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users size={12} /> {studentCount} connected
            </span>
            {autosaveStatus !== 'idle' && (
              <span className={`text-xs ${autosaveStatus === 'saving' ? 'text-muted-foreground' : 'text-green-600'}`}>
                {autosaveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Q{session!.current_question_index + 1}/{questions.length}
          </span>
          {currentQuestion && (
            <>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{typeLabels[currentQuestion.type]}</span>
              <span className="text-xs text-muted-foreground">{currentQuestion.points} pt{currentQuestion.points !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>

        {currentQuestion && (
          <div className="rounded-xl border border-border">
            <div className="px-6 py-6">
              {currentQuestion.type === 'MultipleChoice' && (
                <MCQuestion
                  content={currentQuestion.content}
                  selectedIndex={answer.selectedIndex as number | undefined}
                  onChange={(idx) => setAnswer({ selectedIndex: idx })}
                />
              )}
              {currentQuestion.type === 'TrueOrFalse' && (
                <TFQuestion
                  content={currentQuestion.content}
                  selectedValue={answer.value as boolean | undefined}
                  onChange={(val) => setAnswer({ value: val })}
                />
              )}
              {currentQuestion.type === 'FillInTheBlank' && (
                <FillQuestion
                  content={currentQuestion.content}
                  value={answer.text as string | undefined}
                  onChange={(text) => setAnswer({ text })}
                />
              )}
              {currentQuestion.type === 'Essay' && (
                <EssayQuestion
                  content={currentQuestion.content}
                  value={answer.text as string | undefined}
                  onChange={(text) => setAnswer({ text })}
                />
              )}
              {currentQuestion.type === 'Coding' && (
                <CodingQuestion
                  content={currentQuestion.content}
                  value={answer.code as string | undefined}
                  onChange={(code) => setAnswer({ code })}
                />
              )}
            </div>
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
            className={`flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors ${
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
            className={`flex-1 flex items-center justify-center gap-2 rounded-md border px-4 py-3 cursor-pointer transition-colors ${
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
  const stem = (content.stem as string).replace('______', '')
  return (
    <div>
      <p className="text-base mb-4">{stem}
        <span className="inline-flex mx-1">
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="border-b-2 border-dashed border-primary bg-transparent px-1 text-sm outline-none min-w-[120px]"
            placeholder="answer"
          />
        </span>
        .
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
