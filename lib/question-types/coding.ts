import type { QuestionType } from './types'

export const CodingType: QuestionType = {
  type: 'Coding',
  gradeAnswer() {
    return { score: null, isCorrect: null }
  },
}
