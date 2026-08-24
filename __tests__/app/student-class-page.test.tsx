import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

const auth = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const classActions = vi.hoisted(() => ({
  getStudentEnrolledClasses: vi.fn(),
}))

const assessmentActions = vi.hoisted(() => ({
  getStudentClassAssessments: vi.fn(),
}))

vi.mock('@/lib/auth/require-auth', () => auth)

vi.mock('@/app/actions/classes', () => classActions)

vi.mock('@/app/actions/timed-assessment', () => assessmentActions)

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not found')
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/dashboard-header', () => ({
  default: () => <div>dashboard-header</div>,
}))

vi.mock('@/app/(dashboard)/dashboard/student/notification-bell', () => ({
  NotificationBell: () => <div>notification-bell</div>,
}))

import StudentClassPage from '@/app/(dashboard)/dashboard/student/classes/[id]/page'

function submissionSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'submitted',
    score_total: 7,
    has_in_progress: false,
    has_finished_attempt: true,
    ...overrides,
  }
}

function assessment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a-1',
    class_id: 'class-1',
    title: 'Timed Assessment',
    mode: 'timed',
    state: 'active',
    duration_minutes: 30,
    accepting_submissions: true,
    scores_released: true,
    answer_reveal_enabled: false,
    retakes_allowed: true,
    created_at: '2026-08-01T00:00:00.000Z',
    submission: submissionSummary(),
    ...overrides,
  }
}

async function renderPage() {
  const ui = await StudentClassPage({ params: Promise.resolve({ id: 'class-1' }) })
  render(ui)
}

beforeEach(() => {
  auth.requireAuth.mockResolvedValue({
    firstname: 'Test',
    lastname: 'Student',
    email: 'test-student@example.com',
    avatar_url: null,
  })
  classActions.getStudentEnrolledClasses.mockResolvedValue({
    classes: [{ id: 'class-1', name: 'Test Class' }],
  })
})

afterEach(cleanup)

describe('student class page retake visibility', () => {
  test('shows Retake when the latest attempt is finished and nothing is in progress', async () => {
    assessmentActions.getStudentClassAssessments.mockResolvedValue({
      assessments: [assessment()],
      error: null,
    })

    await renderPage()

    const retake = screen.getByRole('link', { name: /Retake/i })
    expect(retake.getAttribute('href')).toBe(
      '/dashboard/student/classes/class-1/assessments/a-1?retake=1',
    )
  })

  test('hides Retake while any attempt is In Progress even if the summary collapsed it', async () => {
    // A reopened attempt whose granted window lapsed: the map reports the
    // finished status, but the running row still exists.
    assessmentActions.getStudentClassAssessments.mockResolvedValue({
      assessments: [
        assessment({
          submission: submissionSummary({
            status: 'submitted',
            has_in_progress: true,
          }),
        }),
      ],
      error: null,
    })

    await renderPage()

    expect(screen.queryByRole('link', { name: /Retake/i })).toBeNull()
  })

  test('hides Retake when there is no finished attempt', async () => {
    assessmentActions.getStudentClassAssessments.mockResolvedValue({
      assessments: [
        assessment({
          submission: submissionSummary({
            status: 'expired',
            score_total: null,
            has_in_progress: true,
            has_finished_attempt: false,
          }),
        }),
      ],
      error: null,
    })

    await renderPage()

    expect(screen.queryByRole('link', { name: /Retake/i })).toBeNull()
  })

  test('hides Retake when retakes are not allowed', async () => {
    assessmentActions.getStudentClassAssessments.mockResolvedValue({
      assessments: [assessment({ retakes_allowed: false })],
      error: null,
    })

    await renderPage()

    expect(screen.queryByRole('link', { name: /Retake/i })).toBeNull()
  })

  test('live-mode join link keeps its current behavior', async () => {
    assessmentActions.getStudentClassAssessments.mockResolvedValue({
      assessments: [
        assessment({
          id: 'a-live',
          title: 'Live Assessment',
          mode: 'live',
          duration_minutes: null,
        }),
      ],
      error: null,
    })

    await renderPage()

    const retake = screen.getByRole('link', { name: /Retake/i })
    expect(retake.getAttribute('href')).toBe(
      '/dashboard/student/classes/class-1/assessments/a-live/live',
    )
  })
})
