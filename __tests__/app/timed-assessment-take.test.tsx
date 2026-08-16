import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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
}))

vi.mock('@/app/actions/timed-assessment', () => actions)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
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

async function goToSubmit() {
  await screen.findByText('Test Assessment')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }))
  await screen.findByText(/questions unanswered/)
  fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
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
  actions.startAssessmentAction.mockResolvedValue({ error: null, submissionId: 'sub-1' })
  actions.getSubmissionHistoryAction.mockResolvedValue([])
})

afterEach(() => {
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
})
