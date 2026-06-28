import type { QuestionType } from './types'

export const MultipleChoiceType: QuestionType = {
  type: 'MultipleChoice',
  gradeAnswer(questionContent, answerContent, points) {
    const correctIndex = questionContent.correctIndex as number
    const selectedIndex = answerContent.selectedIndex as number
    if (typeof selectedIndex === 'number') {
      const isCorrect = selectedIndex === correctIndex
      return { score: isCorrect ? points : 0, isCorrect }
    }
    return { score: null, isCorrect: null }
  },
}
