import { describe, test, expect } from 'vitest'
import { MultipleChoiceType } from '@/lib/question-types/multiple-choice'

describe('MultipleChoice grader', () => {
  const questionContent = {
    stem: 'What is 2+2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: '4',
    correctIndex: 1,
  }

  test('correct answer returns full points', () => {
    const result = MultipleChoiceType.gradeAnswer(
      questionContent,
      { selectedIndex: 1 },
      5,
    )
    expect(result.score).toBe(5)
    expect(result.isCorrect).toBe(true)
  })

  test('incorrect answer returns 0 points', () => {
    const result = MultipleChoiceType.gradeAnswer(
      questionContent,
      { selectedIndex: 0 },
      5,
    )
    expect(result.score).toBe(0)
    expect(result.isCorrect).toBe(false)
  })

  test('missing answer returns null', () => {
    const result = MultipleChoiceType.gradeAnswer(
      questionContent,
      {},
      5,
    )
    expect(result.score).toBeNull()
    expect(result.isCorrect).toBeNull()
  })
})
