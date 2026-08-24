import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import SettingsTab from '@/app/(dashboard)/dashboard/instructor/classes/[id]/assessments/[assessmentId]/_components/settings-tab'

const assessmentActions = vi.hoisted(() => ({
  publishAssessmentAction: vi.fn(),
  unpublishAssessmentAction: vi.fn(),
  closeAssessmentAction: vi.fn(),
  deleteAssessmentAction: vi.fn(),
  updateAssessmentSettingsAction: vi.fn(),
  getAssessmentWithQuestions: vi.fn(),
}))

const gradingActions = vi.hoisted(() => ({
  getAssessmentSubmissions: vi.fn(),
}))

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/app/actions/assessments', () => assessmentActions)
vi.mock('@/app/actions/grading', () => gradingActions)
vi.mock('sonner', () => ({ toast }))

const baseAssessment = {
  id: 'assessment-1',
  class_id: 'class-1',
  title: 'Midterm Exam',
  mode: 'timed',
  state: 'draft',
  duration_minutes: 30,
  passing_score: null as number | null,
  scores_released: false,
  answer_reveal_enabled: false,
  accepting_submissions: true,
  retakes_allowed: false,
}

function renderTab(assessment = baseAssessment) {
  return render(
    <SettingsTab
      assessmentId="assessment-1"
      classId="class-1"
      assessment={assessment}
      onAssessmentUpdate={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
}

function passingScoreInput() {
  return screen.getByLabelText('Passing score (%)') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  gradingActions.getAssessmentSubmissions.mockResolvedValue({ submissions: [], total: 0, error: null })
})

afterEach(() => {
  cleanup()
})

describe('settings tab passing score', () => {
  test('renders the current passing score', () => {
    renderTab({ ...baseAssessment, passing_score: 75 })
    expect(passingScoreInput().value).toBe('75')
  })

  test('renders blank when no threshold is set', () => {
    renderTab()
    expect(passingScoreInput().value).toBe('')
  })

  test('saves an edited integer value on blur', async () => {
    assessmentActions.updateAssessmentSettingsAction.mockResolvedValue({
      error: null,
      assessment: { ...baseAssessment, passing_score: 80 },
    })

    renderTab()
    fireEvent.change(passingScoreInput(), { target: { value: '80' } })
    fireEvent.blur(passingScoreInput())

    await waitFor(() => {
      expect(assessmentActions.updateAssessmentSettingsAction).toHaveBeenCalledWith('assessment-1', { passing_score: 80 })
    })
    expect(toast.success).toHaveBeenCalledWith('Settings updated')
  })

  test('clearing the field saves null meaning no threshold', async () => {
    assessmentActions.updateAssessmentSettingsAction.mockResolvedValue({
      error: null,
      assessment: { ...baseAssessment, passing_score: null },
    })

    renderTab({ ...baseAssessment, passing_score: 75 })
    fireEvent.change(passingScoreInput(), { target: { value: '' } })
    fireEvent.blur(passingScoreInput())

    await waitFor(() => {
      expect(assessmentActions.updateAssessmentSettingsAction).toHaveBeenCalledWith('assessment-1', { passing_score: null })
    })
    expect(toast.success).toHaveBeenCalledWith('Settings updated')
  })

  test('rejects out-of-range values with a clear message without saving', async () => {
    renderTab()
    fireEvent.change(passingScoreInput(), { target: { value: '150' } })
    fireEvent.blur(passingScoreInput())

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Passing score must be an integer between 0 and 100')
    })
    expect(assessmentActions.updateAssessmentSettingsAction).not.toHaveBeenCalled()
  })

  test('rejects negative values with a clear message without saving', async () => {
    renderTab()
    fireEvent.change(passingScoreInput(), { target: { value: '-5' } })
    fireEvent.blur(passingScoreInput())

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Passing score must be an integer between 0 and 100')
    })
    expect(assessmentActions.updateAssessmentSettingsAction).not.toHaveBeenCalled()
  })

  test('rejects non-integer values with a clear message without saving', async () => {
    renderTab()
    fireEvent.change(passingScoreInput(), { target: { value: '12.5' } })
    fireEvent.blur(passingScoreInput())

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Passing score must be an integer between 0 and 100')
    })
    expect(assessmentActions.updateAssessmentSettingsAction).not.toHaveBeenCalled()
  })
})
