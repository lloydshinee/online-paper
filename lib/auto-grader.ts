import type { SupabaseClient } from '@supabase/supabase-js'
import { questionTypeRegistry } from './question-types/registry'

export async function gradeSubmission(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<void> {
  const { data: answers } = await supabase
    .from('answers')
    .select('*')
    .eq('submission_id', submissionId)

  if (!answers || answers.length === 0) return

  const questionIds = answers.map((a) => a.question_id)
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', questionIds)

  if (!questions) return

  let totalScore = 0

  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.question_id)
    if (!question) continue

    const content = question.content as Record<string, unknown>
    const answerContent = answer.answer_content as Record<string, unknown>

    const qType = questionTypeRegistry[question.type]
    let score: number | null = null
    let isCorrect: boolean | null = null

    if (qType) {
      const result = qType.gradeAnswer(content, answerContent, question.points)
      score = result.score
      isCorrect = result.isCorrect
      if (typeof score === 'number') {
        totalScore += score
      }
    }

    await supabase
      .from('answers')
      .update({ score, is_correct: isCorrect })
      .eq('id', answer.id)
  }

  const { data: gradedAnswers } = await supabase
    .from('answers')
    .select('score')
    .eq('submission_id', submissionId)

  const finalTotal = gradedAnswers?.reduce((sum, a) => sum + (a.score ?? 0), 0) ?? totalScore

  await supabase
    .from('submissions')
    .update({ score_total: finalTotal })
    .eq('id', submissionId)
}
