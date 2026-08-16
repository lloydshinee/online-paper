'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { gradeAnswerAction } from '@/app/actions/grading'
import type { SubmissionDetail } from './types'
import { typeLabels } from './types'

interface GradingPanelProps {
  submission: SubmissionDetail
  attemptNumber?: number
  onBack: () => void
  onGradeComplete: () => void
  onError: (msg: string) => void
  onSuccess: (msg: string) => void
}

export default function GradingPanel({ submission, attemptNumber, onBack, onGradeComplete, onError, onSuccess }: GradingPanelProps) {
  const [gradingScores, setGradingScores] = useState<Record<string, string>>(() => {
    const scores: Record<string, string> = {}
    for (const a of submission.answers) {
      if (a.score != null) {
        scores[a.id] = String(a.score)
      } else {
        const hasAnswer = a.answer_content && Object.keys(a.answer_content).length > 0
        scores[a.id] = hasAnswer ? '' : '0'
      }
    }
    return scores
  })
  const [gradingFeedback, setGradingFeedback] = useState<Record<string, string>>(() => {
    const fb: Record<string, string> = {}
    for (const a of submission.answers) {
      fb[a.id] = a.feedback ?? ''
    }
    return fb
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const maxPointsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const map: Record<string, number> = {}
    for (const a of submission.answers) {
      map[a.id] = a.questions.points
    }
    maxPointsRef.current = map
    scoresRef.current = gradingScores
    feedbackRef.current = gradingFeedback
  })

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const scoresRef = useRef(gradingScores)
  const feedbackRef = useRef(gradingFeedback)

  const debouncedSave = useCallback((answerId: string) => {
    if (timersRef.current[answerId]) {
      clearTimeout(timersRef.current[answerId])
    }
    timersRef.current[answerId] = setTimeout(async () => {
      const scoreStr = scoresRef.current[answerId]
      if (!scoreStr || scoreStr.trim() === '') return
      const score = parseFloat(scoreStr)
      const max = maxPointsRef.current[answerId] ?? Infinity
      if (isNaN(score) || score < 0 || score > max) return

      // Reject fractional scores visibly instead of silently rounding them.
      if (!Number.isInteger(score)) {
        onError(`Score must be a whole number (received ${scoreStr}). The saved value will not match what you typed.`)
        return
      }

      setSaving((prev) => ({ ...prev, [answerId]: true }))
      const feedback = feedbackRef.current[answerId]?.trim() || null
      const result = await gradeAnswerAction(answerId, score, feedback)
      setSaving((prev) => ({ ...prev, [answerId]: false }))

      if (result.error) {
        onError(result.error)
      } else {
        onSuccess('Grade auto-saved')
        onGradeComplete()
      }
    }, 1000)
  }, [onError, onSuccess, onGradeComplete])

  function handleScoreChange(answerId: string, value: string) {
    if (value === '') {
      setGradingScores((prev) => ({ ...prev, [answerId]: value }))
      return
    }
    const num = parseFloat(value)
    const max = maxPointsRef.current[answerId] ?? Infinity
    if (isNaN(num) || num < 0) return
    if (num > max) return
    setGradingScores((prev) => ({ ...prev, [answerId]: value }))
    debouncedSave(answerId)
  }

  function handleFeedbackChange(answerId: string, value: string) {
    setGradingFeedback((prev) => ({ ...prev, [answerId]: value }))
    debouncedSave(answerId)
  }

  // Auto-save defaulted 0 scores for unanswered questions on mount
  useEffect(() => {
    for (const a of submission.answers) {
      const hasAnswer = a.answer_content && Object.keys(a.answer_content).length > 0
      if (a.score == null && !hasAnswer && gradingScores[a.id] === '0') {
        debouncedSave(a.id)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <button onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft size={14} /> Back to submissions
      </button>

      <div className="rounded-xl border border-border mb-6">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Submission Detail</p>
              {attemptNumber != null && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Attempt {attemptNumber}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{submission.assessment_title}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{submission.score_total ?? '-'} pts</p>
            <p className="text-xs text-muted-foreground capitalize">{submission.status}</p>
            {(submission.violations ?? 0) > 0 && (
              <p className="text-xs text-destructive font-medium mt-0.5">{submission.violations} violation{(submission.violations ?? 0) !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="divide-y divide-border -mx-6">
            {submission.answers.map((a, idx) => {
              const q = a.questions
              const isAuto = ['MultipleChoice', 'TrueOrFalse', 'FillInTheBlank'].includes(q.type)
              const isManual = ['Essay', 'Coding'].includes(q.type)

              return (
                <div key={a.question_id || a.id} className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Q{idx + 1}</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{typeLabels[q.type]}</span>
                    <span className="text-xs text-muted-foreground">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                    {a.score != null && (
                      <span className={`rounded px-1.5 py-0.5 text-xs ${a.is_correct ? 'bg-green-100 text-green-700' : isManual ? 'bg-blue-100 text-blue-700' : 'bg-destructive/10 text-destructive'}`}>
                        {a.score}/{q.points}
                      </span>
                    )}
                    {a.score == null && isManual && (
                      <span className="rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 px-1.5 py-0.5 text-xs">Pending</span>
                    )}
                    {a.score == null && !isManual && !a.id && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">No answer</span>
                    )}
                  </div>

                  <div className="text-sm mb-2">
                    {q.type === 'MultipleChoice' && <p className="font-medium">{q.content.stem as string}</p>}
                    {q.type === 'TrueOrFalse' && <p className="font-medium">{q.content.statement as string}</p>}
                    {q.type === 'FillInTheBlank' && <p className="font-medium">{q.content.stem as string}</p>}
                    {q.type === 'Essay' && <p>{q.content.prompt as string}</p>}
                    {q.type === 'Coding' && <p className="font-mono text-xs">{q.content.prompt as string}</p>}
                  </div>

                  <div className="rounded-md bg-muted/50 px-3 py-2 mb-2">
                    <p className="text-xs text-muted-foreground mb-1">Student answer:</p>
                    {q.type === 'MultipleChoice' && (
                      <p className="text-sm">
                        {typeof a.answer_content.selectedIndex === 'number'
                          ? `${String.fromCharCode(97 + (a.answer_content.selectedIndex as number))}) ${(q.content.options as string[])[(a.answer_content.selectedIndex as number)]}`
                          : 'No answer'}
                      </p>
                    )}
                    {q.type === 'TrueOrFalse' && (
                      <p className="text-sm">
                        {typeof a.answer_content.value === 'boolean'
                          ? (a.answer_content.value ? 'True' : 'False')
                          : 'No answer'}
                      </p>
                    )}
                    {q.type === 'FillInTheBlank' && (
                      <p className="text-sm">{a.answer_content.text as string || <span className="text-muted-foreground italic">No answer</span>}</p>
                    )}
                    {q.type === 'Essay' && (
                      <p className="text-sm whitespace-pre-wrap">{a.answer_content.text as string || <span className="text-muted-foreground italic">No answer</span>}</p>
                    )}
                    {q.type === 'Coding' && (
                      <pre className="text-xs font-mono whitespace-pre-wrap">{a.answer_content.code as string || <span className="text-muted-foreground italic">No answer</span>}</pre>
                    )}
                  </div>

                  {isAuto && (
                    <div className="rounded-md bg-green-50 dark:bg-green-900/10 px-3 py-2 mb-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Correct answer:</p>
                      {q.type === 'MultipleChoice' && (
                        <p className="text-sm">{q.content.correctAnswer as string}</p>
                      )}
                      {q.type === 'TrueOrFalse' && (
                        <p className="text-sm">{q.content.correctAnswer ? 'True' : 'False'}</p>
                      )}
                      {q.type === 'FillInTheBlank' && (
                        <p className="text-sm">{q.content.correctAnswer as string}</p>
                      )}
                    </div>
                  )}

                  {isManual && (
                    <div className="rounded-md border border-border px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-muted-foreground">Score:</label>
                          <input
                            type="number" min="0" max={q.points}
                            value={gradingScores[a.id] ?? ''}
                            onChange={(e) => handleScoreChange(a.id, e.target.value)}
                            className="w-16 h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <span className="text-xs text-muted-foreground">/ {q.points}</span>
                        </div>
                        <input
                          type="text"
                          value={gradingFeedback[a.id] ?? ''}
                          onChange={(e) => handleFeedbackChange(a.id, e.target.value)}
                          placeholder="Feedback (optional)"
                          className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {saving[a.id] ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground min-w-[52px]">
                            <Loader2 size={12} className="animate-spin" /> Saving
                          </span>
                        ) : a.score != null && gradingScores[a.id] === String(a.score) && (gradingFeedback[a.id] || '') === (a.feedback || '') ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 min-w-[52px]">
                            <Check size={12} /> Saved
                          </span>
                        ) : gradingScores[a.id] ? (
                          <span className="text-xs text-muted-foreground min-w-[52px]">Auto-save...</span>
                        ) : null}
                      </div>
                      {a.feedback && gradingFeedback[a.id] === '' && (
                        <p className="text-xs text-muted-foreground mt-2">Previous feedback: {a.feedback}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
