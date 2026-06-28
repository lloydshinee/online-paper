import type { QuestionType } from './types'
import { MultipleChoiceType } from './multiple-choice'
import { TrueOrFalseType } from './true-false'
import { FillInTheBlankType } from './fill-blank'
import { EssayType } from './essay'
import { CodingType } from './coding'

export const questionTypeRegistry: Record<string, QuestionType> = {
  MultipleChoice: MultipleChoiceType,
  TrueOrFalse: TrueOrFalseType,
  FillInTheBlank: FillInTheBlankType,
  Essay: EssayType,
  Coding: CodingType,
}
