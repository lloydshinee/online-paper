/**
 * Sanitizers for question content handed to students.
 *
 * The full answer key (correctAnswer / correctIndex) must never reach a
 * student's browser until the instructor enables answer reveal. The results
 * path applies reveal-gated sanitization itself; the take-page and live
 * session paths use `sanitizeQuestionForStudent` unconditionally because
 * students never see grading fields while answering.
 */

export interface SanitizableQuestion {
  id: string
  assessment_id?: string
  type: string
  content: Record<string, unknown>
  points: number
  order_index: number
}

export function sanitizeQuestionForStudent<T extends { content: Record<string, unknown> }>(question: T): T {
  if (!question.content || typeof question.content !== 'object') {
    return question
  }
  const content = { ...question.content }
  delete content.correctAnswer
  delete content.correctIndex
  return { ...question, content }
}

export function sanitizeQuestionContent(content: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...content }
  delete sanitized.correctAnswer
  delete sanitized.correctIndex
  return sanitized
}
