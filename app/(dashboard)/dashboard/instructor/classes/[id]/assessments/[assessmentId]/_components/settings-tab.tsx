'use client'

import { useState } from 'react'
import {
  publishAssessmentAction,
  unpublishAssessmentAction,
  closeAssessmentAction,
  deleteAssessmentAction,
  updateAssessmentSettingsAction,
} from '@/app/actions/assessments'
import { getAssessmentSubmissions } from '@/app/actions/grading'
import { AlertTriangle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { AssessmentInfo } from './types'

interface SettingsTabProps {
  assessmentId: string
  classId: string
  assessment: AssessmentInfo
  onAssessmentUpdate: (assessment: AssessmentInfo) => void
  onDelete: () => void
}

export default function SettingsTab({ assessmentId, classId, assessment, onAssessmentUpdate, onDelete }: SettingsTabProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(assessment.title)
  const [settingsDuration, setSettingsDuration] = useState(assessment.duration_minutes?.toString() ?? '')
  const [scoresReleased, setScoresReleased] = useState(assessment.scores_released ?? false)
  const [answerRevealed, setAnswerRevealed] = useState(assessment.answer_reveal_enabled ?? false)
  const [acceptingSubmissions, setAcceptingSubmissions] = useState(assessment.accepting_submissions ?? true)
  const [retakesAllowed, setRetakesAllowed] = useState(assessment.retakes_allowed ?? false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [showReleaseWarning, setShowReleaseWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isDraft = assessment.state === 'draft'
  const isActive = assessment.state === 'active'

  async function handlePublish() {
    const result = await publishAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else onAssessmentUpdate({ ...assessment, state: 'active' })
  }

  async function handleUnpublish() {
    const result = await unpublishAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else onAssessmentUpdate({ ...assessment, state: 'draft' })
  }

  async function handleDelete() {
    const result = await deleteAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else onDelete()
  }

  async function handleClose() {
    const result = await closeAssessmentAction(assessmentId, classId)
    if (result.error) setError(result.error)
    else onAssessmentUpdate({ ...assessment, state: 'closed' })
  }

  async function saveSetting(updates: Record<string, unknown>) {
    setError(null); setSuccess(null)
    const result = await updateAssessmentSettingsAction(assessmentId, updates as Parameters<typeof updateAssessmentSettingsAction>[1])
    if (result.error) setError(result.error)
    else if (result.assessment) {
      onAssessmentUpdate(result.assessment)
      setScoresReleased(result.assessment.scores_released)
      setAnswerRevealed(result.assessment.answer_reveal_enabled)
      setAcceptingSubmissions(result.assessment.accepting_submissions)
      setRetakesAllowed(result.assessment.retakes_allowed)
      setSuccess('Settings updated')
    }
  }

  async function handleSaveTitle() {
    setError(null); setSuccess(null)
    if (titleInput.trim() === assessment.title) { setEditingTitle(false); return }
    const result = await updateAssessmentSettingsAction(assessmentId, { title: titleInput.trim() })
    if (result.error) setError(result.error)
    else if (result.assessment) {
      onAssessmentUpdate(result.assessment)
      setTitleInput(result.assessment.title)
      setEditingTitle(false)
    }
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-green-100 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">{success}</div>}

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
            <Switch
              checked={!isDraft}
              onCheckedChange={(checked) => { checked ? handlePublish() : handleUnpublish() }}
              aria-label="Publish assessment"
            />
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Title</label>
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} maxLength={200}
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
                <button onClick={handleSaveTitle}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Save</button>
                <button onClick={() => { setTitleInput(assessment.title); setEditingTitle(false) }}
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
          {assessment.mode === 'timed' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Duration (minutes)</label>
              <input type="number" min="1" value={settingsDuration}
                onChange={(e) => setSettingsDuration(e.target.value)}
                onBlur={() => {
                  const dur = settingsDuration ? parseInt(settingsDuration) : null
                  if (dur !== assessment.duration_minutes) saveSetting({ duration_minutes: dur })
                }}
                className="w-24 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          )}

          {/* Score release */}
          <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
            <div>
              <p className="text-sm font-medium">Release scores</p>
              <p className="text-xs text-muted-foreground">Students can see their scores</p>
            </div>
            <Switch
              checked={scoresReleased}
              onCheckedChange={async (checked) => {
                if (checked) {
                  const { submissions } = await getAssessmentSubmissions(assessmentId, 100, 0)
                  const hasPending = submissions.some((s) => s.pending_count > 0)
                  if (hasPending) {
                    setShowReleaseWarning(true)
                    return
                  }
                }
                setScoresReleased(checked)
                saveSetting({ scores_released: checked })
              }}
              aria-label="Release scores"
            />
          </div>

          {/* Answer reveal */}
          <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
            <div>
              <p className="text-sm font-medium">Show answers</p>
              <p className="text-xs text-muted-foreground">Students can see correct answers</p>
            </div>
            <Switch
              checked={answerRevealed}
              onCheckedChange={(checked) => {
                setAnswerRevealed(checked)
                saveSetting({ answer_reveal_enabled: checked })
              }}
              aria-label="Show answers"
            />
          </div>

          {/* Accepting submissions */}
          <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
            <div>
              <p className="text-sm font-medium">Accept submissions</p>
              <p className="text-xs text-muted-foreground">Students can start/take this assessment</p>
            </div>
            <Switch
              checked={acceptingSubmissions}
              onCheckedChange={(checked) => {
                setAcceptingSubmissions(checked)
                saveSetting({ accepting_submissions: checked })
              }}
              aria-label="Accept submissions"
            />
          </div>

          {/* Allow retakes */}
          <div className={`flex items-center justify-between py-1 ${isDraft ? 'opacity-40 pointer-events-none' : ''}`}>
            <div>
              <p className="text-sm font-medium">Allow retakes</p>
              <p className="text-xs text-muted-foreground">Students who submitted can retake</p>
            </div>
            <Switch
              checked={retakesAllowed}
              onCheckedChange={(checked) => {
                setRetakesAllowed(checked)
                saveSetting({ retakes_allowed: checked })
              }}
              aria-label="Allow retakes"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-border px-6 py-4 flex items-center gap-2">
          {isActive && (
            <button onClick={() => setShowCloseDialog(true)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              Close assessment
            </button>
          )}
          <button onClick={() => setShowDeleteDialog(true)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
            Delete assessment
          </button>
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

      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close assessment</DialogTitle>
            <DialogDescription>
              Are you sure you want to close &ldquo;{assessment.title}&rdquo;? Students will no longer be able to take or submit this assessment. Existing submissions will remain accessible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowCloseDialog(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={() => { setShowCloseDialog(false); handleClose() }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Close assessment
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReleaseWarning} onOpenChange={setShowReleaseWarning}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-600" />
              Ungraded answers
            </DialogTitle>
            <DialogDescription>
              Some submissions have essay or coding answers that have not been graded yet. Students will see these as 0 points if you release scores now. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowReleaseWarning(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={() => { setShowReleaseWarning(false); setScoresReleased(true); saveSetting({ scores_released: true }) }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Release anyway
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
