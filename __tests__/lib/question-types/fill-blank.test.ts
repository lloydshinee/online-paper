import { describe, test, expect } from 'vitest'
import { FillInTheBlankType } from '@/lib/question-types/fill-blank'

describe('FillInTheBlank grader', () => {
  const questionContent = {
    stem: 'The capital of France is ______.',
    correctAnswer: 'Paris',
  }

  test('exact match returns full points', () => {
    const result = FillInTheBlankType.gradeAnswer(
      questionContent,
      { text: 'Paris' },
      2,
    )
    expect(result.score).toBe(2)
    expect(result.isCorrect).toBe(true)
  })

  test('case-insensitive match returns full points', () => {
    const result = FillInTheBlankType.gradeAnswer(
      questionContent,
      { text: 'PARIS' },
      2,
    )
    expect(result.score).toBe(2)
    expect(result.isCorrect).toBe(true)
  })

  test('whitespace trimming works', () => {
    const result = FillInTheBlankType.gradeAnswer(
      questionContent,
      { text: '  Paris  ' },
      2,
    )
    expect(result.score).toBe(2)
    expect(result.isCorrect).toBe(true)
  })

  test('incorrect answer returns 0 points', () => {
    const result = FillInTheBlankType.gradeAnswer(
      questionContent,
      { text: 'London' },
      2,
    )
    expect(result.score).toBe(0)
    expect(result.isCorrect).toBe(false)
  })

  test('empty answer returns 0 points', () => {
    const result = FillInTheBlankType.gradeAnswer(
      questionContent,
      { text: '' },
      2,
    )
    expect(result.score).toBe(0)
    expect(result.isCorrect).toBe(false)
  })
})
