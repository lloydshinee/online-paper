import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import SubmissionsTab from '@/app/(dashboard)/dashboard/instructor/classes/[id]/assessments/[assessmentId]/_components/submissions-tab'

const gradingActions = vi.hoisted(() => ({
  getAssessmentSubmissions: vi.fn(),
  getSubmissionDetail: vi.fn(),
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
