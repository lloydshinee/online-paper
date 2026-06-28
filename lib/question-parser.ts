export interface ParsedQuestion {
  type: 'MultipleChoice' | 'FillInTheBlank' | 'TrueOrFalse' | 'Essay' | 'Coding'
  content: Record<string, unknown>
  points: number
}

type SectionType = 'MultipleChoice' | 'FillInTheBlank' | 'TrueOrFalse' | 'Essay' | 'Coding'

interface Section {
  type: SectionType
  body: string
}

function splitSections(text: string): Section[] {
  const sections: Section[] = []
  const headerRegex = /^\[(MultipleChoice|FillInTheBlank|TrueOrFalse|Essay|Coding)\]\s*$/gm

  let currentType: SectionType | null = null
  let currentStart = 0
  let match: RegExpExecArray | null

  while ((match = headerRegex.exec(text)) !== null) {
    if (currentType !== null) {
      sections.push({
        type: currentType,
        body: text.slice(currentStart, match.index).trim(),
      })
    }
    currentType = match[1] as SectionType
    currentStart = match.index + match[0].length
  }

  if (currentType !== null) {
    sections.push({
      type: currentType,
      body: text.slice(currentStart).trim(),
    })
  }

  return sections
}

function extractPoints(lines: string[]): { points: number; remainingLines: string[] } {
  const pointsLineIdx = lines.findIndex((l) => /^Points:\s*\d+/i.test(l.trim()))
  let points = 1
  const remainingLines = [...lines]

  if (pointsLineIdx !== -1) {
    const match = remainingLines[pointsLineIdx].trim().match(/^Points:\s*(\d+)/i)
    if (match) {
      points = Math.max(1, parseInt(match[1], 10))
    }
    remainingLines.splice(pointsLineIdx, 1)
  }

  return { points, remainingLines }
}

function parseMultipleChoice(body: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = body.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue

    const { points, remainingLines } = extractPoints(lines)

    const stem = remainingLines[0].trim()
    const options: string[] = []
    let correctLetter = ''

    for (let i = 1; i < remainingLines.length; i++) {
      const line = remainingLines[i].trim()
      const optMatch = line.match(/^([a-d])\)\s*(.+)/i)
      if (optMatch) {
        options.push(optMatch[2].trim())
        continue
      }
      const ansMatch = line.match(/^Answer:\s*([a-d])/i)
      if (ansMatch) {
        correctLetter = ansMatch[1].toLowerCase()
      }
    }

    if (stem && options.length > 0 && correctLetter) {
      const index = correctLetter.charCodeAt(0) - 'a'.charCodeAt(0)
      if (index >= 0 && index < options.length) {
        questions.push({
          type: 'MultipleChoice',
          content: {
            stem,
            options,
            correctAnswer: options[index],
            correctIndex: index,
          },
          points,
        })
      }
    }
  }

  return questions
}

function parseTrueOrFalse(body: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = body.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    const { points, remainingLines } = extractPoints(lines)

    const statement = remainingLines[0].trim()
    const answerLine = remainingLines[remainingLines.length - 1].trim()
    const ansMatch = answerLine.match(/^Answer:\s*(True|False)/i)

    if (statement && ansMatch) {
      questions.push({
        type: 'TrueOrFalse',
        content: {
          statement,
          correctAnswer: ansMatch[1].toLowerCase() === 'true',
        },
        points,
      })
    }
  }

  return questions
}

function parseFillInTheBlank(body: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = body.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    const { points, remainingLines } = extractPoints(lines)

    const stem = remainingLines[0].trim()
    const answerLine = remainingLines[remainingLines.length - 1].trim()
    const ansMatch = answerLine.match(/^Answer:\s*(.+)/i)

    if (stem && ansMatch) {
      questions.push({
        type: 'FillInTheBlank',
        content: {
          stem,
          correctAnswer: ansMatch[1].trim(),
        },
        points,
      })
    }
  }

  return questions
}

function parseEssay(body: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = body.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const { points, remainingLines } = extractPoints(lines)
    const prompt = remainingLines.join('\n').trim()
    if (prompt) {
      questions.push({ type: 'Essay', content: { prompt }, points })
    }
  }

  return questions
}

function parseCoding(body: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = body.split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const { points, remainingLines } = extractPoints(lines)
    const prompt = remainingLines.join('\n').trim()
    if (prompt) {
      questions.push({ type: 'Coding', content: { prompt }, points })
    }
  }

  return questions
}

const parsers: Record<SectionType, (body: string) => ParsedQuestion[]> = {
  MultipleChoice: parseMultipleChoice,
  TrueOrFalse: parseTrueOrFalse,
  FillInTheBlank: parseFillInTheBlank,
  Essay: parseEssay,
  Coding: parseCoding,
}

export function parseQuestions(text: string): ParsedQuestion[] {
  const sections = splitSections(text.trim())
  const allQuestions: ParsedQuestion[] = []

  for (const section of sections) {
    const parser = parsers[section.type]
    if (parser) {
      const parsed = parser(section.body)
      allQuestions.push(...parsed)
    }
  }

  return allQuestions
}
