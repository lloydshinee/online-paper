'use client'

import { useState, useEffect, use, useRef } from 'react'
import {
  createLiveSessionAction,
  startLiveSessionAction,
  advanceLiveSessionAction,
  endLiveSessionAction,
  getLiveSessionByAssessmentAction,
} from '@/app/actions/live-assessment'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Lightbulb, Play, ChevronRight, ChevronLeft, Square, Users } from 'lucide-react'
import Link from 'next/link'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface QuestionData {
  id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

interface SessionData {
  id: string
  assessment_id: string
  current_question_index: number
  status: 'waiting' | 'active' | 'ended'
  questions: QuestionData[]
}

const typeLabels: Record<string, string> = {
  MultipleChoice: 'MC', FillInTheBlank: 'Fill', TrueOrFalse: 'T/F', Essay: 'Essay', Coding: 'Coding',
}

export default function InstructorLivePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; assessmentId: string }>
}) {
  const { id: classId, assessmentId } = use(paramsPromise)

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [presenceState, setPresenceState] = useState<Record<string, unknown>>({})

  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    async function init() {
      const result = await getLiveSessionByAssessmentAction(assessmentId)
      if (result) {
        setSession(result)
      } else {
        setError('No active session found')
      }
      setLoading(false)
    }
    init()
  }, [assessmentId])

  // Realtime channel — used for both presence and broadcasting
  useEffect(() => {
    if (!session) return

    const channel = supabase.channel(`live-${session.id}`, {
      config: { presence: { key: 'instructor' } },
    })

    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        setPresenceState(channel.presenceState())
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ role: 'instructor', joined_at: new Date().toISOString() })
        }
      })

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [session?.id, supabase])

  const broadcast = (event: string, payload?: Record<string, unknown>) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: payload ?? {} })
  }

  const handleCreate = async () => {
    setError(null)
    const result = await createLiveSessionAction(assessmentId)
    if (result.error) {
      setError(result.error)
    } else if (result.session) {
      const reloaded = await getLiveSessionByAssessmentAction(assessmentId)
      if (reloaded) setSession(reloaded)
    }
  }

  const handleStart = async () => {
    if (!session) return
    const result = await startLiveSessionAction(session.id, assessmentId)
    if (result.error) {
      setError(result.error)
    } else {
      const reloaded = await getLiveSessionByAssessmentAction(assessmentId)
      if (reloaded) setSession(reloaded)
      broadcast('start')
    }
  }

  const handleAdvance = async (direction: 'next' | 'prev') => {
    if (!session) return
    const result = await advanceLiveSessionAction(session.id, direction)
    if (result.error) {
      setError(result.error)
    } else if (result.session) {
      const newIndex = result.session.current_question_index
      setSession((prev) => prev ? {
        ...prev,
        current_question_index: newIndex,
      } : prev)
      broadcast(direction, { questionIndex: newIndex, question: result.question as unknown as Record<string, unknown> })
    }
  }

  const handleEnd = async () => {
    if (!session) return
    const result = await endLiveSessionAction(session.id, assessmentId)
    if (result.error) {
      setError(result.error)
    } else {
      broadcast('end')
      setSession((prev) => prev ? { ...prev, status: 'ended' } : prev)
    }
  }

  const currentQuestion = session?.questions[session.current_question_index]
  const totalQuestions = session?.questions.length ?? 0
  const studentCount = Object.keys(presenceState).filter((k) => k !== 'instructor').length

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-destructive mb-4">{error}</p>
          <button onClick={handleCreate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Create Live Session
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading session...</p>
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
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href={`/dashboard/instructor/classes/${classId}/assessments/${assessmentId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to assessment
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Live Session</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`rounded-md px-1.5 py-0.5 text-xs ${
                session.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : session.status === 'waiting' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                : 'bg-muted text-muted-foreground'
              }`}>
                {session.status === 'waiting' ? 'Waiting' : session.status === 'active' ? 'Active' : 'Ended'}
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users size={12} />
                {studentCount} joined
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {session.status === 'waiting' && (
              <button onClick={handleStart}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                <Play size={14} /> Start Session
              </button>
            )}
            {(session.status === 'active' || session.status === 'waiting') && (
              <button onClick={handleEnd}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                <Square size={14} /> End Session
              </button>
            )}
          </div>
        </div>

        {/* Question control */}
        {session.status !== 'ended' && (
          <div className="rounded-xl border border-border mb-8">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Current Question</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAdvance('prev')}
                  disabled={session.current_question_index === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  {session.current_question_index + 1}/{totalQuestions}
                </span>
                <button
                  onClick={() => handleAdvance('next')}
                  disabled={session.current_question_index >= totalQuestions - 1}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="px-6 py-6">
              {currentQuestion ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{typeLabels[currentQuestion.type]}</span>
                    <span className="text-xs text-muted-foreground">{currentQuestion.points} pt{currentQuestion.points !== 1 ? 's' : ''}</span>
                  </div>
                  {currentQuestion.type === 'MultipleChoice' && (
                    <MCQuestionDisplay content={currentQuestion.content} />
                  )}
                  {currentQuestion.type === 'TrueOrFalse' && (
                    <TFQuestionDisplay content={currentQuestion.content} />
                  )}
                  {currentQuestion.type === 'FillInTheBlank' && (
                    <FillQuestionDisplay content={currentQuestion.content} />
                  )}
                  {currentQuestion.type === 'Essay' && (
                    <p className="text-base">{currentQuestion.content.prompt as string}</p>
                  )}
                  {currentQuestion.type === 'Coding' && (
                    <p className="text-base font-mono text-sm">{currentQuestion.content.prompt as string}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No questions in this assessment.</p>
              )}
            </div>
          </div>
        )}

        {/* All questions overview */}
        {session.status === 'active' && (
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-6 py-4">
              <p className="text-sm font-medium">Questions Overview</p>
            </div>
            <div className="px-6 py-4">
              <div className="divide-y divide-border -mx-6">
                {session.questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className={`px-6 py-3 flex items-center gap-3 ${
                      idx === session.current_question_index ? 'bg-primary/5' : ''
                    }`}
                  >
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      idx === session.current_question_index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      Q{idx + 1}
                    </span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{typeLabels[q.type]}</span>
                    <span className="text-xs text-muted-foreground">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {q.type === 'MultipleChoice' ? (q.content.stem as string)
                        : q.type === 'TrueOrFalse' ? (q.content.statement as string)
                        : q.type === 'FillInTheBlank' ? (q.content.stem as string)
                        : q.type === 'Essay' ? (q.content.prompt as string)
                        : (q.content.prompt as string)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sessions ended */}
        {session.status === 'ended' && (
          <div className="rounded-xl border border-border p-12 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
              <Square size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Session Ended</h2>
            <p className="text-sm text-muted-foreground mb-6">
              All student answers have been converted to submissions and are available for grading.
            </p>
            <Link
              href={`/dashboard/instructor/classes/${classId}/assessments/${assessmentId}`}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              View Submissions
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

function MCQuestionDisplay({ content }: { content: Record<string, unknown> }) {
  const options = content.options as string[]
  const correctAnswer = content.correctAnswer as string
  return (
    <div>
      <p className="text-base mb-3">{content.stem as string}</p>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <p key={i} className={`text-sm pl-2 border-l-2 ${opt === correctAnswer ? 'border-green-500 text-green-700 dark:text-green-400 font-medium' : 'border-muted text-muted-foreground'}`}>
            {String.fromCharCode(97 + i)}) {opt} {opt === correctAnswer ? '✓' : ''}
          </p>
        ))}
      </div>
    </div>
  )
}

function TFQuestionDisplay({ content }: { content: Record<string, unknown> }) {
  const correct = content.correctAnswer as boolean
  return (
    <div>
      <p className="text-base mb-2">{content.statement as string}</p>
      <p className="text-sm text-green-700 dark:text-green-400 font-medium">
        Answer: {correct ? 'True ✓' : 'False ✓'}
      </p>
    </div>
  )
}

function FillQuestionDisplay({ content }: { content: Record<string, unknown> }) {
  return (
    <div>
      <p className="text-base mb-2">{content.stem as string}</p>
      <p className="text-sm text-green-700 dark:text-green-400 font-medium">
        Answer: {content.correctAnswer as string}
      </p>
    </div>
  )
}
