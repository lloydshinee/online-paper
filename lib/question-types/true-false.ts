import type { QuestionType } from './types'

export const TrueOrFalseType: QuestionType = {
  type: 'TrueOrFalse',
  gradeAnswer(questionContent, answerContent, points) {
    const correctAnswer = questionContent.correctAnswer as boolean
    const value = answerContent.value as boolean
    if (typeof value === 'boolean') {
      const isCorrect = value === correctAnswer
      return { score: isCorrect ? points : 0, isCorrect }
    }
    return { score: null, isCorrect: null }
  },
}
