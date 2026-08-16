'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { toast } from 'sonner'
import {
  getAssessmentWithQuestions,
  saveAssessmentQuestionsAction,
} from '@/app/actions/assessments'
import { parseQuestions, parseQuestionsWithDiagnostics, formatQuestions } from '@/lib/question-parser'
import { Plus, Trash2, Copy, Check, Pencil, Eye, EyeOff, ChevronUp, ChevronDown, CopyPlus, BookOpen } from 'lucide-react'
import { copyToClipboard } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import type { QuestionItem, InputTab } from './types'
import { typeOrder, typeLabels } from './types'

interface QuestionsTabProps {
  assessmentId: string
  isDraft: boolean
}

const emptyErrors = { stem: '', a: '', b: '', c: '', d: '', correct: '', statement: '', answer: '', prompt: '' }

function getAnswerLetter(idx: number): string {
  return String.fromCharCode(97 + idx)
}

function getAnswerIndex(letter: string): number {
  return letter.charCodeAt(0) - 97
}

function validateFields(type: string, mc: McForm, tf: TfForm, fill: FillForm, essay: EssayForm, coding: CodingForm): Record<string, string> {
  const e = { ...emptyErrors }
  switch (type) {
    case 'MultipleChoice': {
      if (!mc.stem.trim()) e.stem = 'Question stem is required'
      const opts = [mc.a, mc.b, mc.c, mc.d].filter(Boolean)
      if (opts.length < 2) e.a = 'Fill at least 2 options'
      const idx = getAnswerIndex(mc.correct)
      if (mc.correct && (idx < 0 || idx >= opts.length)) e.correct = 'Select a filled option'
      break
    }
    case 'TrueOrFalse':
      if (!tf.statement.trim()) e.statement = 'Statement is required'
      break
    case 'FillInTheBlank':
      if (!fill.stem.trim()) e.stem = 'Sentence is required'
      if (!fill.answer.trim()) e.answer = 'Answer is required'
      break
    case 'Essay':
      if (!essay.prompt.trim()) e.prompt = 'Prompt is required'
      break
    case 'Coding':
      if (!coding.prompt.trim()) e.prompt = 'Problem statement is required'
      break
  }
  return e
}

function hasErrors(e: Record<string, string>): boolean {
  return Object.values(e).some((v) => v !== '')
}

interface McForm { stem: string; a: string; b: string; c: string; d: string; correct: string }
interface TfForm { statement: string; correct: string }
interface FillForm { stem: string; answer: string }
interface EssayForm { prompt: string }
interface CodingForm { prompt: string }

const initialMc: McForm = { stem: '', a: '', b: '', c: '', d: '', correct: 'a' }
const initialTf: TfForm = { statement: '', correct: 'true' }
const initialFill: FillForm = { stem: '', answer: '' }
const initialEssay: EssayForm = { prompt: '' }
const initialCoding: CodingForm = { prompt: '' }

interface QuestionFormFieldsProps {
  type: string
  mc: McForm; setMc: (v: McForm) => void
  tf: TfForm; setTf: (v: TfForm) => void
  fill: FillForm; setFill: (v: FillForm) => void
  essay: EssayForm; setEssay: (v: EssayForm) => void
  coding: CodingForm; setCoding: (v: CodingForm) => void
  errors: Record<string, string>
  idPrefix: string
}

function QuestionFormFields({ type, mc, setMc, tf, setTf, fill, setFill, essay, setEssay, coding, setCoding, errors, idPrefix }: QuestionFormFieldsProps) {
  const inputClass = (field: string) =>
    `flex h-9 rounded-md border px-3 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring transition-colors ${errors[field] ? 'border-destructive focus-visible:ring-destructive' : 'border-input bg-transparent'}`

  if (type === 'MultipleChoice') {
    const correctOptions = ['a', 'b', 'c', 'd'].filter((_, i) => [mc.a, mc.b, mc.c, mc.d][i].trim() !== '')
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor={`${idPrefix}-mc-stem`} className="text-sm font-medium mb-1 block">Question stem</label>
          <input id={`${idPrefix}-mc-stem`} value={mc.stem} onChange={(e) => setMc({ ...mc, stem: e.target.value })}
            placeholder="What is the capital of France?" className={inputClass('stem')} />
          {errors.stem && <p className="text-xs text-destructive mt-1">{errors.stem}</p>}
        </div>
        <p className="text-sm font-medium">Options</p>
        {['a', 'b', 'c', 'd'].map((l, i) => (
          <div key={l}>
            <div className="flex items-center gap-2">
              <label htmlFor={`${idPrefix}-mc-opt-${l}`} className="text-sm text-muted-foreground w-5">{l})</label>
              <input id={`${idPrefix}-mc-opt-${l}`}
                value={[mc.a, mc.b, mc.c, mc.d][i]}
                onChange={(e) => { const keys = ['a', 'b', 'c', 'd'] as const; setMc({ ...mc, [keys[i]]: e.target.value }) }}
                placeholder={`Option ${l}`} className={inputClass(l)} />
            </div>
            {errors[l] && <p className="text-xs text-destructive mt-1 ml-7">{errors[l]}</p>}
          </div>
        ))}
        <div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${idPrefix}-mc-correct`} className="text-sm font-medium">Correct answer</label>
            <select id={`${idPrefix}-mc-correct`} value={mc.correct} onChange={(e) => setMc({ ...mc, correct: e.target.value })}
              className={inputClass('correct')}>
              {correctOptions.map((l) => <option key={l} value={l}>{l}) {[mc.a, mc.b, mc.c, mc.d][getAnswerIndex(l)]}</option>)}
            </select>
          </div>
          {errors.correct && <p className="text-xs text-destructive mt-1">{errors.correct}</p>}
        </div>
      </div>
    )
  }

  if (type === 'TrueOrFalse') {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor={`${idPrefix}-tf-statement`} className="text-sm font-medium mb-1 block">Statement</label>
          <input id={`${idPrefix}-tf-statement`} value={tf.statement} onChange={(e) => setTf({ ...tf, statement: e.target.value })}
            placeholder="The Earth revolves around the Sun." className={inputClass('statement')} />
          {errors.statement && <p className="text-xs text-destructive mt-1">{errors.statement}</p>}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-tf-answer`} className="text-sm font-medium mb-1 block">Correct answer</label>
          <select id={`${idPrefix}-tf-answer`} value={tf.correct} onChange={(e) => setTf({ ...tf, correct: e.target.value })}
            className={inputClass('')}>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </div>
      </div>
    )
  }

  if (type === 'FillInTheBlank') {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor={`${idPrefix}-fill-stem`} className="text-sm font-medium mb-1 block">Sentence</label>
          <input id={`${idPrefix}-fill-stem`} value={fill.stem} onChange={(e) => setFill({ ...fill, stem: e.target.value })}
            placeholder="The largest planet in the solar system is ______." className={inputClass('stem')} />
          {errors.stem && <p className="text-xs text-destructive mt-1">{errors.stem}</p>}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-fill-answer`} className="text-sm font-medium mb-1 block">Correct answer</label>
          <input id={`${idPrefix}-fill-answer`} value={fill.answer} onChange={(e) => setFill({ ...fill, answer: e.target.value })}
            placeholder="Jupiter" className={inputClass('answer')} />
          {errors.answer && <p className="text-xs text-destructive mt-1">{errors.answer}</p>}
        </div>
      </div>
    )
  }

  if (type === 'Essay') {
    return (
      <div>
        <label htmlFor={`${idPrefix}-essay-prompt`} className="text-sm font-medium mb-1 block">Essay prompt</label>
        <textarea id={`${idPrefix}-essay-prompt`} value={essay.prompt} onChange={(e) => setEssay({ prompt: e.target.value })}
          placeholder="Discuss the impact of..." rows={4}
          className={`w-full rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y ${errors.prompt ? 'border-destructive' : 'border-input bg-transparent'}`} />
        {errors.prompt && <p className="text-xs text-destructive mt-1">{errors.prompt}</p>}
      </div>
    )
  }

  if (type === 'Coding') {
    return (
      <div>
        <label htmlFor={`${idPrefix}-coding-prompt`} className="text-sm font-medium mb-1 block">Problem statement</label>
        <textarea id={`${idPrefix}-coding-prompt`} value={coding.prompt} onChange={(e) => setCoding({ prompt: e.target.value })}
          placeholder="Write a function that..." rows={4}
          className={`w-full rounded-md border px-3 py-2 text-sm font-mono shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring resize-y ${errors.prompt ? 'border-destructive' : 'border-input bg-transparent'}`} />
        {errors.prompt && <p className="text-xs text-destructive mt-1">{errors.prompt}</p>}
      </div>
    )
  }

  return null
}

interface QuestionPreviewProps {
  question: QuestionItem
  idx: number
  previewMode: boolean
  editPtsIdx: number | null
  ptsInput: string
  onPtsClick: (idx: number, pts: number) => void
  onPtsChange: (val: string) => void
  onPtsCommit: (idx: number, pts: number) => void
  onEdit: (idx: number) => void
  onDelete: (idx: number) => void
  onDuplicate: (idx: number) => void
  onMoveUp: (idx: number) => void
  onMoveDown: (idx: number) => void
  total: number
}

function QuestionPreview({ question, idx, previewMode, editPtsIdx, ptsInput, onPtsClick, onPtsChange, onPtsCommit, onEdit, onDelete, onDuplicate, onMoveUp, onMoveDown, total }: QuestionPreviewProps) {
  const q = question
  return (
    <div className="px-6 py-4 relative group">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Q{idx + 1}</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{typeLabels[q.type]}</span>
        {editPtsIdx === idx ? (
          <input type="number" min="1"
            className="w-14 h-6 rounded border border-input bg-transparent px-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            value={ptsInput} onChange={(e) => onPtsChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onPtsCommit(idx, parseInt(ptsInput) || 1); if (e.key === 'Escape') onPtsClick(idx, question.points) }}
            onBlur={() => onPtsCommit(idx, parseInt(ptsInput) || 1)} autoFocus />
        ) : (
          <button onClick={() => onPtsClick(idx, question.points)}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-dotted border-muted-foreground/40 hover:border-foreground/40" type="button">
            {question.points} pt{question.points !== 1 ? 's' : ''}
            <Pencil size={10} className="opacity-40" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          {idx > 0 && (
            <button onClick={() => onMoveUp(idx)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" type="button"
              aria-label={`Move question ${idx + 1} up`}>
              <ChevronUp size={14} />
            </button>
          )}
          {idx < total - 1 && (
            <button onClick={() => onMoveDown(idx)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" type="button"
              aria-label={`Move question ${idx + 1} down`}>
              <ChevronDown size={14} />
            </button>
          )}
          <button onClick={() => onDuplicate(idx)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" type="button"
            aria-label={`Duplicate question ${idx + 1}`}>
            <CopyPlus size={14} />
          </button>
          <button onClick={() => onEdit(idx)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" type="button"
            aria-label={`Edit question ${idx + 1}`}>
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(idx)}
            className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors" type="button"
            aria-label={`Delete question ${idx + 1}`}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {previewMode ? (
        <div className="text-sm space-y-2">
          {q.type === 'MultipleChoice' && (
            <div>
              <p className="font-medium mb-2">{q.content.stem as string}</p>
              <div className="ml-3 space-y-1.5">
                {(q.content.options as string[]).map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 text-muted-foreground">
                    <span className="size-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                    <span>{String.fromCharCode(97 + i)}) {opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {q.type === 'TrueOrFalse' && (
            <div>
              <p className="font-medium mb-2">{q.content.statement as string}</p>
              <div className="flex gap-4 ml-3">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                  True
                </label>
                <label className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                  False
                </label>
              </div>
            </div>
          )}
          {q.type === 'FillInTheBlank' && (
            <div>
              <p className="font-medium">{q.content.stem as string}</p>
              <p className="text-xs text-muted-foreground mt-1">Fill in the blank</p>
            </div>
          )}
          {q.type === 'Essay' && (
            <div>
              <p className="font-medium">{q.content.prompt as string}</p>
              <div className="mt-2 rounded-md border border-border bg-muted/30 h-24" />
              <p className="text-xs text-muted-foreground mt-1">Long-form response</p>
            </div>
          )}
          {q.type === 'Coding' && (
            <div>
              <p className="font-medium">{q.content.prompt as string}</p>
              <div className="mt-2 rounded-md border border-border bg-muted/30 h-24 font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Code submission</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm">
          {q.type === 'MultipleChoice' && (
            <div>
              <p className="font-medium mb-1">{q.content.stem as string}</p>
              <div className="ml-3 space-y-0.5">
                {(q.content.options as string[]).map((opt, i) => (
                  <p key={i} className={`text-sm ${q.content.correctAnswer === opt ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                    {String.fromCharCode(97 + i)}) {opt} {q.content.correctAnswer === opt ? ' ✓' : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
          {q.type === 'TrueOrFalse' && (
            <div>
              <p className="mb-1">{q.content.statement as string}</p>
              <p className="text-sm text-green-600 font-medium">Answer: {q.content.correctAnswer ? 'True ✓' : 'False ✓'}</p>
            </div>
          )}
          {q.type === 'FillInTheBlank' && (
            <div>
              <p className="mb-1">{q.content.stem as string}</p>
              <p className="text-sm text-green-600 font-medium">Answer: {q.content.correctAnswer as string}</p>
            </div>
          )}
          {q.type === 'Essay' && (
            <div>
              <p>{q.content.prompt as string}</p>
              <p className="text-sm text-muted-foreground mt-1">Manual grading</p>
            </div>
          )}
          {q.type === 'Coding' && (
            <div>
              <p className="font-mono text-sm">{q.content.prompt as string}</p>
              <p className="text-sm text-muted-foreground mt-1">Manual grading</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function QuestionsTab({ assessmentId, isDraft }: QuestionsTabProps) {
  const addId = useId()
  const editId = useId()

  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [inputTab, setInputTab] = useState<InputTab>('manual')
  const [questionText, setQuestionText] = useState('')
  const [addType, setAddType] = useState('MultipleChoice')

  const [editPtsIdx, setEditPtsIdx] = useState<number | null>(null)
  const [ptsInput, setPtsInput] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [showFormatGuide, setShowFormatGuide] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])

  const [addPoints, setAddPoints] = useState(1)

  const [mc, setMc] = useState<McForm>(initialMc)
  const [tf, setTf] = useState<TfForm>(initialTf)
  const [fill, setFill] = useState<FillForm>(initialFill)
  const [essay, setEssay] = useState<EssayForm>(initialEssay)
  const [coding, setCoding] = useState<CodingForm>(initialCoding)

  const [errors, setErrors] = useState<Record<string, string>>(emptyErrors)
  const [dirty, setDirty] = useState(false)

  const totalScore = questions.reduce((sum, q) => sum + q.points, 0)

  const resetForms = useCallback(() => {
    setAddPoints(1)
    setMc(initialMc)
    setTf(initialTf)
    setFill(initialFill)
    setEssay(initialEssay)
    setCoding(initialCoding)
    setErrors(emptyErrors)
    setDirty(false)
  }, [])

  useEffect(() => {
    async function load() {
      const data = await getAssessmentWithQuestions(assessmentId)
      if (data && data.questions) {
        setQuestions(data.questions.map((q: { id: string; type: string; content: Record<string, unknown>; points: number }) => ({
          id: q.id, type: q.type, content: q.content, points: q.points,
        } as QuestionItem)))
      }
    }
    load()
  }, [assessmentId])

  const buildQuestion = useCallback((pts: number): QuestionItem | null => {
    switch (addType) {
      case 'MultipleChoice': {
        const opts = [mc.a, mc.b, mc.c, mc.d].filter(Boolean)
        const idx = getAnswerIndex(mc.correct)
        return { type: 'MultipleChoice', content: { stem: mc.stem.trim(), options: opts, correctAnswer: opts[idx], correctIndex: idx }, points: Math.max(1, pts) }
      }
      case 'TrueOrFalse':
        return { type: 'TrueOrFalse', content: { statement: tf.statement.trim(), correctAnswer: tf.correct === 'true' }, points: Math.max(1, pts) }
      case 'FillInTheBlank':
        return { type: 'FillInTheBlank', content: { stem: fill.stem.trim(), correctAnswer: fill.answer.trim() }, points: Math.max(1, pts) }
      case 'Essay':
        return { type: 'Essay', content: { prompt: essay.prompt.trim() }, points: Math.max(1, pts) }
      case 'Coding':
        return { type: 'Coding', content: { prompt: coding.prompt.trim() }, points: Math.max(1, pts) }
    }
    return null
  }, [addType, mc, tf, fill, essay, coding])

  async function persistQuestions(qs: QuestionItem[], silent = false) {
    const result = await saveAssessmentQuestionsAction(assessmentId, qs)
    if (!silent) {
      if (result.error) toast.error(result.error)
      else {
        toast.success(`Saved ${result.count} question${result.count !== 1 ? 's' : ''}`)
        if (result.resetCount && result.resetCount > 0) {
          toast.warning(
            `${result.resetCount} question${result.resetCount !== 1 ? 's' : ''} changed — existing answers were reset and scores recalculated.`,
            { duration: 8000 },
          )
        }
      }
    } else if (result.resetCount && result.resetCount > 0) {
      toast.warning(
        `${result.resetCount} question${result.resetCount !== 1 ? 's' : ''} changed — existing answers were reset and scores recalculated.`,
        { duration: 8000 },
      )
    }
  }

  function addManual() {
    const errs = validateFields(addType, mc, tf, fill, essay, coding)
    setErrors(errs)
    if (hasErrors(errs)) {
      toast.error('Fix the highlighted fields before adding')
      return
    }

    const q = buildQuestion(addPoints)
    if (q) {
      const updated = [...questions, q]
      setQuestions(updated)
      resetForms()
      setAddType('MultipleChoice')
      persistQuestions(updated, true)
    }
  }

  function addParsed() {
    const { questions: parsed, warnings } = parseQuestionsWithDiagnostics(questionText)
    setParseWarnings(warnings.map((w) => w.message))
    if (warnings.length > 0) {
      for (const w of warnings) {
        toast.error(w.message, { duration: 8000 })
      }
    }
    if (parsed.length > 0) {
      const updated = [...questions, ...parsed]
      setQuestions(updated)
      setQuestionText('')
      toast.success(`Added ${parsed.length} question${parsed.length !== 1 ? 's' : ''}`)
      persistQuestions(updated, true)
    }
  }

  function removeQuestion(idx: number) {
    const removed = questions[idx]
    setQuestions((prev) => prev.filter((_, i) => i !== idx))
    toast('Question removed', {
      action: {
        label: 'Undo',
        onClick: () => {
          setQuestions((prev) => {
            const restored = [...prev]
            restored.splice(idx, 0, removed)
            persistQuestions(restored, true)
            return restored
          })
        },
      },
    })
    const updated = questions.filter((_, i) => i !== idx)
    persistQuestions(updated, true)
  }

  function duplicateQuestion(idx: number) {
    const cloned = { ...questions[idx] }
    delete cloned.id
    const updated = [...questions]
    updated.splice(idx + 1, 0, cloned)
    setQuestions(updated)
    toast.success('Question duplicated')
    persistQuestions(updated, true)
  }

  function moveQuestion(fromIdx: number, toIdx: number) {
    const updated = [...questions]
    const [moved] = updated.splice(fromIdx, 1)
    updated.splice(toIdx, 0, moved)
    setQuestions(updated)
    persistQuestions(updated, true)
  }

  function openEdit(idx: number) {
    const q = questions[idx]
    setEditingIdx(idx)
    setAddType(q.type)
    resetForms()

    if (q.type === 'MultipleChoice') {
      const opts = q.content.options as string[]
      setMc({ stem: q.content.stem as string, a: opts[0] || '', b: opts[1] || '', c: opts[2] || '', d: opts[3] || '', correct: getAnswerLetter((q.content.correctIndex as number) || 0) })
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

    const errs = validateFields(addType, mc, tf, fill, essay, coding)
    setErrors(errs)
    if (hasErrors(errs)) {
      toast.error('Fix the highlighted fields before saving')
      return
    }

    const q = buildQuestion(questions[editingIdx].points)
    if (q) {
      const updated = questions.map((item, i) => (i === editingIdx ? q! : item))
      setQuestions(updated)
      setEditingIdx(null)
      setShowAddDialog(false)
      setQuestionText('')
      resetForms()
      persistQuestions(updated)
    }
  }

  function updatePoints(idx: number, pts: number) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, points: Math.max(1, pts) } : q)))
    setEditPtsIdx(null)
    const updated = [...questions]
    updated[idx] = { ...updated[idx], points: Math.max(1, pts) }
    persistQuestions(updated, true)
  }

  async function handleCopyQuestions() {
    const text = formatQuestions(questions)
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Copy failed — use a secure context or select and copy manually')
    }
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open && dirty) {
      setShowUnsavedDialog(true)
    } else if (!open) {
      setShowAddDialog(false)
      setQuestionText('')
      resetForms()
      setEditingIdx(null)
    } else {
      setShowAddDialog(true)
    }
  }

  function confirmClose() {
    setShowUnsavedDialog(false)
    setShowAddDialog(false)
    setQuestionText('')
    resetForms()
    setEditingIdx(null)
  }

  function cancelClose() {
    setShowUnsavedDialog(false)
  }

  function markDirty() {
    if (!dirty) setDirty(true)
  }

  return (
    <div>

      <div className="mb-4">
        <button
          onClick={() => { setEditingIdx(null); setErrors(emptyErrors); setDirty(false); setShowAddDialog(true) }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Add questions
        </button>
      </div>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Questions</p>
            <p className="text-xs text-muted-foreground">{questions.length} question{questions.length !== 1 ? 's' : ''} — {totalScore} total pt{totalScore !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {questions.length > 0 && (
              <button onClick={() => setPreviewMode((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                {previewMode ? <EyeOff size={12} /> : <Eye size={12} />}
                {previewMode ? 'Instructor view' : 'Student preview'}
              </button>
            )}
            {questions.length > 0 && (
              <button onClick={handleCopyQuestions}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy questions'}
              </button>
            )}
          </div>
        </div>
        <div className="px-6 py-4">
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {isDraft ? 'Click "Add questions" to get started.' : 'No questions.'}
            </p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {questions.map((q, idx) => (
                <QuestionPreview
                  key={idx}
                  question={q}
                  idx={idx}
                  previewMode={previewMode}
                  editPtsIdx={editPtsIdx}
                  ptsInput={ptsInput}
                  onPtsClick={(i, pts) => { setEditPtsIdx(i); setPtsInput(String(pts)) }}
                  onPtsChange={setPtsInput}
                  onPtsCommit={updatePoints}
                  onEdit={openEdit}
                  onDelete={removeQuestion}
                  onDuplicate={duplicateQuestion}
                  onMoveUp={(i) => moveQuestion(i, i - 1)}
                  onMoveDown={(i) => moveQuestion(i, i + 1)}
                  total={questions.length}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIdx !== null ? 'Edit question' : 'Add questions'}</DialogTitle>
            <DialogDescription>{editingIdx !== null ? 'Edit this question and save changes.' : 'Add questions one by one or paste formatted text.'}</DialogDescription>
          </DialogHeader>

          {editingIdx !== null ? (
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-muted-foreground">Type:</span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-sm text-primary">{addType}</span>
              </div>

              <QuestionFormFields
                type={addType}
                mc={mc} setMc={(v) => { setMc(v); markDirty() }}
                tf={tf} setTf={(v) => { setTf(v); markDirty() }}
                fill={fill} setFill={(v) => { setFill(v); markDirty() }}
                essay={essay} setEssay={(v) => { setEssay(v); markDirty() }}
                coding={coding} setCoding={(v) => { setCoding(v); markDirty() }}
                errors={errors}
                idPrefix={editId}
              />

              <button onClick={saveEdit}
                className="mt-4 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Save changes
              </button>
            </div>
          ) : (
            <div>
              <div className="flex rounded-md border border-border overflow-hidden mb-4">
                <button onClick={() => setInputTab('manual')}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${inputTab === 'manual' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  One by one
                </button>
                <button onClick={() => setInputTab('paste')}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${inputTab === 'paste' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  Paste text
                </button>
              </div>

              {inputTab === 'manual' && (
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <select value={addType} onChange={(e) => { setAddType(e.target.value); setErrors(emptyErrors) }}
                      className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                      {typeOrder.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="number" min={1} value={addPoints} onChange={(e) => setAddPoints(Math.max(1, Number(e.target.value)))}
                      className="w-16 h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                    <span className="text-sm text-muted-foreground">pt{addPoints !== 1 ? 's' : ''}</span>
                    <button onClick={addManual}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Plus size={14} /> Add
                    </button>
                  </div>

                  <QuestionFormFields
                    type={addType}
                    mc={mc} setMc={(v) => { setMc(v); markDirty() }}
                    tf={tf} setTf={(v) => { setTf(v); markDirty() }}
                    fill={fill} setFill={(v) => { setFill(v); markDirty() }}
                    essay={essay} setEssay={(v) => { setEssay(v); markDirty() }}
                    coding={coding} setCoding={(v) => { setCoding(v); markDirty() }}
                    errors={errors}
                    idPrefix={addId}
                  />
                </div>
              )}

              {inputTab === 'paste' && (
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Paste formatted questions using section headers.
                      </p>
                      <button onClick={() => setShowFormatGuide((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <BookOpen size={12} />
                        Format guide
                        <ChevronDown size={10} className={`transition-transform ${showFormatGuide ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {showFormatGuide && (
                      <div className="mt-3 rounded-md bg-muted/50 p-3">
                        <pre className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
{`[MultipleChoice]
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
Points: 15`}
                        </pre>
                        <p className="text-xs font-medium mt-2 mb-1">Rules</p>
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          <p>• Each question in a section is separated by a blank line</p>
                          <p>• MultipleChoice options are labeled a) b) c) d) … up to z); any count of options works</p>
                          <p>• MultipleChoice/FillInTheBlank use &ldquo;Answer:&rdquo; followed by the correct answer</p>
                          <p>• TrueOrFalse uses &ldquo;Answer: True&rdquo; or &ldquo;Answer: False&rdquo;</p>
                          <p>• Essay and Coding have no Answer line (manual grading)</p>
                          <p>• Points must be a whole number greater than 0 (defaults to 1 if omitted)</p>
                          <p>• Essay/Coding prompts may span paragraphs; end each question with its &ldquo;Points:&rdquo; line to start the next one</p>
                          <p>• Use section headers exactly as shown in brackets, with nothing after the closing bracket</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={12}
                    className="w-full min-h-[180px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs font-mono focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
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
                  {parseWarnings.length > 0 && (
                    <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-xs font-medium text-destructive mb-1">
                        {parseWarnings.length} problem{parseWarnings.length !== 1 ? 's' : ''} found:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {parseWarnings.map((w, i) => (
                          <li key={i} className="text-xs text-destructive">{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button onClick={addParsed} disabled={!questionText.trim()}
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Plus size={14} /> Add {parseQuestions(questionText).length} parsed question{parseQuestions(questionText).length !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the question form. If you close now, they will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelClose}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
