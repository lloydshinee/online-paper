import { describe, test, expect } from 'vitest'
import { computeDeadline, remainingSeconds, isPastDeadline } from '@/lib/deadline'

describe('deadline math', () => {
  test('fresh start: deadline is started_at plus duration', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    const deadline = computeDeadline(startedAt, 30)
    expect(deadline).toBe(new Date('2026-01-01T10:30:00.000Z').getTime())
  })

  test('resume mid-assessment computes the correct remaining time from started_at', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    const deadline = computeDeadline(startedAt, 30)

    // 10 minutes of wall-clock time have passed since the start.
    const now = new Date('2026-01-01T10:10:00.000Z').getTime()
    expect(remainingSeconds(deadline, now)).toBe(20 * 60)
  })

  test('after a hidden-tab gap, remaining time reflects real elapsed time', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    const deadline = computeDeadline(startedAt, 30)

    // The tab was backgrounded for 10 of 30 minutes.
    const now = new Date('2026-01-01T10:10:00.000Z').getTime()
    expect(remainingSeconds(deadline, now)).toBe(1200)

    // A frozen interval counter would still think ~30 minutes remain.
    expect(remainingSeconds(deadline, now)).not.toBe(30 * 60)
  })

  test('remaining time clamps at zero past the deadline', () => {
    const deadline = new Date('2026-01-01T10:30:00.000Z').getTime()
    const now = new Date('2026-01-01T10:35:00.000Z').getTime()
    expect(remainingSeconds(deadline, now)).toBe(0)
    expect(isPastDeadline(deadline, now)).toBe(true)
  })

  test('boundary: exactly at the deadline is expired', () => {
    const deadline = new Date('2026-01-01T10:30:00.000Z').getTime()
    expect(isPastDeadline(deadline, deadline)).toBe(true)
    expect(remainingSeconds(deadline, deadline)).toBe(0)
  })

  test('fractional seconds round up so the clock never shows a negative or early zero', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    const deadline = computeDeadline(startedAt, 1)
    const now = new Date('2026-01-01T10:00:30.500Z').getTime()
    expect(remainingSeconds(deadline, now)).toBe(30)
  })

  test('extra_seconds shifts the deadline past the original duration', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    const deadline = computeDeadline(startedAt, 30, 5 * 60)
    expect(deadline).toBe(new Date('2026-01-01T10:35:00.000Z').getTime())
  })

  test('extra_seconds defaults to zero: unextended attempts are unchanged', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    expect(computeDeadline(startedAt, 30)).toBe(computeDeadline(startedAt, 30, 0))
  })

  test('remaining time reflects the extended deadline after the original one passed', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    const deadline = computeDeadline(startedAt, 30, 10 * 60)
    const now = new Date('2026-01-01T10:35:00.000Z').getTime()
    expect(remainingSeconds(deadline, now)).toBe(5 * 60)
    expect(isPastDeadline(deadline, now)).toBe(false)
  })
})
