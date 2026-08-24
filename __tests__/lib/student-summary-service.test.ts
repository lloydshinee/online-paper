import { describe, test, expect } from 'vitest'
import { computeCellState } from '@/lib/student-summary-service'
import type { MatrixAssessment } from '@/lib/student-summary-service'

interface FakeSubmission {
  id: string
  assessment_id: string
  student_id: string
  status: string
  score_total: number | null
  started_at: string
  extra_seconds: number
}

const baseAssessment: MatrixAssessment = {
  id: 'a1',
  title: 'Test Assessment',
  passing_score: null,
  total_points: 10,
  mode: 'timed',
  state: 'active',
  accepting_submissions: true,
  duration_minutes: 30,
}

const liveAssessment: MatrixAssessment = {
  ...baseAssessment,
  id: 'a2',
  mode: 'live',
  duration_minutes: null,
}

function sub(overrides: Partial<FakeSubmission> = {}): FakeSubmission {
  return {
    id: 's1',
    assessment_id: 'a1',
    student_id: 'st1',
    status: 'submitted',
    score_total: 8,
    started_at: new Date().toISOString(),
    extra_seconds: 0,
    ...overrides,
  }
}

describe('computeCellState', () => {
  describe('in_progress', () => {
    test('shows in_progress when a live in-progress submission exists', () => {
      const result = computeCellState(
        [sub({ status: 'in_progress' })],
        baseAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'in_progress' })
    })

    test('shows missing when in-progress is overdue and no submitted attempt', () => {
      const pastStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const result = computeCellState(
        [sub({ status: 'in_progress', started_at: pastStart, extra_seconds: 0 })],
        { ...baseAssessment, duration_minutes: 30 },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'missing' })
    })

    test('shows score when in-progress is overdue but a previous submitted attempt exists', () => {
      const pastStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const result = computeCellState(
        [
          sub({ id: 's2', status: 'in_progress', started_at: pastStart, extra_seconds: 0 }),
          sub({ id: 's1', status: 'submitted', score_total: 7 }),
        ],
        { ...baseAssessment, duration_minutes: 30 },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 7, total: 10 })
    })
  })

  describe('score', () => {
    test('shows score from submitted attempt', () => {
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: 8 })],
        baseAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 8, total: 10 })
    })

    test('shows score from expired attempt', () => {
      const result = computeCellState(
        [sub({ status: 'expired', score_total: 5 })],
        baseAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 5, total: 10 })
    })

    test('uses latest submitted/expired as authoritative', () => {
      const result = computeCellState(
        [
          sub({ id: 's2', status: 'submitted', score_total: 9, started_at: '2026-01-02T00:00:00Z' }),
          sub({ id: 's1', status: 'submitted', score_total: 6, started_at: '2026-01-01T00:00:00Z' }),
        ],
        baseAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 9, total: 10 })
    })

    test('defaults to 0 when score_total is null', () => {
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: null })],
        baseAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 0, total: 10 })
    })
  })

  describe('failed', () => {
    test('shows failed when score is below passing score', () => {
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: 5 })],
        { ...baseAssessment, passing_score: 60 },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'failed', score: 5, total: 10 })
    })

    test('does not show failed when score meets passing score', () => {
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: 7 })],
        { ...baseAssessment, passing_score: 60 },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 7, total: 10 })
    })

    test('does not show failed when no passing score is set', () => {
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: 2 })],
        { ...baseAssessment, passing_score: null },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'score', score: 2, total: 10 })
    })

    test('does not show failed when manual grades are pending', () => {
      const pending = new Map([['s1', true]])
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: 3 })],
        { ...baseAssessment, passing_score: 50 },
        null,
        pending,
      )
      expect(result).toEqual({ kind: 'score', score: 3, total: 10 })
    })

    test('shows failed when manual grades are complete on authoritative attempt', () => {
      const complete = new Map()
      const result = computeCellState(
        [sub({ status: 'submitted', score_total: 4 })],
        { ...baseAssessment, passing_score: 50 },
        null,
        complete,
      )
      expect(result).toEqual({ kind: 'failed', score: 4, total: 10 })
    })
  })

  describe('missing', () => {
    test('shows missing when no submissions and assessment is closed', () => {
      const result = computeCellState(
        [],
        { ...baseAssessment, state: 'closed' },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'missing' })
    })

    test('shows missing when no submissions and accepting_submissions is false', () => {
      const result = computeCellState(
        [],
        { ...baseAssessment, accepting_submissions: false },
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'missing' })
    })

    test('shows missing when no submissions and live session has ended', () => {
      const result = computeCellState(
        [],
        liveAssessment,
        { status: 'ended' },
        new Map(),
      )
      expect(result).toEqual({ kind: 'missing' })
    })
  })

  describe('not_taken', () => {
    test('shows not_taken when no submissions and assessment is open', () => {
      const result = computeCellState(
        [],
        baseAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'not_taken' })
    })

    test('shows not_taken for live assessment with no session yet', () => {
      const result = computeCellState(
        [],
        liveAssessment,
        null,
        new Map(),
      )
      expect(result).toEqual({ kind: 'not_taken' })
    })

    test('shows not_taken for live assessment with waiting session', () => {
      const result = computeCellState(
        [],
        liveAssessment,
        { status: 'waiting' },
        new Map(),
      )
      expect(result).toEqual({ kind: 'not_taken' })
    })

    test('shows not_taken for live assessment with active session', () => {
      const result = computeCellState(
        [],
        liveAssessment,
        { status: 'active' },
        new Map(),
      )
      expect(result).toEqual({ kind: 'not_taken' })
    })
  })
})
