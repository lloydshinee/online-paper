'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  getAssessmentWithQuestions,
  saveAssessmentQuestionsAction,
} from '@/app/actions/assessments'
import { parseQuestions, formatQuestions } from '@/lib/question-parser'
import { Plus, Trash2, Save, Eye, Copy, Check, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { QuestionItem, InputTab } from './types'
import { typeOrder, typeLabels } from './types'

interface QuestionsTabProps {
  assessmentId: string
  isDraft: boolean
}

export default function QuestionsTab({ assessmentId, isDraft }: QuestionsTabProps) {
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [inputTab, setInputTab] = useState<InputTab>('manual')
  const [questionText, setQuestionText] = useState('')
  const [addType, setAddType] = useState('MultipleChoice')
  const [saving, setSaving] = useState(false)
  const [editPtsIdx, setEditPtsIdx] = useState<number | null>(null)
  const [ptsInput, setPtsInput] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const [addPoints, setAddPoints] = useState(1)

  const [mc, setMc] = useState({ stem: '', a: '', b: '', c: '', d: '', correct: 'a' })
  const [tf, setTf] = useState({ statement: '', correct: 'true' })
  const [fill, setFill] = useState({ stem: '', answer: '' })
  const [essay, setEssay] = useState({ prompt: '' })
  const [coding, setCoding] = useState({ prompt: '' })

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

  const totalScore = questions.reduce((sum, q) => sum + q.points, 0)

  const resetForms = useCallback(() => {
    setAddPoints(1)
    setMc({ stem: '', a: '', b: '', c: '', d: '', correct: 'a' })
    setTf({ statement: '', correct: 'true' })
    setFill({ stem: '', answer: '' })
    setEssay({ prompt: '' })
    setCoding({ prompt: '' })
  }, [])

  function addManual() {
    const pts = Math.max(1, addPoints)
    let q: QuestionItem | null = null
    switch (addType) {
      case 'MultipleChoice': {
        const opts = [mc.a, mc.b, mc.c, mc.d].filter(Boolean)
        if (!mc.stem.trim() || opts.length < 2) return
        const idx = mc.correct.charCodeAt(0) - 97
        if (idx < 0 || idx >= opts.length) return
        q = { type: 'MultipleChoice', content: { stem: mc.stem.trim(), options: opts, correctAnswer: opts[idx], correctIndex: idx }, points: pts }
        break
      }
      case 'TrueOrFalse':
        if (!tf.statement.trim()) return
        q = { type: 'TrueOrFalse', content: { statement: tf.statement.trim(), correctAnswer: tf.correct === 'true' }, points: pts }
        break
      case 'FillInTheBlank':
        if (!fill.stem.trim() || !fill.answer.trim()) return
        q = { type: 'FillInTheBlank', content: { stem: fill.stem.trim(), correctAnswer: fill.answer.trim() }, points: pts }
        break
      case 'Essay':
        if (!essay.prompt.trim()) return
        q = { type: 'Essay', content: { prompt: essay.prompt.trim() }, points: pts }
        break
      case 'Coding':
        if (!coding.prompt.trim()) return
        q = { type: 'Coding', content: { prompt: coding.prompt.trim() }, points: pts }
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
      const updated = questions.map((item, i) => (i === editingIdx ? q! : item))
      setQuestions(updated)
      setEditingIdx(null)
      setShowAddDialog(false)
      setQuestionText('')
      resetForms()
      handleSave(updated)
    }
  }

  function updatePoints(idx: number, pts: number) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, points: Math.max(1, pts) } : q)))
    setEditPtsIdx(null)
  }

  async function handleSave(overrideQuestions?: QuestionItem[]) {
    setSaving(true)
    const qs = overrideQuestions ?? questions
    const result = await saveAssessmentQuestionsAction(assessmentId, qs)
    if (result.error) toast.error(result.error)
    else toast.success(`Saved ${result.count} question${result.count !== 1 ? 's' : ''}`)
    setSaving(false)
  }

  function handleCopyQuestions() {
    const text = formatQuestions(questions)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
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
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Questions</p>
            <p className="text-xs text-muted-foreground">{questions.length} question{questions.length !== 1 ? 's' : ''} — {totalScore} total pt{totalScore !== 1 ? 's' : ''}</p>
          </div>
          {questions.length > 0 && (
            <button onClick={handleCopyQuestions}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy questions'}
            </button>
          )}
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
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" type="button"
                        aria-label={`Edit question ${idx + 1}`}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => removeQuestion(idx)}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors" type="button"
                        aria-label={`Delete question ${idx + 1}`}>
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
                    <input type="number" min={1} value={addPoints} onChange={(e) => setAddPoints(Math.max(1, Number(e.target.value)))}
                      className="w-16 h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                    <span className="text-xs text-muted-foreground">pt{addPoints !== 1 ? 's' : ''}</span>
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
  )
}
