import { describe, test, expect } from 'vitest'
import { TrueOrFalseType } from '@/lib/question-types/true-false'

describe('TrueOrFalse grader', () => {
  const questionContent = {
    statement: 'The sky is blue.',
    correctAnswer: true,
  }

  test('correct answer returns full points', () => {
    const result = TrueOrFalseType.gradeAnswer(
      questionContent,
      { value: true },
      3,
    )
    expect(result.score).toBe(3)
    expect(result.isCorrect).toBe(true)
  })

  test('incorrect answer returns 0 points', () => {
    const result = TrueOrFalseType.gradeAnswer(
      questionContent,
      { value: false },
      3,
    )
    expect(result.score).toBe(0)
    expect(result.isCorrect).toBe(false)
  })

  test('false statement with correct false answer', () => {
    const falseContent = { statement: 'Test', correctAnswer: false }
    const result = TrueOrFalseType.gradeAnswer(
      falseContent,
      { value: false },
      3,
    )
    expect(result.score).toBe(3)
    expect(result.isCorrect).toBe(true)
  })

  test('missing answer returns null', () => {
    const result = TrueOrFalseType.gradeAnswer(
      questionContent,
      {},
      3,
    )
    expect(result.score).toBeNull()
    expect(result.isCorrect).toBeNull()
  })
})
