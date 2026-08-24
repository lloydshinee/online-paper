import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  ClassPageTabs,
  classPageHref,
  parseClassPageTab,
} from '@/app/(dashboard)/dashboard/instructor/classes/[id]/_components/class-page-tabs'
import { AssessmentsTab } from '@/app/(dashboard)/dashboard/instructor/classes/[id]/_components/assessments-tab'
import { StudentSummaryTab } from '@/app/(dashboard)/dashboard/instructor/classes/[id]/_components/student-summary-tab'
import type { AssessmentData } from '@/lib/assessment-service'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const assessment = (overrides: Partial<AssessmentData> = {}): AssessmentData => ({
  id: 'a-1',
  class_id: 'class-1',
  title: 'Midterm',
  mode: 'timed',
  state: 'draft',
  duration_minutes: 60,
  scores_released: false,
  answer_reveal_enabled: false,
  accepting_submissions: true,
  retakes_allowed: false,
  created_at: '2026-08-01T00:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('parseClassPageTab', () => {
  test('defaults a missing or unrecognized param to assessments', () => {
    expect(parseClassPageTab(undefined)).toBe('assessments')
    expect(parseClassPageTab('')).toBe('assessments')
    expect(parseClassPageTab('nonsense')).toBe('assessments')
    expect(parseClassPageTab(['roster', 'summary'])).toBe('assessments')
    expect(parseClassPageTab('assessments')).toBe('assessments')
  })

  test('accepts roster and summary', () => {
    expect(parseClassPageTab('roster')).toBe('roster')
    expect(parseClassPageTab('summary')).toBe('summary')
  })
})

describe('classPageHref', () => {
  test('keeps the assessments tab on the bare class URL', () => {
    expect(classPageHref('c1', 'assessments')).toBe('/dashboard/instructor/classes/c1')
  })

  test('addresses other tabs via the tab query param', () => {
    expect(classPageHref('c1', 'roster')).toBe('/dashboard/instructor/classes/c1?tab=roster')
    expect(classPageHref('c1', 'summary')).toBe('/dashboard/instructor/classes/c1?tab=summary')
  })
})

describe('ClassPageTabs', () => {
  test('renders three tabs in order with URL-addressable hrefs', () => {
    render(<ClassPageTabs classId="c1" active="assessments" />)

    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Assessments', 'Roster', 'Student Summary'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/dashboard/instructor/classes/c1',
      '/dashboard/instructor/classes/c1?tab=roster',
      '/dashboard/instructor/classes/c1?tab=summary',
    ])
  })

  test('marks only the active tab as current', () => {
    render(<ClassPageTabs classId="c1" active="summary" />)

    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current.map((l) => l.textContent)).toEqual(['Student Summary'])
  })
})

describe('AssessmentsTab', () => {
  test('renders the empty state when the class has no assessments', () => {
    render(<AssessmentsTab classId="c1" drafts={[]} published={[]} closed={[]} />)

    expect(screen.getByText('No assessments yet')).toBeDefined()
    expect(screen.getByRole('link', { name: /Create Assessment/i }).getAttribute('href'))
      .toBe('/dashboard/instructor/classes/c1/assessments/create')
    expect(screen.queryByRole('heading', { name: 'Drafts' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Published' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Closed' })).toBeNull()
  })

  test('renders drafts, published, and closed sections linking to each assessment', () => {
    render(
      <AssessmentsTab
        classId="c1"
        drafts={[assessment({ id: 'd-1', title: 'Draft quiz' })]}
        published={[
          assessment({ id: 'p-1', title: 'Live exam', mode: 'live', state: 'active' }),
          assessment({ id: 'p-2', title: 'Closed intake', state: 'active', accepting_submissions: false }),
        ]}
        closed={[assessment({ id: 'x-1', title: 'Old final', state: 'closed' })]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Drafts' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Published' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Closed' })).toBeDefined()

    expect(screen.getByRole('link', { name: /Draft quiz/i }).getAttribute('href'))
      .toBe('/dashboard/instructor/classes/c1/assessments/d-1')
    expect(screen.getByRole('link', { name: /Live exam/i }).getAttribute('href'))
      .toBe('/dashboard/instructor/classes/c1/assessments/p-1')
    // A published assessment that no longer accepts submissions is flagged Closed inline.
    expect(screen.getByText('Closed intake')).toBeDefined()
    expect(screen.getByRole('link', { name: /Old final/i }).getAttribute('href'))
      .toBe('/dashboard/instructor/classes/c1/assessments/x-1')

    // Section headings are h2; the remaining "Closed" matches are card badges
    // (one on the closed card, one on the not-accepting published card).
    const closedBadges = screen.getAllByText('Closed').filter((el) => el.tagName !== 'H2')
    expect(closedBadges.length).toBe(2)
  })
})

describe('StudentSummaryTab', () => {
  test('renders a placeholder empty state', () => {
    render(<StudentSummaryTab />)

    expect(screen.getByText('No student summary yet')).toBeDefined()
    expect(
      screen.getByText(/Scores will appear here once you publish assessments/),
    ).toBeDefined()
  })
})
