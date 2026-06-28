import { describe, test, expect } from 'vitest'
import { parseQuestions } from '@/lib/question-parser'

describe('question parser', () => {
  test('parses multiple choice questions', () => {
    const input = `[MultipleChoice]
What is the capital of France?
a) London
b) Paris
c) Berlin
d) Madrid
Answer: b

Which planet is known as the Red Planet?
a) Venus
b) Mars
c) Jupiter
d) Saturn
Answer: b`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      type: 'MultipleChoice',
      content: {
        stem: 'What is the capital of France?',
        options: ['London', 'Paris', 'Berlin', 'Madrid'],
        correctAnswer: 'Paris',
      },
      points: 1,
    })

    expect(result[1]).toMatchObject({
      type: 'MultipleChoice',
      content: {
        stem: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
        correctAnswer: 'Mars',
      },
      points: 1,
    })
  })

  test('parses true or false questions', () => {
    const input = `[TrueOrFalse]
The Earth revolves around the Sun.
Answer: True

Water boils at 50 degrees Celsius.
Answer: False`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      type: 'TrueOrFalse',
      content: {
        statement: 'The Earth revolves around the Sun.',
        correctAnswer: true,
      },
      points: 1,
    })

    expect(result[1]).toMatchObject({
      type: 'TrueOrFalse',
      content: {
        statement: 'Water boils at 50 degrees Celsius.',
        correctAnswer: false,
      },
      points: 1,
    })
  })

  test('parses fill in the blank questions', () => {
    const input = `[FillInTheBlank]
The process of water turning into vapor is called ______.
Answer: evaporation

The chemical symbol for water is ______.
Answer: H2O`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      type: 'FillInTheBlank',
      content: {
        stem: 'The process of water turning into vapor is called ______.',
        correctAnswer: 'evaporation',
      },
      points: 1,
    })

    expect(result[1]).toMatchObject({
      type: 'FillInTheBlank',
      content: {
        stem: 'The chemical symbol for water is ______.',
        correctAnswer: 'H2O',
      },
      points: 1,
    })
  })

  test('parses essay questions', () => {
    const input = `[Essay]
Describe the impact of the Industrial Revolution on urbanization.

Explain the water cycle in your own words.`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      type: 'Essay',
      content: {
        prompt: 'Describe the impact of the Industrial Revolution on urbanization.',
      },
      points: 1,
    })

    expect(result[1]).toMatchObject({
      type: 'Essay',
      content: {
        prompt: 'Explain the water cycle in your own words.',
      },
      points: 1,
    })
  })

  test('parses coding questions', () => {
    const input = `[Coding]
Write a function that returns the factorial of a number.

Implement a binary search algorithm.`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      type: 'Coding',
      content: {
        prompt: 'Write a function that returns the factorial of a number.',
      },
      points: 1,
    })

    expect(result[1]).toMatchObject({
      type: 'Coding',
      content: {
        prompt: 'Implement a binary search algorithm.',
      },
      points: 1,
    })
  })

  test('parses mixed question types', () => {
    const input = `[MultipleChoice]
What is 2+2?
a) 3
b) 4
c) 5
d) 6
Answer: b

[TrueOrFalse]
The sky is green.
Answer: False

[FillInTheBlank]
The largest ocean is the ______ Ocean.
Answer: Pacific

[Essay]
What is your favorite season and why?

[Coding]
Write a hello world program.`

    const result = parseQuestions(input)

    expect(result).toHaveLength(5)
    expect(result[0].type).toBe('MultipleChoice')
    expect(result[1].type).toBe('TrueOrFalse')
    expect(result[2].type).toBe('FillInTheBlank')
    expect(result[3].type).toBe('Essay')
    expect(result[4].type).toBe('Coding')
  })

  test('returns empty array for empty input', () => {
    expect(parseQuestions('')).toHaveLength(0)
    expect(parseQuestions('   \n\n  ')).toHaveLength(0)
  })

  test('skips unknown section types', () => {
    const input = `[UnknownType]
Some content here

[TrueOrFalse]
The Earth is round.
Answer: True`

    const result = parseQuestions(input)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('TrueOrFalse')
  })

  test('parses Points: line for per-question scoring', () => {
    const input = `[MultipleChoice]
What is 2+2?
a) 3
b) 4
c) 5
d) 6
Answer: b
Points: 5

[TrueOrFalse]
The sky is blue.
Answer: True
Points: 3

[FillInTheBlank]
Water boils at ______ degrees Celsius.
Answer: 100
Points: 2

[Essay]
Describe the water cycle.
Points: 10

[Coding]
Write a function to reverse a string.
Points: 15`

    const result = parseQuestions(input)

    expect(result).toHaveLength(5)
    expect(result[0].points).toBe(5)
    expect(result[1].points).toBe(3)
    expect(result[2].points).toBe(2)
    expect(result[3].points).toBe(10)
    expect(result[4].points).toBe(15)
  })

  test('defaults to 1 point when no Points: line', () => {
    const input = `[MultipleChoice]
What is 2+2?
a) 3
b) 4
c) 5
d) 6
Answer: b

[Essay]
No points line here.`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)
    expect(result[0].points).toBe(1)
    expect(result[1].points).toBe(1)
  })
})
