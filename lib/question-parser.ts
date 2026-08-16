export interface ParsedQuestion {
  type: 'MultipleChoice' | 'FillInTheBlank' | 'TrueOrFalse' | 'Essay' | 'Coding'
  content: Record<string, unknown>
  points: number
}

export interface ParseWarning {
  message: string
  severity: 'warning' | 'error'
}

export interface ParseDiagnostics {
  questions: ParsedQuestion[]
  warnings: ParseWarning[]
}

type SectionType = 'MultipleChoice' | 'FillInTheBlank' | 'TrueOrFalse' | 'Essay' | 'Coding'

const SECTION_TYPES: SectionType[] = ['MultipleChoice', 'FillInTheBlank', 'TrueOrFalse', 'Essay', 'Coding']

interface Section {
  type: SectionType
  body: string
  bodyStartLine: number
}

const HEADER_PATTERN = /^\[([^\]]*)\]\s*(.*)$/

function isKnownType(value: string): value is SectionType {
  return (SECTION_TYPES as string[]).includes(value)
}

interface HeaderMark {
  line: number
  type: SectionType | null
  headerText: string
  rawType: string
  trailing: string
}

function splitSections(text: string): { sections: Section[]; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = []
  const lines = text.split('\n')

  // Collect every header line (valid or not). A valid header starts a new
  // section; a bracket-shaped line that fails validation is a HARD boundary:
  // its body is dropped entirely and is never attributed to any section.
  // A line that merely starts with "[" but has no closing bracket ("[foo")
  // is plain text, not a header.
  const headers: HeaderMark[] = []
  lines.forEach((line, idx) => {
    if (!line.trim().startsWith('[')) return
    const trimmed = line.trim()
    const match = HEADER_PATTERN.exec(trimmed)
    if (!match) return

    const rawType = match[1].trim()
    const trailing = match[2].trim()

    headers.push({
      line: idx,
      type: isKnownType(rawType) && trailing === '' ? rawType : null,
      headerText: trimmed,
      rawType,
      trailing,
    })
  })

  const sections: Section[] = []
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const end = headers[i + 1]?.line ?? lines.length

    if (header.type === null) {
      // Malformed/unknown header: report the header itself...
      if (!isKnownType(header.rawType)) {
        warnings.push({
          message: `Line ${header.line + 1}: unknown section header "[${header.rawType}]". Recognized headers: ${SECTION_TYPES.map((t) => `[${t}]`).join(', ')}.`,
          severity: 'error',
        })
      } else {
        warnings.push({
          message: `Line ${header.line + 1}: malformed section header "${header.headerText}". Section headers must be on their own line with nothing after "]".`,
          severity: 'error',
        })
      }

      // ...and explicitly report the dropped body so nothing is silent.
      const bodyLineCount = lines
        .slice(header.line + 1, end)
        .filter((l) => l.trim() !== '').length

      if (bodyLineCount > 0) {
        const label = isKnownType(header.rawType) ? 'malformed' : 'unknown'
        warnings.push({
          message: `Line ${header.line + 1}: the content following ${label} section header "${header.headerText}" (${bodyLineCount} line${bodyLineCount === 1 ? '' : 's'}) was discarded and not attributed to any question.`,
          severity: 'error',
        })
      }
      continue
    }

    const bodyLines = lines.slice(header.line + 1, end)
    sections.push({
      type: header.type,
      body: bodyLines.join('\n').trim(),
      bodyStartLine: header.line + 2,
    })
  }

  return { sections, warnings }
}

interface PointsParse {
  points: number | null
  remaining: string[]
  error: string | null
}

const POINTS_LINE_RE = /^Points:\s*(-?\d+(?:\.\d+)?)\s*$/i

function extractPoints(lines: string[]): PointsParse {
  const idx = lines.findIndex((l) => /^Points:\s*/i.test(l.trim()))
  if (idx === -1) {
    return { points: null, remaining: lines, error: null }
  }

  const raw = lines[idx].trim()
  const match = POINTS_LINE_RE.exec(raw)
  const remaining = lines.filter((_, i) => i !== idx)

  if (!match) {
    return { points: null, remaining, error: `invalid Points value "${raw.replace(/^Points:\s*/i, '')}" — Points must be a whole number greater than 0` }
  }

  const value = parseFloat(match[1])
  if (!Number.isInteger(value) || value <= 0) {
    return { points: null, remaining, error: `invalid Points value "${match[1]}" — Points must be a whole number greater than 0` }
  }

  return { points: value, remaining, error: null }
}

function parseBlockQuestions(
  body: string,
  onWarning: (blockNumber: number, msg: string) => void,
  parse: (lines: string[], blockNumber: number) => ParsedQuestion | null,
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const rawBlocks = body.split(/\n\n+/)

  let blockNumber = 0
  for (const raw of rawBlocks) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const question = parse(trimmed.split('\n'), blockNumber)
    if (question) questions.push(question)
    blockNumber++
  }

  return questions
}

function parseMultipleChoice(body: string, onWarning: (blockNumber: number, msg: string) => void): ParsedQuestion[] {
  return parseBlockQuestions(body, onWarning, (lines, blockNumber) => {
    const { points, remaining, error } = extractPoints(lines)
    if (error) {
      onWarning(blockNumber, error)
      return null
    }

    const stem = remaining[0]?.trim()
    const options: string[] = []
    let correctLetter = ''

    for (let i = 1; i < remaining.length; i++) {
      const line = remaining[i].trim()
      const optMatch = line.match(/^([a-z])\)\s*(.+)/i)
      if (optMatch) {
        options.push(optMatch[2].trim())
        continue
      }
      const ansMatch = line.match(/^Answer:\s*([a-z])\b/i)
      if (ansMatch) {
        correctLetter = ansMatch[1].toLowerCase()
      }
    }

    if (!stem) {
      onWarning(blockNumber, 'missing question stem')
      return null
    }
    if (options.length === 0) {
      onWarning(blockNumber, 'no options parsed (expected lines like "a) First option")')
      return null
    }
    if (!correctLetter) {
      onWarning(blockNumber, 'missing "Answer:" line')
      return null
    }

    const index = correctLetter.charCodeAt(0) - 'a'.charCodeAt(0)
    if (index >= options.length) {
      onWarning(blockNumber, `answer "${correctLetter}" but only ${options.length} option${options.length === 1 ? '' : 's'} parsed`)
      return null
    }

    return {
      type: 'MultipleChoice',
      content: {
        stem,
        options,
        correctAnswer: options[index],
        correctIndex: index,
      },
      points: points ?? 1,
    }
  })
}

function parseTrueOrFalse(body: string, onWarning: (blockNumber: number, msg: string) => void): ParsedQuestion[] {
  return parseBlockQuestions(body, onWarning, (lines, blockNumber) => {
    const { points, remaining, error } = extractPoints(lines)
    if (error) {
      onWarning(blockNumber, error)
      return null
    }

    const statement = remaining[0]?.trim()
    const answerLine = remaining[remaining.length - 1].trim()
    const ansMatch = answerLine.match(/^Answer:\s*(True|False)$/i)

    if (!statement) {
      onWarning(blockNumber, 'missing statement')
      return null
    }
    if (!ansMatch) {
      onWarning(blockNumber, 'missing "Answer: True" or "Answer: False" line')
      return null
    }

    return {
      type: 'TrueOrFalse',
      content: {
        statement,
        correctAnswer: ansMatch[1].toLowerCase() === 'true',
      },
      points: points ?? 1,
    }
  })
}

function parseFillInTheBlank(body: string, onWarning: (blockNumber: number, msg: string) => void): ParsedQuestion[] {
  return parseBlockQuestions(body, onWarning, (lines, blockNumber) => {
    const { points, remaining, error } = extractPoints(lines)
    if (error) {
      onWarning(blockNumber, error)
      return null
    }

    const stem = remaining[0]?.trim()
    const answerLine = remaining[remaining.length - 1].trim()
    const ansMatch = answerLine.match(/^Answer:\s*(.+)$/i)

    if (!stem) {
      onWarning(blockNumber, 'missing sentence stem')
      return null
    }
    if (!ansMatch) {
      onWarning(blockNumber, 'missing "Answer:" line')
      return null
    }

    return {
      type: 'FillInTheBlank',
      content: {
        stem,
        correctAnswer: ansMatch[1].trim(),
      },
      points: points ?? 1,
    }
  })
}

/**
 * Essay/Coding sections: consecutive blocks without an `Answer:` line are treated
 * as continuations of the previous prompt. A question terminates when a block
 * containing a `Points:` line is consumed; the next block starts a new question.
 */
function parsePromptSection(
  type: 'Essay' | 'Coding',
  body: string,
  onWarning: (blockNumber: number, msg: string) => void,
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []
  const blocks = body.split(/\n\n+/).filter((b) => b.trim() !== '')

  let promptParts: string[] = []
  let points: number | null = null

  const flush = (blockNumber: number) => {
    const prompt = promptParts.map((p) => p.trim()).filter(Boolean).join('\n\n').trim()
    promptParts = []
    if (!prompt) {
      if (points !== null) {
        onWarning(blockNumber, 'empty prompt')
      }
      points = null
      return
    }
    questions.push({ type, content: { prompt }, points: points ?? 1 })
    points = null
  }

  let blockNumber = 0
  for (const rawBlock of blocks) {
    const lines = rawBlock.trim().split('\n')
    const { points: blockPoints, remaining, error } = extractPoints(lines)

    if (error) {
      if (promptParts.length > 0) flush(blockNumber)
      onWarning(blockNumber, error)
      blockNumber++
      continue
    }

    const blockText = remaining.map((l) => l.trim()).filter(Boolean).join('\n').trim()

    if (promptParts.length === 0) {
      // Starting a new question.
      promptParts = [blockText]
      points = blockPoints
      if (blockPoints !== null) {
        // A Points line in the opening block terminates it immediately.
        flush(blockNumber)
      }
    } else {
      // Continuation of the current question.
      if (blockText) promptParts.push(blockText)
      if (blockPoints !== null) {
        points = blockPoints
        flush(blockNumber)
      }
    }
    blockNumber++
  }

  if (promptParts.length > 0 || points !== null) {
    flush(blockNumber)
  }

  return questions
}

const parsers: Record<SectionType, (body: string, onWarning: (blockNumber: number, msg: string) => void) => ParsedQuestion[]> = {
  MultipleChoice: parseMultipleChoice,
  TrueOrFalse: parseTrueOrFalse,
  FillInTheBlank: parseFillInTheBlank,
  Essay: (body, onWarning) => parsePromptSection('Essay', body, onWarning),
  Coding: (body, onWarning) => parsePromptSection('Coding', body, onWarning),
}

function formatMultipleChoice(questions: ParsedQuestion[]): string {
  return questions.map((q) => {
    const opts = q.content.options as string[]
    const idx = q.content.correctIndex as number
    const letter = String.fromCharCode(97 + idx)
    const lines = [
      q.content.stem as string,
      ...opts.map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`),
      `Answer: ${letter}`,
    ]
    if (q.points !== 1) lines.push(`Points: ${q.points}`)
    return lines.join('\n')
  }).join('\n\n')
}

function formatTrueOrFalse(questions: ParsedQuestion[]): string {
  return questions.map((q) => {
    const lines = [
      q.content.statement as string,
      `Answer: ${q.content.correctAnswer ? 'True' : 'False'}`,
    ]
    if (q.points !== 1) lines.push(`Points: ${q.points}`)
    return lines.join('\n')
  }).join('\n\n')
}

function formatFillInTheBlank(questions: ParsedQuestion[]): string {
  return questions.map((q) => {
    const lines = [
      q.content.stem as string,
      `Answer: ${q.content.correctAnswer as string}`,
    ]
    if (q.points !== 1) lines.push(`Points: ${q.points}`)
    return lines.join('\n')
  }).join('\n\n')
}

function formatEssay(questions: ParsedQuestion[]): string {
  return questions.map((q) => {
    const lines = [q.content.prompt as string]
    if (q.points !== 1) lines.push(`Points: ${q.points}`)
    return lines.join('\n')
  }).join('\n\n')
}

function formatCoding(questions: ParsedQuestion[]): string {
  return questions.map((q) => {
    const lines = [q.content.prompt as string]
    if (q.points !== 1) lines.push(`Points: ${q.points}`)
    return lines.join('\n')
  }).join('\n\n')
}

const typeOrder: SectionType[] = ['MultipleChoice', 'TrueOrFalse', 'FillInTheBlank', 'Essay', 'Coding']

export function formatQuestions(questions: ParsedQuestion[]): string {
  const grouped = new Map<SectionType, ParsedQuestion[]>()
  for (const q of questions) {
    const list = grouped.get(q.type) || []
    list.push(q)
    grouped.set(q.type, list)
  }

  const sections: string[] = []
  for (const type of typeOrder) {
    const list = grouped.get(type)
    if (!list || list.length === 0) continue

    let body = ''
    switch (type) {
      case 'MultipleChoice': body = formatMultipleChoice(list); break
      case 'TrueOrFalse': body = formatTrueOrFalse(list); break
      case 'FillInTheBlank': body = formatFillInTheBlank(list); break
      case 'Essay': body = formatEssay(list); break
      case 'Coding': body = formatCoding(list); break
    }

    sections.push(`[${type}]\n${body}`)
  }

  return sections.join('\n\n')
}

export function parseQuestionsWithDiagnostics(text: string): ParseDiagnostics {
  const { sections, warnings } = splitSections(text.trim())
  const questions: ParsedQuestion[] = []

  let globalBlockNumber = 0

  for (const section of sections) {
    const parser = parsers[section.type]
    if (!parser) continue

    const onWarning = (blockNumber: number, msg: string) => {
      warnings.push({
        message: `Question ${globalBlockNumber + blockNumber + 1} discarded: ${msg}`,
        severity: 'error',
      })
    }

    const sectionQuestions = parser(section.body, onWarning)
    questions.push(...sectionQuestions)
    globalBlockNumber += section.body === '' ? 0 : section.body.split(/\n\n+/).filter((b) => b.trim() !== '').length
  }

  return { questions, warnings }
}

export function parseQuestions(text: string): ParsedQuestion[] {
  return parseQuestionsWithDiagnostics(text).questions
}
