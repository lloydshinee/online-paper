'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAssessmentWithQuestions,
  saveAssessmentQuestionsAction,
  publishAssessmentAction,
  unpublishAssessmentAction,
  deleteAssessmentAction,
  updateAssessmentSettingsAction,
} from '@/app/actions/assessments'
import { getAssessmentSubmissions, getSubmissionDetail, gradeAnswerAction, deleteSubmissionAction } from '@/app/actions/grading'
import { parseQuestions } from '@/lib/question-parser'
import type { ParsedQuestion } from '@/lib/question-parser'
import { ArrowLeft, Lightbulb, Plus, Trash2, Save, Eye, Copy, Check, Pencil, Play, ClipboardList } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import Link from 'next/link'

const typeOrder = ['MultipleChoice', 'TrueOrFalse', 'FillInTheBlank', 'Essay', 'Coding']
const typeLabels: Record<string, string> = {
  MultipleChoice: 'MC', FillInTheBlank: 'Fill', TrueOrFalse: 'T/F', Essay: 'Essay', Coding: 'Coding',
}

function getLastName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.includes(',')) {
    return trimmed.split(',')[0].trim().toLowerCase()
  }
  const parts = trimmed.split(/\s+/)
  return parts[parts.length - 1].toLowerCase()
}

type PageTab = 'questions' | 'settings' | 'submissions'
type InputTab = 'manual' | 'paste'

interface QuestionItem extends ParsedQuestion { id?: string }
interface AssessmentInfo {
  id: string
  class_id: string
  title: string
  mode: string
  state: string
  duration_minutes: number | null
  scores_released: boolean
  answer_reveal_enabled: boolean
  accepting_submissions: boolean
}

interface SubmissionData {
  id: string
  assessment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  status: string
  score_total: number | null
  violations: number
  student_name: string
  student_email: string
  pending_count: number
}

interface SubmissionDetail {
  id: string
  assessment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  status: string
  score_total: number | null
  violations: number
  assessment_title: string
  answers: AnswerDetail[]
}

interface AnswerDetail {
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
  }
}

export default function AssessmentPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; assessmentId: string }>
}) {
  const { id: classId, assessmentId } = use(paramsPromise)
  const router = useRouter()

  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null)
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [tab, setTab] = useState<PageTab>('questions')

  // Question state
  const [inputTab, setInputTab] = useState<InputTab>('manual')
  const [questionText, setQuestionText] = useState('')
  const [addType, setAddType] = useState('MultipleChoice')
  const [saving, setSaving] = useState(false)
  const [editPtsIdx, setEditPtsIdx] = useState<number | null>(null)
  const [ptsInput, setPtsInput] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // Manual form state
  const [mc, setMc] = useState({ stem: '', a: '', b: '', c: '', d: '', correct: 'a' })
  const [tf, setTf] = useState({ statement: '', correct: 'true' })
  const [fill, setFill] = useState({ stem: '', answer: '' })
  const [essay, setEssay] = useState({ prompt: '' })
  const [coding, setCoding] = useState({ prompt: '' })

  // Settings state
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [settingsMode, setSettingsMode] = useState<'timed' | 'live'>('timed')
  const [settingsDuration, setSettingsDuration] = useState('')
  const [scoresReleased, setScoresReleased] = useState(false)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [acceptingSubmissions, setAcceptingSubmissions] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [scoresCopied, setScoresCopied] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [retakeTarget, setRetakeTarget] = useState<{ id: string; name: string } | null>(null)

  // Submissions state
  const [submissions, setSubmissions] = useState<(SubmissionData & { student_name: string; student_email: string })[]>([])
  const [viewingSubmission, setViewingSubmission] = useState<SubmissionDetail | null>(null)
  const [gradingScores, setGradingScores] = useState<Record<string, string>>({})
  const [gradingFeedback, setGradingFeedback] = useState<Record<string, string>>({})

  useEffect(() => {
    async function loadSubs() {
      const { submissions: subs } = await getAssessmentSubmissions(assessmentId)
      subs.sort((a, b) => getLastName(a.student_name).localeCompare(getLastName(b.student_name)))
      setSubmissions(subs)
    }
    loadSubs()
  }, [assessmentId, tab])

  useEffect(() => {
    async function load() {
      const data = await getAssessmentWithQuestions(assessmentId)
      if (data && data.assessment) {
        setAssessment(data.assessment)
        setQuestions(data.questions.map((q: { id: string; type: string; content: Record<string, unknown>; points: number }) => ({
          id: q.id, type: q.type, content: q.content, points: q.points,
        } as QuestionItem)))
        setTitleInput(data.assessment.title)
        setSettingsMode(data.assessment.mode as 'timed' | 'live')
        setSettingsDuration(data.assessment.duration_minutes?.toString() ?? '')
        setScoresReleased(data.assessment.scores_released ?? false)
        setAnswerRevealed(data.assessment.answer_reveal_enabled ?? false)
        setAcceptingSubmissions(data.assessment.accepting_submissions ?? true)
      } else {
        setError('Assessment not found')
      }
    }
    load()
  }, [assessmentId])

  const totalScore = questions.reduce((sum, q) => sum + q.points, 0)
  const isDraft = assessment?.state === 'draft'

  // ---- Question handlers ----
  const resetForms = useCallback(() => {
    setMc({ stem: '', a: '', b: '', c: '', d: '', correct: 'a' })
    setTf({ statement: '', correct: 'true' })
    setFill({ stem: '', answer: '' })
    setEssay({ prompt: '' })
    setCoding({ prompt: '' })
  }, [])

  function addManual() {
    let q: QuestionItem | null = null
    switch (addType) {
      case 'MultipleChoice': {
        const opts = [mc.a, mc.b, mc.c, mc.d].filter(Boolean)
        if (!mc.stem.trim() || opts.length < 2) return
        const idx = mc.correct.charCodeAt(0) - 97
        if (idx < 0 || idx >= opts.length) return
        q = { type: 'MultipleChoice', content: { stem: mc.stem.trim(), options: opts, correctAnswer: opts[idx], correctIndex: idx }, points: 1 }
        break
      }
      case 'TrueOrFalse':
        if (!tf.statement.trim()) return
        q = { type: 'TrueOrFalse', content: { statement: tf.statement.trim(), correctAnswer: tf.correct === 'true' }, points: 1 }
        break
      case 'FillInTheBlank':
        if (!fill.stem.trim() || !fill.answer.trim()) return
        q = { type: 'FillInTheBlank', content: { stem: fill.stem.trim(), correctAnswer: fill.answer.trim() }, points: 1 }
        break
      case 'Essay':
        if (!essay.prompt.trim()) return
        q = { type: 'Essay', content: { prompt: essay.prompt.trim() }, points: 1 }
        break
      case 'Coding':
        if (!coding.prompt.trim()) return
        q = { type: 'Coding', content: { prompt: coding.prompt.trim() }, points: 1 }
        break
    }
    if (q) { setQuestions((prev) => [...prev, q]); resetForms() }
  }

  function addParsed() {
    const parsed = parseQuestions(questionText)
    if (parsed.length > 0) { setQuestions((prev) => [...prev, ...parsed]); setQuestionText('') }
  }

  function removeQuestion(idx: number) { setQuestions((prev) => prev.filter((_, i) => i !== idx)) }

  function openEdit(idx: number) {
    const q = questions[idx]
    setEditingIdx(idx)
    setAddType(q.type)
    resetForms()

    if (q.type === 'MultipleChoice') {
      const opts = q.content.options as string[]
      setMc({ stem: q.content.stem as string, a: opts[0] || '', b: opts[1] || '', c: opts[2] || '', d: opts[3] || '', correct: String.fromCharCode(97 + ((q.content.correctIndex as number) || 0)) })
    } else if (q.type === 'TrueOrFalse') {
      setTf({ statement: q.content.statement as string, correct: q.content.correctAnswer ? 'true' : 'false' })
    } else if (q.type === 'FillInTheBlank') {
      setFill({ stem: q.content.stem as string, answer: q.content.correctAnswer as string })
    } else if (q.type === 'Essay') {
      setEssay({ prompt: q.content.prompt as string })
    } else if (q.type === 'Coding') {
      setCoding({ prompt: q.content.prompt as string })
    }

    setShowAddDialog(true)
  }

  function saveEdit() {
    if (editingIdx === null) return
    let q: QuestionItem | null = null

    switch (addType) {
      case 'MultipleChoice': {
        const opts = [mc.a, mc.b, mc.c, mc.d].filter(Boolean)
        if (!mc.stem.trim() || opts.length < 2) return
        const idx = mc.correct.charCodeAt(0) - 97
        if (idx < 0 || idx >= opts.length) return
        q = { type: 'MultipleChoice', content: { stem: mc.stem.trim(), options: opts, correctAnswer: opts[idx], correctIndex: idx }, points: questions[editingIdx].points }
        break
      }
      case 'TrueOrFalse':
        if (!tf.statement.trim()) return
        q = { type: 'TrueOrFalse', content: { statement: tf.statement.trim(), correctAnswer: tf.correct === 'true' }, points: questions[editingIdx].points }
        break
      case 'FillInTheBlank':
        if (!fill.stem.trim() || !fill.answer.trim()) return
        q = { type: 'FillInTheBlank', content: { stem: fill.stem.trim(), correctAnswer: fill.answer.trim() }, points: questions[editingIdx].points }
        break
      case 'Essay':
        if (!essay.prompt.trim()) return
        q = { type: 'Essay', content: { prompt: essay.prompt.trim() }, points: questions[editingIdx].points }
        break
      case 'Coding':
        if (!coding.prompt.trim()) return
        q = { type: 'Coding', content: { prompt: coding.prompt.trim() }, points: questions[editingIdx].points }
        break
    }

    if (q) {
      setQuestions((prev) => prev.map((item, i) => (i === editingIdx ? q! : item)))
      setEditingIdx(null)
      setShowAddDialog(false)
      setQuestionText('')
      resetForms()
    }
  }
  function updatePoints(idx: number, pts: number) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, points: Math.max(1, pts) } : q)))
    setEditPtsIdx(null)
  }

  async function handleSave() {
    setSaving(true); setError(null); setSuccess(null)
    const result = await saveAssessmentQuestionsAction(assessmentId, questions)
    if (result.error) setError(result.error)
    else setSuccess(`Saved ${result.count} question${result.count !== 1 ? 's' : ''}`)
    setSaving(false)
  }

  // ---- Settings handlers ----
  async function handleUpdateSettings() {
    setError(null); setSuccess(null)
    const updates: Record<string, unknown> = {}
    if (titleInput.trim() !== assessment!.title) updates.title = titleInput.trim()
    if (settingsMode !== assessment!.mode) updates.mode = settingsMode
    if (assessment!.mode === 'timed' || settingsMode === 'timed') {
      const dur = settingsDuration ? parseInt(settingsDuration) : null
      if (dur !== assessment!.duration_minutes) updates.duration_minutes = settingsMode === 'timed' ? dur : null
    }
    if (scoresReleased !== assessment!.scores_released) updates.scores_released = scoresReleased
    if (answerRevealed !== assessment!.answer_reveal_enabled) updates.answer_reveal_enabled = answerRevealed
    if (acceptingSubmissions !== assessment!.accepting_submissions) updates.accepting_submissions = acceptingSubmissions
    if (Object.keys(updates).length === 0) { setEditingTitle(false); return }
    const result = await updateAssessmentSettingsAction(assessmentId, updates as Parameters<typeof updateAssessmentSettingsAction>[1])
    if (result.error) setError(result.error)
    else if (result.assessment) {
      setAssessment(result.assessment)
      setTitleInput(result.assessment.title)
      setScoresReleased(result.assessment.scores_released)
      setAnswerRevealed(result.assessment.answer_reveal_enabled)
      setAcceptingSubmissions(result.assessment.accepting_submissions)
      setSuccess('Settings updated')
      setEditingTitle(false)
    }
  }

  // ---- Lifecycle handlers ----
  async function handlePublish() {
    const result = await publishAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else setAssessment((a) => a ? { ...a, state: 'active' } : a)
  }
  async function handleUnpublish() {
    const result = await unpublishAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else setAssessment((a) => a ? { ...a, state: 'draft' } : a)
  }
  async function handleDelete() {
    const result = await deleteAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else router.push(`/dashboard/instructor/classes/${classId}`)
  }

  async function viewSubmission(submissionId: string) {
    const detail = await getSubmissionDetail(submissionId)
    if (detail) {
      setViewingSubmission(detail as unknown as SubmissionDetail)
      const scores: Record<string, string> = {}
      const fb: Record<string, string> = {}
      for (const a of detail.answers) {
        scores[a.id] = a.score != null ? String(a.score) : ''
        fb[a.id] = a.feedback ?? ''
      }
      setGradingScores(scores)
      setGradingFeedback(fb)
    }
  }

  function handleCopyScores() {
    const lines = submissions.map((s) => {
      const score = s.score_total != null ? String(s.score_total) : '-'
      return [s.student_name, s.student_email, score].join('\t')
    })
    if (lines.length === 0) return
    navigator.clipboard.writeText(lines.join('\n'))
    setScoresCopied(true)
    setTimeout(() => setScoresCopied(false), 2000)
  }

  async function handleRetake(submissionId: string) {
    const result = await deleteSubmissionAction(submissionId)
    if (result.error) {
      setError(result.error)
    } else {
      setRetakeTarget(null)
      const { submissions: subs } = await getAssessmentSubmissions(assessmentId)
      subs.sort((a, b) => getLastName(a.student_name).localeCompare(getLastName(b.student_name)))
      setSubmissions(subs)
    }
  }

  async function handleGradeAnswer(answerId: string, submissionId: string) {
    const scoreStr = gradingScores[answerId]
    if (!scoreStr || scoreStr.trim() === '') {
      setError('Please enter a score')
      return
    }
    const score = parseFloat(scoreStr)
    if (isNaN(score) || score < 0) {
      setError('Invalid score')
      return
    }
    const feedback = gradingFeedback[answerId]?.trim() || null
    const result = await gradeAnswerAction(answerId, Math.round(score), feedback)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('Grade saved')
      viewSubmission(submissionId)
      const { submissions: subs } = await getAssessmentSubmissions(assessmentId)
      setSubmissions(subs)
    }
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{error || 'Loading...'}</p>
      </div>
    )
  }

  const tabs: { key: PageTab; label: string }[] = [
    { key: 'questions', label: 'Questions' },
    { key: 'settings', label: 'Settings' },
    { key: 'submissions', label: 'Submissions' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-medium text-base">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Lightbulb size={16} />
            </div>
            Online Paper
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href={`/dashboard/instructor/classes/${classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to class
        </Link>

        {/* Header */}
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
                <Play size={14} />
                Live Session
              </Link>
            )}
          </div>
        </div>

        {error && <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
        {success && <div className="mb-4 rounded-md bg-green-100 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">{success}</div>}

        {/* Tab bar */}
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

        {/* Tab: Questions */}
        {tab === 'questions' && (
          <div>
            <div className="mb-4">
                <button
                  onClick={() => { setEditingIdx(null); setShowAddDialog(true) }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus size={14} />
                  Add questions
                </button>
              </div>

            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-6 py-4">
                <p className="text-sm font-medium">Questions</p>
                <p className="text-xs text-muted-foreground">{questions.length} question{questions.length !== 1 ? 's' : ''} — {totalScore} total pt{totalScore !== 1 ? 's' : ''}</p>
              </div>
              <div className="px-6 py-4">
                {questions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                      {isDraft ? 'Click "Add questions" to get started.' : 'No questions.'}
                  </p>
                ) : (
                  <div className="divide-y divide-border -mx-6">
                    {questions.map((q, idx) => (
                      <div key={idx} className="px-6 py-3 relative group">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Q{idx + 1}</span>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{typeLabels[q.type]}</span>
                          {editPtsIdx === idx ? (
                            <input type="number" min="1"
                              className="w-14 h-6 rounded border border-input bg-transparent px-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                              value={ptsInput} onChange={(e) => setPtsInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') updatePoints(idx, parseInt(ptsInput) || 1); if (e.key === 'Escape') setEditPtsIdx(null) }}
                              onBlur={() => updatePoints(idx, parseInt(ptsInput) || 1)} autoFocus />
                          ) : (
                            <button onClick={() => { setEditPtsIdx(idx); setPtsInput(String(q.points)) }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors" type="button">
                              {q.points} pt{q.points !== 1 ? 's' : ''}
                            </button>
                          )}
                          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => openEdit(idx)}
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" type="button">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => removeQuestion(idx)}
                                className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors" type="button">
                                <Trash2 size={14} />
                              </button>
                            </div>
                        </div>
                        <div className="text-sm">
                          {q.type === 'MultipleChoice' && (
                            <div>
                              <p className="font-medium mb-1">{q.content.stem as string}</p>
                              <div className="ml-3 space-y-0.5">
                                {(q.content.options as string[]).map((opt, i) => (
                                  <p key={i} className={`text-xs ${q.content.correctAnswer === opt ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                                    {String.fromCharCode(97 + i)}) {opt} {q.content.correctAnswer === opt ? ' ✓' : ''}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          {q.type === 'TrueOrFalse' && (
                            <div>
                              <p className="mb-1">{q.content.statement as string}</p>
                              <p className="text-xs text-green-600 font-medium">Answer: {q.content.correctAnswer ? 'True ✓' : 'False ✓'}</p>
                            </div>
                          )}
                          {q.type === 'FillInTheBlank' && (
                            <div>
                              <p className="mb-1">{q.content.stem as string}</p>
                              <p className="text-xs text-green-600 font-medium">Answer: {q.content.correctAnswer as string}</p>
                            </div>
                          )}
                          {q.type === 'Essay' && (
                            <div>
                              <p>{q.content.prompt as string}</p>
                              <p className="text-xs text-muted-foreground mt-1">Manual grading</p>
                            </div>
                          )}
                          {q.type === 'Coding' && (
                            <div>
                              <p className="font-mono text-xs">{q.content.prompt as string}</p>
                              <p className="text-xs text-muted-foreground mt-1">Manual grading</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Add questions dialog */}
            <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) { setQuestionText(''); resetForms() } }}>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingIdx !== null ? 'Edit question' : 'Add questions'}</DialogTitle>
                  <DialogDescription>{editingIdx !== null ? 'Edit this question and save changes.' : 'Add questions one by one or paste formatted text.'}</DialogDescription>
                </DialogHeader>

                {editingIdx !== null ? (
                  <div className="rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs text-muted-foreground">Type:</span>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{addType}</span>
                    </div>

                    {addType === 'MultipleChoice' && (
                      <div className="flex flex-col gap-2">
                        <input value={mc.stem} onChange={(e) => setMc({ ...mc, stem: e.target.value })}
                          placeholder="Question stem" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                        {['a','b','c','d'].map((l, i) => (
                          <div key={l} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-4">{l})</span>
                            <input
                              value={[mc.a, mc.b, mc.c, mc.d][i]}
                              onChange={(e) => { const keys = ['a','b','c','d'] as const; setMc((prev) => ({ ...prev, [keys[i]]: e.target.value })) }}
                              placeholder={`Option ${l}`} className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Correct:</span>
                          <select value={mc.correct} onChange={(e) => setMc({ ...mc, correct: e.target.value })}
                            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                            <option value="a">a</option><option value="b">b</option><option value="c">c</option><option value="d">d</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {addType === 'TrueOrFalse' && (
                      <div className="flex flex-col gap-2">
                        <input value={tf.statement} onChange={(e) => setTf({ ...tf, statement: e.target.value })}
                          placeholder="Statement" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Answer:</span>
                          <select value={tf.correct} onChange={(e) => setTf({ ...tf, correct: e.target.value })}
                            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                            <option value="true">True</option><option value="false">False</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {addType === 'FillInTheBlank' && (
                      <div className="flex flex-col gap-2">
                        <input value={fill.stem} onChange={(e) => setFill({ ...fill, stem: e.target.value })}
                          placeholder="Sentence with ______ for the blank" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                        <input value={fill.answer} onChange={(e) => setFill({ ...fill, answer: e.target.value })}
                          placeholder="Correct answer" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                      </div>
                    )}

                    {addType === 'Essay' && (
                      <textarea value={essay.prompt} onChange={(e) => setEssay({ prompt: e.target.value })}
                        placeholder="Essay prompt" rows={3}
                        className="w-full flex rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y" />
                    )}

                    {addType === 'Coding' && (
                      <textarea value={coding.prompt} onChange={(e) => setCoding({ prompt: e.target.value })}
                        placeholder="Coding problem statement" rows={3}
                        className="w-full flex rounded-md border border-input bg-transparent px-2 py-1.5 text-xs font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y" />
                    )}

                    <button onClick={saveEdit}
                      className="mt-4 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      Save changes
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex rounded-md border border-border overflow-hidden mb-4">
                      <button onClick={() => setInputTab('manual')}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${inputTab === 'manual' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        One by one
                      </button>
                      <button onClick={() => setInputTab('paste')}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${inputTab === 'paste' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        Paste text
                      </button>
                    </div>

                    {inputTab === 'manual' && (
                      <div className="rounded-xl border border-border p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <select value={addType} onChange={(e) => setAddType(e.target.value)}
                            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                            {typeOrder.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button onClick={addManual}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                            <Plus size={12} /> Add
                          </button>
                        </div>

                        {addType === 'MultipleChoice' && (
                          <div className="flex flex-col gap-2">
                            <input value={mc.stem} onChange={(e) => setMc({ ...mc, stem: e.target.value })}
                              placeholder="Question stem" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                            {['a','b','c','d'].map((l, i) => (
                              <div key={l} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-4">{l})</span>
                                <input
                                  value={[mc.a, mc.b, mc.c, mc.d][i]}
                                  onChange={(e) => { const keys = ['a','b','c','d'] as const; setMc((prev) => ({ ...prev, [keys[i]]: e.target.value })) }}
                                  placeholder={`Option ${l}`} className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                              </div>
                            ))}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Correct:</span>
                              <select value={mc.correct} onChange={(e) => setMc({ ...mc, correct: e.target.value })}
                                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                                <option value="a">a</option><option value="b">b</option><option value="c">c</option><option value="d">d</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {addType === 'TrueOrFalse' && (
                          <div className="flex flex-col gap-2">
                            <input value={tf.statement} onChange={(e) => setTf({ ...tf, statement: e.target.value })}
                              placeholder="Statement" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Answer:</span>
                              <select value={tf.correct} onChange={(e) => setTf({ ...tf, correct: e.target.value })}
                                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                                <option value="true">True</option><option value="false">False</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {addType === 'FillInTheBlank' && (
                          <div className="flex flex-col gap-2">
                            <input value={fill.stem} onChange={(e) => setFill({ ...fill, stem: e.target.value })}
                              placeholder="Sentence with ______ for the blank" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                            <input value={fill.answer} onChange={(e) => setFill({ ...fill, answer: e.target.value })}
                              placeholder="Correct answer" className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                        )}

                        {addType === 'Essay' && (
                          <textarea value={essay.prompt} onChange={(e) => setEssay({ prompt: e.target.value })}
                            placeholder="Essay prompt" rows={3}
                            className="w-full flex rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y" />
                        )}

                        {addType === 'Coding' && (
                          <textarea value={coding.prompt} onChange={(e) => setCoding({ prompt: e.target.value })}
                            placeholder="Coding problem statement" rows={3}
                            className="w-full flex rounded-md border border-input bg-transparent px-2 py-1.5 text-xs font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y" />
                        )}
                      </div>
                    )}

                    {inputTab === 'paste' && (
                      <div className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">
                            Paste formatted questions with headers
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const instructions = `Convert the following questions into this exact format:
                    
[MultipleChoice]
Question stem here
a) First option
b) Second option
c) Third option
d) Fourth option
Answer: b
Points: 5

[TrueOrFalse]
Statement here
Answer: True
Points: 3

[FillInTheBlank]
Sentence with a ______ marking the blank.
Answer: correct text
Points: 2

[Essay]
Essay prompt here
Points: 10

[Coding]
Coding problem description here
Points: 15

Rules:
- Each question in a section is separated by a blank line
- MultipleChoice always has exactly 4 options labeled a) b) c) d)
- MultipleChoice/FillInTheBlank use "Answer: " followed by the correct answer
- TrueOrFalse uses "Answer: True" or "Answer: False"
- Essay and Coding have no Answer line (manual grading)
- Add "Points: N" to any question to set its score (defaults to 1 if omitted)
- Use section headers exactly as shown in brackets`
                              navigator.clipboard.writeText(instructions)
                              setCopied(true)
                              setTimeout(() => setCopied(false), 2000)
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
                          >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? 'Copied!' : 'Copy instructions'}
                          </button>
                        </div>
                        <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={12}
                          className="w-full min-h-[180px] rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs font-mono focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder={`[MultipleChoice]
Question stem goes here
a) First option
b) Second option
c) Third option
d) Fourth option
Answer: b
Points: 5

[TrueOrFalse]
This statement is either true or false.
Answer: True
Points: 3

[FillInTheBlank]
The blank is marked by ______ in the sentence.
Answer: the correct text
Points: 2

[Essay]
Write a prompt for an essay question here.
Points: 10

[Coding]
Describe a coding problem for the student to solve.
Points: 15`} />
                        <button onClick={addParsed} disabled={!questionText.trim()}
                          className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                          <Plus size={12} /> Add {parseQuestions(questionText).length} parsed question{parseQuestions(questionText).length !== 1 ? 's' : ''}
                        </button>
                      </div>
                    )}

                    <button onClick={() => { handleSave(); setShowAddDialog(false); setQuestionText(''); resetForms() }} disabled={saving}
                      className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                      <Save size={14} />
                      {saving ? 'Saving...' : `Save ${questions.length} Question${questions.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Tab: Settings */}
        {tab === 'settings' && (
          <><div>
            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-6 py-3">
                <p className="text-sm font-medium">Assessment Settings</p>
              </div>
              <div className="px-6 py-5 flex flex-col gap-5">
                {/* Publish toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">Published</p>
                    <p className="text-xs text-muted-foreground">Students can see this assessment</p>
                  </div>
                  <button
                    onClick={() => { isDraft ? handlePublish() : handleUnpublish() }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      !isDraft ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
                      !isDraft ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Title</label>
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
                        className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                      <button onClick={handleUpdateSettings}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Save</button>
                      <button onClick={() => { setTitleInput(assessment!.title); setEditingTitle(false) }}
                        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{assessment.title}</span>
                      <button onClick={() => setEditingTitle(true)}
                        className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                    </div>
                  )}
                </div>

                {/* Mode */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Mode</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{assessment.mode}</span>
                    <span className="text-xs text-muted-foreground">(locked)</span>
                  </div>
                </div>

                {/* Duration */}
                {settingsMode === 'timed' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Duration (minutes)</label>
                    <input type="number" min="1" value={settingsDuration}
                      onChange={(e) => setSettingsDuration(e.target.value)}
                      className="w-24 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                )}

                {/* Score release */}
                <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">Release scores</p>
                    <p className="text-xs text-muted-foreground">Students can see their scores</p>
                  </div>
                  <button
                    onClick={() => setScoresReleased(!scoresReleased)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      scoresReleased ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
                      scoresReleased ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Answer reveal */}
                <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">Show answers</p>
                    <p className="text-xs text-muted-foreground">Students can see correct answers</p>
                  </div>
                  <button
                    onClick={() => setAnswerRevealed(!answerRevealed)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      answerRevealed ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
                      answerRevealed ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Accepting submissions */}
                <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div>
                    <p className="text-sm font-medium">Accept submissions</p>
                    <p className="text-xs text-muted-foreground">Students can start/take this assessment</p>
                  </div>
                  <button
                    onClick={() => setAcceptingSubmissions(!acceptingSubmissions)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      acceptingSubmissions ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
                      acceptingSubmissions ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Save settings */}
              <div className="border-t border-border px-6 py-3">
                <button onClick={handleUpdateSettings}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Save settings
                </button>
              </div>

              {/* Actions */}
              <div className="border-t border-border px-6 py-4 flex items-center gap-2">
                <button onClick={() => setShowDeleteDialog(true)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                  Delete assessment
                </button>
              </div>
            </div>
          </div>

          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete assessment</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete &ldquo;{assessment.title}&rdquo;? This will permanently remove all questions, submissions, and answers. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowDeleteDialog(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={() => { setShowDeleteDialog(false); handleDelete() }}
                  className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">
                  Delete
                </button>
              </div>
            </DialogContent>
          </Dialog>
          </>)}

        {/* Tab: Submissions */}
        {tab === 'submissions' && (
          <><div>
            {viewingSubmission ? (
              <div>
                <button onClick={() => setViewingSubmission(null)}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
                  <ArrowLeft size={14} /> Back to submissions
                </button>

                <div className="rounded-xl border border-border mb-6">
                  <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Submission Detail</p>
                      <p className="text-xs text-muted-foreground">{viewingSubmission.assessment_title}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{viewingSubmission.score_total ?? '-'} pts</p>
                      <p className="text-xs text-muted-foreground capitalize">{viewingSubmission.status}</p>
                      {(viewingSubmission.violations ?? 0) > 0 && (
                        <p className="text-xs text-destructive font-medium mt-0.5">{viewingSubmission.violations} violation{(viewingSubmission.violations ?? 0) !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <div className="divide-y divide-border -mx-6">
                      {viewingSubmission.answers.map((a, idx) => {
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

                            {/* Question text */}
                            <div className="text-sm mb-2">
                              {q.type === 'MultipleChoice' && <p className="font-medium">{q.content.stem as string}</p>}
                              {q.type === 'TrueOrFalse' && <p className="font-medium">{q.content.statement as string}</p>}
                              {q.type === 'FillInTheBlank' && <p className="font-medium">{q.content.stem as string}</p>}
                              {q.type === 'Essay' && <p>{q.content.prompt as string}</p>}
                              {q.type === 'Coding' && <p className="font-mono text-xs">{q.content.prompt as string}</p>}
                            </div>

                            {/* Answer display */}
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

                            {/* Correct answer (for auto types) */}
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

                            {/* Grading form for Essay/Coding */}
                            {isManual && (
                              <div className="rounded-md border border-border px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1">
                                    <label className="text-xs text-muted-foreground">Score:</label>
                                    <input
                                      type="number" min="0" max={q.points}
                                      value={gradingScores[a.id] ?? ''}
                                      onChange={(e) => setGradingScores((prev) => ({ ...prev, [a.id]: e.target.value }))}
                                      className="w-16 h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                    <span className="text-xs text-muted-foreground">/ {q.points}</span>
                                  </div>
                                  <input
                                    type="text"
                                    value={gradingFeedback[a.id] ?? ''}
                                    onChange={(e) => setGradingFeedback((prev) => ({ ...prev, [a.id]: e.target.value }))}
                                    placeholder="Feedback (optional)"
                                    className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                                  />
                                  <button
                                    onClick={() => handleGradeAnswer(a.id, viewingSubmission.id)}
                                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                                  >
                                    Save
                                  </button>
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
            ) : (
              <div>
                <div className="rounded-xl border border-border">
                  <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Submissions</p>
                      <p className="text-xs text-muted-foreground">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</p>
                    </div>
                    {submissions.length > 0 && (
                      <button
                        onClick={handleCopyScores}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        {scoresCopied ? <Check size={12} /> : <ClipboardList size={12} />}
                        {scoresCopied ? 'Copied!' : 'Copy scores'}
                      </button>
                    )}
                  </div>
                  <div className="px-6 py-4">
                    {submissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        No submissions yet. Student submissions will appear here once the assessment is published.
                      </p>
                    ) : (
                      <div className="divide-y divide-border -mx-6">
                        {submissions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between px-6 py-4">
                            <div>
                              <p className="text-sm font-medium">{s.student_name}</p>
                              <p className="text-xs text-muted-foreground">{s.student_email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`rounded-md px-1.5 py-0.5 text-xs ${
                                  s.status === 'submitted' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                  : s.status === 'expired' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                                  : 'bg-muted text-muted-foreground'
                                }`}>
                                  {s.status === 'submitted' ? 'Submitted' : s.status === 'expired' ? 'Expired' : 'In progress'}
                                </span>
                                {s.score_total != null && (
                                  <span className="text-xs text-muted-foreground">{s.score_total} pts</span>
                                )}
                                {s.pending_count > 0 && (
                                  <span className="rounded-md bg-yellow-100 dark:bg-yellow-900/20 px-1.5 py-0.5 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                                    {s.pending_count} pending
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
                              <button onClick={() => viewSubmission(s.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                                <Eye size={12} /> View
                              </button>
                              <button onClick={() => setRetakeTarget({ id: s.id, name: s.student_name })}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive transition-colors">
                                Retake
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

              <Dialog open={retakeTarget !== null} onOpenChange={(open) => { if (!open) setRetakeTarget(null) }}>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Allow retake</DialogTitle>
                    <DialogDescription>
                      This will delete all answers and let {retakeTarget?.name ?? 'this student'} retake the assessment. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setRetakeTarget(null)}
                      className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => retakeTarget && handleRetake(retakeTarget.id)}
                      className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">
                      Allow retake
                    </button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </>)}
      </main>
    </div>
  )
}
