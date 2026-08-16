import { createServiceClient } from '@/lib/supabase/service'
import { convertLiveSession } from '@/lib/submission-service'
import { sanitizeQuestionForStudent } from '@/lib/question-sanitizer'

export interface LiveSessionData {
  id: string
  assessment_id: string
  instructor_id: string
  current_question_index: number
  status: 'waiting' | 'active' | 'ended'
  started_at: string | null
  ended_at: string | null
  created_at: string
  prev_question_index?: number | null
  advanced_at?: string | null
  flush_departures?: { index: number; departed_at: string }[] | null
}

export interface LiveQuestionData {
  id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

export interface StudentLiveSessionView {
  session: {
    id: string
    assessment_id: string
    current_question_index: number
    status: 'waiting' | 'active' | 'ended'
  }
  currentQuestion: LiveQuestionData | null
  totalQuestions: number
}

interface SessionResult {
  session: LiveSessionData | null
  error: string | null
}

export async function createLiveSession(
  instructorId: string,
  assessmentId: string,
): Promise<SessionResult> {
  const supabase = createServiceClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, class_id, mode, state')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return { session: null, error: 'Assessment not found' }
  if (assessment.mode !== 'live') return { session: null, error: 'Assessment is not live mode' }
  if (assessment.state !== 'active') return { session: null, error: 'Assessment is not published' }

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) return { session: null, error: 'Not authorized' }

  const { data: existing } = await supabase
    .from('live_sessions')
    .select('id, status')
    .eq('assessment_id', assessmentId)
    .maybeSingle()

  if (existing) {
    if (existing.status !== 'ended') {
      return { session: null, error: 'A live session is already in progress for this assessment' }
    }

    // Re-running a session creates a brand-new Submission per student when it
    // ends, which is a retake. The instructor's retake policy must be honored.
    const { data: retakePolicy } = await supabase
      .from('assessments')
      .select('retakes_allowed')
      .eq('id', assessmentId)
      .single()

    if (retakePolicy && retakePolicy.retakes_allowed !== true) {
      return {
        session: null,
        error: 'Retakes are not allowed for this assessment. Enable "Allow retakes" in settings to run another live session.',
      }
    }

    await supabase
      .from('live_answers')
      .delete()
      .eq('session_id', existing.id)

    // Membership from the previous run must not block re-joining.
    await supabase
      .from('live_session_members')
      .delete()
      .eq('session_id', existing.id)

    const { data: reset, error: resetError } = await supabase
      .from('live_sessions')
      .update({
        status: 'waiting',
        current_question_index: -1,
        started_at: null,
        ended_at: null,
        prev_question_index: null,
        advanced_at: null,
        flush_departures: null,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (resetError) return { session: null, error: resetError.message }
    return { session: reset as LiveSessionData, error: null }
  }

  const { data: session, error } = await supabase
    .from('live_sessions')
    .insert({ assessment_id: assessmentId, instructor_id: instructorId, status: 'waiting', current_question_index: -1 })
    .select('*')
    .single()

  if (error) return { session: null, error: error.message }

  return { session: session as LiveSessionData, error: null }
}

export async function startLiveSession(
  sessionId: string,
  instructorId: string,
): Promise<SessionResult> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('instructor_id', instructorId)
    .single()

  if (!session) return { session: null, error: 'Session not found' }

  // Idempotent: starting an already-active session returns the session as-is
  // instead of an error, so retried starts can never corrupt state.
  if (session.status === 'active') {
    return { session: session as LiveSessionData, error: null }
  }
  if (session.status === 'ended') {
    return { session: null, error: 'Cannot start a session that has ended' }
  }

  // Guarded transition: only a Waiting session becomes Active. The loser of
  // a concurrent start re-reads the row and returns it (idempotent).
  const { data: updated, error } = await supabase
    .from('live_sessions')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      prev_question_index: null,
      advanced_at: null,
      flush_departures: null,
    })
    .eq('id', sessionId)
    .eq('status', 'waiting')
    .select('*')
    .maybeSingle()

  if (error) return { session: null, error: error.message }

  if (!updated) {
    const { data: current } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    return { session: (current as LiveSessionData) ?? null, error: current ? null : 'Session not found' }
  }

  return { session: updated as LiveSessionData, error: null }
}

export async function advanceLiveSession(
  sessionId: string,
  instructorId: string,
  direction: 'next' | 'prev',
): Promise<{ session: LiveSessionData | null; question: LiveQuestionData | null; error: string | null }> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('instructor_id', instructorId)
    .single()

  if (!session) return { session: null, question: null, error: 'Session not found' }
  if (session.status !== 'active') return { session: null, question: null, error: 'Session is not active' }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', session.assessment_id)
    .order('order_index')

  if (!questions || questions.length === 0) {
    return { session: null, question: null, error: 'No questions in this assessment' }
  }

  let newIndex = session.current_question_index
  if (direction === 'next') {
    newIndex = Math.min(questions.length - 1, newIndex + 1)
  } else {
    newIndex = Math.max(0, newIndex - 1)
  }

  // Record the departing question with its own departure timestamp so the
  // write gate can tolerate a flush of the question that just left for a
  // short window (ticket 16) while still rejecting out-of-order writes.
  //
  // Ticket 21 (F1/F2): every departed question carries its OWN window from
  // its own departure (flush_departures), instead of one chain origin. Rapid
  // back-to-back advances — even ones discovered late by the 12s poll — never
  // shorten a question's flush window. Entries are truncated to non-expired
  // ones on every advance, so stale questions cannot be saved beyond
  // LIVE_ADVANCE_FLUSH_WINDOW_MS after they left.
  const indexChanged = newIndex !== session.current_question_index
  const nowMs = Date.now()
  const existingDepartures: { index: number; departed_at: string }[] =
    Array.isArray(session.flush_departures) ? session.flush_departures : []

  const { data: updated, error } = await supabase
    .from('live_sessions')
    .update({
      current_question_index: newIndex,
      ...(indexChanged
        ? {
            flush_departures: (() => {
              const kept = existingDepartures.filter(
                (d) =>
                  typeof d?.index === 'number' &&
                  typeof d?.departed_at === 'string' &&
                  nowMs - new Date(d.departed_at).getTime() <= LIVE_ADVANCE_FLUSH_WINDOW_MS,
              )
              if (session.current_question_index >= 0) {
                kept.push({
                  index: session.current_question_index,
                  departed_at: new Date(nowMs).toISOString(),
                })
              }
              return kept.slice(-20)
            })(),
          }
        : {}),
    })
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) return { session: null, question: null, error: error.message }

  return {
    session: updated as LiveSessionData,
    question: questions[newIndex] as LiveQuestionData,
    error: null,
  }
}

/**
 * Grace period between the instructor's "end" broadcast and conversion.
 * Students flush their pending debounced saves during this window, so the
 * last seconds of typing make it into the converted submissions.
 */
export const LIVE_END_FLUSH_GRACE_MS = 5000

/**
 * Window after an advance during which the write gate accepts a save for a
 * question that was current or immediately previous during that window (the
 * student's synchronous advance flush).
 *
 * Ticket 21 (F2): sized to exceed the student page's 12s active-poll cadence,
 * so a flush for an advance discovered by polling (rather than a realtime
 * broadcast) still lands inside the window.
 */
export const LIVE_ADVANCE_FLUSH_WINDOW_MS = 15_000

/**
 * A membership row against a Waiting session older than this is treated as
 * abandoned and cleaned up, so a session that never started cannot
 * permanently lock students out of other live sessions. The age is measured
 * on the membership row itself (joined_at), never the session's created_at.
 */
export const STALE_WAITING_SESSION_MS = 10 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function endLiveSession(
  sessionId: string,
  instructorId: string,
): Promise<SessionResult> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('instructor_id', instructorId)
    .single()

  if (!session) return { session: null, error: 'Session not found' }
  if (session.status === 'ended') return { session: null, error: 'Session already ended' }

  // Let in-flight student saves (debounced autosaves, end-event flushes)
  // land before we atomically close writes and convert answers.
  await sleep(LIVE_END_FLUSH_GRACE_MS)

  // Authoritative flip: only the caller that actually transitions the row
  // out of waiting/active proceeds to conversion. The loser of a concurrent
  // double-End gets no row back and never converts.
  const { data: flipped, error: updateError } = await supabase
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .in('status', ['waiting', 'active'])
    .select('*')
    .maybeSingle()

  if (updateError) return { session: null, error: updateError.message }

  if (!flipped) {
    return { session: null, error: 'Session already ended' }
  }

  // Convert live answers to submissions — exactly once per session.
  // Ticket 21 (F4): conversion is retried within this call, and if every
  // attempt fails the status flip is reverted so the instructor can retry
  // End — a student is never left with a missing submission.
  try {
    await finalizeLiveSubmissions(supabase, flipped as LiveSessionData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown conversion error'
    await supabase
      .from('live_sessions')
      .update({ status: session.status, ended_at: null })
      .eq('id', sessionId)
      .eq('status', 'ended')
    return { session: null, error: `Failed to finalize submissions: ${message}` }
  }

  return { session: flipped as LiveSessionData, error: null }
}

const LIVE_CONVERSION_MAX_ATTEMPTS = 3
const LIVE_CONVERSION_RETRY_BASE_DELAY_MS = 1000

async function finalizeLiveSubmissions(
  supabase: ReturnType<typeof createServiceClient>,
  session: LiveSessionData,
): Promise<void> {
  const startedAt = session.started_at || new Date().toISOString()

  for (let attempt = 1; attempt <= LIVE_CONVERSION_MAX_ATTEMPTS; attempt++) {
    // Conversion dedup runs before EVERY attempt — including the first of a
    // new End call. A failed attempt (of this call or an earlier failed End,
    // e.g. a crash on the final retry) may have converted some students;
    // those rows are removed first (identified by the conversion's started_at
    // signature) so a retried End never duplicates submissions. Re-run
    // sessions get a fresh started_at on start, so their submissions are
    // never matched.
    await supabase
      .from('submissions')
      .delete()
      .eq('assessment_id', session.assessment_id)
      .eq('status', 'submitted')
      .eq('started_at', startedAt)

    try {
      await convertLiveSession(session.id, session.assessment_id, startedAt)
      return
    } catch (error) {
      if (attempt === LIVE_CONVERSION_MAX_ATTEMPTS) {
        throw error
      }
      await sleep(LIVE_CONVERSION_RETRY_BASE_DELAY_MS * attempt)
    }
  }
}

export async function getLiveSession(
  sessionId: string,
): Promise<(LiveSessionData & { questions: LiveQuestionData[] }) | null> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) return null

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', session.assessment_id)
    .order('order_index')

  return { ...(session as LiveSessionData), questions: (questions as LiveQuestionData[]) ?? [] }
}

/**
 * Instructor-scoped session read (ticket 19): resolves the session up to its
 * class and verifies the requesting instructor owns that class. Returns null
 * for non-owners so the full question list (incl. the answer key) never
 * crosses an ownership boundary.
 */
export async function getLiveSessionForInstructor(
  sessionId: string,
  instructorId: string,
): Promise<(LiveSessionData & { questions: LiveQuestionData[] }) | null> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) return null

  const { data: assessment } = await supabase
    .from('assessments')
    .select('class_id')
    .eq('id', session.assessment_id)
    .single()

  if (!assessment) return null

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id)
    .eq('instructor_id', instructorId)
    .single()

  if (!cls) return null

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', session.assessment_id)
    .order('order_index')

  return { ...(session as LiveSessionData), questions: (questions as LiveQuestionData[]) ?? [] }
}

export async function getLiveSessionByAssessment(
  assessmentId: string,
): Promise<(LiveSessionData & { questions: LiveQuestionData[] }) | null> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .neq('status', 'ended')
    .maybeSingle()

  if (!session) return null

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('order_index')

  return { ...(session as LiveSessionData), questions: (questions as LiveQuestionData[]) ?? [] }
}

export async function verifyLiveEnrollment(
  studentId: string,
  assessmentId: string,
): Promise<boolean> {
  const supabase = createServiceClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('class_id')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return false

  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', assessment.class_id)
    .maybeSingle()

  return !!enrollment
}

/**
 * Student-facing live session read: sanitized (no correct answers) and
 * limited to what the current question index requires.
 */
export async function getLiveSessionByAssessmentForStudent(
  assessmentId: string,
  studentId: string,
): Promise<(StudentLiveSessionView & { error?: undefined }) | { error: string }> {
  const supabase = createServiceClient()

  const enrolled = await verifyLiveEnrollment(studentId, assessmentId)
  if (!enrolled) {
    return { error: 'You are not enrolled in this class' }
  }

  // Include ended sessions: a student who arrives late (or who polls during
  // the end flush) must converge to the Ended screen, not a stale waiting one.
  const { data: session } = await supabase
    .from('live_sessions')
    .select('id, assessment_id, current_question_index, status')
    .eq('assessment_id', assessmentId)
    .maybeSingle()

  if (!session) return { error: 'No live session found' }

  return buildStudentView(supabase, session)
}

export async function getLiveSessionForStudent(
  sessionId: string,
  studentId: string,
): Promise<(StudentLiveSessionView & { error?: undefined }) | { error: string }> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('id, assessment_id, current_question_index, status')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'No live session found' }

  const enrolled = await verifyLiveEnrollment(studentId, session.assessment_id)
  if (!enrolled) {
    return { error: 'You are not enrolled in this class' }
  }

  return buildStudentView(supabase, session)
}

async function buildStudentView(
  supabase: ReturnType<typeof createServiceClient>,
  session: { id: string; assessment_id: string; current_question_index: number; status: string },
): Promise<StudentLiveSessionView> {
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('assessment_id', session.assessment_id)
    .order('order_index')

  const all = (questions as LiveQuestionData[]) ?? []
  const current =
    session.current_question_index >= 0 && session.current_question_index < all.length
      ? sanitizeQuestionForStudent(all[session.current_question_index])
      : null

  return {
    session: {
      id: session.id,
      assessment_id: session.assessment_id,
      current_question_index: session.current_question_index,
      status: session.status as 'waiting' | 'active' | 'ended',
    },
    currentQuestion: current,
    totalQuestions: all.length,
  }
}

export async function getStudentLiveAnswer(
  sessionId: string,
  studentId: string,
  questionId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('live_answers')
    .select('answer_content')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .maybeSingle()

  return data?.answer_content as Record<string, unknown> ?? null
}

export async function saveLiveAnswer(
  sessionId: string,
  studentId: string,
  questionId: string,
  answerContent: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('id, status, current_question_index, flush_departures, assessment_id')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }

  // Writes are only accepted while the session is Active.
  if (session.status !== 'active') {
    return { error: `Cannot save an answer while the session is ${session.status}` }
  }

  // The saver must be enrolled in the assessment's class.
  const { data: assessment } = await supabase
    .from('assessments')
    .select('class_id')
    .eq('id', session.assessment_id)
    .single()

  if (!assessment) return { error: 'Assessment not found' }

  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('class_id', assessment.class_id)
    .maybeSingle()

  if (!enrollment) {
    return { error: 'You are not enrolled in this class' }
  }

  // The saved question must be the session's current question — or one that
  // departed within the flush window (tickets 16 + 21 F1/F2): the student's
  // synchronous flush races the index change. Each departed question keeps
  // its OWN window from its own departure time (flush_departures), so rapid
  // back-to-back advances — even ones discovered late by polling — never
  // shorten a question's flush window, while a question can never be saved
  // more than LIVE_ADVANCE_FLUSH_WINDOW_MS after it left. Questions the
  // session never reached (two-ahead) have no departure record and stay
  // rejected.
  const { data: questions } = await supabase
    .from('questions')
    .select('id, order_index')
    .eq('assessment_id', session.assessment_id)
    .order('order_index')

  const currentQuestion = (questions ?? [])[session.current_question_index]
  const isCurrent = !!currentQuestion && currentQuestion.id === questionId

  let isInFlushWindow = false
  if (!isCurrent && Array.isArray(session.flush_departures)) {
    const idx = (questions ?? []).findIndex((q) => q.id === questionId)
    if (idx !== -1) {
      const now = Date.now()
      isInFlushWindow = session.flush_departures.some((d) => {
        if (typeof d?.index !== 'number' || typeof d?.departed_at !== 'string') return false
        if (d.index !== idx) return false
        const elapsedMs = now - new Date(d.departed_at).getTime()
        return elapsedMs >= 0 && elapsedMs <= LIVE_ADVANCE_FLUSH_WINDOW_MS
      })
    }
  }

  if (!isCurrent && !isInFlushWindow) {
    return { error: 'This question is not the current question' }
  }

  // The saver must be a member of this session, and of no OTHER non-ended
  // session (ticket 20.2): dual-session enforcement on the write path.
  const { data: memberships } = await supabase
    .from('live_session_members')
    .select('session_id, live_sessions!inner(status)')
    .eq('student_id', studentId)
    .neq('live_sessions.status', 'ended')
    .limit(5)

  const memberOfThisSession = (memberships ?? []).some((m) => m.session_id === sessionId)
  if (!memberOfThisSession) {
    return { error: 'You are not a participant in this live session' }
  }

  const otherSession = (memberships ?? []).find((m) => m.session_id !== sessionId)
  if (otherSession) {
    return { error: 'You are already in another live session' }
  }

  // Ticket 21 (F7): the membership check above is read-then-act — a save
  // racing a concurrent join of a second session (another tab) could slip
  // through once. Snapshot the previous answer, write, then re-check
  // membership and revert the write on conflict.
  const { data: previousAnswer } = await supabase
    .from('live_answers')
    .select('answer_content')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .maybeSingle()

  const { error } = await supabase
    .from('live_answers')
    .upsert({
      session_id: sessionId,
      student_id: studentId,
      question_id: questionId,
      answer_content: answerContent,
      auto_saved_at: new Date().toISOString(),
    }, { onConflict: 'session_id,student_id,question_id' })

  if (error) return { error: error.message }

  const { data: postWriteMemberships } = await supabase
    .from('live_session_members')
    .select('session_id, live_sessions!inner(status)')
    .eq('student_id', studentId)
    .neq('live_sessions.status', 'ended')
    .limit(5)

  const stillMemberOfThisSession = (postWriteMemberships ?? []).some(
    (m) => m.session_id === sessionId,
  )
  const postWriteOtherSession = (postWriteMemberships ?? []).find(
    (m) => m.session_id !== sessionId,
  )

  if (!stillMemberOfThisSession || postWriteOtherSession) {
    if (previousAnswer) {
      await supabase
        .from('live_answers')
        .upsert({
          session_id: sessionId,
          student_id: studentId,
          question_id: questionId,
          answer_content: previousAnswer.answer_content,
        }, { onConflict: 'session_id,student_id,question_id' })
    } else {
      await supabase
        .from('live_answers')
        .delete()
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .eq('question_id', questionId)
    }
    return {
      error: postWriteOtherSession
        ? 'You are already in another live session'
        : 'You are not a participant in this live session',
    }
  }

  return { error: null }
}

async function verifyInstructorOwnsSession(
  supabase: ReturnType<typeof createServiceClient>,
  sessionId: string,
  instructorId: string,
): Promise<boolean> {
  const { data: session } = await supabase
    .from('live_sessions')
    .select('assessment_id')
    .eq('id', sessionId)
    .single()

  if (!session) return false

  const { data: assessment } = await supabase
    .from('assessments')
    .select('class_id')
    .eq('id', session.assessment_id)
    .single()

  if (!assessment) return false

  const { data: cls } = await supabase
    .from('classes')
    .select('id')
    .eq('id', assessment.class_id)
    .eq('instructor_id', instructorId)
    .single()

  return !!cls
}

export async function getQuestionAnswerCount(
  sessionId: string,
  questionId: string,
  instructorId: string,
): Promise<number> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructorOwnsSession(supabase, sessionId, instructorId)
  if (!authorized) return 0

  const { count } = await supabase
    .from('live_answers')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .neq('answer_content', '{}')

  return count ?? 0
}

export async function getSessionAnswerCounts(
  sessionId: string,
  questionIds: string[],
  instructorId: string,
): Promise<Record<string, number>> {
  const supabase = createServiceClient()

  const authorized = await verifyInstructorOwnsSession(supabase, sessionId, instructorId)
  if (!authorized) return {}

  const { data } = await supabase
    .from('live_answers')
    .select('question_id')
    .eq('session_id', sessionId)
    .in('question_id', questionIds)
    .neq('answer_content', '{}')

  const counts: Record<string, number> = {}
  for (const qid of questionIds) {
    counts[qid] = 0
  }
  if (data) {
    for (const row of data) {
      counts[row.question_id] = (counts[row.question_id] || 0) + 1
    }
  }

  return counts
}

/**
 * Delete memberships against abandoned Waiting sessions so a session that
 * never started cannot lock students out of other live sessions (ticket 18).
 *
 * Ticket 21 (F5): the TTL keys on the MEMBERSHIP row's own join time, not
 * the session's created_at — a student who just joined an old Waiting
 * session must never be evicted; only memberships that are themselves stale
 * (the student left long ago) are cleaned up.
 */
async function cleanupStaleWaitingMemberships(
  supabase: ReturnType<typeof createServiceClient>,
  studentId: string,
): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_WAITING_SESSION_MS).toISOString()

  const { data: stale } = await supabase
    .from('live_session_members')
    .select('id, joined_at, live_sessions!inner(status)')
    .eq('student_id', studentId)
    .eq('live_sessions.status', 'waiting')
    .lt('joined_at', staleCutoff)

  for (const m of stale ?? []) {
    await supabase.from('live_session_members').delete().eq('id', m.id)
  }
}

export async function hasActiveLiveSession(
  studentId: string,
): Promise<{ sessionId: string | null; assessmentId: string | null }> {
  const supabase = createServiceClient()

  await cleanupStaleWaitingMemberships(supabase, studentId)

  // Membership-based: joined-but-not-answered students are detected too, and
  // no single-row fetch can swallow multi-row results.
  const { data } = await supabase
    .from('live_session_members')
    .select('session_id, live_sessions!inner(assessment_id, status)')
    .eq('student_id', studentId)
    .neq('live_sessions.status', 'ended')
    .order('joined_at', { ascending: false })
    .limit(2)

  const first = (data ?? [])[0]
  if (!first) return { sessionId: null, assessmentId: null }

  const ls = first.live_sessions as unknown as { assessment_id: string; status: string }
  return { sessionId: first.session_id, assessmentId: ls.assessment_id }
}

export async function joinLiveSession(
  sessionId: string,
  studentId: string,
): Promise<{ error: string | null }> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('live_sessions')
    .select('id, status, assessment_id')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }
  if (session.status === 'ended') return { error: 'This live session has ended' }

  const enrolled = await verifyLiveEnrollment(studentId, session.assessment_id)
  if (!enrolled) return { error: 'You are not enrolled in this class' }

  // Drop stale Waiting-session memberships before enforcing the constraint.
  await cleanupStaleWaitingMemberships(supabase, studentId)

  // Enforce the CONTEXT.md constraint: a student cannot participate in two
  // overlapping (non-ended) live sessions.
  const { data: existing } = await supabase
    .from('live_session_members')
    .select('id, session_id, live_sessions!inner(status)')
    .eq('student_id', studentId)
    .neq('live_sessions.status', 'ended')
    .limit(2)

  const otherSession = (existing ?? []).find((m) => m.session_id !== sessionId)
  if (otherSession) {
    return { error: 'You are already in another live session' }
  }

  const { error } = await supabase
    .from('live_session_members')
    .upsert(
      { session_id: sessionId, student_id: studentId, joined_at: new Date().toISOString() },
      { onConflict: 'session_id,student_id' },
    )

  if (error) {
    // The DB overlap trigger also guards concurrent joins.
    if (error.code === '23505' || error.message.toLowerCase().includes('another live session')) {
      return { error: 'You are already in another live session' }
    }
    return { error: error.message }
  }

  return { error: null }
}
