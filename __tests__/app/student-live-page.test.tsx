import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { Suspense, type ReactNode } from 'react'

// Constants mirrored from the component under test.
const SLOW_POLL_MS = 12_000
const END_POLL_INTERVAL_MS = 1_500
const END_POLL_MAX_ATTEMPTS = 20

// ---------------------------------------------------------------------------
// Hoisted shared state
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const realtime = {
    // event name -> registered broadcast handler
    handlers: {} as Record<string, () => void>,
    reset() {
      this.handlers = {}
    },
  }
  return { realtime }
})

const actions = vi.hoisted(() => ({
  getLiveSessionByAssessmentForStudentAction: vi.fn(),
  getLiveSessionForStudentAction: vi.fn(),
  saveLiveAnswerAction: vi.fn(),
  getStudentLiveAnswerAction: vi.fn(),
  checkActiveLiveSessionAction: vi.fn(),
  joinLiveSessionAction: vi.fn(),
}))

vi.mock('@/app/actions/live-assessment', () => actions)

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'student-1' } }, error: null }),
    },
    channel: () => {
      const chan = {
        on(type: string, filter: unknown, handler: () => void) {
          // Broadcast registrations are keyed by their declared event name;
          // the first argument is always the channel message type.
          const eventName =
            typeof filter === 'object' && filter !== null && 'event' in filter
              ? String((filter as { event: string }).event)
              : type
          h.realtime.handlers[eventName] = handler
          return chan
        },
        presenceState: () => ({}),
        track: async () => {},
        send: () => {},
        subscribe: (cb: (status: string) => void) => {
          cb('SUBSCRIBED')
          return chan
        },
      }
      return chan
    },
    removeChannel: vi.fn(async () => {}),
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import StudentLivePage from '@/app/(dashboard)/dashboard/student/classes/[id]/assessments/[assessmentId]/live/page'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const question = (n: number) => ({
  id: `q${n}`,
  type: 'MultipleChoice',
  content: { stem: `Stem ${n}?`, options: ['one', 'two'] },
  points: 1,
  order_index: n,
})

const view = (
  status: 'waiting' | 'active' | 'ended',
  index: number,
  q: ReturnType<typeof question> | null = null,
) => ({
  session: { id: 'sess-1', assessment_id: 'a-1', current_question_index: index, status },
  currentQuestion: q,
  totalQuestions: 2,
})

function renderPage() {
  // Next.js resolves the params promise before the page renders; a
  // pre-fulfilled thenable mirrors that (a plain Promise keeps `use()`
  // suspended until some unrelated re-render).
  const params = {
    then: () => {},
    status: 'fulfilled',
    value: { id: 'class-1', assessmentId: 'a-1' },
  } as unknown as Promise<{ id: string; assessmentId: string }>
  return render(
    <Suspense fallback="loading-fallback">
      <StudentLivePage params={params} />
    </Suspense>,
  )
}

/** Flush pending microtasks (action promises) inside act(). */
async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {})
  }
}

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await settle()
}

function pollCalls(): number {
  return actions.getLiveSessionByAssessmentForStudentAction.mock.calls.length
}

beforeEach(() => {
  vi.useFakeTimers()
  h.realtime.reset()
  vi.clearAllMocks()

  actions.checkActiveLiveSessionAction.mockResolvedValue({ sessionId: null, assessmentId: null })
  actions.joinLiveSessionAction.mockResolvedValue({})
  actions.saveLiveAnswerAction.mockResolvedValue({})
  actions.getStudentLiveAnswerAction.mockResolvedValue(null)
  actions.getLiveSessionForStudentAction.mockResolvedValue(view('active', 1, question(1)))
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('StudentLivePage', () => {
  // -------------------------------------------------------------------------
  // Finding 1 — an ended session renders the Ended screen, not the error view
  // -------------------------------------------------------------------------

  test('opening an already-ended session renders the ended screen and skips join', async () => {
    actions.getLiveSessionByAssessmentForStudentAction.mockResolvedValue(view('ended', -1))

    renderPage()
    await settle()

    expect(screen.getByText('Session Ended')).toBeTruthy()
    expect(actions.joinLiveSessionAction).not.toHaveBeenCalled()
  })

  test('a join rejection caused by the session ending mid-init converges to Ended', async () => {
    actions.getLiveSessionByAssessmentForStudentAction
      .mockResolvedValueOnce(view('active', -1)) // fetched while live...
      .mockResolvedValue(view('ended', -1)) // ...ended before the join landed
    actions.joinLiveSessionAction.mockResolvedValue({ error: 'This live session has ended' })

    renderPage()
    await settle()

    expect(screen.getByText('Session Ended')).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Finding 4 — lobby of an active session converges via polling
  // -------------------------------------------------------------------------

  test('active session at index -1 keeps polling and converges after Begin', async () => {
    actions.getLiveSessionByAssessmentForStudentAction
      .mockResolvedValueOnce(view('active', -1))
      .mockResolvedValue(view('active', 0, question(0)))

    renderPage()
    await settle()

    // Lobby rendering while no question is live.
    expect(screen.getAllByText(/Waiting for/i).length).toBeGreaterThan(0)

    // One fast-poll tick delivers the begun question and stops the poll.
    await advanceTimers(2100)
    expect(screen.getByText('Stem 0?')).toBeTruthy()

    const settledCalls = pollCalls()
    await advanceTimers(10_000)
    expect(pollCalls()).toBe(settledCalls)
  })

  // -------------------------------------------------------------------------
  // Finding 2 — a stale lower-index poll snapshot cannot regress the view
  // -------------------------------------------------------------------------

  test('slow-poll snapshot that races an advance is superseded, not applied', async () => {
    let releaseSlowPoll: (v: ReturnType<typeof view>) => void = () => {}
    const slowPollSnapshot = new Promise<ReturnType<typeof view>>((resolve) => {
      releaseSlowPoll = resolve
    })
    actions.getLiveSessionByAssessmentForStudentAction
      .mockResolvedValueOnce(view('active', 0, question(0))) // init converges
      .mockReturnValueOnce(slowPollSnapshot) // in flight when 'next' lands

    renderPage()
    await settle()
    expect(screen.getByText('Stem 0?')).toBeTruthy()

    // The slow-poll tick starts; its fetch is parked on the deferred promise.
    await advanceTimers(SLOW_POLL_MS)

    // The advance broadcast wins the race while the poll fetch is parked.
    await act(async () => {
      h.realtime.handlers['next']()
    })
    await settle()
    expect(screen.getByText('Stem 1?')).toBeTruthy()

    // Now deliver the pre-advance snapshot the poll parked on.
    await act(async () => {
      releaseSlowPoll(view('active', 0, question(0)))
    })
    await settle()

    // The student stays on the newer question; no regression to Stem 0.
    expect(screen.getByText('Stem 1?')).toBeTruthy()
    expect(screen.queryByText('Stem 0?')).not.toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Finding 3 — the end-conversion poll is single, bounded, and cleanable
  // -------------------------------------------------------------------------

  test("repeated 'end' broadcasts never stack conversion polls", async () => {
    // Conversion never succeeds here; the server keeps reporting active.
    actions.getLiveSessionByAssessmentForStudentAction.mockResolvedValue(
      view('active', 0, question(0)),
    )

    renderPage()
    await settle()

    await act(async () => {
      h.realtime.handlers['end']()
      h.realtime.handlers['end']()
      h.realtime.handlers['end']()
    })
    await settle()

    // Exactly one conversion poll fires in this window; stacked intervals
    // (the pre-fix behavior, one per delivered event) would fire three.
    const before = pollCalls()
    await advanceTimers(END_POLL_INTERVAL_MS)
    expect(pollCalls() - before).toBe(1)
  })

  test('unmount cancels the end-conversion poll', async () => {
    actions.getLiveSessionByAssessmentForStudentAction.mockResolvedValue(
      view('active', 0, question(0)),
    )

    const { unmount } = renderPage()
    await settle()

    await act(async () => {
      h.realtime.handlers['end']()
    })
    await settle()

    unmount()
    const callsAtUnmount = pollCalls()
    await advanceTimers(60_000)
    expect(pollCalls()).toBe(callsAtUnmount)
  })

  test('conversion poll gives up instead of polling forever when the flip reverts', async () => {
    actions.getLiveSessionByAssessmentForStudentAction.mockResolvedValue(
      view('active', 0, question(0)),
    )

    renderPage()
    await settle()

    await act(async () => {
      h.realtime.handlers['end']()
    })
    await settle()

    // Outlive END_POLL_MAX_ATTEMPTS (20 x 1.5s = 30s). Afterwards the only
    // remaining caller is the active-path slow poll (12s cadence); a surviving
    // conversion poll would add one call per 1.5s instead.
    const before = pollCalls()
    // Advance one poll period at a time so each tick's async body settles
    // before the next fires — matching real-clock sequencing, where the
    // give-up branch runs before the following tick.
    for (let i = 0; i < END_POLL_MAX_ATTEMPTS + 6; i++) {
      await advanceTimers(END_POLL_INTERVAL_MS)
    }
    const elapsed = pollCalls() - before
    const slowPollTicks = Math.floor(
      (END_POLL_INTERVAL_MS * (END_POLL_MAX_ATTEMPTS + 6)) / SLOW_POLL_MS,
    )
    expect(elapsed).toBeLessThanOrEqual(END_POLL_MAX_ATTEMPTS + slowPollTicks + 2)
  })
})
