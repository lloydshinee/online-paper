import type { QuestionType } from './types'

export const FillInTheBlankType: QuestionType = {
  type: 'FillInTheBlank',
  gradeAnswer(questionContent, answerContent, points) {
    const correctAnswer = (questionContent.correctAnswer as string).trim().toLowerCase()
    const text = (answerContent.text as string || '').trim().toLowerCase()
    const isCorrect = text === correctAnswer
    return { score: isCorrect ? points : 0, isCorrect }
  },
}
