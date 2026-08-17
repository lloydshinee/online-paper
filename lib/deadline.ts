/**
 * Deadline math for timed assessments.
 *
 * The countdown is always derived from the server-side deadline
 * (started_at + duration_minutes + extra_seconds) so hidden/throttled tabs
 * cannot accumulate drift or grant extra time. extra_seconds carries
 * instructor-granted time extensions; it defaults to 0, making the
 * effective deadline behave exactly like the original duration for
 * unextended attempts.
 */

export function computeDeadline(startedAt: string | number | Date, durationMinutes: number, extraSeconds = 0): number {
  const startedMs = typeof startedAt === 'string' ? new Date(startedAt).getTime() : new Date(startedAt).getTime()
  return startedMs + durationMinutes * 60 * 1000 + extraSeconds * 1000
}

export function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function isPastDeadline(deadline: number, now: number): boolean {
  return now >= deadline
}
