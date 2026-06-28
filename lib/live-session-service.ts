import { createServiceClient } from '@/lib/supabase/service'
import { convertLiveSession } from '@/lib/submission-service'

export interface LiveSessionData {
  id: string
  assessment_id: string
  instructor_id: string
  current_question_index: number
  status: 'waiting' | 'active' | 'ended'
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface LiveQuestionData {
  id: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
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
    .select('id')
    .eq('assessment_id', assessmentId)
    .neq('status', 'ended')
    .maybeSingle()

  if (existing) return { session: null, error: 'A live session is already in progress for this assessment' }

  const { data: session, error } = await supabase
    .from('live_sessions')
    .insert({ assessment_id: assessmentId, instructor_id: instructorId, status: 'waiting', current_question_index: 0 })
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
  if (session.status !== 'waiting') return { session: null, error: `Cannot start session in ${session.status} state` }

  const { data: updated, error } = await supabase
    .from('live_sessions')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) return { session: null, error: error.message }

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

  const { data: updated, error } = await supabase
    .from('live_sessions')
    .update({ current_question_index: newIndex })
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

  const { error: updateError } = await supabase
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (updateError) return { session: null, error: updateError.message }

  // Convert live answers to submissions
  await finalizeLiveSubmissions(session)

  const { data: final } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  return { session: final as LiveSessionData, error: null }
}

async function finalizeLiveSubmissions(session: LiveSessionData): Promise<void> {
  await convertLiveSession(session.id, session.assessment_id, session.started_at || new Date().toISOString())
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

export async function hasActiveLiveSession(
  studentId: string,
): Promise<{ sessionId: string | null; assessmentId: string | null }> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('live_answers')
    .select('session_id, live_sessions!inner(assessment_id, status)')
    .eq('student_id', studentId)
    .neq('live_sessions.status', 'ended')
    .limit(1)
    .maybeSingle()

  if (!data) return { sessionId: null, assessmentId: null }

  const ls = data.live_sessions as unknown as { assessment_id: string; status: string }
  return { sessionId: data.session_id, assessmentId: ls.assessment_id }
}
