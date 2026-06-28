import type { QuestionType } from './types'

export const EssayType: QuestionType = {
  type: 'Essay',
  gradeAnswer() {
    return { score: null, isCorrect: null }
  },
}
