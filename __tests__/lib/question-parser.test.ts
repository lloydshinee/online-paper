import { describe, test, expect } from 'vitest'
import { parseQuestions, parseQuestionsWithDiagnostics } from '@/lib/question-parser'

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
Points: 1

Explain the water cycle in your own words.
Points: 1`

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
Points: 1

Implement a binary search algorithm.
Points: 1`

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

  test('reports unknown section types instead of silently skipping', () => {
    const input = `[UnknownType]
Some content here

[TrueOrFalse]
The Earth is round.
Answer: True`

    const result = parseQuestions(input)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('TrueOrFalse')

    const diagnostics = parseQuestionsWithDiagnostics(input)
    expect(diagnostics.warnings.length).toBeGreaterThanOrEqual(1)
    expect(diagnostics.warnings[0].message).toContain('UnknownType')
    // The dropped body is also explicitly reported (hard boundary).
    expect(diagnostics.warnings.some((w) => w.message.includes('discarded'))).toBe(true)
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

  test('parses a 5-option multiple choice question with answer e', () => {
    const input = `[MultipleChoice]
Which of these is a primary color?
a) Orange
b) Purple
c) Green
d) Brown
e) Red
Answer: e
Points: 2`

    const result = parseQuestions(input)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'MultipleChoice',
      content: {
        stem: 'Which of these is a primary color?',
        options: ['Orange', 'Purple', 'Green', 'Brown', 'Red'],
        correctAnswer: 'Red',
        correctIndex: 4,
      },
      points: 2,
    })
  })

  test('reports a question whose answer letter exceeds the parsed options', () => {
    const input = `[MultipleChoice]
Which one?
a) A
b) B
Answer: e`

    const diagnostics = parseQuestionsWithDiagnostics(input)

    expect(diagnostics.questions).toHaveLength(0)
    expect(diagnostics.warnings).toHaveLength(1)
    expect(diagnostics.warnings[0].message).toContain('answer "e"')
    expect(diagnostics.warnings[0].message).toContain('only 2 options')
  })

  test('an essay prompt with blank lines parses as one question with the authored points', () => {
    const input = `[Essay]
Describe the French Revolution.

Include economic, social, and political causes.
Points: 10`

    const result = parseQuestions(input)

    expect(result).toHaveLength(1)
    expect(result[0].points).toBe(10)
    expect(result[0].content.prompt).toContain('Describe the French Revolution.')
    expect(result[0].content.prompt).toContain('Include economic, social, and political causes.')
  })

  test('a coding prompt with blank lines parses as one question', () => {
    const input = `[Coding]
Write a parser.

It should handle multiple paragraphs and blank lines.
Points: 8`

    const result = parseQuestions(input)

    expect(result).toHaveLength(1)
    expect(result[0].points).toBe(8)
    expect(result[0].content.prompt).toContain('Write a parser.')
    expect(result[0].content.prompt).toContain('multiple paragraphs')
  })

  test('essay questions separated by Points lines parse as distinct questions', () => {
    const input = `[Essay]
First essay paragraph one.

First essay paragraph two.
Points: 10

Second essay.
Points: 5`

    const result = parseQuestions(input)

    expect(result).toHaveLength(2)
    expect(result[0].points).toBe(10)
    expect(result[0].content.prompt).toContain('First essay paragraph one.')
    expect(result[0].content.prompt).toContain('First essay paragraph two.')
    expect(result[1].points).toBe(5)
    expect(result[1].content.prompt).toBe('Second essay.')
  })

  test('Points: 0 produces a warning, not silent coercion to 1', () => {
    const input = `[MultipleChoice]
What is 2+2?
a) 3
b) 4
Answer: b
Points: 0`

    const diagnostics = parseQuestionsWithDiagnostics(input)

    expect(diagnostics.questions).toHaveLength(0)
    expect(diagnostics.warnings).toHaveLength(1)
    expect(diagnostics.warnings[0].message).toContain('Points must be a whole number greater than 0')
  })

  test('Points: 2.5 produces a warning, not silent truncation to 2', () => {
    const input = `[Essay]
Write an essay.
Points: 2.5`

    const diagnostics = parseQuestionsWithDiagnostics(input)

    expect(diagnostics.questions).toHaveLength(0)
    expect(diagnostics.warnings).toHaveLength(1)
    expect(diagnostics.warnings[0].message).toContain('2.5')
  })

  test('a malformed section header with trailing text produces an error naming the header', () => {
    const input = `[MultipleChoice] extra words
What is 2+2?
a) 3
b) 4
Answer: b

[TrueOrFalse]
The Earth is round.
Answer: True`

    const diagnostics = parseQuestionsWithDiagnostics(input)

    expect(diagnostics.warnings.length).toBeGreaterThan(0)
    expect(diagnostics.warnings[0].message).toContain('[MultipleChoice] extra words')
    // The TrueOrFalse question still parses
    expect(diagnostics.questions).toHaveLength(1)
    expect(diagnostics.questions[0].type).toBe('TrueOrFalse')
  })

  test('reports a discarded question with a reason', () => {
    const input = `[MultipleChoice]
A question missing its answer line.
a) One
b) Two`

    const diagnostics = parseQuestionsWithDiagnostics(input)

    expect(diagnostics.questions).toHaveLength(0)
    expect(diagnostics.warnings).toHaveLength(1)
    expect(diagnostics.warnings[0].message).toMatch(/Question \d+ discarded/)
    expect(diagnostics.warnings[0].message).toContain('Answer')
  })

  test('a malformed header between valid sections drops its body entirely and reports both warnings', () => {
    const input = `[Essay]
First essay prompt.
Points: 5

[MultipleChoice] oops
What is 2+2?
a) 3
b) 4
Answer: b

[TrueOrFalse]
The Earth is round.
Answer: True`

    const diagnostics = parseQuestionsWithDiagnostics(input)
    const questions = diagnostics.questions

    // The questions around the malformed header are unchanged.
    expect(questions).toHaveLength(2)
    expect(questions[0]).toMatchObject({ type: 'Essay', points: 5 })
    expect(questions[0].content.prompt).toBe('First essay prompt.')
    expect(questions[1]).toMatchObject({ type: 'TrueOrFalse' })
    expect(questions[1].content.statement).toBe('The Earth is round.')

    // The malformed body text never appears in any parsed question content.
    const allContent = JSON.stringify(questions.map((q) => q.content))
    expect(allContent).not.toContain('What is 2+2?')
    expect(allContent).not.toContain('b) 4')

    // Two warnings: the header warning + a discard warning naming the header.
    expect(diagnostics.warnings).toHaveLength(2)
    expect(diagnostics.warnings[0].message).toContain('[MultipleChoice] oops')
    expect(diagnostics.warnings[1].message).toContain('discarded')
    expect(diagnostics.warnings[1].message).toContain('[MultipleChoice] oops')
  })

  test('an unmatched bracket line inside a section is plain text, not a boundary', () => {
    const input = `[Essay]
[unfinished thought
and more text.
Points: 4`

    const diagnostics = parseQuestionsWithDiagnostics(input)

    expect(diagnostics.questions).toHaveLength(1)
    expect(diagnostics.questions[0].type).toBe('Essay')
    expect(diagnostics.questions[0].content.prompt).toBe('[unfinished thought\nand more text.')
    expect(diagnostics.warnings).toHaveLength(0)
  })
})
