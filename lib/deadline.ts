/**
 * Deadline math for timed assessments.
 *
 * The countdown is always derived from the server-side deadline
 * (started_at + duration_minutes) so hidden/throttled tabs cannot
 * accumulate drift or grant extra time.
 */

export function computeDeadline(startedAt: string | number | Date, durationMinutes: number): number {
  const startedMs = typeof startedAt === 'string' ? new Date(startedAt).getTime() : new Date(startedAt).getTime()
  return startedMs + durationMinutes * 60 * 1000
}

export function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function isPastDeadline(deadline: number, now: number): boolean {
  return now >= deadline
}
