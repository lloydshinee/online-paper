import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Suspense, type ReactNode } from 'react'

const actions = vi.hoisted(() => ({
  startAssessmentAction: vi.fn(),
  saveAnswerAction: vi.fn(),
  submitAssessmentAction: vi.fn(),
  expireAssessmentAction: vi.fn(),
  getAssessmentData: vi.fn(),
  getSubmissionResultsAction: vi.fn(),
  getSubmissionHistoryAction: vi.fn(),
  getActiveSubmissionAction: vi.fn(),
  recordViolationAction: vi.fn(),
  getRemainingTimeAction: vi.fn(),
}))

vi.mock('@/app/actions/timed-assessment', () => actions)

const searchParamsGet = vi.hoisted(() => vi.fn<(key: string) => string | null>(() => null))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => ({ get: searchParamsGet }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

vi.mock('@/components/dashboard-header', () => ({
  default: () => <div>dashboard-header</div>,
}))

import TakeAssessmentPage from '@/app/(dashboard)/dashboard/student/classes/[id]/assessments/[assessmentId]/page'

const assessmentInfo = {
  id: 'assessment-1',
  class_id: 'class-1',
  title: 'Test Assessment',
  mode: 'timed',
  state: 'active',
  duration_minutes: 30,
  scores_released: false,
  answer_reveal_enabled: false,
  proctoring_violations_allowed: 3,
}

const questions = [
  { id: 'q1', type: 'MultipleChoice', content: { stem: 'What is 2+2?', options: ['3', '4', '5', '6'] }, points: 2, order_index: 0 },
  { id: 'q2', type: 'TrueOrFalse', content: { statement: 'The sky is blue.' }, points: 1, order_index: 1 },
]

const noSubmissionResults = {
  resultStatus: 'no-submission',
  assessment: { title: 'Test Assessment', scores_released: false, answer_reveal_enabled: false, total_points: 3 },
  submission: null,
  answers: null,
}

const hiddenResults = {
  resultStatus: 'hidden',
  assessment: { title: 'Test Assessment', scores_released: false, answer_reveal_enabled: false, total_points: 3 },
  submission: { id: 'sub-1', status: 'submitted', score_total: null, submitted_at: '2026-08-16T00:00:00.000Z' },
  answers: [],
}

const releasedNoRevealResults = {
  resultStatus: 'released',
  assessment: { title: 'Test Assessment', scores_released: true, answer_reveal_enabled: false, total_points: 3 },
  submission: { id: 'sub-1', status: 'submitted', score_total: 3, submitted_at: '2026-08-16T00:00:00.000Z' },
  answers: [],
}

const releasedRevealResults = {
  ...releasedNoRevealResults,
  assessment: { title: 'Test Assessment', scores_released: true, answer_reveal_enabled: true, total_points: 3 },
}

function renderPage() {
  // Next.js resolves the params promise before the page renders; a
  // pre-fulfilled thenable mirrors that (a plain Promise keeps `use()`
  // suspended until some unrelated re-render).
  const params = {
    then: () => {},
    status: 'fulfilled',
    value: { id: 'class-1', assessmentId: 'assessment-1' },
  } as unknown as Promise<{ id: string; assessmentId: string }>
  return render(
    <Suspense fallback={null}>
      <TakeAssessmentPage params={params} />
    </Suspense>,
  )
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function goToSubmit() {
  await screen.findByText('Test Assessment')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }))
  await screen.findByText(/questions unanswered/)
  fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  searchParamsGet.mockReturnValue(null)
  actions.getSubmissionResultsAction
    .mockResolvedValueOnce(noSubmissionResults)
    .mockResolvedValue(hiddenResults)
  actions.getActiveSubmissionAction.mockResolvedValue(null)
  actions.getAssessmentData.mockResolvedValue({
    error: null,
    assessment: assessmentInfo,
    questions,
    timeLimit: null,
  })
  actions.startAssessmentAction.mockResolvedValue({
    error: null,
    submissionId: 'sub-1',
    // Server-authoritative start time; the countdown seeds from this, not
    // from Date.now() (see adoptServerRemainingTime / extraSecondsRef).
    startedAt: new Date('2026-08-17T12:00:00.000Z').toISOString(),
    extraSeconds: 0,
  })
  actions.getSubmissionHistoryAction.mockResolvedValue([])
  actions.getRemainingTimeAction.mockResolvedValue({ error: null, remainingSeconds: 600, extraSeconds: 0, overdue: false, deadline: Date.now() + 600_000 })
  actions.expireAssessmentAction.mockResolvedValue({ error: null, submission: { id: 'sub-1', extra_seconds: 0, status: 'expired' }, overdue: true, remainingSeconds: 0, deadline: null })
  actions.recordViolationAction.mockResolvedValue({ violations: 1, error: null })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('timed assessment take page', () => {
  test('a submit that loses the race converges to the results view', async () => {
    actions.submitAssessmentAction.mockResolvedValue({
      error: 'Assessment already submitted',
      submission: null,
    })

    renderPage()
    await goToSubmit()

    await screen.findByText('Scores not yet released')
    expect(screen.queryByText('Submit Assessment')).toBeNull()
  })

  test('a losing submit whose results fetch fails shows the refresh notice', async () => {
    actions.submitAssessmentAction.mockResolvedValue({
      error: 'Assessment already submitted',
      submission: null,
    })
    actions.getSubmissionResultsAction
      .mockReset()
      .mockResolvedValueOnce(noSubmissionResults)
      .mockResolvedValue(null)

    renderPage()
    await goToSubmit()

    await screen.findByText(/Results unavailable/)
    expect(screen.queryByText('Scores not yet released')).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit Assessment' })).toBeDefined()
  })

  test('a non-race submit error keeps the student on the take page', async () => {
    actions.submitAssessmentAction.mockResolvedValue({
      error: 'Something went wrong',
      submission: null,
    })

    renderPage()
    await goToSubmit()

    await screen.findByText('Something went wrong')
    expect(screen.getByRole('button', { name: 'Submit Assessment' })).toBeDefined()
  })

  test('score release without answer reveal shows only the total score', async () => {
    actions.submitAssessmentAction.mockResolvedValue({ error: null, submission: null })
    actions.getSubmissionResultsAction
      .mockReset()
      .mockResolvedValueOnce(noSubmissionResults)
      .mockResolvedValue(releasedNoRevealResults)

    renderPage()
    await goToSubmit()

    await screen.findByText('Score Summary')
    expect(screen.queryByText('Question Breakdown')).toBeNull()
    expect(screen.queryByText('Correct Answer')).toBeNull()
  })

  test('score release with answer reveal shows the per-question breakdown', async () => {
    actions.submitAssessmentAction.mockResolvedValue({ error: null, submission: null })
    actions.getSubmissionResultsAction
      .mockReset()
      .mockResolvedValueOnce(noSubmissionResults)
      .mockResolvedValue(releasedRevealResults)

    renderPage()
    await goToSubmit()

    await screen.findByText('Question Breakdown')
    expect(screen.getByText('Correct Answer')).toBeDefined()
  })

  test('poll adoption jumps the countdown and shows the extension banner', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))

    actions.getAssessmentData.mockResolvedValue({
      error: null,
      assessment: assessmentInfo,
      questions,
      timeLimit: 1,
    })
    actions.getRemainingTimeAction.mockResolvedValue({
      error: null,
      remainingSeconds: 180,
      extraSeconds: 120,
      overdue: false,
      deadline: new Date('2026-08-17T12:03:00.000Z').getTime(),
    })

    renderPage()
    await flushPromises()
    expect(screen.getByText('01:00')).toBeDefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await flushPromises()

    expect(screen.getByText('03:00')).toBeDefined()
    expect(screen.getByText('Instructor added 2 min')).toBeDefined()
  })

  test('a later server deadline with an unchanged grant counter stays silent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))

    actions.startAssessmentAction.mockResolvedValue({
      error: null,
      submissionId: 'sub-1',
      startedAt: new Date('2026-08-17T12:00:00.000Z').toISOString(),
      extraSeconds: 0,
    })
    actions.getAssessmentData.mockResolvedValue({
      error: null,
      assessment: assessmentInfo,
      questions,
      timeLimit: 30,
    })
    // First poll: ordinary clock convergence — the server deadline sits a
    // few seconds later than the seeded one, but nothing was granted.
    actions.getRemainingTimeAction
      .mockResolvedValueOnce({
        error: null,
        remainingSeconds: 1795,
        extraSeconds: 0,
        overdue: false,
        deadline: new Date('2026-08-17T12:30:05.000Z').getTime(),
      })
      .mockResolvedValue({
        error: null,
        remainingSeconds: 1905,
        extraSeconds: 120,
        overdue: false,
        deadline: new Date('2026-08-17T12:32:05.000Z').getTime(),
      })

    renderPage()
    await flushPromises()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await flushPromises()

    expect(screen.getByText('29:55')).toBeDefined()
    expect(screen.queryByText(/Instructor added/)).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await flushPromises()

    // A real grant still announces, sized by the granted delta.
    expect(screen.getByText('Instructor added 2 min')).toBeDefined()
    expect(screen.getByText('31:45')).toBeDefined()
  })

  test('stale zero timer does not submit when the server says not overdue', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))

    actions.getAssessmentData.mockResolvedValue({
      error: null,
      assessment: assessmentInfo,
      questions,
      timeLimit: 1,
    })
    actions.getRemainingTimeAction.mockResolvedValue({
      error: null,
      remainingSeconds: 60,
      extraSeconds: 0,
      overdue: false,
      deadline: new Date('2026-08-17T12:01:00.000Z').getTime(),
    })
    actions.expireAssessmentAction.mockResolvedValue({
      error: null,
      submission: { id: 'sub-1', extra_seconds: 120, status: 'in_progress' },
      overdue: false,
      remainingSeconds: 120,
      deadline: new Date('2026-08-17T12:02:00.000Z').getTime(),
    })

    renderPage()
    await flushPromises()
    expect(screen.getByText('01:00')).toBeDefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await flushPromises()

    expect(screen.getByText('02:00')).toBeDefined()
    expect(actions.submitAssessmentAction).not.toHaveBeenCalled()
    expect(screen.getByText('Instructor added 2 min')).toBeDefined()
  })

  test('violation path still submits through forced expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'))

    actions.getAssessmentData.mockResolvedValue({
      error: null,
      assessment: assessmentInfo,
      questions,
      timeLimit: 30,
    })
    actions.recordViolationAction.mockResolvedValue({ violations: 3, error: null })
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    actions.getSubmissionResultsAction
      .mockReset()
      .mockResolvedValueOnce(noSubmissionResults)
      .mockResolvedValue(hiddenResults)

    renderPage()
    await flushPromises()
    expect(screen.getByText('30:00')).toBeDefined()

    try {
      fireEvent(document, new Event('visibilitychange'))
      fireEvent(document, new Event('visibilitychange'))
      fireEvent(document, new Event('visibilitychange'))

      await act(async () => {
        await Promise.resolve()
      })
      expect(actions.expireAssessmentAction).toHaveBeenCalledWith('sub-1', true)
    } finally {
      if (hiddenDescriptor) {
        Object.defineProperty(document, 'hidden', hiddenDescriptor)
      }
    }
  })
})

describe('retake confirm gate', () => {
  function historyItem(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'sub-9',
      attempt_number: 1,
      score_total: 7,
      status: 'submitted',
      submitted_at: '2026-08-16T00:00:00.000Z',
      started_at: '2026-08-16T00:00:00.000Z',
      ...overrides,
    }
  }

  test('retake visit with prior finished attempts shows the gate and starts only on explicit click', async () => {
    searchParamsGet.mockReturnValue('1')
    actions.getSubmissionHistoryAction.mockResolvedValue([historyItem()])

    renderPage()
    await screen.findByText(/Your previous attempt: 7 pts/)

    expect(screen.getByRole('button', { name: 'Start attempt #2' })).toBeDefined()
    expect(actions.startAssessmentAction).not.toHaveBeenCalled()
    expect(actions.getAssessmentData).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Start attempt #2' }))

    await screen.findByText('What is 2+2?')
    expect(actions.startAssessmentAction).toHaveBeenCalledWith('assessment-1', true)
  })

  test('a crafted retake URL with no prior submissions behaves like a normal first start', async () => {
    searchParamsGet.mockReturnValue('1')
    actions.getSubmissionHistoryAction.mockResolvedValue([])

    renderPage()

    await screen.findByText('What is 2+2?')
    expect(screen.queryByText(/previous attempt/i)).toBeNull()
    expect(actions.startAssessmentAction).toHaveBeenCalledWith('assessment-1', true)
  })

  test('the gate hides the previous score while scores are unreleased', async () => {
    searchParamsGet.mockReturnValue('1')
    actions.getSubmissionHistoryAction.mockResolvedValue([historyItem({ score_total: null })])

    renderPage()

    await screen.findByRole('button', { name: 'Start attempt #2' })
    expect(screen.getByText(/previous attempt on record/)).toBeDefined()
    expect(screen.queryByText(/\d+ pts/)).toBeNull()
  })

  test('first-time starts without the retake flag never show the gate', async () => {
    actions.getSubmissionResultsAction
      .mockReset()
      .mockResolvedValueOnce(noSubmissionResults)

    renderPage()

    await screen.findByText('What is 2+2?')
    expect(screen.queryByText(/previous attempt/i)).toBeNull()
    expect(actions.startAssessmentAction).toHaveBeenCalledWith('assessment-1', false)
  })
})

vi.mock('@/components/use-current-user-profile', () => ({
  useCurrentUserProfile: () => null,
  profileDisplayName: () => 'Test User',
}))
