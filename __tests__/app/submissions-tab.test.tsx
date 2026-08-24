import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import SubmissionsTab from '@/app/(dashboard)/dashboard/instructor/classes/[id]/assessments/[assessmentId]/_components/submissions-tab'

const gradingActions = vi.hoisted(() => ({
  getAssessmentSubmissions: vi.fn(),
  getSubmissionDetail: vi.fn(),
  deleteSubmissionAction: vi.fn(),
}))

const timedAssessmentActions = vi.hoisted(() => ({
  grantTimeAction: vi.fn(),
}))

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/app/actions/grading', () => gradingActions)
vi.mock('@/app/actions/timed-assessment', () => timedAssessmentActions)
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils')
  return {
    ...actual,
    copyToClipboard: vi.fn().mockResolvedValue(true),
  }
})
vi.mock('@/app/(dashboard)/dashboard/instructor/classes/[id]/assessments/[assessmentId]/_components/grading-panel', () => ({
  default: () => <div>grading-panel</div>,
}))

const baseSubmissions = [
  {
    id: 'sub-in-progress',
    assessment_id: 'assessment-1',
    student_id: 'student-1',
    started_at: '2026-08-17T10:00:00.000Z',
    submitted_at: null,
    status: 'in_progress',
    score_total: null,
    violations: 0,
    student_name: 'Ada Lovelace',
    student_email: 'ada@example.com',
    pending_count: 1,
    extra_seconds: 300,
    remaining_seconds: 125,
  },
  {
    id: 'sub-latest-finished',
    assessment_id: 'assessment-1',
    student_id: 'student-1',
    started_at: '2026-08-17T09:00:00.000Z',
    submitted_at: '2026-08-17T09:30:00.000Z',
    status: 'submitted',
    score_total: 92,
    violations: 0,
    student_name: 'Ada Lovelace',
    student_email: 'ada@example.com',
    pending_count: 0,
    extra_seconds: 0,
    remaining_seconds: null,
  },
  {
    id: 'sub-older-finished',
    assessment_id: 'assessment-1',
    student_id: 'student-1',
    started_at: '2026-08-17T08:00:00.000Z',
    submitted_at: '2026-08-17T08:30:00.000Z',
    status: 'expired',
    score_total: 80,
    violations: 2,
    student_name: 'Ada Lovelace',
    student_email: 'ada@example.com',
    pending_count: 0,
    extra_seconds: 0,
    remaining_seconds: null,
  },
]

function mockListing(submissions = baseSubmissions) {
  gradingActions.getAssessmentSubmissions.mockResolvedValue({
    submissions,
    total: submissions.length,
    error: null,
  })
}

async function openAttemptsDialog() {
  await screen.findByText('Ada Lovelace')
  fireEvent.click(screen.getByRole('button', { name: /view/i }))
  await screen.findByText('3 attempts')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListing()
  gradingActions.getSubmissionDetail.mockResolvedValue(null)
  gradingActions.deleteSubmissionAction.mockResolvedValue({ error: null })
  timedAssessmentActions.grantTimeAction.mockResolvedValue({ error: null, submission: { id: 'sub-in-progress' } })
})

afterEach(() => {
  cleanup()
})

describe('submissions tab', () => {
  test('renders remaining time, time added chip, and add time only for eligible attempts', async () => {
    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    expect(screen.getByText('2m 5s left')).toBeDefined()
    expect(screen.getByText('Time added: 5 min added')).toBeDefined()
    expect(screen.getAllByRole('button', { name: /add time/i })).toHaveLength(2)
    expect(screen.queryByText('Attempt 1')).toBeDefined()
  })

  test('validates custom input and submits a preset without reopen warning for in-progress attempts', async () => {
    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /add time/i })[0])
    await screen.findByLabelText('Custom minutes')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByText('Enter a valid number of minutes greater than zero')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByText('Enter a valid number of minutes greater than zero')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '10m' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(timedAssessmentActions.grantTimeAction).toHaveBeenCalledWith('sub-in-progress', 10)
    })
    expect(screen.queryByText('Re-open this attempt?')).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('Added 10 minutes')
  })

  test('shows the reopen warning for finished attempts and confirms through to the action call', async () => {
    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /add time/i })[1])
    await screen.findByLabelText('Custom minutes')

    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await screen.findByText('Re-open this attempt?')
    expect(screen.getByText(/clears auto-grades/i)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /re-open and add time/i }))

    await waitFor(() => {
      expect(timedAssessmentActions.grantTimeAction).toHaveBeenCalledWith('sub-latest-finished', 7)
    })
  })

  test('shows an error toast and refreshes data when the grant fails', async () => {
    timedAssessmentActions.grantTimeAction.mockResolvedValue({ error: 'Grant failed', submission: null })
    mockListing()

    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /add time/i })[0])
    await screen.findByLabelText('Custom minutes')

    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(timedAssessmentActions.grantTimeAction).toHaveBeenCalledWith('sub-in-progress', 3)
    })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Grant failed')
    })
    expect(gradingActions.getAssessmentSubmissions).toHaveBeenCalledTimes(2)
  })
})

describe('submissions tab attempt deletion', () => {
  function queueListingAfterDelete(remaining = baseSubmissions) {
    gradingActions.getAssessmentSubmissions
      .mockResolvedValueOnce({ submissions: baseSubmissions, total: baseSubmissions.length, error: null })
      .mockResolvedValue({ submissions: remaining, total: remaining.length, error: null })
  }

  test('deleting an In Progress attempt warns, confirms, deletes, and refreshes the list', async () => {
    const remaining = baseSubmissions.filter((s) => s.id !== 'sub-in-progress')
    queueListingAfterDelete(remaining)

    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0])

    await screen.findByText('Delete this attempt?')
    expect(screen.getByText(/may be answering right now/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => {
      expect(gradingActions.deleteSubmissionAction).toHaveBeenCalledWith('sub-in-progress')
    })
    await waitFor(() => {
      expect(screen.getByText('2 attempts')).toBeDefined()
    })
    expect(toast.success).toHaveBeenCalledWith('Attempt deleted')
  })

  test('deleting a finished attempt shows no in-progress warning and calls the action', async () => {
    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[2])

    await screen.findByText('Delete this attempt?')
    expect(screen.queryByText(/answering right now/)).toBeNull()
    expect(screen.getByText(/regardless of the retakes setting/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => {
      expect(gradingActions.deleteSubmissionAction).toHaveBeenCalledWith('sub-older-finished')
    })
  })

  test('cancelling the confirmation leaves the attempt untouched', async () => {
    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[1])
    await screen.findByText('Delete this attempt?')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('3 attempts')).toBeDefined()
    expect(gradingActions.deleteSubmissionAction).not.toHaveBeenCalled()
  })

  test('delete all confirms once with the warning and removes every attempt, closing the dialog', async () => {
    queueListingAfterDelete([])

    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getByRole('button', { name: /delete all attempts/i }))

    await screen.findByText('Delete all attempts?')
    expect(screen.getByText(/may be answering right now/)).toBeDefined()
    expect(screen.getByText(/all 3 attempts/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete all' }))

    await waitFor(() => {
      expect(gradingActions.deleteSubmissionAction).toHaveBeenCalledTimes(3)
    })
    expect(gradingActions.deleteSubmissionAction).toHaveBeenCalledWith('sub-in-progress')
    expect(gradingActions.deleteSubmissionAction).toHaveBeenCalledWith('sub-latest-finished')
    expect(gradingActions.deleteSubmissionAction).toHaveBeenCalledWith('sub-older-finished')

    // The student has no attempts left, so the dialog closes entirely.
    await waitFor(() => {
      expect(screen.queryByText('3 attempts')).toBeNull()
    })
    expect(toast.success).toHaveBeenCalledWith('3 attempts deleted')
  })

  test('a failed delete surfaces the server error and keeps the dialog usable', async () => {
    gradingActions.deleteSubmissionAction.mockResolvedValue({ error: 'Not authorized' })

    render(<SubmissionsTab assessmentId="assessment-1" assessmentMode="timed" />)

    await openAttemptsDialog()

    fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0])
    await screen.findByText('Delete this attempt?')

    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Not authorized')
    })
  })
})
